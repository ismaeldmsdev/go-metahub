import { replaceEqualDeep } from '@tanstack/preact-query';
import { ENDPOINTS, HOUR, RETRY_AFTER_ERROR, type CountersTarget, type Endpoint } from './config';
import { SourceError } from './errors';
import { fetchEndpoint, fetchJson } from './http';
import type { SpriteIndex } from '../domain/sprites';
import type { CountersData, GameEvent, PokebattlerBosses, PvpData, RaidBoss, Snapshot, Translations } from './models';
import { commits, parseWith } from './schemas';
import {
  parseGamemaster,
  toCounters,
  toEvents,
  toPokebattlerBosses,
  toRaids,
  toRanking,
  toSpecies,
  toSprites,
  toTranslations,
  usedMoves,
} from './transform';

export interface SourceData {
  pvp: PvpData;
  raids: RaidBoss[];
  events: GameEvent[];
  translations: Translations;
  pokebattler: PokebattlerBosses;
  sprites: SpriteIndex;
}

export interface FetchContext<T> {
  previous: Snapshot<T> | undefined;
  signal?: AbortSignal | undefined;
}

type Loader<T> = (ctx: FetchContext<T>) => Promise<Snapshot<T>>;

function snapshot<T>(
  previous: Snapshot<T> | undefined,
  next: { data: T; discarded?: number; viaFallback?: boolean; sourceUpdatedAt?: number | null },
): Snapshot<T> {
  const now = Date.now();
  // replaceEqualDeep devuelve la referencia anterior cuando el contenido es idéntico.
  const unchanged = previous !== undefined && replaceEqualDeep(previous.data, next.data) === previous.data;
  return {
    data: next.data,
    sourceUpdatedAt: next.sourceUpdatedAt ?? null,
    firstSeenAt: previous?.firstSeenAt ?? now,
    changedAt: previous === undefined ? null : unchanged ? previous.changedAt : now,
    discarded: next.discarded ?? 0,
    viaFallback: next.viaFallback ?? false,
  };
}

/** Dato informativo: si no se consigue, queda como «no disponible» y no bloquea la actualización. */
async function commitDate(url: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const [latest] = parseWith(commits, await fetchJson(url, signal), 'el historial');
    return Date.parse(latest!.commit.committer.date);
  } catch {
    return null;
  }
}

const loaderFor =
  (ctx: FetchContext<unknown>) =>
  (endpoint: Endpoint, as: 'json' | 'text' = 'json') =>
    fetchEndpoint(endpoint, { signal: ctx.signal, allowFallback: ctx.previous === undefined, as });

export const SOURCES: { [K in keyof SourceData]: Loader<SourceData[K]> } = {
  async pvp(ctx) {
    const load = loaderFor(ctx);
    // Se piden juntos y se aceptan o rechazan en bloque para no mezclar versiones.
    const [great, ultra, master, gm, sourceUpdatedAt] = await Promise.all([
      load(ENDPOINTS.ranking(1500)),
      load(ENDPOINTS.ranking(2500)),
      load(ENDPOINTS.ranking(10000)),
      load(ENDPOINTS.gamemaster),
      commitDate(ENDPOINTS.pvpokeCommit, ctx.signal),
    ]);
    const game = parseGamemaster(gm.json);
    const a = toRanking(great.json, game, 'Liga Super');
    const b = toRanking(ultra.json, game, 'Liga Ultra');
    const c = toRanking(master.json, game, 'Liga Máster');
    return snapshot(ctx.previous, {
      data: {
        leagues: { 1500: a.entries, 2500: b.entries, 10000: c.entries },
        moves: usedMoves([a.entries, b.entries, c.entries], game),
        species: toSpecies(game),
      },
      discarded: a.discarded + b.discarded + c.discarded,
      viaFallback: [great, ultra, master, gm].some((r) => r.viaFallback),
      sourceUpdatedAt,
    });
  },

  async raids(ctx) {
    const [result, sourceUpdatedAt] = await Promise.all([
      loaderFor(ctx)(ENDPOINTS.raids),
      commitDate(ENDPOINTS.scrapedDuckCommit, ctx.signal),
    ]);
    return snapshot(ctx.previous, { ...toRaids(result.json), viaFallback: result.viaFallback, sourceUpdatedAt });
  },

  async events(ctx) {
    const [result, sourceUpdatedAt] = await Promise.all([
      loaderFor(ctx)(ENDPOINTS.events),
      commitDate(ENDPOINTS.scrapedDuckCommit, ctx.signal),
    ]);
    return snapshot(ctx.previous, { ...toEvents(result.json), viaFallback: result.viaFallback, sourceUpdatedAt });
  },

  async translations(ctx) {
    const load = loaderFor(ctx);
    const [en, es] = await Promise.all([load(ENDPOINTS.locale('en')), load(ENDPOINTS.locale('es'))]);
    return snapshot(ctx.previous, {
      data: toTranslations(en.json, es.json),
      viaFallback: en.viaFallback || es.viaFallback,
    });
  },

  async pokebattler(ctx) {
    const { json } = await loaderFor(ctx)(ENDPOINTS.pokebattler);
    return snapshot(ctx.previous, { data: toPokebattlerBosses(json) });
  },

  async sprites(ctx) {
    const { json, viaFallback } = await loaderFor(ctx)(ENDPOINTS.sprites, 'text');
    return snapshot(ctx.previous, { data: toSprites(json), viaFallback });
  },
};

/** Si Pokébattler limita las consultas, se respeta su espera en todos los jefes y climas. */
const MAX_PAUSE = HOUR;
let pausedUntil = 0;

/** Solo a petición de quien abre un jefe: nunca se recorren todos. */
export async function loadCounters(
  target: CountersTarget,
  ctx: FetchContext<CountersData>,
): Promise<Snapshot<CountersData>> {
  const pause = pausedUntil - Date.now();
  // Una pausa mayor que la máxima indica que ha cambiado el reloj.
  if (pause > 0 && pause <= MAX_PAUSE) {
    throw new SourceError('http', 'Pokébattler ha pedido esperar antes de hacer más consultas', 429);
  }
  try {
    const { json } = await loaderFor(ctx)(ENDPOINTS.counters(target));
    return snapshot(ctx.previous, { data: toCounters(json, target) });
  } catch (error) {
    if (error instanceof SourceError && error.status === 429) {
      pausedUntil = Date.now() + Math.min(error.retryAfter ?? RETRY_AFTER_ERROR, MAX_PAUSE);
    }
    throw error;
  }
}
