import type { RaidAttacker, Translations } from '../data/models';
import { GYM_GROUPS, type GymGroup, type Presence } from './gyms';
import { pvpLabel } from './names';
import { matchesSearch, searchWords } from './pvp';

export interface RaidFilters extends Record<GymGroup, Presence> {
  search: string;
}

/**
 * Los que tienen como mejor conjunto registrado un ataque cargado de ese tipo, por el percentil que publica la fuente.
 * Los empates van por nombre. No se numeran: faltan los que usan ese tipo con otros movimientos.
 */
export function attackersOfType(
  attackers: RaidAttacker[],
  type: string,
  filters: RaidFilters,
  tr: Translations | undefined,
): RaidAttacker[] {
  const words = searchWords(filters.search);
  return attackers
    .filter(
      (p) =>
        p.chargedType === type &&
        GYM_GROUPS.every((group) => filters[group] === 'with' || p.groups.includes(group) === (filters[group] === 'only')) &&
        matchesSearch(p, words, tr),
    )
    .sort(
      (a, b) =>
        b.percentile - a.percentile ||
        pvpLabel(a, tr).name.localeCompare(pvpLabel(b, tr).name, 'es') ||
        a.name.localeCompare(b.name),
    );
}

export function countByType(attackers: RaidAttacker[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { chargedType } of attackers) counts.set(chargedType, (counts.get(chargedType) ?? 0) + 1);
  return counts;
}

/** Listas externas más completas, con varias combinaciones por Pokémon. */
export const goHubTypeUrl = (type: string): string => `https://db.pokemongohub.net/pokemon-list/best-per-type/${type}`;
