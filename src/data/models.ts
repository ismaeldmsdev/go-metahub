import type { League } from './config';

/** Datos de una fuente junto con la información necesaria para juzgar su vigencia. */
export interface Snapshot<T> {
  data: T;
  /** Fecha publicada por la fuente (ms), o null si no se ha podido conocer. */
  sourceUpdatedAt: number | null;
  /** Primera vez que esta app guardó datos de la fuente. */
  firstSeenAt: number;
  /** Última vez que la app vio cambiar el contenido; null si aún no ha cambiado. */
  changedAt: number | null;
  discarded: number;
  viaFallback: boolean;
}

export interface PvpMove {
  name: string;
  type: string;
  fast: boolean;
}

export interface PvpEntry {
  /** Puesto original de PvPoke. */
  rank: number;
  id: string;
  name: string;
  dex: number;
  types: string[];
  /** Puntuación original de PvPoke. */
  score: number;
  moves: string[];
  /** Movimientos de la lista que PvPoke marca como especiales. */
  elite: string[];
}

export interface Species {
  name: string;
  dex: number;
  types: string[];
}

export interface PvpData {
  /** Clasificaciones completas, en el orden de PvPoke. */
  leagues: Record<League, PvpEntry[]>;
  moves: Record<string, PvpMove>;
  /** Todas las formas que conoce PvPoke, con megas y oscuros, por identificador. */
  species: Record<string, Species>;
}

export interface CpRange {
  min: number;
  max: number;
}

export interface RaidBoss {
  name: string;
  tier: string;
  shadow: boolean;
  dex: number | null;
  types: string[];
  shiny: boolean;
  cp: CpRange | null;
  boostedCp: CpRange | null;
  weather: string[];
  image: string | null;
}

export interface Featured {
  name: string;
  image: string | null;
}

export interface GameEvent {
  id: string;
  name: string;
  type: string;
  heading: string;
  link: string | null;
  image: string | null;
  start: string | null;
  end: string | null;
  bonuses: string[];
  notes: string[];
  featured: Featured[];
  raidBosses: string[];
  hasSpawns: boolean;
  hasResearch: boolean;
}

export interface Translations {
  /** Por número de Pokédex. */
  pokemon: Record<string, { en: string; es: string }>;
  /** Por nombre inglés normalizado. */
  moves: Record<string, string>;
}

/** Jefes que Pokébattler lista en su rotación actual y su nivel (null si figura en varios). */
export type PokebattlerBosses = Record<string, string | null>;

export interface Counter {
  /** Identificador de Pokébattler. */
  id: string;
  fast: string;
  charged: string;
  /** Entrenadores necesarios, aproximadamente. Menos es mejor. */
  estimator: number;
  edps: number | null;
  tdo: number | null;
}

export interface CountersData {
  /** De mejor a peor. */
  list: Counter[];
  /** Nivel de megaevolución que ha supuesto Pokébattler. */
  megaLevel: number | null;
}
