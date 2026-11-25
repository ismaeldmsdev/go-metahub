import { z } from 'zod';
import type { GymData, RocketAttacker, RocketAttackersData } from '../src/data/models';
import { weaknesses } from '../src/domain/types';
import {
  chart,
  DataError,
  dataset as gymDataset,
  EXTRA_LEGENDARY,
  gamemaster as gymGamemaster,
  matchSpecies,
  NAME_ALIAS,
  parse,
  plainTypes,
  record as gymRecord,
  RELEASED,
} from './gyms';

/** Genera el resumen de atacantes para Rocket. Solo selecciona y empareja: no recalcula nada. */

export { DATASET_URL, DataError, GAMEMASTER_URL } from './gyms';

const record = gymRecord.omit({ gym: true }).extend({
  rocket: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('computed'),
      score: z.number().positive(),
      tier: z.enum(['S+', 'S', 'A', 'B', 'C', 'D']),
      recommendation: z.object({
        fast_name_en: z.string().min(1),
        charge_name_en: z.string().min(1),
        attack_type: z.string().min(1),
      }),
    }),
    z.object({ status: z.literal('unavailable') }),
  ]),
});

const dataset = gymDataset.extend({ records: z.array(record) });

export const gamemaster = gymGamemaster.extend({
  moves: z.array(z.object({ name: z.string().min(1), type: z.string().min(1) })),
});

/**
 * Formas que no se pueden elegir: solo aparecen a mitad de un combate. Minior entra en forma Meteorito y pasa a Núcleo con
 * menos de la mitad de los PS, también contra Rocket (Bulbapedia, comprobado el 25-11-2026). Evaluarlo como Núcleo engaña.
 */
export const BATTLE_FORMS = new Set(['Minior (Core)']);

/** «Techno Blast Normal» y «Techno Blast (Normal)» son el mismo. El «+» distingue variantes. */
const moveKey = (name: string): string => name.toLowerCase().replace(/[^a-z+]/g, '');

/** Tipo de un movimiento por su nombre, solo si no hay duda. */
export function moveTypes(moves: { name: string; type: string }[]): (name: string) => string | null {
  const known = new Map<string, Set<string>>();
  for (const { name, type } of moves) known.set(moveKey(name), (known.get(moveKey(name)) ?? new Set()).add(type));
  return (name) => {
    const types = [...(known.get(moveKey(name)) ?? [])];
    return types.length === 1 ? types[0]! : null;
  };
}

export interface RocketCoverage {
  records: number;
  published: number;
  /** Identificadores del dataset que no se usan, por motivo. */
  omitted: Record<'gigantamax' | 'unmatched' | 'unreleased' | 'unavailable' | 'doubtfulMoves' | 'battleForm', string[]>;
}

export interface RocketFile extends RocketAttackersData {
  format: 1;
}

/** Las pruebas usan otros: trabajan con unas pocas fichas. */
export const LIMITS = { minRecords: 1500, unmatched: 0.02, doubtful: 0.01 };

