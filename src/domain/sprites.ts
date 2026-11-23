/** Formas de cada especie en PokéAPI, por número de Pokédex. La primera es la habitual. */
export interface SpriteForm {
  id: number;
  name: string;
}
export type SpriteIndex = Record<string, SpriteForm[]>;

const REGIONS: Record<string, string> = {
  alolan: 'alola',
  galarian: 'galar',
  hisuian: 'hisui',
  paldean: 'paldea',
};

/** Formas que PokéAPI nombra de otra manera. La cadena vacía es la forma habitual de la especie. */
const ALIASES: Record<string, string> = {
  '128:aqua': 'paldea-aqua-breed',
  '128:blaze': 'paldea-blaze-breed',
  '128:combat': 'paldea-combat-breed',
  '421:overcast': '',
  '555:galarian': 'galar-standard',
  "741:pa'u": 'pau',
  '774:core': 'red',
  '800:dawn wings': 'dawn',
  '800:dusk mane': 'dusk',
  '888:crowned sword': 'crowned',
  '888:hero': '',
  '889:crowned shield': 'crowned',
  '889:hero': '',
  '898:ice rider': 'ice',
};

const slug = (form: string): string =>
  form
    .toLowerCase()
    .replace(/ forme?$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Identificador de la imagen que corresponde exactamente a esa forma, o null.
 * Ante la duda no se elige ninguna: mostrar otra forma sería peor que no mostrar imagen.
 * Los oscuros comparten imagen con su forma normal.
 */
export function spriteId(entry: { name: string; dex: number }, index: SpriteIndex | undefined): number | null {
  const species = index?.[entry.dex];
  if (!species?.length) return null;
  const forms = [...entry.name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!).filter((form) => form !== 'Shadow');
  if (forms.length === 0) return species[0]!.id;
  if (forms.length > 1) return null;
  const key = forms[0]!.toLowerCase();
  const suffix = ALIASES[`${entry.dex}:${key}`] ?? REGIONS[key] ?? slug(forms[0]!);
  if (suffix === '') return species[0]!.id;
  const matches = species
    .filter((form) => form.name.endsWith(`-${suffix}`))
    .sort((a, b) => a.name.length - b.name.length);
  const [first, second] = matches;
  if (!first) return null;
  // «darmanitan-zen» frente a «darmanitan-galar-zen»: gana el nombre sin más apellidos.
  return second && second.name.length === first.name.length ? null : first.id;
}
