import { Settings } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toEvents } from '../../src/data/transform';
import { countdown, eventStatus, groupEvents, isGlobalTime, parseEventDate, raidBoundaries } from '../../src/domain/events';
import { fixtures, NOW } from '../fixtures';

// El dispositivo puede estar en otra zona horaria: el resultado no debe cambiar.
beforeAll(() => {
  Settings.defaultZone = 'America/Los_Angeles';
});
afterAll(() => {
  Settings.defaultZone = 'system';
});

const iso = (value: string) => parseEventDate(value)!.toUTC().toISO();

describe('fechas en hora peninsular', () => {
  it('sin zona: hora local de Madrid en invierno y en verano', () => {
    expect(iso('2026-11-25T18:00:00.000')).toBe('2026-11-25T17:00:00.000Z');
    expect(iso('2027-07-28T17:00:00.000')).toBe('2027-07-28T15:00:00.000Z');
  });

  it('con Z o desfase: instante mundial mostrado en Madrid', () => {
    expect(iso('2026-11-25T21:00:00.000Z')).toBe('2026-11-25T21:00:00.000Z');
    expect(parseEventDate('2026-11-25T21:00:00.000Z')!.hour).toBe(22);
    expect(iso('2026-11-25T21:00:00+02:00')).toBe('2026-11-25T19:00:00.000Z');
    expect(isGlobalTime('2026-11-25T21:00:00.000Z')).toBe(true);
    expect(isGlobalTime('2026-11-25T21:00:00.000')).toBe(false);
  });

  it('cambio a horario de verano (28 de marzo de 2027)', () => {
    expect(iso('2027-03-28T01:59:00.000')).toBe('2027-03-28T00:59:00.000Z');
    expect(iso('2027-03-28T03:00:00.000')).toBe('2027-03-28T01:00:00.000Z');
    const event = { start: '2027-03-27T10:00:00.000', end: '2027-03-28T10:00:00.000' };
    expect((Date.parse(iso(event.end)!) - Date.parse(iso(event.start)!)) / 3_600_000).toBe(23);
  });

  it('cambio a horario de invierno (31 de octubre de 2027)', () => {
    expect(iso('2027-10-31T01:30:00.000')).toBe('2027-10-30T23:30:00.000Z');
    expect(iso('2027-10-31T04:00:00.000')).toBe('2027-10-31T03:00:00.000Z');
  });

  it('una fecha ilegible no se interpreta', () => {
    expect(parseEventDate('TBD')).toBeNull();
    expect(parseEventDate('')).toBeNull();
    expect(parseEventDate(null)).toBeNull();
  });
});

describe('estado de los eventos', () => {
  const event = { start: '2026-11-25T18:00:00.000', end: '2026-11-25T19:00:00.000' };
  const at = (utc: string) => eventStatus(event, Date.parse(utc));

  it('cambia exactamente en los límites', () => {
    expect(at('2026-11-25T16:59:59.999Z')).toBe('upcoming');
    expect(at('2026-11-25T17:00:00.000Z')).toBe('active');
    expect(at('2026-11-25T17:59:59.999Z')).toBe('active');
    expect(at('2026-11-25T18:00:00.000Z')).toBe('ended');
  });

  it.each([
    [null, null],
    ['2026-11-20T10:00:00.000', null],
    [null, '2026-12-20T10:00:00.000'],
    ['TBD', '2026-12-20T10:00:00.000'],
    ['2026-12-20T10:00:00.000', '2026-11-20T10:00:00.000'],
  ])('fechas incompletas o incoherentes (%s, %s) nunca cuentan como activas', (start, end) => {
    expect(eventStatus({ start, end }, NOW)).toBe('unconfirmed');
  });

  it('con los datos reales separa los terminados que la fuente sigue listando', () => {
    const groups = groupEvents(toEvents(fixtures.events()).data, NOW);
    const ids = (list: { id: string }[]) => list.map((e) => e.id);
    expect(ids(groups.unconfirmed).sort()).toEqual(['eternamax-eternatus-max-battles-2026', 'november-communityday2026']);
    expect(ids(groups.active)).toContain('max-mondays-2026-11-23');
    expect(ids(groups.active)).not.toContain(
      'pokemon-latin-america-international-championships-2027-timed-research-twitch-drops',
    );
    expect(groups.upcoming[0]!.id).toBe('twilight-wishes-2026');
    expect(groups.active.length + groups.upcoming.length + groups.unconfirmed.length).toBe(38);
  });

  it('ordena los límites de las rotaciones', () => {
    const limits = raidBoundaries(toEvents(fixtures.events()).data);
    expect(limits).toEqual([...limits].sort((a, b) => a - b));
    expect(limits.find((t) => t > NOW)).toBe(Date.parse('2026-11-24T21:00:00Z'));
  });
});

describe('cuenta atrás', () => {
  it('da días, horas y segundos, y nunca es negativa', () => {
    expect(countdown(NOW + 90_061_000, NOW)).toBe('1 d 1 h 01 min');
    expect(countdown(NOW + 3_661_000, NOW)).toBe('01:01:01');
    expect(countdown(NOW - 5000, NOW)).toBe('00:00:00');
  });
});
