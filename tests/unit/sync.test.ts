import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { QueryObserver, type QueryClient } from '@tanstack/preact-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY, HOUR, MINUTE, RETRY_AFTER_ERROR, type CountersTarget } from '../../src/data/config';
import type { Snapshot } from '../../src/data/models';
import { countersKey, countersQuery, createClient, formatKey, formatQuery, isDue, lifetime, recentlyFailed, sourceQuery } from '../../src/data/queries';
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
    expect((await load('pokebattler')).data.raids).toHaveProperty('DARKRAI', 'RAID_LEVEL_5');
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

describe('counters por jefe', () => {
  const cresselia = { id: 'CRESSELIA', tier: 'RAID_LEVEL_5', weather: 'NO_WEATHER' } as const;
  const fetchCounters = (target: CountersTarget = cresselia) =>
    client.fetchQuery({ ...countersQuery(client, target), retry: false });

  it('guarda cada jefe y clima, y los recupera sin red', async () => {
    await fetchCounters();
    await fetchCounters({ ...cresselia, weather: 'FOG' });
    table = {};
    await reopen();
    expect(client.getQueryData<Snapshot<any>>(countersKey(cresselia))!.data.list).toHaveLength(30);
    expect(client.getQueryState(countersKey({ ...cresselia, weather: 'FOG' }))!.dataUpdatedAt).toBe(NOW);
    expect(storageErrors).toEqual([]);
  });

  it('no repite la petición durante 24 horas', async () => {
    await fetchCounters();
    await reopen();
    calls = [];
    vi.setSystemTime(NOW + DAY - MINUTE);
    await fetchCounters();
    expect(calls).toEqual([]);
    vi.setSystemTime(NOW + DAY + MINUTE);
    await fetchCounters();
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['sin red', offline],
    ['límite de peticiones', () => new Response('', { status: 429 })],
    ['HTML', () => new Response('<html>')],
    ['vacía', () => new Response('{}')],
  ] as [string, Reply][])('si falla (%s) conserva los últimos válidos', async (_, reply) => {
    await fetchCounters();
    vi.setSystemTime(NOW + 2 * DAY);
    table['raids/defenders/CRESSELIA/'] = reply;
    await expect(fetchCounters()).rejects.toThrow();
    await reopen();
    expect(client.getQueryState<Snapshot<any>>(countersKey(cresselia))).toMatchObject({
      dataUpdatedAt: NOW,
      data: { data: { list: { length: 30 } } },
    });
  });

  it('si Pokébattler limita las consultas, espera lo que pide antes de preguntar por otro jefe o clima', async () => {
    // Otra fecha: la pausa dura lo que la aplicación y no debe alcanzar a las demás pruebas.
    const start = NOW + 100 * DAY;
    vi.setSystemTime(start);
    const limited = () => new Response('', { status: 429, headers: { 'Retry-After': '120' } });
    table['raids/defenders/CRESSELIA/'] = limited;
    await expect(fetchCounters()).rejects.toThrow(/error 429/);
    table = routes();
    calls = [];
    vi.setSystemTime(start + MINUTE);
    await expect(fetchCounters({ ...cresselia, weather: 'FOG' })).rejects.toThrow(/pedido esperar/);
    expect(calls).toEqual([]);
    vi.setSystemTime(start + 2 * MINUTE + 1);
    await fetchCounters();
    expect(calls).toHaveLength(1);
  });

  it('borra los que no se actualizan desde hace un mes, y solo esos', async () => {
    await fetchCounters();
    await load('raids');
    vi.setSystemTime(NOW + 31 * DAY);
    await reopen();
    expect(client.getQueryData(countersKey(cresselia))).toBeUndefined();
    expect(client.getQueryData(['raids'])).toBeDefined();
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

describe('Team GO Rocket', () => {
  const COMMITS = 'repos/WatWowMap/event-info/commits';
  const CHANGED = Date.parse('2026-10-04T04:51:19Z');

  it('descarga las tres fuentes y la fecha del último cambio', async () => {
    expect(await load('rocket')).toMatchObject({ sourceUpdatedAt: CHANGED, discarded: 0, data: { length: 26 } });
    expect((await load('rocketContrast')).data).toHaveLength(26);
    expect((await load('rocketAttackers')).data.source.license).toBe('CC BY 4.0');
  });

  it('un cambio en la fuente llega sin volver a publicar la aplicación', async () => {
    await load('rocket');
    vi.setSystemTime(NOW + 7 * HOUR);
    const next = fixtures.rocket();
    next['44'].encounters.third = [{ id: 643 }];
    table['event-info/main/grunts/formatted.json'] = next;
    table[COMMITS] = fixtures.commit('2026-11-23T15:00:00Z');
    const { data, changedAt, sourceUpdatedAt } = await load('rocket');
    expect(data.find((t) => t.kind === 'giovanni')!.slots[2].options).toEqual([{ dex: 643, form: null }]);
    expect(changedAt).toBe(NOW + 7 * HOUR);
    expect(sourceUpdatedAt).toBe(Date.parse('2026-11-23T15:00:00Z'));
  });

  it('si no se puede leer la fecha, conserva la conocida solo mientras no cambien las alineaciones', async () => {
    await load('rocket');
    vi.setSystemTime(NOW + 7 * HOUR);
    table[COMMITS] = () => new Response('{}', { status: 403 });
    expect((await load('rocket')).sourceUpdatedAt).toBe(CHANGED);
    vi.setSystemTime(NOW + 14 * HOUR);
    const next = fixtures.rocket();
    next['44'].encounters.third = [{ id: 643 }];
    table['event-info/main/grunts/formatted.json'] = next;
    expect((await load('rocket')).sourceUpdatedAt).toBeNull();
  });

  it.each([
    ['sin red', offline],
    ['error del servidor', () => new Response('', { status: 503 })],
    ['HTML', '<html></html>'],
    ['lista vacía', {}],
  ])('si la principal falla (%s), se conservan los últimos datos tras reabrir', async (_, reply) => {
    await load('rocket');
    table['event-info/main/grunts/formatted.json'] = reply;
    vi.setSystemTime(NOW + 7 * HOUR);
    await expect(load('rocket')).rejects.toThrow();
    await reopen();
    expect(client.getQueryData<Snapshot<unknown[]>>(['rocket'])!.data).toHaveLength(26);
    expect(client.getQueryState(['rocket'])!.dataUpdatedAt).toBe(NOW);
  });

  it('si falla el contraste, las alineaciones no se ven afectadas', async () => {
    await load('rocketContrast');
    table['rocketLineups.min.json'] = offline;
    vi.setSystemTime(NOW + 7 * HOUR);
    await expect(load('rocketContrast')).rejects.toThrow();
    expect((await load('rocket')).data).toHaveLength(26);
    await reopen();
    expect(client.getQueryData<Snapshot<unknown[]>>(['rocketContrast'])!.data).toHaveLength(26);
  });

  it('la primera vez usa la copia de respaldo si la principal no responde, y lo indica', async () => {
    const copy = fixtures.rocket();
    table = { 'cdn.jsdelivr.net/gh/WatWowMap/event-info@main': copy, 'raw.githubusercontent.com/WatWowMap/event-info': offline, ...table };
    expect(await load('rocket')).toMatchObject({ viaFallback: true, data: { length: 26 } });
  });

  it('se consulta de nuevo a las seis horas', () => {
    expect(lifetime('rocket', NOW, { viaFallback: false })).toBe(6 * HOUR);
    expect(lifetime('rocketContrast', NOW, { viaFallback: false })).toBe(6 * HOUR);
    expect(lifetime('rocketAttackers', NOW, { viaFallback: false })).toBe(DAY);
  });
});

describe('copas, ligas Mega e incursiones por tipo', () => {
  const target = { cup: 'mega', cp: 1500 };
  const loadFormat = () => client.fetchQuery({ ...formatQuery(client, target), retry: false });

  it('el ranking de un formato se pide solo al abrirlo', async () => {
    await load('pvp');
    expect(calls.filter((url) => url.includes('rankings/mega'))).toEqual([]);
    const { data, sourceUpdatedAt } = await loadFormat();
    expect(data.entries[0]!.name).toBe('Sableye (Mega)');
    expect(sourceUpdatedAt).toBe(Date.parse('2026-11-20T16:56:34Z'));
  });

  it('se guarda por formato y sobrevive a un fallo y a reabrir', async () => {
    await loadFormat();
    table['rankings/mega/overall/rankings-1500.json'] = () => new Response('', { status: 404 });
    vi.setSystemTime(NOW + 2 * DAY);
    await expect(loadFormat()).rejects.toThrow(/404/);
    await reopen();
    expect(client.getQueryData<Snapshot<any>>(formatKey(target))!.data.entries).toHaveLength(120);
    expect(client.getQueryState(formatKey(target))!.dataUpdatedAt).toBe(NOW);
  });

  it('los formatos que no se usan se borran', async () => {
    await loadFormat();
    await settle();
    vi.setSystemTime(NOW + 31 * DAY);
    await reopen();
    expect(client.getQueryData(formatKey(target))).toBeUndefined();
  });

  it('una copa sin ranking publicado falla sin afectar a las ligas', async () => {

    table = { 'rankings/fantasy': () => new Response('', { status: 404 }), ...table };
    await expect(client.fetchQuery({ ...formatQuery(client, { cup: 'fantasy', cp: 1500 }), retry: false })).rejects.toThrow(/404/);
    expect((await load('pvp')).data.leagues[1500]).toHaveLength(1156);
  });

  it('el calendario conserva la semana en curso si la fuente deja de listarla', async () => {
    expect((await load('season')).data).toHaveLength(2);
    table['events.min.json'] = fixtures.events().filter((e: any) => e.eventType !== 'go-battle-league');
    vi.setSystemTime(NOW + 7 * HOUR);
    expect((await load('season')).data).toHaveLength(1);
    vi.setSystemTime(NOW + 9 * DAY);
    expect((await load('season')).data).toEqual([]);
  });

  it('incursiones por tipo y catálogo Max', async () => {
    expect((await load('raidTypes')).data.source.license).toBe('CC BY 4.0');
    expect((await load('pokebattler')).data.max).toHaveLength(6);
    expect(lifetime('format', NOW, { viaFallback: false })).toBe(DAY);
    expect(lifetime('season', NOW, { viaFallback: false })).toBe(6 * HOUR);
  });
});
