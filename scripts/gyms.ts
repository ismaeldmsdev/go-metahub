import { z } from 'zod';
import type { GymData, GymPokemon } from '../src/data/models';
import { weaknesses } from '../src/domain/types';

/** Genera el resumen de gimnasios que usa la aplicación. Solo selecciona y empareja: no recalcula nada. */

export const DATASET_URL = 'https://cdn-r2.doctorpokegogo.com/dataset/pokego-dataset.json';
export const GAMEMASTER_URL = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.min.json';
const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';

const move = z.object({
  fast_name_en: z.string().min(1),
  charge_name_en: z.string().min(1),
  fast_type: z.string().min(1),
  charge_type: z.string().min(1),
});

export const record = z.object({
  canonical_id: z.string().regex(/^pm_\d{4}_[a-z0-9_]+$/),
  dex: z.number().int().positive(),
  form: z.string(),
  name_en: z.string().min(1),
  type1: z.string().min(1),
  type2: z.string().nullable(),
  base_stats: z.object({
    attack: z.number().positive(),
    defense: z.number().positive(),
    stamina: z.number().positive(),
    durability: z.number().positive(),
  }),
  gym: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('computed'),
      metrics: z.object({
        clear_score: z.number().min(0),
        percentile: z.number().min(0).max(100),
        // Vacío en Ditto y Smeargle, que no tienen movimientos propios.
        tier: z.enum(['S+', 'S', 'A', 'B', 'C', 'D', '']),
      }),
      recommendation: move.nullable(),
    }),
    z.object({ status: z.literal('unavailable') }),
  ]),
  type_effectiveness: z.object({ weaknesses: z.array(z.object({ type: z.string(), multiplier: z.number() })) }),
});

export const dataset = z.object({
  meta: z.object({
    schema_version: z.literal(3),
    license: z.literal(LICENSE),
    generated_at: z.iso.datetime(),
    dataset_version: z.string().min(1),
    record_count: z.number(),
  }),
  records: z.array(record),
});

export const gamemaster = z.object({
  pokemon: z.array(
    z.object({
      speciesId: z.string(),
      speciesName: z.string(),
      dex: z.number(),
      types: z.array(z.string()),
      baseStats: z.object({ atk: z.number(), def: z.number(), hp: z.number() }),
      released: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
    }),
  ),
});

type Entry = z.infer<typeof record>;
type Species = z.infer<typeof gamemaster>['pokemon'][number];

/** La forma habitual de estas especies lleva nombre propio en PvPoke. */
const DEFAULT_FORM: Record<number, string> = {
  421: 'overcast', 487: 'altered', 492: 'land', 555: 'standard', 641: 'incarnate', 642: 'incarnate',
  645: 'incarnate', 647: 'ordinary', 678: 'male', 710: 'small', 711: 'small', 718: '50', 741: 'baile',
  745: 'midday', 876: 'male', 888: 'hero', 889: 'hero', 905: 'incarnate', 978: 'stretchy',
};

const FORM_ALIAS: Record<string, string> = {
  '128:paldean_aqua': 'aqua',
  '128:paldean_blaze': 'blaze',
  '128:paldean_combat': 'combat',
  '382:mega': 'primal',
  '383:mega': 'primal',
  '421:sunny': 'sunshine',
  '439:normal': 'jr',
  '555:galarian_standard': 'galarian',
  '718:ten_percent': '10',
  '741:pau': 'pa_u',
};

/** Nombres que no siguen el patrón «Especie (Forma)». */
export const NAME_ALIAS: Record<string, string> = { mime_jr: 'Mime Jr.' };

/**
 * PvPoke marca como no publicados a estos, que no usa en PvP. Publicación comprobada el 24-11-2026 en pogoapi.net
 * o en la wiki de Pokémon GO.
 */
export const RELEASED = new Set(['ditto', 'shedinja', 'spewpa', 'cosmog', 'cosmoem', 'toxtricity_low_key']);

/**
 * Tienen una forma que solo existe en combate y no pueden usarse en gimnasios, ni atacando ni defendiendo.
 * Comprobado el 24-11-2026 en la wiki de Pokémon GO: Aegislash, Mimikyu, Cramorant y Morpeko, en la ficha de cada
 * uno; Minior, por la regla general de la página «Gym». Bulbapedia coincide en Morpeko, y doctorpokegogo no evalúa
 * a Aegislash ni a Minior (núcleo).
 */
export const NOT_IN_GYMS = new Set([681, 774, 778, 845, 877]);

/** Meltan y Melmetal son los únicos singulares que pueden defender. */
const MYTHICAL_DEFENDERS = new Set([808, 809]);
/** Legendarios y singulares que PvPoke no etiqueta: por si aparecen. */
export const EXTRA_LEGENDARY = new Set([489, 490, 772, 773, 789, 790]);

