import type { League } from '../data/config';
import type { FormatFilter, PvpEntry, PvpFormat, SeasonWeek, Species, Translations } from '../data/models';
import { eventStatus, parseEventDate, type EventStatus } from './events';
import { pvpLabel, typeName, TYPES } from './names';
import { matchesSearch, searchWords } from './pvp';

/* Ligas y copas que nombra el calendario */

const CP: Record<string, League> = { Great: 1500, Ultra: 2500, Master: 10000 };

export const LEAGUE_TITLES: Record<League, string> = { 1500: 'Liga Super', 2500: 'Liga Ultra', 10000: 'Liga Máster' };

export type SeasonEntry =
  | { kind: 'league'; league: League; mega: boolean }
  /** `cp` es null si el nombre no indica la liga. */
  | { kind: 'cup'; name: string; cp: League | null };

/** «Great League: Mega Edition» es una liga; «Mountain Cup: Great League Edition», una copa. */
export function parseEntry(text: string): SeasonEntry {
  const league = /^(Great|Ultra|Master) League(: Mega Edition)?$/.exec(text);
  if (league) return { kind: 'league', league: CP[league[1]!]!, mega: league[2] !== undefined };
  const cup = /^(.+?)(?:: (Great|Ultra|Master) League Edition)?$/.exec(text);
  return { kind: 'cup', name: cup?.[1] ?? text, cp: cup?.[2] ? CP[cup[2]]! : null };
}

/** Nombres contrastados con las páginas oficiales en español. Los demás se dejan en inglés. */
const CUP_NAMES: Record<string, string> = {
  'Catch Cup': 'Copa Captura',
  'Evolution Cup': 'Copa Evolución',
  'Fantasy Cup': 'Copa Fantasía',
  'Fighting Cup': 'Copa Lucha',
  'Halloween Cup': 'Copa de Halloween',
  'Holiday Cup': 'Copa Festividades',
  'Jungle Cup': 'Copa Selvática',
  'Little Cup': 'Copa Chica',
  'Love Cup': 'Copa Pasión',
  'Mountain Cup': 'Copa Montaña',
  'Retro Cup': 'Copa Retro',
  'Scroll Cup': 'Copa Manuscrito',
  'Summer Cup': 'Copa Verano',
  'Sunshine Cup': 'Copa Luz Solar',
  'Weather Cup': 'Copa Meteorológica',
  'Willpower Cup': 'Copa Tesón',
};

export interface EntryLabel {
  name: string;
  untranslated: boolean;
}

export function entryLabel(entry: SeasonEntry): EntryLabel {
  if (entry.kind === 'league') {
    return { name: LEAGUE_TITLES[entry.league] + (entry.mega ? ': Edición Mega' : ''), untranslated: false };
  }
  const championship = /^(\d{4}) GO (LAIC|EUIC) Cup$/.exec(entry.name);
  if (championship) return { name: `Copa ${championship[2]} de GO ${championship[1]}`, untranslated: false };
  const spanish = CUP_NAMES[entry.name];
  return { name: spanish ?? entry.name, untranslated: spanish === undefined };
}

/** Sin años ni «GO»: PvPoke llama «LAIC 2027 Cup (GBL)» a la «2026 GO LAIC Cup». */
const words = (name: string): string =>
  name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !/^\d{4}$/.test(word) && word !== 'go' && word !== 'gbl')
    .sort()
    .join(' ');

/** El formato de PvPoke que corresponde exactamente, o null. Ante la duda, ninguno: sería el ranking de otra copa. */
export function formatFor(entry: SeasonEntry, formats: PvpFormat[]): PvpFormat | null {
  const found =
    entry.kind === 'league'
      ? formats.filter((f) => entry.mega && f.cup === 'mega' && f.cp === entry.league)
      : formats.filter((f) => words(f.title) === words(entry.name) && (entry.cp === null || f.cp === entry.cp));
  return found.length === 1 ? found[0]! : null;
}

/* Calendario */

export interface SeasonGroup {
  current: SeasonWeek[];
  upcoming: SeasonWeek[];
  undated: SeasonWeek[];
}

export function groupSeason(weeks: SeasonWeek[], now: number): SeasonGroup {
  const of = (status: EventStatus) =>
    weeks
      .filter((week) => eventStatus(week, now) === status)
      .sort((a, b) => (parseEventDate(a.start)?.toMillis() ?? 0) - (parseEventDate(b.start)?.toMillis() ?? 0));
  return { current: of('active'), upcoming: of('upcoming'), undated: of('unconfirmed') };
}

