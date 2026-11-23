import type { PvpEntry, Translations } from '../data/models';
import { pvpLabel } from './names';
import { normalize } from './text';
import { matchesVariant, tierOf, TIERS, type Tier, type Variant } from './tiers';

export interface PvpFilters {
  tier: Tier | 'all';
  variant: Variant;
  search: string;
}

/** `null` agrupa a los Pokémon sin tier, que solo aparecen al buscarlos. */
export interface TierGroup {
  tier: Tier | null;
  entries: PvpEntry[];
}

/** Busca por nombre en español o inglés, por forma o por número de Pokédex. */
function matchesSearch(entry: PvpEntry, words: string[], tr: Translations | undefined): boolean {
  if (words.length === 0) return true;
  const label = pvpLabel(entry, tr);
  const text = [label.name, label.form ?? '', label.shadow ? 'oscuro' : '', entry.name].map(normalize).join(' ');
  return words.every((word) => (/^\d+$/.test(word) ? entry.dex === Number(word) : text.includes(word)));
}

export function filterPvp(entries: PvpEntry[], filters: PvpFilters, tr: Translations | undefined): TierGroup[] {
  const words = filters.search.split(/\s+/).map(normalize).filter(Boolean);
  const groups = new Map<Tier | null, PvpEntry[]>();
  for (const entry of entries) {
    const tier = tierOf(entry.score);
    if (tier === null && (words.length === 0 || filters.tier !== 'all')) continue;
    if (filters.tier !== 'all' && tier !== filters.tier) continue;
    if (!matchesVariant(entry, filters.variant) || !matchesSearch(entry, words, tr)) continue;
    const group = groups.get(tier);
    if (group) group.push(entry);
    else groups.set(tier, [entry]);
  }
  return [...TIERS, null]
    .map((tier) => ({ tier, entries: groups.get(tier) ?? [] }))
    .filter((group) => group.entries.length > 0);
}

export function countTiers(entries: PvpEntry[]): Record<Tier, number> {
  const counts: Record<Tier, number> = { S: 0, A: 0, B: 0, C: 0 };
  for (const entry of entries) {
    const tier = tierOf(entry.score);
    if (tier) counts[tier] += 1;
  }
  return counts;
}
