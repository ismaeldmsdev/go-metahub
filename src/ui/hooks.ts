import { useQuery, useQueryClient } from '@tanstack/preact-query';
import { useEffect, useState } from 'preact/hooks';
import { MIN_MANUAL_INTERVAL, TTL, type SourceId } from '../data/config';
import type { GameEvent, Snapshot } from '../data/models';
import { lifetime, sourceQuery } from '../data/queries';
import type { SourceData } from '../data/sources';
import { assess, type Health } from '../domain/freshness';

/** Hora actual, refrescada cada `period` ms mientras la pantalla está visible. */
export function useNow(period: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    const timer = setInterval(tick, period);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [period]);
  return now;
}

export interface Source<T> {
  id: SourceId;
  data: T | undefined;
  snapshot: Snapshot<T> | undefined;
  checkedAt: number;
  failedAt: number;
  fetching: boolean;
  health: Health;
  /** Consulta manual, limitada para no repetir peticiones inútiles. */
  refresh: () => void;
  canRefresh: boolean;
}

export function useSource<K extends keyof SourceData>(id: K): Source<SourceData[K]> {
  const client = useQueryClient();
  const query = useQuery(sourceQuery(client, id));
  const now = useNow(30_000);
  const events = client.getQueryData<Snapshot<GameEvent[]>>(['events'])?.data;
  const health = assess(
    id,
    {
      snapshot: query.data,
      checkedAt: query.dataUpdatedAt,
      failedAt: query.errorUpdatedAt,
      error: query.error ?? query.failureReason,
      lifetime: query.data ? lifetime(id, query.dataUpdatedAt, query.data, events) : TTL[id],
      fetching: query.isFetching,
    },
    now,
  );
  const waiting = now - query.dataUpdatedAt < MIN_MANUAL_INTERVAL;
  return {
    id,
    data: query.data?.data,
    snapshot: query.data,
    checkedAt: query.dataUpdatedAt,
    failedAt: query.errorUpdatedAt,
    fetching: query.isFetching,
    health,
    refresh: () => void query.refetch({ cancelRefetch: false }),
    canRefresh: !query.isFetching && !waiting,
  };
}

export type Sources = { [K in keyof SourceData]: Source<SourceData[K]> };

/** Todas las fuentes se mantienen al día aunque su pestaña no esté abierta. */
export function useSources(): Sources {
  return {
    events: useSource('events'),
    raids: useSource('raids'),
    pvp: useSource('pvp'),
    translations: useSource('translations'),
    pokebattler: useSource('pokebattler'),
    sprites: useSource('sprites'),
  };
}

export const TABS = ['pvp', 'incursiones', 'eventos', 'fuentes'] as const;
export type Tab = (typeof TABS)[number];

const readTab = (): Tab => TABS.find((tab) => location.hash === `#${tab}`) ?? 'pvp';

export function useTab(): Tab {
  const [tab, setTab] = useState<Tab>(readTab);
  useEffect(() => {
    const update = () => {
      setTab(readTab());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return tab;
}