/** Página oficial en español de la temporada: su dirección sigue el nombre inglés. */
export const officialSeasonUrl = (season: string): string =>
  `https://pokemongo.com/es/news/go-battle-league-${season.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/* Restricciones */

const TAGS: Record<string, string> = {
  legendary: 'legendarios',
  mythical: 'singulares',
  ultrabeast: 'ultraentes',
  mega: 'megaevoluciones',
  shadow: 'oscuros',
};

const EVOLUTIONS: Record<string, string> = {
  1: 'Solo Pokémon que pueden evolucionar y aún no lo han hecho',
  2: 'Solo Pokémon que han evolucionado una vez y aún pueden evolucionar',
};

export interface Restriction {
  text: string;
  /** Pokémon concretos, si los hay. */
  names: string[];
}

const join = (items: string[], type: 'conjunction' | 'disjunction'): string =>
  new Intl.ListFormat('es', { type }).format(items);

export const limitText = (cp: number): string => (cp >= 10000 ? 'Sin límite de PC' : `Hasta ${cp} PC`);

/** Lo que dicen los filtros de PvPoke, en español. Lo que no se sabe explicar se remite a la página oficial. */
export function restrictionsOf(
  format: PvpFormat,
  species: Record<string, Species> | undefined,
  tr: Translations | undefined,
): Restriction[] {
  const list: Restriction[] = [{ text: limitText(format.cp), names: [] }];
  const names = (ids: string[]): string[] => {
    const labels = ids.map((id) => {
      const found = species && Object.hasOwn(species, id) ? species[id]! : null;
      if (!found) return id;
      const label = pvpLabel(found, tr);
      return [label.name, label.form && `(${label.form})`, label.shadow && 'oscuro'].filter(Boolean).join(' ');
    });
    return [...new Set(labels)].sort((a, b) => a.localeCompare(b, 'es'));
  };
  const describe = ({ kind, values }: FormatFilter, allowed: boolean): Restriction | null => {
    switch (kind) {
      case 'type': {
        // Enumerar los dieciocho tipos no restringe nada.
        if (allowed && Object.keys(TYPES).every((type) => values.includes(type))) return null;
        const types = values.map(typeName);
        return {
          text: allowed ? `Solo de tipo ${join(types, 'disjunction')}` : `No se permiten los de tipo ${join(types, 'disjunction')}`,
          names: [],
        };
      }
      case 'tag': {
        const tags = join(values.map((tag) => TAGS[tag] ?? tag), 'conjunction');
        return { text: allowed ? `Solo ${tags}` : `No se permiten ${tags}`, names: [] };
      }
      case 'id':
        return { text: allowed ? 'Solo Pokémon concretos' : 'Pokémon prohibidos', names: names(values) };
      case 'evolution': {
        const text = allowed && values.length === 1 ? EVOLUTIONS[values[0]!] : undefined;
        return text ? { text, names: [] } : OTHER;
      }
      case 'other':
        return OTHER;
    }
  };
  if (format.cup === 'mega') list.push({ text: 'Se permiten megaevoluciones', names: [] });
  for (const filter of format.include) list.push(...[describe(filter, true)].filter((r) => r !== null));
  for (const filter of format.exclude) list.push(...[describe(filter, false)].filter((r) => r !== null));
  // «Otras condiciones» basta con decirlo una vez.
  return list.filter((r, i) => r !== OTHER || list.indexOf(OTHER) === i);
}

const OTHER: Restriction = { text: 'Tiene otras condiciones: consulta la página oficial', names: [] };

/* Ranking */

export const FORMAT_VARIANTS = ['all', 'normal', 'mega', 'shadow'] as const;
export type FormatVariant = (typeof FORMAT_VARIANTS)[number];

const variantOf = ({ name }: Pick<PvpEntry, 'name'>): Exclude<FormatVariant, 'all'> =>
  /\(Shadow\)/.test(name) ? 'shadow' : /\((?:Mega|Primal)/.test(name) ? 'mega' : 'normal';

/** Conserva el orden y el puesto de PvPoke. */
export function filterFormat(
  entries: PvpEntry[],
  filters: { variant: FormatVariant; search: string },
  tr: Translations | undefined,
): PvpEntry[] {
  const search = searchWords(filters.search);
  return entries.filter(
    (entry) => (filters.variant === 'all' || variantOf(entry) === filters.variant) && matchesSearch(entry, search, tr),
  );
}
