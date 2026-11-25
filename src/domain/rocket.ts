import type {
  ContrastPokemon,
  ContrastTrainer,
  RocketAttacker,
  RocketPokemon,
  RocketTrainer,
  Species,
  Translations,
} from '../data/models';
import { GYM_GROUPS, GYM_TIERS, type AttackerFilters, type GymGroup, type GymTier, type Presence } from './gyms';
import { parseBossName, pvpLabel, typeName } from './names';
import { matchesSearch, searchWords } from './pvp';
import { normalize } from './text';
import { effectiveness, weaknesses } from './types';

/* Entrenadores */

export const SLOT_NAMES = ['Primero', 'Segundo', 'Tercero'] as const;

export const isBoss = (trainer: RocketTrainer): boolean => trainer.kind === 'giovanni' || trainer.kind === 'leader';

export const GENDERS = { m: 'Hombre', f: 'Mujer' } as const;

export interface TrainerLabel {
  name: string;
  /** Cargo o, en los reclutas, si es hombre o mujer: es lo que distingue a los que comparten frase. */
  detail: string | null;
}

export function trainerLabel(trainer: RocketTrainer, tr: Translations | undefined): TrainerLabel {
  const gender = trainer.gender && GENDERS[trainer.gender];
  switch (trainer.kind) {
    case 'giovanni':
      return { name: trainer.name, detail: 'Jefe del Team GO Rocket' };
    case 'leader':
      return { name: trainer.name, detail: 'Líder del Team GO Rocket' };
    case 'grunt':
      if (trainer.type) return { name: `Recluta de tipo ${typeName(trainer.type)}`, detail: gender };
      return { name: trainer.key.startsWith('decoy') ? 'Recluta señuelo' : 'Recluta sin tipo', detail: gender };
    case 'other':
      return { name: tr?.trainers[trainer.id]?.name ?? trainer.name, detail: gender };
  }
}

export const phrasesOf = (trainer: RocketTrainer, tr: Translations | undefined): string[] =>
  tr?.trainers[trainer.id]?.phrases ?? [];

/** Los demás entrenadores en activo que dicen alguna de sus frases. */
export function sharingPhrase(
  trainer: RocketTrainer,
  all: RocketTrainer[],
  tr: Translations | undefined,
): RocketTrainer[] {
  const mine = new Set(phrasesOf(trainer, tr).map(normalize));
  return all.filter((other) => other.id !== trainer.id && phrasesOf(other, tr).some((phrase) => mine.has(normalize(phrase))));
}

const bossOrder = ['giovanni', 'leader', 'grunt', 'other'];

export const bossesOf = (trainers: RocketTrainer[]): RocketTrainer[] =>
  trainers.filter(isBoss).sort((a, b) => bossOrder.indexOf(a.kind) - bossOrder.indexOf(b.kind) || a.id - b.id);

/** Por tipo, en el orden alfabético en que se leen. Los que no tienen tipo, al final. */
export const gruntsOf = (trainers: RocketTrainer[], tr: Translations | undefined): RocketTrainer[] =>
  trainers
    .filter((trainer) => !isBoss(trainer))
    .sort(
      (a, b) =>
        Number(a.type === null) - Number(b.type === null) ||
        trainerLabel(a, tr).name.localeCompare(trainerLabel(b, tr).name, 'es') ||
        a.id - b.id,
    );

/** Busca en las frases, el nombre, el tipo y los Pokémon que puede usar. */
export function searchTrainers(
  trainers: RocketTrainer[],
  search: string,
  tr: Translations | undefined,
  species: Record<string, Species> | undefined,
): RocketTrainer[] {
  const words = searchWords(search);
  if (words.length === 0) return trainers;
  return trainers.filter((trainer) => {
    const label = trainerLabel(trainer, tr);
    const rivals = trainer.slots.flatMap((slot) => slot.options.map((p) => rivalSpecies(p, species, tr)));
    const text = [
      label.name,
      label.detail ?? '',
      ...phrasesOf(trainer, tr),
      ...rivals.flatMap((rival) => [rival.name, pvpLabel(rival, tr).name]),
    ]
      .map(normalize)
      .join(' ');
    return words.every((word) => text.includes(word));
  });
}

/* Pokémon de los rivales */

const REGIONS: Record<string, string> = { ALOLA: 'Alolan', GALARIAN: 'Galarian', HISUIAN: 'Hisuian', PALDEA: 'Paldean' };

const regionOf = (form: string | null): string | null =>
  Object.keys(REGIONS).find((region) => form !== null && new RegExp(`_${region}(?:_|$)`).test(form)) ?? null;

/**
 * Nombre y tipos de la forma exacta según PvPoke. Si no se reconoce con seguridad, se muestra la especie sin tipos:
 * sin tipos no hay debilidades ni sugerencias, que es mejor que dar las de otra forma.
 */
