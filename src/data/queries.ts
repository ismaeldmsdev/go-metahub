import { QueryClient, queryOptions, type Query } from '@tanstack/preact-query';
import { raidBoundaries } from '../domain/events';
import { MINUTE, RETRY_AFTER_ERROR, TTL, type CountersTarget, type QueryId } from './config';
import { SourceError } from './errors';
import type { CountersData, GameEvent, Snapshot } from './models';
import { loadCounters, SOURCES, type SourceData } from './sources';

type AnyQuery = Query<any, any, any, any>;

/** Cuánto tiempo se consideran vigentes unos datos obtenidos en `updatedAt`. */
export function lifetime(
  id: QueryId,
  updatedAt: number,
  snapshot: Pick<Snapshot<unknown>, 'viaFallback'> | undefined,
  events?: GameEvent[],
): number {
  // Una copia del espejo puede ser antigua: se busca pronto la original.
  if (snapshot?.viaFallback) return RETRY_AFTER_ERROR;
  const ttl = TTL[id];
  if (id !== 'raids' || !events) return ttl;
  // Si empieza o termina una rotación anunciada, las incursiones caducan en ese momento.
  const next = raidBoundaries(events).find((at) => at > updatedAt);
  return next === undefined ? ttl : Math.min(ttl, next - updatedAt);
}

function queryLifetime(client: QueryClient, id: QueryId, query: AnyQuery): number {
  const events = client.getQueryData<Snapshot<GameEvent[]>>(['events'])?.data;
  return lifetime(id, query.state.dataUpdatedAt, query.state.data, events);
}

/** Al volver a primer plano no se insiste si acaba de fallar. */
export const recentlyFailed = (now: number, errorUpdatedAt: number, dataUpdatedAt: number): boolean =>
  errorUpdatedAt > dataUpdatedAt && now - errorUpdatedAt < RETRY_AFTER_ERROR;

/** Caducado y sin un fallo reciente: toca volver a consultar. */
export const isDue = (now: number, state: { dataUpdatedAt: number; errorUpdatedAt: number }, life: number): boolean =>
  now >= state.dataUpdatedAt + life && !recentlyFailed(now, state.errorUpdatedAt, state.dataUpdatedAt);

export const createClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        // No depende de navigator.onLine, que no siempre acierta: se intenta y se informa del fallo.
        networkMode: 'always',
        retry: (count, error) => count < 2 && error instanceof SourceError && error.transient,
        refetchOnMount: true,
        refetchOnReconnect: true,
        refetchOnWindowFocus: (query) =>
          !recentlyFailed(Date.now(), query.state.errorUpdatedAt, query.state.dataUpdatedAt),
      },
    },
  });

export function sourceQuery<K extends keyof SourceData>(client: QueryClient, id: K) {
  return queryOptions<Snapshot<SourceData[K]>, Error>({
    queryKey: [id],
    queryFn: ({ signal }) =>
      SOURCES[id]({ previous: client.getQueryData<Snapshot<SourceData[K]>>([id]), signal }),
    staleTime: (query) => queryLifetime(client, id, query),
  });
}

export const countersKey = (target: CountersTarget) =>
  ['counters', `${target.id}|${target.tier}|${target.weather}`] as const;

export function countersQuery(client: QueryClient, target: CountersTarget) {
  return queryOptions<Snapshot<CountersData>, Error>({
    queryKey: countersKey(target),
    queryFn: ({ signal }) =>
      loadCounters(target, { previous: client.getQueryData<Snapshot<CountersData>>(countersKey(target)), signal }),
    staleTime: (query) => queryLifetime(client, 'counters', query),
  });
}

/**
 * Revisa cada minuto, con la aplicación visible, si algo ha caducado. Compara con el reloj en vez
 * de programar esperas largas, que se pierden al suspender el equipo o congelar la pestaña.
 */
export function startPeriodicCheck(client: QueryClient): () => void {
  const timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    void client.refetchQueries({
      type: 'active',
      predicate: (query) =>
        query.state.fetchStatus === 'idle' &&
        isDue(Date.now(), query.state, queryLifetime(client, query.queryKey[0] as QueryId, query)),
    });
  }, MINUTE);
  return () => clearInterval(timer);
}
