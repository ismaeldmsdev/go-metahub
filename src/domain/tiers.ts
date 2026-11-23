import type { PvpEntry } from '../data/models';

export const TIERS = ['S', 'A', 'B', 'C'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Cortes propios sobre la puntuación original de PvPoke (0 a 100). No son categorías de PvPoke.
 * Se eligieron por su estabilidad en el historial de PvPoke de septiembre a noviembre de 2026.
 */
export const TIER_MIN: Record<Tier, number> = { S: 90, A: 85, B: 80, C: 70 };

export const tierOf = (score: number): Tier | null => TIERS.find((tier) => score >= TIER_MIN[tier]) ?? null;

/** Una forma puede ser a la vez oscura y especial: «Ninetales (Alolan) (Shadow)». */
export const isShadow = (entry: Pick<PvpEntry, 'name'>): boolean => /\(Shadow\)/.test(entry.name);
export const hasForm = (entry: Pick<PvpEntry, 'name'>): boolean => /\((?!Shadow\))[^)]+\)/.test(entry.name);

export const VARIANTS = ['all', 'normal', 'shadow', 'form'] as const;
export type Variant = (typeof VARIANTS)[number];

export function matchesVariant(entry: Pick<PvpEntry, 'name'>, variant: Variant): boolean {
  switch (variant) {
    case 'all':
      return true;
    case 'normal':
      return !isShadow(entry) && !hasForm(entry);
    case 'shadow':
      return isShadow(entry);
    case 'form':
      return hasForm(entry);
  }
}