const formKeys = (name: string): string[] =>
  [...name.matchAll(/\(([^)]+)\)/g)].map((m) =>
    m[1]!
      .toLowerCase()
      .replace(/ forme?$/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, ''),
  );

/** Formas, al estilo de PvPoke, que describe el identificador del dataset. */
function wantedForms(entry: Pick<Entry, 'canonical_id' | 'dex'>): string[] {
  let rest = entry.canonical_id.replace(/^pm_\d+_/, '');
  const forms: string[] = [];
  if (/^shadow(_|$)/.test(rest)) {
    forms.push('shadow');
    rest = rest.replace(/^shadow_?/, '') || 'normal';
  }
  const alias = FORM_ALIAS[`${entry.dex}:${rest}`];
  if (alias) return [...forms, alias];
  if (rest !== 'normal') return [...forms, rest];
  const usual = DEFAULT_FORM[entry.dex];
  return usual ? [...forms, usual] : forms;
}

export const plainTypes = (types: (string | null)[]): string[] => types.filter((t): t is string => !!t && t !== 'none');

/** La pareja solo vale si coinciden número, forma, tipos y las tres estadísticas base. */
export function matchSpecies(
  entry: Pick<Entry, 'canonical_id' | 'dex' | 'type1' | 'type2' | 'base_stats'>,
  candidates: Species[],
): Species | null {
  const wanted = wantedForms(entry).sort().join();
  const found = candidates.filter(
    (s) =>
      formKeys(s.speciesName).sort().join() === wanted &&
      !s.speciesName.includes('_') &&
      s.baseStats.atk === entry.base_stats.attack &&
      s.baseStats.def === entry.base_stats.defense &&
      s.baseStats.hp === entry.base_stats.stamina &&
      plainTypes(s.types).sort().join() === plainTypes([entry.type1, entry.type2]).sort().join(),
  );
  return found.length === 1 ? found[0]! : null;
}

export interface Coverage {
  records: number;
  published: number;
  attackers: number;
  defenders: number;
  /** Identificadores del dataset que no se usan, por motivo. */
  omitted: Record<'gigantamax' | 'unmatched' | 'unreleased' | 'notInGyms', string[]>;
  withoutAttack: string[];
}

export interface GymFile extends GymData {
  format: 1;
}

export class DataError extends Error {}

export function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  throw new DataError(`${what} no tiene la estructura esperada (${issue.path.join('.')}: ${issue.message})`);
}

export const chart = (list: { type: string; multiplier: number }[]): string =>
  list
    .map((w) => `${w.type} ${w.multiplier.toFixed(2)}`)
    .sort()
    .join();

const MIN_RECORDS = 1500;
const MAX_UNMATCHED = 0.02;

