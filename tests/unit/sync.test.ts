import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { QueryObserver, type QueryClient } from '@tanstack/preact-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY, HOUR, MINUTE, RETRY_AFTER_ERROR } from '../../src/data/config';
import type { Snapshot } from '../../src/data/models';
import { createClient, isDue, lifetime, recentlyFailed, sourceQuery } from '../../src/data/queries';
import { SOURCES } from '../../src/data/sources';
import { closeStorage, persistUpdates, restoreSources, saveSource } from '../../src/data/storage';
import { toEvents } from '../../src/data/transform';
import { assess, type SourceState } from '../../src/domain/freshness';
import { fixtures, NOW, routes } from '../fixtures';

type Reply = unknown | (() => Response | Promise<Response>);
let table: Record<string, Reply>;
let calls: string[];

const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url = String(input);
  calls.push(url);
  const match = Object.entries(table).find(([part]) => url.includes(part));
  if (!match) throw new TypeError('Failed to fetch');
  const reply = match[1];
  if (typeof reply === 'function') return reply();
  return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply));
});

const offline = () => {
  throw new TypeError('Failed to fetch');
};

let client: QueryClient;
let stop: () => void;
const storageErrors: unknown[] = [];

const start = () => {
  client = createClient();
  stop = persistUpdates(client, (e) => storageErrors.push(e));
  return client;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  globalThis.indexedDB = new IDBFactory();
  table = routes();
  calls = [];
  storageErrors.length = 0;
  vi.stubGlobal('fetch', fetchMock);
  start();
});

