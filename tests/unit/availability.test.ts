import { describe, expect, it } from 'vitest';
import type { EventPage, RaidSchedule } from '../../src/data/models';
import { parseEventPage, parsePeriodBosses, toEvents, toRaidManifest, toRaids } from '../../src/data/transform';
import {
  eventsNeedingPage,
  periodSpan,
  raidBoard,
  rotationDays,
  statusOf,
  weekendDays,
  withPageDates,
  type BoardInput,
} from '../../src/domain/availability';
import { groupEvents } from '../../src/domain/events';
import { costumeName } from '../../src/domain/names';
import { fixtures } from '../fixtures';

/** Hora peninsular en noviembre y diciembre: UTC+1. */
const madrid = (local: string) => Date.parse(`${local}+01:00`);

// Copias reales del 26-11-2026. La lista de ScrapedDuck se publicó a las 04:27 UTC.
const raids = toRaids(fixtures.raids1126()).data;
const events = toEvents(fixtures.events1126()).data;
const LISTED = Date.parse('2026-11-26T04:27:03Z');

const PAGE_IDS = [
  'cresselia-darkrai-in-5-star-raid-battles-november-2026',
  'mega-banette-in-mega-raids-november-2026',
  'shadow-tornadus-incarnate-forme-in-shadow-raids-november-16-2026',
  'deoxys-normal-defense-attack-speed-formes-in-5-star-raid-battles-november-2026',
  'mega-metagross-in-mega-raids-november-2026',
  'shadow-dialga-in-shadow-raids-december-2026',
];
const PERIODS = [
  'cresselia-darkrai-mega-banette-november-2026',
  'twilight-wishes-2026-deoxys',
  'shadow-tornadus-incarnate-november-december-2026',
];

function calendar(): RaidSchedule {
  const manifest = toRaidManifest(fixtures.manifest());
  for (const period of manifest.periods) {
    if (PERIODS.includes(period.slug)) period.bosses = parsePeriodBosses(fixtures.leekduck(`periodo-${period.slug}`));
  }
  const pages: Record<string, EventPage> = {};
  for (const id of PAGE_IDS) pages[id] = parseEventPage(fixtures.leekduck(`evento-${id}`));
  return { generatedAt: manifest.generatedAt, periods: manifest.periods, pages };
}

const input = (now: number, change: Partial<BoardInput> = {}): BoardInput => ({
  raids,
  events,
  schedule: calendar(),
  listedAt: LISTED,
  stale: false,
  now,
  ...change,
});
const find = (name: string) => raids.find((b) => b.name === name)!;
const statusAt = (name: string, now: number, change: Partial<BoardInput> = {}) => {
  const board = raidBoard(input(now, change));
  return statusOf(find(name), board);
};

