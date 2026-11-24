import type { Counter, PvpMove, Species, Translations } from '../data/models';
import { normalize } from './text';

export const COUNTER_VARIANTS = ['all', 'normal', 'shadow', 'mega'] as const;
export type CounterVariant = (typeof COUNTER_VARIANTS)[number];

/** Pokébattler: «TYRANITAR_SHADOW_FORM», «CHARIZARD_MEGA_Y», «GROUDON_PRIMAL». */
export function variantOf(id: string): Exclude<CounterVariant, 'all'> {
  if (/_SHADOW_FORM$/.test(id)) return 'shadow';
  return /_(?:MEGA|PRIMAL)(?:_|$)/.test(id) ? 'mega' : 'normal';
}

export interface RankedCounter extends Counter {
  /** Puesto entre todos, que no cambia al filtrar. */
  rank: number;
}

export const filterCounters = (list: Counter[], variant: CounterVariant): RankedCounter[] =>
  list
    .map((counter, i) => ({ ...counter, rank: i + 1 }))
    .filter(({ id }) => variant === 'all' || variantOf(id) === variant);

const words = (id: string): string =>
  id
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');

/** Pokébattler y PvPoke comparten identificadores, salvo el sufijo «FORM» y Alola. */
const speciesId = (id: string): string =>
  id
    .toLowerCase()
    .replace(/_form$/, '')
    .replace(/_alola(?=_|$)/, '_alolan');

/** Pokébattler llama «KELDEO» a lo que PvPoke divide en formas: los tipos valen si todas coinciden. */
function commonTypes(dex: number, species: Record<string, Species> | undefined): string[] {
  const forms = Object.values(species ?? {}).filter((s) => s.dex === dex && !/\((?:Mega|Primal)/.test(s.name));
  const same = forms.every((s) => s.types.join() === forms[0]!.types.join());
  return same ? (forms[0]?.types ?? []) : [];
}

/**
 * Nombre y número de la forma exacta. Si PvPoke no la conoce, se busca solo la especie y la forma
 * queda en su idioma original y sin tipos: nunca se sustituye por otra forma.
 */
export function counterSpecies(
  id: string,
  species: Record<string, Species> | undefined,
  tr: Translations | undefined,
): Species {
  const key = speciesId(id);
  if (species && Object.hasOwn(species, key)) return species[key]!;
  const parts = id.replace(/_FORM$/, '').split('_');
  for (let n = parts.length; n > 0; n--) {
    const base = normalize(parts.slice(0, n).join(''));
    const found = Object.entries(tr?.pokemon ?? {}).find(([, name]) => normalize(name.en) === base);
    if (!found) continue;
    const rest = parts.slice(n);
    const shadow = rest.at(-1) === 'SHADOW';
    const form = words(rest.slice(0, shadow ? -1 : undefined).join('_'));
    const name = [found[1].en, form && `(${form})`, shadow && '(Shadow)'].filter(Boolean).join(' ');
    const dex = Number(found[0]);
    return { name, dex, types: form ? [] : commonTypes(dex, species) };
  }
  return { name: words(parts.join('_')), dex: 0, types: [] };
}

const TECHNO_BLAST: Record<string, string> = { BURN: 'fire', CHILL: 'ice', DOUSE: 'water', SHOCK: 'electric' };

/** «MYSTICAL_FIRE_PLUS» es «Mystical Fire+»; «HIDDEN_POWER_BUG_FAST», «Hidden Power (Bug)». */
export function counterMove(id: string): Pick<PvpMove, 'name' | 'type'> {
  const base = id.replace(/_FAST$/, '');
  const typed = /^(HIDDEN_POWER|WEATHER_BALL|TECHNO_BLAST)_([A-Z]+)$/.exec(base);
  if (typed) {
    const family = typed[1]!;
    const detail = typed[2]!;
    return { name: `${words(family)} (${words(detail)})`, type: TECHNO_BLAST[detail] ?? detail.toLowerCase() };
  }
  return { name: words(base.replace(/_PLUS$/, '')) + (base.endsWith('_PLUS') ? '+' : ''), type: '' };
}
