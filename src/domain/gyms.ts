import type { GymAttack, GymPokemon, PvpMove, Translations } from '../data/models';
import { pvpLabel, typeName } from './names';
import { matchesSearch, searchWords } from './pvp';

/** Tiers que publica doctorpokegogo, de mejor a peor. */
export const GYM_TIERS = ['S+', 'S', 'A', 'B', 'C', 'D'] as const;
export type GymTier = (typeof GYM_TIERS)[number];

export type GymAttacker = GymPokemon & { attack: GymAttack };
export type GymDefender = GymPokemon & { bulk: number; rank: number };

/** Con todos, sin los de este grupo o solo ellos. */
export const PRESENCES = ['with', 'without', 'only'] as const;
export type Presence = (typeof PRESENCES)[number];

export const GYM_GROUPS = ['mega', 'shadow', 'legendary'] as const;
export type GymGroup = (typeof GYM_GROUPS)[number];

export interface AttackerFilters extends Record<GymGroup, Presence> {
  tier: GymTier | 'all';
  /** Tipo del ataque cargado recomendado. */
  type: string;
  search: string;
}

export interface AttackerGroup {
  tier: GymTier;
  entries: GymAttacker[];
}

export const attackersOf = (pokemon: GymPokemon[]): GymAttacker[] =>
  pokemon.filter((p): p is GymAttacker => p.attack !== null);

/**
 * Dentro de cada tier se sigue el percentil publicado. Los empates van por tipo de ataque, que no indica mérito.
 * No se numeran: la puntuación depende del defensor de referencia de cada tipo y no permite un orden global.
 */
export function filterAttackers(
  attackers: GymAttacker[],
  filters: AttackerFilters,
  tr: Translations | undefined,
): AttackerGroup[] {
  const words = searchWords(filters.search);
  const matches = attackers.filter(
    (p) =>
      (filters.tier === 'all' || p.attack.tier === filters.tier) &&
      (filters.type === 'all' || p.attack.chargedType === filters.type) &&
      GYM_GROUPS.every((group) => filters[group] === 'with' || p.groups.includes(group) === (filters[group] === 'only')) &&
      matchesSearch(p, words, tr),
  );
  const key = (p: GymAttacker) => `${typeName(p.attack.chargedType)} ${pvpLabel(p, tr).name}`;
  return GYM_TIERS.map((tier) => ({
    tier,
    entries: matches
      .filter((p) => p.attack.tier === tier)
      .sort(
        (a, b) =>
          b.attack.percentile - a.attack.percentile || key(a).localeCompare(key(b), 'es') || a.name.localeCompare(b.name),
      ),
  })).filter((group) => group.entries.length > 0);
}

export interface AttackerBlock {
  /** Percentil en el que empatan, o null si el bloque no es un empate amplio. */
  percentile: number | null;
  entries: GymAttacker[];
}

/** Desde este número, los empatados se presentan juntos. Con menos basta el aviso de cada ficha. */
const WIDE_TIE = 4;

/** Separa los empates amplios del resto, sin cambiar el orden. */
export function tieBlocks(entries: GymAttacker[]): AttackerBlock[] {
  const sizes = countPercentiles(entries);
  const blocks: AttackerBlock[] = [];
  for (const entry of entries) {
    const { percentile } = entry.attack;
    const tied = sizes.get(percentile)! >= WIDE_TIE ? percentile : null;
    const last = blocks.at(-1);
    if (last && last.percentile === tied) last.entries.push(entry);
    else blocks.push({ percentile: tied, entries: [entry] });
  }
  return blocks;
}

/** Cuántos atacantes comparten cada percentil. */
export function countPercentiles(attackers: GymAttacker[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const { attack } of attackers) counts.set(attack.percentile, (counts.get(attack.percentile) ?? 0) + 1);
  return counts;
}

export function countGymTiers(attackers: GymAttacker[]): Record<GymTier, number> {
  const counts = { 'S+': 0, S: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const { attack } of attackers) counts[attack.tier] += 1;
  return counts;
}

/** De más a menos resistencia. Con el mismo valor comparten puesto. */
export function rankDefenders(pokemon: GymPokemon[]): GymDefender[] {
  const sorted = pokemon
    .filter((p): p is GymPokemon & { bulk: number } => p.bulk !== null)
    .sort((a, b) => b.bulk - a.bulk || a.dex - b.dex || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || sorted[i - 1]!.bulk !== p.bulk) rank = i + 1;
    return { ...p, rank };
  });
}

export function filterDefenders(
  defenders: GymDefender[],
  filters: { type: string; search: string },
  tr: Translations | undefined,
): GymDefender[] {
  const words = searchWords(filters.search);
  return defenders.filter(
    (p) => (filters.type === 'all' || p.types.includes(filters.type)) && matchesSearch(p, words, tr),
  );
}

/** La fuente escribe «Weather Ball Ice»; el resto de la aplicación, «Weather Ball (Ice)». */
export const gymMove = (name: string, type: string): Pick<PvpMove, 'name' | 'type'> => ({
  name: name.replace(/^(Weather Ball|Techno Blast|Hidden Power) (\w+)$/, '$1 ($2)'),
  type,
});