describe('calendario de LeekDuck', () => {
  it('lee los periodos en hora local y descarta los que no la usan o no tienen sentido', () => {
    const { periods, discarded } = toRaidManifest(fixtures.manifest());
    expect(periods).toHaveLength(14);
    expect(discarded).toBe(0);
    const twilight = periods.find((p) => p.slug === 'twilight-wishes-2026-deoxys')!;
    expect(twilight).toMatchObject({ kind: 'regular', start: '2026-11-25T06:00:00', end: '2026-11-30T20:00:00', tags: ['Event'] });
    // «-0800» es la zona del servidor de LeekDuck, no la del jugador: no se aplica.
    expect(periodSpan(twilight)).toEqual({ start: madrid('2026-11-25T06:00:00'), end: madrid('2026-11-30T20:00:00') });
    const raw = fixtures.manifest();
    raw.regular_raids[0].local_time = false;
    raw.regular_raids[1].end_date = raw.regular_raids[1].start_date;
    expect(toRaidManifest(raw).discarded).toBe(2);
    expect(() => toRaidManifest({ generated_at: 'ayer' })).toThrow(/estructura/);
  });

  it('lee los jefes de un periodo con los mismos nombres que la lista', () => {
    const bosses = parsePeriodBosses(fixtures.leekduck('periodo-twilight-wishes-2026-deoxys'));
    expect(bosses.map((b) => b.name)).toEqual([
      'Sun Crown Pikachu',
      'Moon Crown Pikachu',
      'Espeon wearing a sun scarf',
      'Umbreon wearing a moon scarf',
      'Deoxys (Normal)',
      'Deoxys (Defense)',
      'Deoxys (Attack)',
      'Deoxys (Speed)',
      'Mega Beedrill',
      'Mega Houndoom',
      'Mega Sableye',
      'Mega Manectric',
    ]);
    expect(bosses[8]).toMatchObject({ tier: 'Mega Raids', image: expect.stringMatching(/^https:\/\/cdn\.leekduck\.com\//) });
    expect(() => parsePeriodBosses('<html>Not found</html>')).toThrow(/estructura/);
  });

  it('lee el resumen y las fechas locales de la página de un evento', () => {
    const tornadus = parseEventPage(fixtures.leekduck(`evento-${PAGE_IDS[2]}`));
    expect(tornadus).toEqual({
      description: expect.stringContaining('every weekend'),
      start: '2026-11-16T06:00:00',
      end: '2026-12-01T22:00:00',
    });
    // ScrapedDuck publica este evento sin fechas; la página sí las tiene.
    expect(parseEventPage(fixtures.leekduck(`evento-${PAGE_IDS[0]}`))).toMatchObject({
      start: '2026-11-16T06:00:00',
      end: '2026-11-24T22:00:00',
    });
    const global = fixtures.leekduck(`evento-${PAGE_IDS[0]}`).replace('data-local-time="true"', 'data-local-time="false"');
    expect(parseEventPage(global)).toMatchObject({ start: null, end: null });
    expect(() => parseEventPage('<html><body>Error</body></html>')).toThrow(/estructura/);
  });

  it('solo reconoce condiciones de días expresas', () => {
    expect(rotationDays({ description: 'Shadow Tornadus will appear in five-star Shadow Raids every weekend from…' })).toBe('weekends');
    expect(rotationDays(parseEventPage(fixtures.leekduck(`evento-${PAGE_IDS[5]}`)))).toBeNull();
    expect(rotationDays({ description: 'Mega Metagross will be in Mega Raids from November 25…' })).toBeNull();
    expect(rotationDays({ description: 'It will appear every Wednesday in raids.' })).toBe('other');
    expect(rotationDays({ description: null })).toBeNull();
    expect(rotationDays(undefined)).toBeNull();
  });

  it('calcula el fin de semana en hora peninsular, dentro de la rotación', () => {
    const rotation = { start: madrid('2026-11-16T06:00:00'), end: madrid('2026-12-01T22:00:00') };
    const sat = madrid('2026-11-28T00:00:00');
    const sun = madrid('2026-11-29T00:00:00');
    expect(weekendDays(madrid('2026-11-26T09:00:00'), rotation)).toEqual([sat, sun]);
    expect(weekendDays(madrid('2026-11-29T23:30:00'), rotation)).toEqual([sun]);
    // El sábado a las 00:30 en Madrid sigue siendo viernes en UTC.
    expect(weekendDays(madrid('2026-11-28T00:30:00'), rotation)).toEqual([sat, sun]);
    expect(weekendDays(madrid('2026-11-30T21:00:00'), rotation)).toEqual([]);
    expect(weekendDays(madrid('2026-11-27T12:00:00'), { ...rotation, end: madrid('2026-11-28T10:00:00') })).toEqual([sat]);
  });

  it('pide las páginas de las rotaciones cercanas y de los eventos sin fecha', () => {
    const ids = eventsNeedingPage(events, madrid('2026-11-26T09:00:00')).map((e) => e.id);
    expect(ids).toEqual(
      expect.arrayContaining([...PAGE_IDS, 'regidrago-in-5-star-raid-battles-december-2026', 'mega-slowbro-in-mega-raids-december-2026']),
    );
    expect(ids).not.toContain('mega-gengar-in-mega-raids-december-2026');
    expect(ids.length).toBeLessThanOrEqual(12);
  });
});

describe('disponibilidad el jueves 26 de noviembre, 09:00', () => {
  const now = madrid('2026-11-26T09:00:00');
  const board = raidBoard(input(now));
  const ahora = board.now.map((e) => e.boss.name);

  it('Deoxys, por su rotación, hasta el 1 de diciembre a las 22:00', () => {
    expect(statusAt('Deoxys (Normal)', now)).toEqual({
      kind: 'confirmed',
      until: madrid('2026-12-01T22:00:00'),
      by: 'Deoxys (Normal, Defense, Attack, and Speed Formes) in 5-star Raid Battles',
    });
  });

  it('las megas del evento, por el periodo en curso, hasta el 30 a las 20:00', () => {
    for (const name of ['Mega Beedrill', 'Mega Houndoom', 'Mega Sableye', 'Mega Manectric', 'Sun Crown Pikachu']) {
      expect(statusAt(name, now)).toEqual({ kind: 'confirmed', until: madrid('2026-11-30T20:00:00'), by: 'Twilight Wishes (Deoxys)' });
    }
  });

  it('las oscuras de 1 y 3 estrellas, por el periodo de oscuras', () => {
    expect(statusAt('Shadow Larvitar', now)).toMatchObject({ kind: 'confirmed', until: madrid('2026-12-01T20:00:00') });
  });

  it('Tornadus oscuro no está: solo fines de semana', () => {
    expect(ahora).not.toContain('Shadow Tornadus (Incarnate)');
    expect(statusAt('Shadow Tornadus (Incarnate)', now)).toEqual({
      kind: 'weekend-later',
      days: [madrid('2026-11-28T00:00:00'), madrid('2026-11-29T00:00:00')],
      end: madrid('2026-12-01T22:00:00'),
    });
    expect(ahora).toHaveLength(19);
  });

  it('Mega Metagross queda como anuncio sin confirmar, sin darlo por falso', () => {
    const metagross = board.upcoming.find((u) => u.key === 'mega-metagross-in-mega-raids-november-2026');
    expect(metagross).toMatchObject({
      kind: 'announced',
      roster: [{ name: 'Mega Metagross' }],
      start: madrid('2026-11-25T06:00:00'),
      end: madrid('2026-12-01T22:00:00'),
      overlap: { title: 'Twilight Wishes (Deoxys)', end: madrid('2026-11-30T20:00:00') },
    });
    expect(board.upcoming[0]).toBe(metagross);
  });

  it('lo próximo, en orden y con sus fechas', () => {
    const keys = board.upcoming.map((u) => u.key);
    expect(keys.indexOf('fin-Shadow Tornadus (Incarnate)')).toBeLessThan(keys.indexOf('regidrago-in-5-star-raid-battles-december-2026'));
    expect(board.upcoming.find((u) => u.key === 'regidrago-in-5-star-raid-battles-december-2026')).toMatchObject({
      kind: 'scheduled',
      start: madrid('2026-12-02T06:00:00'),
      end: madrid('2026-12-08T22:00:00'),
      weekends: false,
    });
    const dialga = board.upcoming.find((u) => u.key === 'shadow-dialga-in-shadow-raids-december-2026');
    // Su anuncio no limita los días: no se inventa ninguna condición.
    expect(dialga).toMatchObject({ shadow: true, weekends: false, roster: [{ name: 'Dialga' }] });
    expect(keys).toContain('clefable-super-mega-raid-day-2026');
    expect(board.nextChange).toBe(madrid('2026-11-28T14:00:00'));
  });

  it('nada termina sin avisar y no queda nada desfasado', () => {
    expect(board.gone).toEqual([]);
    expect(board.alsoNow).toEqual([]);
  });

  it('los eventos que ScrapedDuck publica sin fecha y ya terminaron no salen como «sin fecha»', () => {
    const before = groupEvents(events, now).unconfirmed.map((e) => e.id);
    expect(before).toEqual(expect.arrayContaining([PAGE_IDS[0], PAGE_IDS[1]]));
    const after = groupEvents(withPageDates(events, calendar().pages), now);
    expect(after.unconfirmed.map((e) => e.id)).not.toContain(PAGE_IDS[0]);
    expect(after.unconfirmed.map((e) => e.id)).not.toContain(PAGE_IDS[1]);
    expect([...after.active, ...after.upcoming].map((e) => e.id)).not.toContain(PAGE_IDS[0]);
  });
});

describe('otros momentos', () => {
  it('el sábado 28 sí está Tornadus oscuro, hasta el domingo', () => {
    const now = madrid('2026-11-28T12:00:00');
    expect(statusAt('Shadow Tornadus (Incarnate)', now)).toMatchObject({
      kind: 'weekend',
      days: [madrid('2026-11-28T00:00:00'), madrid('2026-11-29T00:00:00')],
    });
  });

  it('durante el Día de Incursiones, lo que el periodo trae y la lista aún no', () => {
    const schedule = calendar();
    const day = schedule.periods.find((p) => p.slug === 'clefable-super-mega-raid-day-2026')!;
    day.bosses = [{ name: 'Mega Clefable', tier: 'Super Mega Raids', image: null }];
    const board = raidBoard(input(madrid('2026-11-28T15:00:00'), { schedule }));
    expect(board.alsoNow).toEqual([{ boss: day.bosses[0], period: day, until: madrid('2026-11-28T17:00:00') }]);
  });

  it('el lunes 30 a las 21:00, la lista del jueves ya no confirma las megas del evento', () => {
    const now = madrid('2026-11-30T21:00:00');
    const board = raidBoard(input(now));
    expect(statusAt('Mega Beedrill', now)).toEqual({ kind: 'gone', since: madrid('2026-11-30T20:00:00'), reason: 'outdated' });
    expect(statusAt('Deoxys (Attack)', now)).toMatchObject({ kind: 'confirmed', until: madrid('2026-12-01T22:00:00') });
    // Ya no quedan fines de semana en su rotación.
    expect(statusAt('Shadow Tornadus (Incarnate)', now)).toMatchObject({ kind: 'gone', reason: 'no-weekends' });
    expect(board.upcoming.find((u) => u.key === 'mega-metagross-in-mega-raids-november-2026')).toMatchObject({
      kind: 'announced',
      overlap: null,
    });
  });

  it('con una lista publicada después del cambio, manda la lista', () => {
    const now = madrid('2026-11-30T23:00:00');
    expect(statusAt('Mega Beedrill', now, { listedAt: madrid('2026-11-30T22:30:00') })).toEqual({ kind: 'listed' });
  });

  it('con datos antiguos conserva la lista, pero no confirma nada', () => {
    const now = madrid('2026-11-26T09:00:00');
    const board = raidBoard(input(now, { stale: true }));
    expect(new Set(board.now.map((e) => e.availability.kind))).toEqual(new Set(['stale']));
    expect(board.now.length).toBeGreaterThan(0);
    expect(board.alsoNow).toEqual([]);
  });

  it('sin el calendario de LeekDuck, lo que depende de una rotación queda sin comprobar', () => {
    const now = madrid('2026-11-26T09:00:00');
    expect(statusAt('Shadow Tornadus (Incarnate)', now, { schedule: undefined })).toEqual({
      kind: 'unverified',
      by: 'Shadow Tornadus (Incarnate Forme) in Shadow Raids',
      reason: 'page',
    });
    expect(statusAt('Deoxys (Normal)', now, { schedule: undefined }).kind).toBe('unverified');
    expect(statusAt('Mega Beedrill', now, { schedule: undefined })).toEqual({ kind: 'listed' });
  });

  it('si una página no se ha podido leer, su rotación no se confirma', () => {
    const schedule = calendar();
    delete schedule.pages[PAGE_IDS[3]!];
    expect(statusAt('Deoxys (Speed)', madrid('2026-11-26T09:00:00'), { schedule }).kind).toBe('unverified');
  });
});

describe('disfraces', () => {
  it('usa el nombre oficial en español solo si coinciden la imagen y el nombre', () => {
    const pikachu = find('Sun Crown Pikachu');
    expect(costumeName(pikachu.name, pikachu.image)).toBe('Pikachu con corona de sol');
    const espeon = find('Espeon wearing a sun scarf');
    expect(costumeName(espeon.name, espeon.image)).toBe('Espeon con bufanda de sol');
    expect(costumeName('Moon Crown Pikachu', pikachu.image)).toBeNull();
    expect(costumeName('Sun Crown Pikachu', null)).toBeNull();
  });
});
