import { DateTime } from 'luxon';
import { HOUR, MINUTE, SOURCE_STALE_AFTER, ZONE, type QueryId } from '../data/config';
import type { Snapshot } from '../data/models';

export interface SourceState {
  snapshot: Snapshot<unknown> | undefined;
  /** Última consulta correcta (ms). */
  checkedAt: number;
  /** Último fallo (ms), 0 si no ha habido. */
  failedAt: number;
  error: Error | null;
  lifetime: number;
  fetching: boolean;
}

export type HealthLevel = 'loading' | 'ok' | 'warning' | 'error';

export interface Health {
  level: HealthLevel;
  messages: string[];
}

/** Margen para no avisar mientras la comprobación automática aún está en marcha. */
const GRACE = 10 * MINUTE;

export function formatAge(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} días`;
}

export const formatDate = (ms: number): string =>
  DateTime.fromMillis(ms, { zone: ZONE, locale: 'es' }).toFormat("d LLL yyyy, HH:mm");

/** checkedAt = 1 significa que la fecha guardada no era creíble. */
export const hasKnownCheck = (checkedAt: number): boolean => checkedAt > HOUR;

export function assess(id: QueryId, state: SourceState, now: number): Health {
  const { snapshot, checkedAt, error, failedAt } = state;
  if (!snapshot) {
    return error && !state.fetching
      ? { level: 'error', messages: [`Todavía no hay datos. ${error.message}.`] }
      : { level: 'loading', messages: [] };
  }
  const messages: string[] = [];
  const age = now - checkedAt;
  if (error && failedAt > checkedAt) {
    messages.push(`${error.message}. Se muestran los últimos datos válidos.`);
  }
  if (!hasKnownCheck(checkedAt)) {
    messages.push('No se sabe cuándo se obtuvieron estos datos. Pueden ser antiguos.');
  } else if (age > state.lifetime + GRACE) {
    messages.push(`Datos sin actualizar desde hace ${formatAge(age)}. Pueden haber cambiado.`);
  }
  const limit = SOURCE_STALE_AFTER[id];
  if (limit !== undefined && snapshot.sourceUpdatedAt !== null && now - snapshot.sourceUpdatedAt > limit) {
    const since = formatAge(now - snapshot.sourceUpdatedAt);
    messages.push(
      id === 'gyms'
        ? `Los datos de origen son de hace ${since}. Puede que la fuente no haya publicado o que su copia no se actualice.`
        : `La fuente no publica desde hace ${since}.`,
    );
  }
  if (snapshot.viaFallback) {
    messages.push('Datos de una copia de respaldo: pueden ir varias horas por detrás.');
  }
  if (snapshot.discarded > 0) {
    messages.push(
      snapshot.discarded === 1
        ? 'Se ha omitido 1 registro incorrecto de la fuente.'
        : `Se han omitido ${snapshot.discarded} registros incorrectos de la fuente.`,
    );
  }
  return { level: messages.length > 0 ? 'warning' : 'ok', messages };
}
