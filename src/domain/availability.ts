import { DateTime } from 'luxon';
import { DAY, ZONE } from '../data/config';
import type { EventPage, GameEvent, PeriodBoss, RaidBoss, RaidPeriod, RaidSchedule } from '../data/models';
import { eventStatus, isRaidRotation, parseEventDate, schedule } from './events';
import { isShadowRotation, rotationIncludes } from './raids';
import { normalize } from './text';

/*
 * Qué incursiones hay ahora. Se cruzan tres datos de LeekDuck:
 * - su lista de jefes actual (a través de ScrapedDuck), que no trae fechas;
 * - su calendario de periodos, con hora local y los jefes de cada periodo en curso;
 * - los eventos de rotación de cada jefe, con fechas y con un resumen que puede limitar los días.
 * Nunca se da por disponible algo que solo figura en una lista sin fecha si hay motivos para dudar.
 */

export interface Span {
  start: number;
  end: number;
}

function span(start: string | null, end: string | null): Span | null {
  const a = parseEventDate(start);
  const b = parseEventDate(end);
  return a && b && a.toMillis() < b.toMillis() ? { start: a.toMillis(), end: b.toMillis() } : null;
}

export const periodSpan = (period: Pick<RaidPeriod, 'start' | 'end'>): Span | null => span(period.start, period.end);
const eventSpan = (event: Pick<GameEvent, 'start' | 'end'>): Span | null => span(event.start, event.end);
const within = (s: Span | null, now: number): s is Span => s !== null && s.start <= now && now < s.end;

/** Condición de días que el resumen del evento indica expresamente. Sin texto, ninguna. */
export type Days = 'weekends' | 'other' | null;