export function rivalSpecies(
  rival: RocketPokemon,
  species: Record<string, Species> | undefined,
  tr: Translations | undefined,
): Species {
  const forms = Object.entries(species ?? {}).filter(
    ([, s]) => s.dex === rival.dex && !/\((?:Shadow|Mega|Primal)/.test(s.name),
  );
  const english = tr?.pokemon[rival.dex]?.en ?? forms[0]?.[1].name.replace(/\s*\([^)]*\)/g, '') ?? `#${rival.dex}`;
  if (rival.form === null) {
    const plain = forms.filter(([, s]) => !s.name.includes('('));
    if (plain.length === 1) return plain[0]![1];
    if (forms.length === 1) return forms[0]![1];
    // La fuente no dice la forma: los tipos valen si todas coinciden.
    const same = forms.length > 0 && forms.every(([, s]) => s.types.join() === forms[0]![1].types.join());
    return { name: english, dex: rival.dex, types: same ? forms[0]![1].types : [] };
  }
  const id = rival.form.toLowerCase().replace(/_alola(?=_|$)/, '_alolan').replace(/_paldea(?=_|$)/, '_paldean');
  const exact = forms.find(([key]) => key === id);
  if (exact) return exact[1];
  const region = regionOf(rival.form);
  const words = rival.form.split('_').slice(1).map((w) => w[0]! + w.slice(1).toLowerCase());
  const form = region ? REGIONS[region]! : words.join(' ');
  return { name: form ? `${english} (${form})` : english, dex: rival.dex, types: [] };
}

/* Contraste entre fuentes */

export interface SlotDifference {
  /** Posición, desde 0. */
  slot: number;
  /** Solo en WatWowMap. */
  main: RocketPokemon[];
  /** Solo en LeekDuck. */
  contrast: ContrastPokemon[];
}

export interface Comparison {
  /** Diferencias por entrenador. Vacío si coinciden. */
  differences: Map<string, SlotDifference[]>;
  /** En activo según WatWowMap, pero no según LeekDuck. */
  onlyMain: RocketTrainer[];
  /** Nombres de los que solo lista LeekDuck. */
  onlyContrast: string[];
  matching: number;
}

/** Especie y región: lo único que ambas fuentes indican siempre igual. */
const mainKey = (p: RocketPokemon): string => `${p.dex} ${(REGIONS[regionOf(p.form) ?? ''] ?? '').toLowerCase()}`;

const contrastKey = (p: ContrastPokemon): string => {
  const region = parseBossName(p.name).forms.find((form) => Object.values(REGIONS).includes(form));
  return `${p.dex} ${region?.toLowerCase() ?? ''}`;
};

export function compareLineups(main: RocketTrainer[], contrast: ContrastTrainer[]): Comparison {
  const others = new Map(contrast.flatMap((t) => (t.key === null ? [] : [[t.key, t] as const])));
  const result: Comparison = { differences: new Map(), onlyMain: [], onlyContrast: [], matching: 0 };
  for (const trainer of main) {
    const other = others.get(trainer.key);
    if (!other) {
      result.onlyMain.push(trainer);
      continue;
    }
    const differences = trainer.slots.flatMap((slot, i): SlotDifference[] => {
      const there = other.slots[i]!;
      const mainKeys = new Set(slot.options.map(mainKey));
      const contrastKeys = new Set(there.map(contrastKey));
      const onlyHere = slot.options.filter((p) => !contrastKeys.has(mainKey(p)));
      const onlyThere = there.filter((p) => !mainKeys.has(contrastKey(p)));
      return onlyHere.length + onlyThere.length > 0 ? [{ slot: i, main: onlyHere, contrast: onlyThere }] : [];
    });
    if (differences.length > 0) result.differences.set(trainer.key, differences);
    else result.matching += 1;
  }
  const keys = new Set(main.map((t) => t.key));
  result.onlyContrast = contrast.filter((t) => t.key === null || !keys.has(t.key)).map((t) => t.name);
  return result;
}

export const agrees = (c: Comparison): boolean =>
  c.differences.size + c.onlyMain.length + c.onlyContrast.length === 0;

/* Atacantes */

export const inGroups = (p: RocketAttacker, filters: Record<GymGroup, Presence>): boolean =>
  GYM_GROUPS.every((group) => filters[group] === 'with' || p.groups.includes(group) === (filters[group] === 'only'));

const byScore =
  (tr: Translations | undefined) =>
  (a: RocketAttacker, b: RocketAttacker): number =>
    b.score - a.score || pvpLabel(a, tr).name.localeCompare(pvpLabel(b, tr).name, 'es') || a.name.localeCompare(b.name);

export interface RocketTierGroup {
  tier: GymTier;
  entries: RocketAttacker[];
}