export function build(
  rawDataset: unknown,
  rawGamemaster: unknown,
  minRecords = MIN_RECORDS,
): { file: GymFile; coverage: Coverage } {
  const { meta, records } = parse(dataset, rawDataset, 'El dataset de doctorpokegogo');
  const { pokemon: species } = parse(gamemaster, rawGamemaster, 'El archivo de PvPoke');
  if (meta.record_count !== records.length || records.length < minRecords) {
    throw new DataError(`Al dataset le faltan fichas: ${records.length} de ${meta.record_count}`);
  }
  if (new Set(records.map((r) => r.canonical_id)).size !== records.length) {
    throw new DataError('El dataset tiene fichas repetidas');
  }

  const byDex = Map.groupBy(species, (s) => s.dex);
  const legendary = new Set([
    ...EXTRA_LEGENDARY,
    ...records.filter((r) => ['legendary', 'mythical', 'ultra_beast'].includes(r.form)).map((r) => r.dex),
    ...species.filter((s) => s.tags?.some((t) => ['legendary', 'mythical', 'ultrabeast'].includes(t))).map((s) => s.dex),
  ]);

  const omitted: Coverage['omitted'] = { gigantamax: [], unmatched: [], unreleased: [], notInGyms: [] };
  const withoutAttack: string[] = [];
  const list: GymPokemon[] = [];
  for (const entry of records) {
    const id = entry.canonical_id;
    const { defense, stamina, durability } = entry.base_stats;
    if (durability !== defense * stamina) throw new DataError(`La resistencia ya no es defensa × aguante (${id})`);
    if (entry.form === 'gmax') {
      // Es el mismo Pokémon que su forma normal y tiene su misma evaluación: Gigamax solo existe en los combates Max.
      const twins = records.filter((r) => r.dex === entry.dex && r.form !== 'gmax');
      if (!twins.some((r) => JSON.stringify(r.gym) === JSON.stringify(entry.gym))) {
        throw new DataError(`La ficha Gigamax ${id} ya no es igual que la normal: hay que revisarla`);
      }
      omitted.gigantamax.push(id);
      continue;
    }
    if (NOT_IN_GYMS.has(entry.dex)) {
      omitted.notInGyms.push(id);
      continue;
    }
    const match = matchSpecies(entry, byDex.get(entry.dex) ?? []);
    if (!match) {
      omitted.unmatched.push(id);
      continue;
    }
    if (match.released === false && !RELEASED.has(match.speciesId)) {
      omitted.unreleased.push(id);
      continue;
    }
    const types = plainTypes(match.types);
    // La aplicación calcula las debilidades con su tabla de tipos: deben ser las mismas que publica la fuente.
    if (chart(weaknesses(types)) !== chart(entry.type_effectiveness.weaknesses)) {
      throw new DataError(`Las debilidades de ${id} no coinciden con la tabla de tipos`);
    }
    const mega = entry.form === 'mega';
    const shadow = entry.form === 'shadow';
    const isLegendary = legendary.has(entry.dex);
    const groups: GymPokemon['groups'] = [];
    if (mega) groups.push('mega');
    if (shadow) groups.push('shadow');
    if (isLegendary) groups.push('legendary');

    const gym = entry.gym.status === 'computed' ? entry.gym : null;
    const moves = gym?.recommendation ?? null;
    if (gym && (!moves !== !gym.metrics.tier || !moves !== !gym.metrics.clear_score)) {
      throw new DataError(`La evaluación de ${id} está incompleta`);
    }
    const attack: GymPokemon['attack'] =
      gym && moves && gym.metrics.tier
        ? {
            tier: gym.metrics.tier,
            percentile: gym.metrics.percentile,
            score: gym.metrics.clear_score,
            fast: moves.fast_name_en,
            fastType: moves.fast_type,
            charged: moves.charge_name_en,
            chargedType: moves.charge_type,
          }
        : null;
    if (!attack) withoutAttack.push(id);
    const canDefend = !mega && (!isLegendary || MYTHICAL_DEFENDERS.has(entry.dex));
    // Los oscuros pueden defender, pero la fuente les da la resistencia de la forma normal, sin el daño extra que reciben.
    const bulk = canDefend && !shadow ? durability : null;
    if (!attack && bulk === null) continue;
    list.push({ name: NAME_ALIAS[match.speciesId] ?? match.speciesName, dex: entry.dex, types, groups, attack, bulk });
  }

  if (new Set(list.map((p) => p.name)).size !== list.length) throw new DataError('Hay nombres repetidos en el resultado');
  if (omitted.unmatched.length / records.length > MAX_UNMATCHED) {
    throw new DataError(`Demasiadas fichas sin pareja segura: ${omitted.unmatched.length}`);
  }
  return {
    file: {
      format: 1,
      source: {
        name: 'doctorpokegogo.com',
        url: 'https://doctorpokegogo.com/',
        license: 'CC BY 4.0',
        licenseUrl: LICENSE,
        methodologyUrl: 'https://doctorpokegogo.com/en/rating-methodology/',
        version: meta.dataset_version,
        generatedAt: meta.generated_at,
      },
      changes:
        'Datos transformados y resumidos por GO MetaHub: se han seleccionado la evaluación de gimnasio y la resistencia, ' +
        'emparejado los nombres y omitido las fichas que no se usan en gimnasios o no se han podido comprobar. A los oscuros ' +
        'no se les asigna resistencia propia. Las cifras y los tiers no se han modificado.',
      pokemon: list,
    },
    coverage: {
      records: records.length,
      published: list.length,
      attackers: list.filter((p) => p.attack).length,
      defenders: list.filter((p) => p.bulk !== null).length,
      omitted,
      withoutAttack,
    },
  };
}

const MAX_DROP = 0.05;

/** Una caída brusca respecto a lo ya publicado indica un error, no un cambio del juego. */
export function checkAgainst(previous: GymFile | null, next: GymFile): void {
  if (!previous) return;
  if (next.source.generatedAt < previous.source.generatedAt) {
    throw new DataError('El dataset descargado es más antiguo que el publicado');
  }
  const counts: [string, (p: GymPokemon) => boolean][] = [
    ['atacantes', (p) => p.attack !== null],
    ['defensores', (p) => p.bulk !== null],
  ];
  for (const [what, test] of counts) {
    const before = previous.pokemon.filter(test).length;
    const now = next.pokemon.filter(test).length;
    if (now < before * (1 - MAX_DROP)) {
      throw new DataError(`Hay muchos menos ${what} que antes: ${now} frente a ${before}`);
    }
  }
}

/** Un Pokémon por línea: los cambios se pueden revisar. */
export function serialize({ pokemon, ...head }: GymFile): string {
  const rows = pokemon.map((p) => `  ${JSON.stringify(p)}`).join(',\n');
  return `${JSON.stringify(head, null, 1).slice(0, -2)},\n "pokemon": [\n${rows}\n ]\n}\n`;
}
