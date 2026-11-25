import type { Counter, GameEvent, MaxBoss, Species, Translations } from '../data/models';
import { counterSpecies } from './counters';
import { eventStatus, schedule } from './events';
import { parseBossName, pvpLabel, type PokemonLabel } from './names';
import { matchesSearch, searchWords } from './pvp';
import { normalize } from './text';

export type MaxKind = 'dinamax' | 'gigamax' | 'eternamax';

export const MAX_KINDS: Record<MaxKind, string> = { dinamax: 'Dinamax', gigamax: 'Gigamax', eternamax: 'Dinamax Infinito' };

export const kindOf = (id: string): MaxKind =>
  id.endsWith('_GIGANTAMAX') ? 'gigamax' : id.endsWith('_ETERNAMAX_FORM') ? 'eternamax' : 'dinamax';

export interface MaxPokemon {
  /** Identificador de Pokébattler. */
  id: string;
  kind: MaxKind;
  species: Species;
  label: PokemonLabel;
  /** Nombre que encuentra la imagen de esa forma. */
  sprite: { name: string; dex: number };
}

/** Gigamax y Dinamax comparten tipos y estadísticas con su forma normal; solo cambian el aspecto y el ataque Max. */
export function maxPokemon(
  id: string,
  species: Record<string, Species> | undefined,
  tr: Translations | undefined,
): MaxPokemon {
  const kind = kindOf(id);
  const base = id.replace(/_(?:GIGANTAMAX|ETERNAMAX_FORM)$/, '');
  // Pokébattler llama «DARMANITAN» a lo que PvPoke llama «Darmanitan (Standard)».
  const standard = `${base.toLowerCase()}_standard`;
  const known = species && Object.hasOwn(species, standard) ? species[standard]! : counterSpecies(base, species, tr);
  const suffix = kind === 'gigamax' ? ' (Gmax)' : kind === 'eternamax' ? ' (Eternamax)' : '';
  const bare = known.name.replace(/\s*\([^)]*\)/g, '');
  return {
    id,
    kind,
    species: known,
    label: pvpLabel(known, tr),
    sprite: { name: suffix ? bare + suffix : known.name, dex: known.dex },
  };
}

/* Jefes */

export interface MaxTier {
  key: string;
  title: string;
  bosses: MaxBoss[];
}

/** De mayor a menor nivel. Los que figuran en varios, al final. */
export function groupMaxBosses(bosses: MaxBoss[]): MaxTier[] {
  const groups = new Map<string, MaxTier>();
  const level = (tier: string | null) => (tier ? Number(/^RAID_LEVEL_(\d)/.exec(tier)?.[1] ?? 0) : 0);
  for (const boss of bosses) {
    const stars = level(boss.tier);
    const title = stars === 0 ? 'Varios niveles' : stars === 1 ? '1 estrella' : `${stars} estrellas`;
    const group = groups.get(title) ?? { key: title, title, bosses: [] };
    group.bosses.push(boss);
    groups.set(title, group);
  }
  return [...groups.values()].sort((a, b) => level(b.bosses[0]!.tier) - level(a.bosses[0]!.tier));
}

const REGION_IDS: Record<string, string> = { Alolan: 'ALOLA', Galarian: 'GALARIAN', Hisuian: 'HISUIAN', Paldean: 'PALDEA' };

/** «Dynamax Alolan Sandshrew» es «SANDSHREW_ALOLA_FORM»; «Gigantamax Lapras», «LAPRAS_GIGANTAMAX». */
function bossId(kind: string, name: string): string | null {
  const { base, forms, shadow } = parseBossName(name);
  if (shadow || forms.length > 1) return null;
  const id = base
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’.]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  if (/^eternamax$/i.test(kind)) return `${id}_ETERNAMAX_FORM`;
  if (/^gigantamax$/i.test(kind)) return forms.length === 0 ? `${id}_GIGANTAMAX` : null;
  if (forms.length === 0) return id;
  return `${id}_${REGION_IDS[forms[0]!] ?? forms[0]!.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_FORM`;
}

export interface AnnouncedBoss {
  event: GameEvent;
  /** Tal como lo nombra LeekDuck, o el evento si no nombra a ninguno. */
  name: string;
  /** Null si no se reconoce o no figura en el catálogo. */
  boss: MaxBoss | null;
  status: 'active' | 'upcoming';
  start: number;
  end: number;
}

const MAX_EVENTS = new Set(['max-mondays', 'max-battles']);