export function build(
  rawDataset: unknown,
  rawGamemaster: unknown,
  limits = LIMITS,
): { file: RocketFile; coverage: RocketCoverage } {
  const { meta, records } = parse(dataset, rawDataset, 'El dataset de doctorpokegogo');
  const { pokemon: species, moves } = parse(gamemaster, rawGamemaster, 'El archivo de PvPoke');
  if (meta.record_count !== records.length || records.length < limits.minRecords) {
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
  const typeOfMove = moveTypes(moves);

  const omitted: RocketCoverage['omitted'] = {
    gigantamax: [],
    unmatched: [],
    unreleased: [],
    unavailable: [],
    doubtfulMoves: [],
    battleForm: [],
  };
  const list: RocketAttacker[] = [];
  for (const entry of records) {
    const id = entry.canonical_id;
    if (entry.form === 'gmax') {
      // Gigamax solo existe en los combates Max: aquí es el mismo Pokémon que su forma normal.
      const twins = records.filter((r) => r.dex === entry.dex && r.form !== 'gmax');
      if (!twins.some((r) => JSON.stringify(r.rocket) === JSON.stringify(entry.rocket))) {
        throw new DataError(`La ficha Gigamax ${id} ya no es igual que la normal: hay que revisarla`);
      }
      omitted.gigantamax.push(id);
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
    if (BATTLE_FORMS.has(match.speciesName)) {
      omitted.battleForm.push(id);
      continue;
    }
    const { rocket } = entry;
    if (rocket.status !== 'computed') {
      omitted.unavailable.push(id);
      continue;
    }
    const types = plainTypes(match.types);
    // La aplicación usa su tabla de tipos para las ventajas: debe ser la misma que publica la fuente.
    if (chart(weaknesses(types)) !== chart(entry.type_effectiveness.weaknesses)) {
      throw new DataError(`Las debilidades de ${id} no coinciden con la tabla de tipos`);
    }
    const { fast_name_en: fast, charge_name_en: charged, attack_type: chargedType } = rocket.recommendation;
    const fastType = typeOfMove(fast);
    // La fuente no da el tipo del ataque rápido. Si algún tipo no se confirma con PvPoke, no se publica la ficha.
    if (!fastType || typeOfMove(charged) !== chargedType) {
      omitted.doubtfulMoves.push(id);
      continue;
    }
    const groups: RocketAttacker['groups'] = [];
    if (entry.form === 'mega') groups.push('mega');
    if (entry.form === 'shadow') groups.push('shadow');
    if (legendary.has(entry.dex)) groups.push('legendary');
    const name = NAME_ALIAS[match.speciesId] ?? match.speciesName;
    const { tier, score } = rocket;
    list.push({ name, dex: entry.dex, types, groups, tier, score, fast, fastType, charged, chargedType });
  }

  if (new Set(list.map((p) => p.name)).size !== list.length) throw new DataError('Hay nombres repetidos en el resultado');
  if (omitted.unmatched.length / records.length > limits.unmatched) {
    throw new DataError(`Demasiadas fichas sin pareja segura: ${omitted.unmatched.length}`);
  }
  if (omitted.doubtfulMoves.length / records.length > limits.doubtful) {
    throw new DataError(`Demasiadas fichas con movimientos dudosos: ${omitted.doubtfulMoves.length}`);
  }
  return {
    file: {
      format: 1,
      source: {
        name: 'doctorpokegogo.com',
        url: 'https://doctorpokegogo.com/',
        license: 'CC BY 4.0',
        licenseUrl: meta.license,
        methodologyUrl: 'https://doctorpokegogo.com/en/about-methodology/',
        version: meta.dataset_version,
        generatedAt: meta.generated_at,
      },
      changes:
        'Datos transformados y resumidos por GO MetaHub: se ha seleccionado la evaluación de Team GO Rocket, emparejado los ' +
        'nombres, añadido el tipo del ataque rápido según PvPoke y omitido las fichas no publicadas en el juego, las formas ' +
        'que solo existen a mitad de un combate y las que no se han podido comprobar. Las puntuaciones, los tiers y los movimientos no se han modificado.',
      pokemon: list,
    },
    coverage: { records: records.length, published: list.length, omitted },
  };
}

/** Lo que tienen en común los archivos de atacantes. */
interface AttackersFile {
  format: 1;
  source: GymData['source'];
  changes: string;
  pokemon: object[];
}

const MAX_DROP = 0.05;

/** Una caída brusca respecto a lo ya publicado indica un error, no un cambio del juego. */
export function checkAgainst(previous: AttackersFile | null, next: AttackersFile): void {
  if (!previous) return;
  if (next.source.generatedAt < previous.source.generatedAt) {
    throw new DataError('El dataset descargado es más antiguo que el publicado');
  }
  if (next.pokemon.length < previous.pokemon.length * (1 - MAX_DROP)) {
    throw new DataError(`Hay muchos menos atacantes que antes: ${next.pokemon.length} frente a ${previous.pokemon.length}`);
  }
}

/** Los datos idénticos con otra fecha no justifican publicar… */
const RENEW_AFTER = 30 * 24 * 60 * 60 * 1000;

/** …salvo que la fecha publicada ya sea antigua, para que la aplicación no crea que la fuente se ha parado. */
export function needsUpdate(previous: AttackersFile | null, next: AttackersFile): boolean {
  if (!previous) return true;
  const stamp = { version: '', generatedAt: '' };
  const content = (file: AttackersFile) => JSON.stringify({ ...file, source: { ...file.source, ...stamp } });
  if (content(previous) !== content(next)) return true;
  return Date.parse(next.source.generatedAt) - Date.parse(previous.source.generatedAt) > RENEW_AFTER;
}

/** Un Pokémon por línea: los cambios se pueden revisar. */
export function serialize({ pokemon, ...head }: AttackersFile): string {
  const rows = pokemon.map((p) => `  ${JSON.stringify(p)}`).join(',\n');
  return `${JSON.stringify(head, null, 1).slice(0, -2)},\n "pokemon": [\n${rows}\n ]\n}\n`;
}
