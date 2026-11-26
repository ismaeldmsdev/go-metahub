import { replaceEqualDeep } from '@tanstack/preact-query';
import { eventsNeedingPage, periodSpan } from '../domain/availability';
import {
  ENDPOINTS,
  HOUR,
  MAX_EVENT_PAGES,
  MAX_PERIOD_PAGES,
  RETRY_AFTER_ERROR,
  type CountersTarget,
  type Endpoint,
  type FormatTarget,
} from './config';
import { SourceError } from './errors';
import { fetchEndpoint, fetchJson, fetchText, type Download } from './http';
import type { SpriteIndex } from '../domain/sprites';
import type {
  ContrastTrainer,
  CountersData,
  EventPage,
  FormatData,
  GameEvent,
  GymData,
  PokebattlerData,
  PvpData,
  RaidAttackersData,
  RaidBoss,
  RaidSchedule,
  RocketAttackersData,
  RocketTrainer,
  SeasonWeek,
  Snapshot,
  Translations,
} from './models';
import { commits, parseWith } from './schemas';
import {
  MIN_FORMAT,
  parseEventPage,
  parseGamemaster,
  parsePeriodBosses,
  toCounters,
  toEvents,
  toFormats,
  toGyms,
  toPokebattlerData,
  toRaidAttackers,
  toRaidManifest,
  toRaids,
  toRanking,
  toRocket,
  toRocketAttackers,
  toRocketContrast,
  toSeason,
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
  pokebattler: PokebattlerData;
  sprites: SpriteIndex;
  gyms: GymData;
  rocket: RocketTrainer[];
  rocketContrast: ContrastTrainer[];
  rocketAttackers: RocketAttackersData;
  season: SeasonWeek[];
  raidTypes: RaidAttackersData;
  raidSchedule: RaidSchedule;
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

/** Eventos y calendario salen del mismo archivo: si coinciden, se descarga una sola vez. */
let pendingEvents: Promise<Download> | null = null;

function loadEvents({ previous }: FetchContext<unknown>): Promise<Download> {
  pendingEvents ??= loaderFor({ previous })(ENDPOINTS.events).finally(() => {
    pendingEvents = null;
  });
  return pendingEvents;
}

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
        formats: toFormats(game),
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
      loadEvents(ctx),
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
    return snapshot(ctx.previous, { data: toPokebattlerData(json) });
  },

  async sprites(ctx) {
    const { json, viaFallback } = await loaderFor(ctx)(ENDPOINTS.sprites, 'text');
    return snapshot(ctx.previous, { data: toSprites(json), viaFallback });
  },

  async gyms(ctx) {
    const { json } = await loaderFor(ctx)(ENDPOINTS.gyms);
    const data = toGyms(json);
    return snapshot(ctx.previous, { data, sourceUpdatedAt: Date.parse(data.source.generatedAt) });
  },

  async rocket(ctx) {
    const [result, sourceUpdatedAt] = await Promise.all([
      loaderFor(ctx)(ENDPOINTS.rocket),
      commitDate(ENDPOINTS.rocketCommit, ctx.signal),
    ]);
    const next = snapshot(ctx.previous, { ...toRocket(result.json), viaFallback: result.viaFallback, sourceUpdatedAt });
    // La fecha es la de las alineaciones: si no han cambiado, la última conocida sigue valiendo.
    if (!ctx.previous || next.changedAt !== ctx.previous.changedAt) return next;
    return { ...next, sourceUpdatedAt: next.sourceUpdatedAt ?? ctx.previous.sourceUpdatedAt };
  },

  async rocketContrast(ctx) {
    const { json, viaFallback } = await loaderFor(ctx)(ENDPOINTS.rocketContrast);
    return snapshot(ctx.previous, { ...toRocketContrast(json), viaFallback });
  },

  async season(ctx) {
    const { json, viaFallback } = await loadEvents(ctx);
    return snapshot(ctx.previous, { data: toSeason(json, ctx.previous?.data ?? [], Date.now()), viaFallback });
  },

  async raidTypes(ctx) {
    const { json } = await loaderFor(ctx)(ENDPOINTS.raidTypes);
    const data = toRaidAttackers(json);
    return snapshot(ctx.previous, { data, sourceUpdatedAt: Date.parse(data.source.generatedAt) });
  },

  /**
   * Calendario de LeekDuck, los jefes de los periodos en curso y las páginas de las rotaciones cercanas
   * y de los eventos sin fecha. Si una página falla, se conserva la última leída; si no la hay, queda sin
   * dato y la aplicación no confirma lo que dependa de ella.
   */
  async raidSchedule(ctx) {
    const [manifest, events] = await Promise.all([
      loaderFor(ctx)(ENDPOINTS.raidSchedule),
      loadEvents(ctx).then(
        ({ json }) => toEvents(json).data,
        () => [],
      ),
    ]);
    const { generatedAt, periods, discarded } = toRaidManifest(manifest.json);
    const now = Date.now();
    const previous = ctx.previous?.data;
    const read = async <T>(url: string, parse: (html: string) => T, fallback: T | undefined): Promise<T | undefined> => {
      try {
        return parse(await fetchText(url, ctx.signal));
      } catch (error) {
        if (ctx.signal?.aborted) throw error;
        return fallback;
      }
    };
    const current = periods
      .filter((p) => {
        const s = periodSpan(p);
        return s !== null && s.start <= now && now < s.end;
      })
      .slice(0, MAX_PERIOD_PAGES);
    const wanted = eventsNeedingPage(events, now).slice(0, MAX_EVENT_PAGES);
    const pages: Record<string, EventPage> = {};
    await Promise.all([
      ...current.map(async (period) => {
        const known = previous?.periods.find((p) => p.slug === period.slug)?.bosses ?? undefined;
        period.bosses = (await read(ENDPOINTS.raidPeriod(period.slug), parsePeriodBosses, known)) ?? null;
      }),
      ...wanted.map(async (event) => {
        const page = await read(event.link!, parseEventPage, previous?.pages[event.id]);
        if (page) pages[event.id] = page;
      }),
    ]);
    return snapshot(ctx.previous, { data: { generatedAt, periods, pages }, discarded, sourceUpdatedAt: generatedAt });
  },

  async rocketAttackers(ctx) {
    const { json } = await loaderFor(ctx)(ENDPOINTS.rocketAttackers);
    const data = toRocketAttackers(json);
    return snapshot(ctx.previous, { data, sourceUpdatedAt: Date.parse(data.source.generatedAt) });
  },
};

/** Ranking de una copa o liga Mega, con los movimientos de la misma versión. Solo al abrirlo. */
export async function loadFormat(target: FormatTarget, ctx: FetchContext<FormatData>): Promise<Snapshot<FormatData>> {
  const load = loaderFor(ctx);
  const [ranking, gm, sourceUpdatedAt] = await Promise.all([
    load(ENDPOINTS.format(target)),
    load(ENDPOINTS.gamemaster),
    commitDate(ENDPOINTS.formatCommit(target), ctx.signal),
  ]);
  const game = parseGamemaster(gm.json);
  const { entries, discarded } = toRanking(ranking.json, game, 'este formato', MIN_FORMAT);
  return snapshot(ctx.previous, {
    data: { entries, moves: usedMoves([entries], game) },
    discarded,
    viaFallback: ranking.viaFallback || gm.viaFallback,
    sourceUpdatedAt,
  });
}

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