/** Solo los eventos Max con principio y fin: sin fechas completas, nada se da por confirmado. */
export function announcedBosses(events: GameEvent[] | undefined, catalog: MaxBoss[], now: number): AnnouncedBoss[] {
  return (events ?? [])
    .filter((event) => MAX_EVENTS.has(event.type))
    .flatMap((event): AnnouncedBoss[] => {
      const status = eventStatus(event, now);
      if (status !== 'active' && status !== 'upcoming') return [];
      const { start, end } = schedule(event);
      const named = /^(Dynamax|Gigantamax|Eternamax) (.+?)(?: (?:during|in|Max)\b.*)?$/i.exec(event.name);
      const id = named ? bossId(named[1]!, named[2]!) : null;
      return [
        {
          event,
          name: named ? `${named[1]} ${named[2]}` : event.name,
          boss: catalog.find((boss) => boss.id === id) ?? null,
          status,
          start: start!.toMillis(),
          end: end!.toMillis(),
        },
      ];
    })
    .sort((a, b) => a.start - b.start);
}

export const maxSlug = (id: string): string => `max-${id.toLowerCase().replaceAll('_', '-')}`;

/* Enlaces */

const POKEBATTLER = 'https://www.pokebattler.com/max';

/** Páginas de Pokébattler por papel, descritas en su documentación. */
export const ROLES = [
  { path: '', name: 'Equipos' },
  { path: '/ATTACKERS', name: 'Atacantes' },
  { path: '/CHARGER', name: 'Defensores' },
  { path: '/METER_CHARGE', name: 'Cargadores' },
  { path: '/TOTAL_HEAL', name: 'Curación' },
  { path: '/TANK', name: 'Escudos' },
] as const;

export const roleUrl = (id: string, path: string): string =>
  `${POKEBATTLER}/${kindOf(id) === 'dinamax' ? `DYNAMAX_${id}` : id}${path}`;

export const MAX_LINKS = [
  { name: 'Pokébattler: combates Max por jefe y papel', url: POKEBATTLER },
  { name: 'GO Hub: atacantes Max', url: 'https://pokemongohub.net/post/guide/max-attackers-tier-list/' },
  {
    name: 'GO Hub: guía con atacantes, defensores y curación',
    url: 'https://pokemongohub.net/post/guide/pokemon-go-max-battles-guide-best-strategies-moves-and-top-pokemon-2026',
  },
] as const;

/* Counters */

export const MAX_VARIANTS = ['all', 'dinamax', 'gigamax'] as const;
export type MaxVariant = (typeof MAX_VARIANTS)[number];

export const filterMaxCounters = (list: Counter[], variant: MaxVariant): (Counter & { rank: number })[] =>
  list
    .map((counter, i) => ({ ...counter, rank: i + 1 }))
    .filter(({ id }) => variant === 'all' || (kindOf(id) === 'gigamax') === (variant === 'gigamax'));

/* Fichas */

export const MAX_SORTS = ['atk', 'bulk', 'hp', 'name'] as const;
export type MaxSort = (typeof MAX_SORTS)[number];

/** Defensa × PS base, como en los defensores de gimnasio: teórica. */
export const bulkOf = ({ stats }: Species): number | null => (stats ? stats.def * stats.hp : null);

const valueOf = ({ species }: MaxPokemon, sort: MaxSort): number => {
  if (sort === 'atk') return species.stats?.atk ?? -1;
  if (sort === 'hp') return species.stats?.hp ?? -1;
  return sort === 'bulk' ? (bulkOf(species) ?? -1) : 0;
};

export interface MaxFilters {
  kind: 'all' | 'dinamax' | 'gigamax';
  /** Tipo que puede tener su ataque Max. Solo distingue a los Dinamax. */
  type: string;
  sort: MaxSort;
  search: string;
}

/** Ordena por una estadística base. No es un ranking de rendimiento. */
export function filterMax(list: MaxPokemon[], filters: MaxFilters, tr: Translations | undefined): MaxPokemon[] {
  const words = searchWords(filters.search);
  return list
    .filter(
      (p) =>
        (filters.kind === 'all' || (p.kind === 'gigamax') === (filters.kind === 'gigamax')) &&
        (filters.type === 'all' || (p.kind === 'dinamax' && (p.species.fastTypes?.includes(filters.type) ?? false))) &&
        (matchesSearch(p.species, words, tr) ||
          words.every((word) => normalize(`${p.label.name} ${p.label.form ?? ''} ${MAX_KINDS[p.kind]}`).includes(word))),
    )
    .sort(
      (a, b) =>
        valueOf(b, filters.sort) - valueOf(a, filters.sort) ||
        a.label.name.localeCompare(b.label.name, 'es') ||
        a.id.localeCompare(b.id),
    );
}