afterEach(async () => {
  stop();
  client.clear();
  await closeStorage();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const load = <K extends keyof typeof SOURCES>(id: K) => client.fetchQuery({ ...sourceQuery(client, id), retry: false });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
/** Simula cerrar y volver a abrir la aplicación. */
const reopen = async () => {
  await settle();
  stop();
  client.clear();
  await closeStorage();
  start();
  await restoreSources(client);
};

describe('descarga', () => {
  it('obtiene las seis fuentes y la fecha de publicación', async () => {
    const pvp = await load('pvp');
    expect(pvp.data.leagues[1500]).toHaveLength(1156);
    expect(pvp.sourceUpdatedAt).toBe(Date.parse('2026-11-20T16:56:34Z'));
    expect((await load('raids')).data).toHaveLength(18);
    expect((await load('events')).data).toHaveLength(39);
    expect(Object.keys((await load('translations')).data.moves).length).toBeGreaterThan(300);
    expect((await load('pokebattler')).data).toContain('DARKRAI');
    expect((await load('sprites')).data['809']![0]).toEqual({ id: 809, name: 'melmetal' });
  });

  it('no envía cabeceras propias y obliga a revalidar', async () => {
    await load('raids');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toBeUndefined();
      expect(init?.cache).toBe('no-cache');
    }
  });

  it('si no se conoce la fecha de publicación, actualiza igualmente y no la inventa', async () => {
    table['repos/bigfoott/ScrapedDuck/commits'] = () => new Response('{}', { status: 403 });
    expect(await load('raids')).toMatchObject({ sourceUpdatedAt: null, data: { length: 18 } });
  });

  it('PvP se acepta o se rechaza en bloque', async () => {
    table['rankings-2500.json'] = [];
    await expect(load('pvp')).rejects.toThrow(/vacía/);
    expect(client.getQueryData(['pvp'])).toBeUndefined();
  });
});

describe('cambio real de los datos', () => {
  it('distingue consultar de cambiar', async () => {
    const first = await load('raids');
    expect(first).toMatchObject({ firstSeenAt: NOW, changedAt: null });

    vi.setSystemTime(NOW + 7 * HOUR);
    const same = await load('raids');
    expect(same).toMatchObject({ firstSeenAt: NOW, changedAt: null });
    expect(client.getQueryState(['raids'])!.dataUpdatedAt).toBe(NOW + 7 * HOUR);

    vi.setSystemTime(NOW + 14 * HOUR);
    table['raids.min.json'] = fixtures.raids().slice(1);
    expect((await load('raids')).changedAt).toBe(NOW + 14 * HOUR);

    vi.setSystemTime(NOW + 21 * HOUR);
    expect((await load('raids')).changedAt).toBe(NOW + 14 * HOUR);
  });
});

describe('fallos: siempre se conserva lo último válido', () => {
  const failures: [string, Reply, RegExp][] = [
    ['sin red', offline, /conectar/],
    ['error 500', () => new Response('', { status: 500 }), /error 500/],
    ['límite de peticiones', () => new Response('', { status: 429 }), /error 429/],
    ['HTML en lugar de JSON', () => new Response('<html>'), /JSON/],
    ['JSON cortado', () => new Response('[{"name":"Cres'), /JSON/],
    ['lista vacía', [], /vacía/],
    ['estructura distinta', { raids: [] }, /estructura/],
    ['registros rotos', [{}, {}, {}], /Demasiados/],
  ];

  it.each(failures)('%s', async (_, reply, message) => {
    await load('raids');
    vi.setSystemTime(NOW + 7 * HOUR);
    table['raids.min.json'] = reply;
    await expect(load('raids')).rejects.toThrow(message);

    const state = client.getQueryState<Snapshot<unknown[]>>(['raids'])!;
    expect(state.data!.data).toHaveLength(18);
    expect(state.dataUpdatedAt).toBe(NOW);

    await reopen();
    const restored = client.getQueryState<Snapshot<unknown[]>>(['raids'])!;
    expect(restored.data!.data).toHaveLength(18);
    expect(restored.dataUpdatedAt).toBe(NOW);
    expect(storageErrors).toEqual([]);
  });

  it('el espejo se usa solo sin datos previos y queda marcado', async () => {
    table = { 'cdn.jsdelivr.net/gh/bigfoott/ScrapedDuck@data/raids.min.json': fixtures.raids() };
    const first = await load('raids');
    expect(first.viaFallback).toBe(true);

    calls = [];
    vi.setSystemTime(NOW + HOUR);
    await expect(load('raids')).rejects.toThrow(/conectar/);
    expect(calls.some((url) => url.includes('jsdelivr'))).toBe(false);
  });

  it('tras un fallo se recupera en cuanto la fuente vuelve', async () => {
    await load('events');
    vi.setSystemTime(NOW + 7 * HOUR);
    table['events.min.json'] = offline;
    await expect(load('events')).rejects.toThrow();
    table['events.min.json'] = fixtures.events();
    vi.setSystemTime(NOW + 8 * HOUR);
    await load('events');
    expect(client.getQueryState(['events'])).toMatchObject({ status: 'success', dataUpdatedAt: NOW + 8 * HOUR });
  });
});

describe('apertura de la aplicación', () => {
  const open = async (id: 'pvp' | 'raids' | 'events') => {
    calls = [];
    const observer = new QueryObserver(client, { ...sourceQuery(client, id), retry: false } as any);
    const unsubscribe = observer.subscribe(() => {});
    await settle();
    unsubscribe();
    return calls.length > 0;
  };

  it('no repite peticiones si los datos siguen vigentes', async () => {
    await load('raids');
    await load('pvp');
    await reopen();
    vi.setSystemTime(NOW + 5 * HOUR);
    expect(await open('raids')).toBe(false);
    expect(await open('pvp')).toBe(false);
  });

  it('actualiza sola lo caducado: 6 h en incursiones y eventos, 24 h en PvP', async () => {
    await load('raids');
    await load('events');
    await load('pvp');
    await reopen();
    vi.setSystemTime(NOW + 6 * HOUR + MINUTE);
    expect(await open('raids')).toBe(true);
    expect(await open('events')).toBe(true);
    expect(await open('pvp')).toBe(false);
    vi.setSystemTime(NOW + DAY + MINUTE);
    expect(await open('pvp')).toBe(true);
  });

  it('tras actualizar, lo guardado es lo nuevo', async () => {
    await load('raids');
    await settle();
    vi.setSystemTime(NOW + 7 * HOUR);
    table['raids.min.json'] = fixtures.raids().slice(2);
    await load('raids');
    await reopen();
    const state = client.getQueryState<Snapshot<unknown[]>>(['raids'])!;
    expect(state.dataUpdatedAt).toBe(NOW + 7 * HOUR);
    expect(state.data!.data).toHaveLength(16);
  });

  it('sin conexión muestra lo guardado', async () => {
    await load('pvp');
    table = {};
    await reopen();
    vi.setSystemTime(NOW + 3 * DAY);
    await open('pvp');
    expect(client.getQueryData<Snapshot<any>>(['pvp'])!.data.leagues[1500]).toHaveLength(1156);
    expect(client.getQueryState(['pvp'])!.error?.message).toMatch(/conectar/);
  });

  it('un reloj adelantado no deja los datos como vigentes para siempre', async () => {
    vi.setSystemTime(NOW + 30 * DAY);
    await load('raids');
    vi.setSystemTime(NOW);
    await reopen();
    expect(client.getQueryState(['raids'])!.dataUpdatedAt).toBe(1);
    expect(await open('raids')).toBe(true);
    expect(client.getQueryState(['raids'])!.dataUpdatedAt).toBe(NOW);
    await reopen();
    expect(client.getQueryState(['raids'])!.dataUpdatedAt).toBe(NOW);
  });

  it('cambiar el formato de PvP no borra las demás fuentes guardadas', async () => {
    await load('raids');
    await load('pvp');
    await settle();
    const database = await openDB('pke-meta', 1);
    await database.put('sources', { ...(await database.get('sources', 'pvp')), version: 1 }, 'pvp');
    database.close();
    await reopen();
    expect(client.getQueryData(['pvp'])).toBeUndefined();
    expect(client.getQueryData<Snapshot<unknown[]>>(['raids'])!.data).toHaveLength(18);
  });

  it('una pestaña antigua no pisa datos más recientes', async () => {
    const newer = { data: ['nuevo'] } as unknown as Snapshot<unknown>;
    const older = { data: ['viejo'] } as unknown as Snapshot<unknown>;
    await saveSource('raids', newer, NOW);
    await saveSource('raids', older, NOW - HOUR);
    await restoreSources(client);
    expect(client.getQueryData(['raids'])).toEqual(newer);
  });
});

describe('programación de comprobaciones', () => {
  const events = toEvents(fixtures.events()).data;
  const normal = { viaFallback: false };

  it('usa los periodos acordados', () => {
    expect(lifetime('pvp', NOW, normal)).toBe(DAY);
    expect(lifetime('raids', NOW, normal)).toBe(6 * HOUR);
    expect(lifetime('events', NOW, normal)).toBe(6 * HOUR);
  });

  it('las incursiones caducan al cambiar una rotación anunciada', () => {
    const limit = Date.parse('2026-11-24T21:00:00Z');
    expect(lifetime('raids', limit - HOUR, normal, events)).toBe(HOUR);
    expect(lifetime('raids', limit - 10 * HOUR, normal, events)).toBe(6 * HOUR);
  });

  it('una copia de respaldo se sustituye pronto', () => {
    expect(lifetime('pvp', NOW, { viaFallback: true })).toBe(RETRY_AFTER_ERROR);
  });

  it('espacia los reintentos tras un fallo', () => {
    const stale = { dataUpdatedAt: NOW - 7 * HOUR, errorUpdatedAt: 0 };
    expect(isDue(NOW, stale, 6 * HOUR)).toBe(true);
    expect(isDue(NOW, { ...stale, dataUpdatedAt: NOW - HOUR }, 6 * HOUR)).toBe(false);
    expect(isDue(NOW, { ...stale, errorUpdatedAt: NOW - MINUTE }, 6 * HOUR)).toBe(false);
    expect(isDue(NOW, { ...stale, errorUpdatedAt: NOW - RETRY_AFTER_ERROR }, 6 * HOUR)).toBe(true);
    expect(isDue(NOW, { dataUpdatedAt: 0, errorUpdatedAt: NOW - MINUTE }, 6 * HOUR)).toBe(false);
    expect(recentlyFailed(NOW, NOW - HOUR, NOW - 2 * HOUR)).toBe(false);
  });
});

describe('avisos', () => {
  const base: SourceState = {
    snapshot: {
      data: [],
      sourceUpdatedAt: NOW - HOUR,
      firstSeenAt: NOW,
      changedAt: null,
      discarded: 0,
      viaFallback: false,
    },
    checkedAt: NOW - HOUR,
    failedAt: 0,
    error: null,
    lifetime: 6 * HOUR,
    fetching: false,
  };
  const check = (change: Partial<SourceState>, snap: Partial<Snapshot<unknown>> = {}) =>
    assess('raids', { ...base, ...change, snapshot: change.snapshot ?? { ...base.snapshot!, ...snap } }, NOW);

  it('sin problemas no avisa', () => {
    expect(check({})).toEqual({ level: 'ok', messages: [] });
  });

  it('avisa de fallo, antigüedad, fuente parada, respaldo y registros omitidos', () => {
    expect(check({ error: new Error('Fallo'), failedAt: NOW }).messages[0]).toMatch(/últimos datos válidos/);
    expect(check({ checkedAt: NOW - 9 * HOUR }).messages[0]).toMatch(/desde hace 9 h/);
    expect(check({ checkedAt: 1 }).messages[0]).toMatch(/No se sabe/);
    expect(check({}, { sourceUpdatedAt: NOW - 20 * HOUR }).messages[0]).toMatch(/no publica desde hace 20 h/);
    expect(check({}, { viaFallback: true }).messages[0]).toMatch(/respaldo/);
    expect(check({}, { discarded: 2 }).messages[0]).toMatch(/2 registros/);
  });

  it('distingue «cargando» de «sin datos por un fallo»', () => {
    const empty = { ...base, snapshot: undefined, checkedAt: 0 };
    expect(assess('raids', { ...empty, fetching: true }, NOW).level).toBe('loading');
    expect(assess('raids', { ...empty, error: new Error('x'), failedAt: NOW }, NOW).level).toBe('error');
  });
});
