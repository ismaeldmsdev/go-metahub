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
  /** Estadísticas base. */
  stats?: { atk: number; def: number; hp: number };
  /** Tipos de sus ataques rápidos. */
  fastTypes?: string[];
}

/** Condición de una copa, tal como la define PvPoke. */
export interface FormatFilter {
  /** «other» si no se sabe explicar: se remite a la página oficial. */
  kind: 'type' | 'tag' | 'id' | 'evolution' | 'other';
  values: string[];
}

export interface PvpFormat {
  title: string;
  cup: string;
  cp: number;
  include: FormatFilter[];
  exclude: FormatFilter[];
}

/** Semana de la Liga Combates GO, según LeekDuck. */
export interface SeasonWeek {
  id: string;
  /** Nombre inglés de la temporada: «Daydream Destinations». */
  season: string;
  start: string | null;
  end: string | null;
  link: string | null;
  /** «Great League: Mega Edition», «Mountain Cup: Great League Edition». */
  entries: string[];
}

export interface FormatData {
  entries: PvpEntry[];
  moves: Record<string, PvpMove>;
}

export interface PvpData {
  /** Clasificaciones completas, en el orden de PvPoke. */
  leagues: Record<League, PvpEntry[]>;
  moves: Record<string, PvpMove>;
  /** Todas las formas que conoce PvPoke, con megas y oscuros, por identificador. */
  species: Record<string, Species>;
  /** Copas y ligas Mega que PvPoke enseña ahora. */
  formats: PvpFormat[];
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
  /** Nombre y frases en español de los entrenadores del Team GO Rocket, por su número en el juego. */
  trainers: Record<string, { name: string | null; phrases: string[] }>;
}

/** Jefes que Pokébattler lista en su rotación actual y su nivel (null si figura en varios). */
export type PokebattlerBosses = Record<string, string | null>;

export interface MaxBoss {
  /** Identificador de Pokébattler. */
  id: string;
  /** Null si figura en varios niveles. */
  tier: string | null;
}

export interface PokebattlerData {
  raids: PokebattlerBosses;
  /** Catálogo de jefes Max. La fuente no da fechas: no es una rotación. */
  max: MaxBoss[];
  /** Pokémon que la fuente admite en los combates Max. */
  dynamax: string[];
}

export interface GymAttack {
  /** Tier, percentil y puntuación originales de doctorpokegogo. */
  tier: 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';
  percentile: number;
  score: number;
  fast: string;
  fastType: string;
  charged: string;
  chargedType: string;
}

export interface GymPokemon {
  /** Nombre inglés al estilo de PvPoke: «Tauros (Aqua)». */
  name: string;
  dex: number;
  types: string[];
  /** «legendary» incluye singulares y ultraentes. */
  groups: ('mega' | 'shadow' | 'legendary')[];
  attack: GymAttack | null;
  /** Defensa base × aguante base. Null si no puede defender y en los oscuros, que sí pueden pero no tienen dato propio. */
  bulk: number | null;
}

/** Contenido de public/data/gimnasios.json. */
export interface GymData {
  source: {
    name: string;
    url: string;
    license: string;
    licenseUrl: string;
    methodologyUrl: string;
    version: string;
    generatedAt: string;
  };
  /** Qué se ha transformado respecto al original. */
  changes: string;
  pokemon: GymPokemon[];
}

export interface RocketPokemon {
  dex: number;
  /** Forma tal como la nombra WatWowMap («NINETALES_ALOLA»), o null si es la habitual. */
  form: string | null;
}

export interface RocketSlot {
  /** Puede capturarse al ganar. */
  reward: boolean;
  /** Uno de estos. */
  options: RocketPokemon[];
}

export interface RocketTrainer {
  /** Número en el juego, que comparten las alineaciones y las frases. */
  id: number;
  /** Identifica al entrenador en ambas fuentes y en la dirección: «cliff», «water-m». */
  key: string;
  kind: 'giovanni' | 'leader' | 'grunt' | 'other';
  /** Nombre propio, o el de la fuente si no se reconoce. */
  name: string;
  /** Tipo en el que se especializa. */
  type: string | null;
  gender: 'm' | 'f' | null;
  /** Primera, segunda y tercera posición. */
  slots: [RocketSlot, RocketSlot, RocketSlot];
}

export interface ContrastPokemon {
  /** Nombre inglés al estilo de LeekDuck: «Alolan Grimer». */
  name: string;
  dex: number;
}

/** Alineación de LeekDuck, solo para contrastar. */
export interface ContrastTrainer {
  /** Null si no se ha reconocido. */
  key: string | null;
  name: string;
  slots: [ContrastPokemon[], ContrastPokemon[], ContrastPokemon[]];
}

export interface RocketAttacker {
  /** Nombre inglés al estilo de PvPoke. */
  name: string;
  dex: number;
  types: string[];
  groups: GymPokemon['groups'];
  /** Tier y puntuación originales de doctorpokegogo: una evaluación general, no contra un rival. */
  tier: GymAttack['tier'];
  score: number;
  fast: string;
  fastType: string;
  charged: string;
  chargedType: string;
}

/** Contenido de public/data/rocket.json. */
export interface RocketAttackersData {
  source: GymData['source'];
  changes: string;
  pokemon: RocketAttacker[];
}

export interface RaidAttacker {
  /** Nombre inglés al estilo de PvPoke. */
  name: string;
  dex: number;
  types: string[];
  groups: GymPokemon['groups'];
  /** Tier, percentil y métricas originales de doctorpokegogo. */
  tier: 'S+' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E';
  percentile: number;
  dps: number;
  tdo: number;
  fast: string;
  fastType: string;
  charged: string;
  chargedType: string;
}

/** Contenido de public/data/incursiones.json. */
export interface RaidAttackersData {
  source: GymData['source'];
  changes: string;
  pokemon: RaidAttacker[];
}

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
