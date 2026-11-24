/** Única lista de orígenes externos y periodos de la aplicación. */
const RAW = 'https://raw.githubusercontent.com';
const CDN = 'https://cdn.jsdelivr.net/gh';

export interface Endpoint {
  url: string;
  /** Copia que puede ir horas por detrás: solo se usa si aún no hay datos guardados. */
  fallback?: string;
}

const github = (repo: string, branch: string, path: string): Endpoint => ({
  url: `${RAW}/${repo}/${branch}/${path}`,
  fallback: `${CDN}/${repo}@${branch}/${path}`,
});

export const LEAGUES = [1500, 2500, 10000] as const;
export type League = (typeof LEAGUES)[number];

/** Climas que admite la API de Pokébattler. */
export const WEATHERS = ['NO_WEATHER', 'SUNNY', 'RAINY', 'PARTLY_CLOUDY', 'CLOUDY', 'WINDY', 'SNOW', 'FOG'] as const;
export type Weather = (typeof WEATHERS)[number];

export interface CountersTarget {
  /** Identificador y nivel de incursión, tal como los publica Pokébattler. */
  id: string;
  tier: string;
  weather: Weather;
}

export const ENDPOINTS = {
  ranking: (league: League) =>
    github('pvpoke/pvpoke', 'master', `src/data/rankings/all/overall/rankings-${league}.json`),
  gamemaster: github('pvpoke/pvpoke', 'master', 'src/data/gamemaster.min.json'),
  raids: github('bigfoott/ScrapedDuck', 'data', 'raids.min.json'),
  events: github('bigfoott/ScrapedDuck', 'data', 'events.min.json'),
  locale: (lang: 'en' | 'es') =>
    github('WatWowMap/pogo-translations', 'master', `static/locales/${lang}.json`),
  sprites: github('PokeAPI/pokeapi', 'master', 'data/v2/csv/pokemon.csv'),
  pokebattler: { url: 'https://fight.pokebattler.com/raids' } as Endpoint,
  /** Consulta descrita en https://www.pokebattler.com/developers, solo con parámetros documentados. */
  counters: ({ id, tier, weather }: CountersTarget): Endpoint => ({
    url:
      `https://fight.pokebattler.com/raids/defenders/${id}/levels/${tier}/attackers/levels/40` +
      '/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC' +
      `?sort=ESTIMATOR&weatherCondition=${weather}&dodgeStrategy=DODGE_REACTION_TIME&aggregation=AVERAGE`,
  }),
  pvpokeCommit:
    'https://api.github.com/repos/pvpoke/pvpoke/commits?path=src/data/rankings/all/overall&per_page=1',
  scrapedDuckCommit:
    'https://api.github.com/repos/bigfoott/ScrapedDuck/commits?sha=data&per_page=1',
} as const;

/** Imágenes de PokéAPI. Se piden a GitHub: jsDelivr rechaza parte de ellas por el tamaño del repositorio. */
export const SPRITES = {
  small: (id: number) => `${RAW}/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
  art: (id: number) => `${RAW}/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
} as const;

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type SourceId = 'pvp' | 'raids' | 'events' | 'translations' | 'pokebattler' | 'sprites';

/** Los counters se piden por jefe, así que no son una fuente única. */
export type QueryId = SourceId | 'counters';

export const TTL: Record<QueryId, number> = {
  pvp: DAY,
  raids: 6 * HOUR,
  events: 6 * HOUR,
  translations: DAY,
  pokebattler: 6 * HOUR,
  sprites: DAY,
  // Pokébattler pide guardar las respuestas y avisa de que envejecen en días.
  counters: DAY,
};

/** Antigüedad de la publicación a partir de la cual se avisa de que la fuente parece parada. */
export const SOURCE_STALE_AFTER: Partial<Record<QueryId, number>> = {
  // Ejecuciones reales medidas: mediana 6,2 h y máximo 10,4 h.
  raids: 12 * HOUR,
  events: 12 * HOUR,
  // PvPoke publica de forma irregular; puede pasar varias semanas sin cambios.
  pvp: 45 * DAY,
};

/** Espera mínima tras un fallo antes de volver a consultar automáticamente. */
export const RETRY_AFTER_ERROR = 15 * MINUTE;
/** GitHub sirve los archivos en bruto con cinco minutos de caché: repetir antes no aporta nada. */
export const MIN_MANUAL_INTERVAL = 5 * MINUTE;
/** Pokébattler declara una hora de caché en cada respuesta. */
export const MIN_COUNTERS_INTERVAL = HOUR;
export const REQUEST_TIMEOUT = 25_000;

export const ZONE = 'Europe/Madrid';
/** Se incrementa, por fuente, solo si cambia la forma de sus datos guardados. */
export const STORAGE_VERSION: Record<QueryId, number> = {
  pvp: 3,
  raids: 1,
  events: 1,
  translations: 1,
  pokebattler: 2,
  sprites: 1,
  counters: 1,
};
/** Los counters que no se actualizan desde hace este tiempo se borran. */
export const COUNTERS_KEEP = 30 * DAY;
