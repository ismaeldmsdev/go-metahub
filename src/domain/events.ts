import { DateTime } from 'luxon';
import { ZONE } from '../data/config';
import type { GameEvent } from '../data/models';

export type EventStatus = 'active' | 'upcoming' | 'ended' | 'unconfirmed';

/**
 * Con «Z» o desfase es un instante mundial; sin ellos es hora local del juego,
 * que aquí siempre se interpreta como hora peninsular, sea cual sea la zona del dispositivo.
 */
export function parseEventDate(value: string | null): DateTime<true> | null {
  if (!value) return null;
  const date = DateTime.fromISO(value, { zone: ZONE });
  return date.isValid ? date : null;
}

export const isGlobalTime = (value: string | null): boolean => value !== null && /(?:Z|[+-]\d\d:?\d\d)$/.test(value);

export interface Schedule {
  start: DateTime<true> | null;
  end: DateTime<true> | null;
  /** Hay principio y fin, y son coherentes. */
  complete: boolean;
}

export function schedule(event: Pick<GameEvent, 'start' | 'end'>): Schedule {
  const start = parseEventDate(event.start);
  const end = parseEventDate(event.end);
  return { start, end, complete: start !== null && end !== null && start.toMillis() < end.toMillis() };
}

/** Sin fechas completas un evento nunca se da por activo. */
export function eventStatus(event: Pick<GameEvent, 'start' | 'end'>, now: number): EventStatus {
  const { start, end, complete } = schedule(event);
  if (!complete) return 'unconfirmed';
  if (now < start!.toMillis()) return 'upcoming';
  return now < end!.toMillis() ? 'active' : 'ended';
}

export interface EventGroups {
  active: GameEvent[];
  upcoming: GameEvent[];
  unconfirmed: GameEvent[];
}

export function groupEvents(events: GameEvent[], now: number): EventGroups {
  const groups: EventGroups = { active: [], upcoming: [], unconfirmed: [] };
  for (const event of events) {
    const status = eventStatus(event, now);
    if (status !== 'ended') groups[status].push(event);
  }
  const time = (value: string | null) => parseEventDate(value)?.toMillis() ?? Infinity;
  groups.active.sort((a, b) => time(a.end) - time(b.end));
  groups.upcoming.sort((a, b) => time(a.start) - time(b.start));
  return groups;
}

export const isRaidRotation = (event: Pick<GameEvent, 'type'>): boolean => event.type === 'raid-battles';

/** Instantes, en orden, en que empieza o termina una rotación de incursiones anunciada. */
export function raidBoundaries(events: GameEvent[]): number[] {
  return events
    .filter(isRaidRotation)
    .map(schedule)
    .filter((s) => s.complete)
    .flatMap((s) => [s.start!.toMillis(), s.end!.toMillis()])
    .sort((a, b) => a - b);
}

export function countdown(target: number, now: number): string {
  const total = Math.max(0, Math.ceil((target - now) / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days} d ${hours} h ${pad(minutes)} min`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
