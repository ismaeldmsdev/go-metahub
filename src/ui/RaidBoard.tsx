import { HOUR } from '../data/config';
import { raidBoard, type BossStatus, type RaidBoard, type Roster } from '../domain/availability';
import { formatAge, formatDate, formatDay, formatShort, hasKnownCheck } from '../domain/freshness';
import { bossLabel } from '../domain/names';
import { dexFromImage } from '../domain/text';
import { PokemonName } from './common';
import type { Sources } from './hooks';

/** Si la lista no se ha podido comprobar en este tiempo, se conserva sin darla por confirmada. */
const STALE_AFTER = 12 * HOUR;
/** Próximamente muestra a la vista lo que empieza en estas dos semanas. */
export const SOON = 14 * 24 * HOUR;

export function isStale(sources: Sources, now: number): boolean {
  const { raids } = sources;
  const published = raids.snapshot?.sourceUpdatedAt ?? null;
  return (
    !hasKnownCheck(raids.checkedAt) ||
    now - raids.checkedAt > STALE_AFTER ||
    (published !== null && now - published > STALE_AFTER)
  );
}

export function buildBoard(sources: Sources, now: number): RaidBoard | null {
  const { raids, events, raidSchedule } = sources;
  if (!raids.data) return null;
  return raidBoard({
    raids: raids.data,
    events: events.data ?? [],
    schedule: raidSchedule.data,
    listedAt: raids.snapshot?.sourceUpdatedAt ?? raids.checkedAt,
    stale: isStale(sources, now),
    now,
  });
}

export const days = (list: number[]) => list.map(formatDay).join(' y ');

/* ---------- Nivel de incursión ---------- */

export interface TierInfo {
  key: string;
  short: string;
  long: string;
}

/** Nivel según LeekDuck («5-Star Raids», «Mega Raids») o Pokébattler («RAID_LEVEL_5», «RAID_LEVEL_MEGA_5»). */
export function tierOf(tier: string): TierInfo {
  if (/mega/i.test(tier)) return { key: 'mega', short: 'Mega', long: 'Megaincursión' };
  if (/elite/i.test(tier)) return { key: 'elite', short: 'Élite', long: 'Incursión élite' };
  if (/ultra/i.test(tier)) return { key: 's5', short: 'UE', long: 'Ultraentes' };
  const stars = /(\d)/.exec(tier)?.[1];
  if (stars) return { key: `s${stars}`, short: `${stars}★`, long: `${stars} ${stars === '1' ? 'estrella' : 'estrellas'}` };
  return { key: 'other', short: tier || '?', long: tier || 'Nivel no indicado' };
}



/* ---------- Estado de cada jefe ---------- */

/** Una línea en la ficha del jefe. Los detalles van en la explicación general. */
export function StatusNote({ status }: { status: BossStatus }) {
  switch (status.kind) {
    case 'confirmed':
      return <p class="validity ok">Hasta el {formatShort(status.until)}</p>;
    case 'weekend':
      return <p class="validity ok">Hoy sí · solo fines de semana, hasta el {formatDay(status.days.at(-1)!)}</p>;
    case 'weekend-later':
      return <p class="validity warn">Hoy no · solo fines de semana: {days(status.days)}</p>;
    case 'listed':
      return <p class="validity">En la lista de LeekDuck, sin fecha de fin</p>;
    case 'unverified':
      return (
        <p class="validity warn">
          {status.reason === 'days' ? 'Solo algunos días: consulta el evento' : 'Sin comprobar: no se ha podido leer su evento'}
        </p>
      );
    case 'stale':
      return <p class="validity warn">Según la última lista conocida</p>;
    case 'gone':
      return (
        <p class="validity warn">
          {status.reason === 'ended'
            ? `Su rotación terminó el ${formatShort(status.since)}`
            : status.reason === 'no-weekends'
              ? 'No quedan fines de semana en su rotación'
              : `Puede haber cambiado el ${formatShort(status.since)}`}
        </p>
      );
  }
}

/** Versión corta para las fichas de la cuadrícula. */
export function TileStatus({ status, showUntil }: { status: BossStatus; showUntil: boolean }) {
  switch (status.kind) {
    case 'confirmed':
      return showUntil ? <p class="rb-when">Hasta el {formatShort(status.until)}</p> : null;
    case 'weekend':
      return (
        <>
          <p class="rb-flag rb-flag-ok">Hoy sí · solo fines de semana</p>
          <p class="rb-when">Hasta el {formatDay(status.days.at(-1)!)}</p>
        </>
      );
    case 'weekend-later':
      return <p class="rb-flag">Hoy no · {days(status.days)}</p>;
    case 'listed':
      return <p class="rb-when">Sin fecha de fin</p>;
    case 'unverified':
      return <p class="rb-flag">{status.reason === 'days' ? 'Solo algunos días' : 'Sin comprobar'}</p>;
    case 'stale':
      return <p class="rb-flag">Última lista conocida</p>;
    case 'gone':
      return (
        <p class="rb-flag">
          {status.reason === 'ended'
            ? `Terminó el ${formatShort(status.since)}`
            : status.reason === 'no-weekends'
              ? 'Sin más fines de semana'
              : `Puede haber cambiado el ${formatShort(status.since)}`}
        </p>
      );
  }
}