export function rotationDays(page: Pick<EventPage, 'description'> | undefined): Days {
  const text = page?.description ?? '';
  if (/\b(?:every|each) weekend\b|\bon weekends\b|\bweekends only\b|\bduring weekends\b/i.test(text)) return 'weekends';
  // Otras limitaciones de días que no se saben aplicar: se avisa en lugar de suponer.
  if (/\bevery (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b|\bweekdays\b|\bonly on\b/i.test(text)) {
    return 'other';
  }
  return null;
}

const madrid = (ms: number) => DateTime.fromMillis(ms, { zone: ZONE });

/**
 * Sábado y domingo (inicio del día en hora peninsular) del primer fin de semana desde `now` dentro de
 * la rotación. LeekDuck no da horas para estos días: se informa del día, no de la hora.
 */
export function weekendDays(now: number, rotation: Span): number[] {
  const days: number[] = [];
  let day = madrid(Math.max(now, rotation.start)).startOf('day');
  for (let i = 0; i < 9 && day.toMillis() < rotation.end; i++, day = day.plus({ days: 1 })) {
    if (day.weekday >= 6) days.push(day.toMillis());
    else if (days.length > 0) break;
  }
  return days;
}

export type Availability =
  /** Un evento de rotación con fechas o el periodo en curso del calendario lo incluyen. */
  | { kind: 'confirmed'; until: number; by: string }
  /** Su rotación es solo de fines de semana y hoy lo es. */
  | { kind: 'weekend'; until: number; days: number[]; by: string }
  /** Está en la lista de LeekDuck, pero ningún calendario lo respalda ni lo contradice. */
  | { kind: 'listed' }
  /** Su rotación tiene condiciones que no se han podido comprobar. */
  | { kind: 'unverified'; by: string; reason: 'page' | 'days' }
  /** Datos antiguos: se conserva lo último conocido sin darlo por confirmado. */
  | { kind: 'stale' };

export interface BoardEntry {
  boss: RaidBoss;
  availability: Availability;
}

export interface Roster {
  name: string;
  image: string | null;
}

/** Algo que no está disponible ahora: lo anunciado, lo próximo y lo que ya no se puede confirmar. */
export type Upcoming =
  /** Rotación, día o hora de incursiones con fechas futuras. */
  | { kind: 'scheduled'; key: string; type: string; title: string; shadow: boolean; roster: Roster[]; start: number; end: number; link: string | null; weekends: boolean }
  /** Jefe de la lista cuya rotación solo es de fines de semana y hoy no lo es. */
  | { kind: 'weekend'; key: string; boss: RaidBoss; days: number[]; end: number; link: string | null }
  /** Un evento lo programa ahora, pero no está en la lista actual ni en el periodo en curso. */
  | {
      kind: 'announced';
      key: string;
      title: string;
      shadow: boolean;
      roster: Roster[];
      start: number;
      end: number;
      link: string | null;
      /** Periodo de evento en curso que muestra otros jefes del mismo nivel. */
      overlap: { title: string; end: number } | null;
    };

/** Jefes de la lista que pueden haber dejado de estar disponibles. */
export interface Gone {
  boss: RaidBoss;
  /** Fin de la rotación, o cambio del calendario posterior a la lista. */
  since: number;
  reason: 'ended' | 'no-weekends' | 'outdated';
}

export interface RaidBoard {
  now: BoardEntry[];
  /** Jefes del periodo en curso que la lista aún no recoge, como los de un Día de Incursiones. */
  alsoNow: { boss: PeriodBoss; period: RaidPeriod; until: number }[];
  upcoming: Upcoming[];
  gone: Gone[];
  /** Próximo inicio o fin conocido. */
  nextChange: number | null;
}

export interface BoardInput {
  raids: RaidBoss[];
  events: GameEvent[];
  schedule: RaidSchedule | undefined;
  /** Publicación de la lista por ScrapedDuck o, si se desconoce, cuándo se consultó. */
  listedAt: number;
  /** La lista o el calendario son demasiado antiguos para confirmar nada. */
  stale: boolean;
  now: number;
}

const sameName = (a: string, b: string) => normalize(a) === normalize(b);
const rosterOf = (event: GameEvent): Roster[] =>
  event.featured.length > 0
    ? event.featured.map(({ name, image }) => ({ name, image }))
    : event.raidBosses.map((name) => ({ name, image: null }));

const RAID_DATES = /^raid-(?:day|hour|weekend)$/;

/** Fechas de la página de LeekDuck para los eventos que ScrapedDuck publica sin ellas. */
export function withPageDates(events: GameEvent[], pages: Record<string, EventPage> | undefined): GameEvent[] {
  if (!pages) return events;
  return events.map((event) => {
    const page = pages[event.id];
    if (schedule(event).complete || !page || !span(page.start, page.end)) return event;
    return { ...event, start: page.start, end: page.end };
  });
}

/** Eventos cuya página hay que leer: rotaciones en curso o de la próxima semana y eventos sin fechas. */
export function eventsNeedingPage(events: GameEvent[], now: number): GameEvent[] {
  const fromLeekDuck = (e: GameEvent) => e.link !== null && /^https:\/\/leekduck\.com\/events\/[\w-]+\/?$/.test(e.link);
  const rotation = events.filter((e) => {
    if (!fromLeekDuck(e) || !isRaidRotation(e)) return false;
    const s = eventSpan(e);
    return s !== null && s.end > now && s.start < now + 8 * DAY;
  });
  const undated = events.filter((e) => fromLeekDuck(e) && !schedule(e).complete);
  return [...rotation.sort((a, b) => eventSpan(a)!.start - eventSpan(b)!.start), ...undated];
}

export function raidBoard({ raids, events, schedule: calendar, listedAt, stale, now }: BoardInput): RaidBoard {
  const pages = calendar?.pages;
  const dated = withPageDates(events, pages);
  const rotations = dated.filter((e) => isRaidRotation(e) && eventSpan(e) !== null);
  const activeRotations = rotations.filter((e) => eventStatus(e, now) === 'active');
  const periods = calendar?.periods ?? [];
  const activePeriods = periods.filter((p) => within(periodSpan(p), now));

  // Último cambio conocido ya ocurrido: si la lista es anterior, lo que solo ella respalda puede haber cambiado.
  const marks = [...rotations.map(eventSpan), ...periods.map(periodSpan)].flatMap((s) => (s ? [s.start, s.end] : []));
  const lastChange = Math.max(0, ...marks.filter((at) => at <= now));
  const nextChange = Math.min(...marks.filter((at) => at > now));

  const inPeriod = (name: string, shadow: boolean) =>
    activePeriods.find((p) => (p.kind === 'shadow') === shadow && p.bosses?.some((b) => sameName(b.name, name)));

  const board: RaidBoard = { now: [], alsoNow: [], upcoming: [], gone: [], nextChange: Number.isFinite(nextChange) ? nextChange : null };

  for (const boss of raids) {
    const rotation = activeRotations.find((e) => rotationIncludes(e, boss));
    const period = inPeriod(boss.name, boss.shadow);
    const add = (availability: Availability) => board.now.push({ boss, availability: stale ? { kind: 'stale' } : availability });
    if (rotation) {
      const until = eventSpan(rotation)!.end;
      const page = pages?.[rotation.id];
      const days = rotationDays(page);
      if (!page) add({ kind: 'unverified', by: rotation.name, reason: 'page' });
      else if (days === 'other') add({ kind: 'unverified', by: rotation.name, reason: 'days' });
      else if (days === 'weekends') {
        const weekend = weekendDays(now, eventSpan(rotation)!);
        const today = madrid(now).startOf('day').toMillis();
        if (weekend.length === 0) board.gone.push({ boss, since: now, reason: 'no-weekends' });
        else if (weekend[0] === today) add({ kind: 'weekend', until, days: weekend, by: rotation.name });
        else board.upcoming.push({ kind: 'weekend', key: `fin-${boss.name}`, boss, days: weekend, end: until, link: rotation.link });
      } else add({ kind: 'confirmed', until, by: rotation.name });
      continue;
    }
    if (period) {
      add({ kind: 'confirmed', until: periodSpan(period)!.end, by: period.title });
      continue;
    }
    const ended = rotations
      .filter((e) => eventStatus(e, now) === 'ended' && rotationIncludes(e, boss))
      .map((e) => eventSpan(e)!.end)
      .sort((a, b) => b - a)[0];
    // Si la lista es posterior al final y aún lo incluye, manda la lista.
    if (ended !== undefined && ended > listedAt) board.gone.push({ boss, since: ended, reason: 'ended' });
    else if (lastChange > listedAt) board.gone.push({ boss, since: lastChange, reason: 'outdated' });
    else add({ kind: 'listed' });
  }

  const listed = (name: string, shadow: boolean) =>
    raids.some((b) => b.shadow === shadow && sameName(b.name.replace(/^shadow\s+/i, ''), name.replace(/^shadow\s+/i, '')));

  /** Una rotación en curso lo limita a ciertos días o no se ha podido leer: el periodo no basta. */
  const restricted = (name: string, shadow: boolean) =>
    activeRotations.some(
      (e) =>
        isShadowRotation(e) === shadow &&
        e.raidBosses.some((other) => sameName(other.replace(/^shadow\s+/i, ''), name.replace(/^shadow\s+/i, ''))) &&
        (!pages?.[e.id] || rotationDays(pages[e.id]) !== null),
    );

  // Lo que el periodo en curso incluye y la lista aún no.
  for (const period of activePeriods) {
    for (const boss of period.bosses ?? []) {
      const shadow = period.kind === 'shadow';
      if (listed(boss.name, shadow) || restricted(boss.name, shadow) || stale) continue;
      board.alsoNow.push({ boss, period, until: periodSpan(period)!.end });
    }
  }

  for (const event of rotations) {
    const s = eventSpan(event)!;
    const shadow = isShadowRotation(event);
    const roster = rosterOf(event);
    const base = { title: event.name, shadow, roster, start: s.start, end: s.end, link: event.link };
    if (s.start > now) {
      const weekends = rotationDays(pages?.[event.id]) === 'weekends';
      board.upcoming.push({ kind: 'scheduled', key: event.id, type: event.type, ...base, weekends });
      continue;
    }
    if (s.end <= now) continue;
    // En curso: lo que no está en la lista ni en el periodo es un anuncio sin confirmar.
    const missing = roster.filter(
      (r) =>
        !listed(r.name, shadow) &&
        (stale || restricted(r.name, shadow) || !inPeriod(shadow ? `Shadow ${r.name}` : r.name, shadow)),
    );
    if (missing.length === 0) continue;
    const overlap = activePeriods.find((p) => (p.kind === 'shadow') === shadow && p.tags.includes('Event') && p.bosses !== null);
    board.upcoming.push({
      kind: 'announced',
      key: event.id,
      ...base,
      roster: missing,
      overlap: overlap ? { title: overlap.title, end: periodSpan(overlap)!.end } : null,
    });
  }

  for (const event of dated) {
    const s = eventSpan(event);
    if (!RAID_DATES.test(event.type) || !s || s.start <= now) continue;
    board.upcoming.push({
      kind: 'scheduled',
      key: event.id,
      type: event.type,
      title: event.name,
      shadow: false,
      roster: rosterOf(event),
      start: s.start,
      end: s.end,
      link: event.link,
      weekends: false,
    });
  }

  const order = (u: Upcoming) => (u.kind === 'announced' ? 0 : u.kind === 'weekend' ? u.days[0]! : u.start);
  board.upcoming.sort((a, b) => order(a) - order(b));
  return board;
}

/** Estado de un jefe de la lista, esté o no disponible ahora. */
export type BossStatus =
  | Availability
  | { kind: 'weekend-later'; days: number[]; end: number }
  | { kind: 'gone'; since: number; reason: Gone['reason'] };

export function statusOf(boss: RaidBoss, board: RaidBoard): BossStatus {
  const entry = board.now.find((e) => e.boss === boss);
  if (entry) return entry.availability;
  for (const item of board.upcoming) {
    if (item.kind === 'weekend' && item.boss === boss) return { kind: 'weekend-later', days: item.days, end: item.end };
  }
  const gone = board.gone.find((g) => g.boss === boss);
  return gone ? { kind: 'gone', since: gone.since, reason: gone.reason } : { kind: 'listed' };
}