/** Clasificación general, tal como la publica doctorpokegogo: por tier y puntuación. Los empates, por nombre. */
export function filterRocketAttackers(
  attackers: RocketAttacker[],
  filters: AttackerFilters,
  tr: Translations | undefined,
): RocketTierGroup[] {
  const words = searchWords(filters.search);
  const matches = attackers.filter(
    (p) =>
      (filters.tier === 'all' || p.tier === filters.tier) &&
      (filters.type === 'all' || p.chargedType === filters.type) &&
      inGroups(p, filters) &&
      matchesSearch(p, words, tr),
  );
  return GYM_TIERS.map((tier) => ({
    tier,
    entries: matches.filter((p) => p.tier === tier).sort(byScore(tr)),
  })).filter((group) => group.entries.length > 0);
}

export function countRocketTiers(attackers: RocketAttacker[]): Map<GymTier, number> {
  const counts = new Map<GymTier, number>();
  for (const tier of GYM_TIERS) {
    const count = attackers.filter((p) => p.tier === tier).length;
    if (count > 0) counts.set(tier, count);
  }
  return counts;
}

export function countScores(attackers: RocketAttacker[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const { score } of attackers) counts.set(score, (counts.get(score) ?? 0) + 1);
  return counts;
}

/** Solo se sugieren Pokémon bien valorados en general: un buen tipo no compensa a un atacante flojo. */
const SUGGESTED_TIERS: readonly GymTier[] = ['S+', 'S', 'A'];
/** Las especies que forman un equipo. Con menos, no se sugiere nada. */
export const MIN_SUGGESTIONS = 3;

export interface Suggestion {
  attacker: RocketAttacker;
  /** Multiplicadores de tipo de sus dos ataques contra el rival. */
  fast: number;
  charged: number;
}

export interface SuggestionGroup {
  /** Tipo del ataque cargado. */
  type: string;
  multiplier: number;
  entries: Suggestion[];
}

/** Débil a alguno de los tipos del rival: una desventaja evidente aunque ataque bien. */
export const isExposed = (attacker: RocketAttacker, rivalTypes: string[]): boolean =>
  rivalTypes.some((type) => effectiveness(type, attacker.types) > 1.01);

/**
 * Pokémon con ventaja de tipo: ataque cargado eficaz, rápido no resistido y sin debilidad a los tipos del rival. Es un
 * filtro sobre la clasificación general con la tabla de tipos. No simula el combate ni crea puntuaciones: los grupos van
 * por la debilidad del rival y, a igualdad, por la mejor puntuación general original, que también ordena cada grupo.
 */
export function suggestionsFor(
  rivalTypes: string[],
  attackers: RocketAttacker[],
  tr: Translations | undefined,
): SuggestionGroup[] {
  const groups = weaknesses(rivalTypes).map(({ type, multiplier }): SuggestionGroup => ({
    type,
    multiplier,
    entries: attackers
      .filter((p) => p.chargedType === type && SUGGESTED_TIERS.includes(p.tier) && !isExposed(p, rivalTypes))
      .sort(byScore(tr))
      .map((attacker) => ({ attacker, fast: effectiveness(attacker.fastType, rivalTypes), charged: multiplier }))
      .filter(({ fast }) => fast > 0.99),
  }));
  const found = groups
    .filter((group) => group.entries.length > 0)
    .sort((a, b) => b.multiplier - a.multiplier || b.entries[0]!.attacker.score - a.entries[0]!.attacker.score);
  // Las variantes de una especie cuentan como una sola opción.
  const options = new Set(found.flatMap((group) => group.entries.map(({ attacker }) => attacker.dex)));
  return options.size < MIN_SUGGESTIONS ? [] : found;
}

export const filterSuggestions = (
  groups: SuggestionGroup[],
  filters: Record<GymGroup, Presence>,
): SuggestionGroup[] =>
  groups
    .map((group) => ({ ...group, entries: group.entries.filter(({ attacker }) => inGroups(attacker, filters)) }))
    .filter((group) => group.entries.length > 0);

/** Lo primero que se enseña: unas pocas especies distintas de los tipos que más convienen. */
const FEATURED_TYPES = 2;
const FEATURED_EACH = 3;

export function featuredSuggestions(groups: SuggestionGroup[]): SuggestionGroup[] {
  const used = new Set<number>();
  return groups
    .slice(0, FEATURED_TYPES)
    .map((group) => {
      const entries: Suggestion[] = [];
      for (const suggestion of group.entries) {
        if (entries.length === FEATURED_EACH) break;
        // Sin repetir la especie en sus variantes oscura, mega o normal.
        if (used.has(suggestion.attacker.dex)) continue;
        used.add(suggestion.attacker.dex);
        entries.push(suggestion);
      }
      return { ...group, entries };
    })
    .filter((group) => group.entries.length > 0);
}

export const countSuggestions = (groups: SuggestionGroup[]): number =>
  groups.reduce((sum, group) => sum + group.entries.length, 0);