export const doubtful = (status: BossStatus) => status.kind === 'unverified' || status.kind === 'stale' || status.kind === 'gone';


/* ---------- Pestañas ---------- */

export type BoardTab = 'ahora' | 'proximamente' | 'catalogo';

export function RaidTabs({ active, board }: { active: BoardTab; board: RaidBoard | null }) {
  const tabs: { id: BoardTab; name: string; hash: string; count: number | null }[] = [
    { id: 'ahora', name: 'Ahora', hash: '#incursiones', count: board ? board.now.length + board.alsoNow.length : null },
    { id: 'proximamente', name: 'Próximamente', hash: '#incursiones/proximamente', count: board?.upcoming.length ?? null },
    { id: 'catalogo', name: 'Catálogo', hash: '#incursiones/catalogo', count: null },
  ];
  return (
    <nav class="rb-tabs" aria-label="Jefes de incursión">
      {tabs.map(({ id, name, hash, count }) => (
        <a key={id} href={hash} aria-current={active === id ? 'page' : undefined}>
          {name}
          {count !== null && <small>{count}</small>}
        </a>
      ))}
    </nav>
  );
}

/* ---------- Ahora ---------- */


/** Fecha de fin común a todo el grupo, para no repetirla en cada ficha. */
export function commonEnd(statuses: BossStatus[]): number | null {
  const ends = statuses.map((s) => (s.kind === 'confirmed' ? s.until : null));
  const first = ends[0] ?? null;
  return first !== null && ends.every((end) => end === first) ? first : null;
}


/* ---------- Próximamente ---------- */

/** Nombres en texto corrido; con uno solo, con su forma y la etiqueta de oscuro. */
export function rosterNames(roster: Roster[], shadow: boolean, sources: Sources) {
  const tr = sources.translations.data;
  const labels = roster.map((r) =>
    bossLabel({ name: shadow ? `Shadow ${r.name}` : r.name, dex: dexFromImage(r.image), image: r.image }, tr),
  );
  if (labels.length === 1) return <PokemonName label={labels[0]!} />;
  const text = (l: (typeof labels)[number]) => (l.form ? `${l.name} (${l.form})` : l.name);
  const shown = labels.slice(0, 3).map(text).join(', ');
  return labels.length > 3 ? `${shown} y ${labels.length - 3} más` : shown;
}

export function when(start: number, end: number): string {
  const sameDay = formatDay(start) === formatDay(end);
  if (sameDay) return `${formatShort(start)}–${formatShort(end).split(', ')[1]}`;
  return `Del ${formatShort(start)} al ${formatShort(end)}`;
}

/** Nivel según el título inglés de la rotación de LeekDuck. */
export function tierHint(title: string, shadow: boolean): string {
  if (/\bmega\b/i.test(title)) return 'Megaincursión';
  if (shadow) return 'Incursión oscura';
  const stars = /(\d)-star/i.exec(title)?.[1];
  return stars ? `${stars} estrellas` : 'Incursión';
}



/** «Hoy», «Mañana» o la fecha. */
export function dayTitle(ms: number, now: number): string {
  const day = formatDay(ms);
  if (day === formatDay(now)) return `Hoy · ${day}`;
  if (day === formatDay(now + 24 * HOUR)) return `Mañana · ${day}`;
  return day;
}


/* ---------- Explicación ---------- */


/** El método y las fechas de las fuentes, sin el desplegable. */
export function ExplanationBody({ sources, now }: { sources: Sources; now: number }) {
  const { raids, raidSchedule } = sources;
  return (
    <>
      <p>
        Un jefe está <b>disponible ahora</b> si figura en la lista de LeekDuck y su rotación o el periodo en curso de su
        calendario lo respaldan con fechas. Las horas son las locales del juego, en hora peninsular.
      </p>
      <p>
        Si el anuncio de una rotación dice que solo es en fin de semana, solo se muestra como disponible el sábado y el
        domingo. No se suponen otras condiciones.
      </p>
      <p>
        Lo anunciado que no está en la lista va aparte, sin confirmar. Lo que estaba en una lista anterior a un cambio de
        calendario va en «Puede que ya no estén».
      </p>
      <p>
        Lista consultada hace {formatAge(now - raids.checkedAt)}
        {raids.snapshot?.sourceUpdatedAt ? `, publicada el ${formatDate(raids.snapshot.sourceUpdatedAt)}` : ''}.
        {raidSchedule.snapshot?.sourceUpdatedAt
          ? ` Calendario de LeekDuck generado el ${formatDate(raidSchedule.snapshot.sourceUpdatedAt)}.`
          : ' Sin calendario de LeekDuck: nada se da por confirmado.'}
      </p>
    </>
  );
}
