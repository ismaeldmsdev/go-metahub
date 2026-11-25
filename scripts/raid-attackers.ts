import { z } from 'zod';
import type { RaidAttacker, RaidAttackersData } from '../src/data/models';
import { weaknesses } from '../src/domain/types';
import {
  chart,
  DataError,
  dataset as gymDataset,
  EXTRA_LEGENDARY,
  matchSpecies,
  NAME_ALIAS,
  parse,
  plainTypes,
  record as gymRecord,
  RELEASED,
} from './gyms';
import { BATTLE_FORMS, gamemaster, LIMITS, moveTypes } from './rocket-attackers';

/** Genera el resumen de atacantes de incursión. Solo selecciona y empareja: no recalcula nada. */

export { DATASET_URL, DataError, GAMEMASTER_URL } from './gyms';
export { checkAgainst, needsUpdate, serialize } from './rocket-attackers';

const record = gymRecord.omit({ gym: true }).extend({
  raid: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('computed'),
      metrics: z.object({
        dps: z.number().min(0),
        tdo: z.number().min(0),
        percentile: z.number().min(0).max(100),
        // Vacío en los que no tienen movimientos propios.
        tier: z.enum(['S+', 'S', 'A', 'B', 'C', 'D', 'E', '']),
      }),
      recommendation: z
        .object({
          fast_name_en: z.string().min(1),
          charge_name_en: z.string().min(1),
          fast_type: z.string().min(1),
          charge_type: z.string().min(1),
        })
        .nullable(),
    }),
    z.object({ status: z.literal('unavailable') }),
  ]),
});

const dataset = gymDataset.extend({ records: z.array(record) });

export interface RaidCoverage {
  records: number;
  published: number;
  /** Cuántos hay de cada tipo de ataque. */
  byType: Record<string, number>;
  /** Identificadores del dataset que no se usan, por motivo. */
  omitted: Record<'gigantamax' | 'unmatched' | 'unreleased' | 'unavailable' | 'doubtfulMoves' | 'battleForm', string[]>;
}

export interface RaidFile extends RaidAttackersData {
  format: 1;
}

export function build(
  rawDataset: unknown,
  rawGamemaster: unknown,
  limits = LIMITS,
): { file: RaidFile; coverage: RaidCoverage } {
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

  const omitted: RaidCoverage['omitted'] = {
    gigantamax: [],
    unmatched: [],
    unreleased: [],
    unavailable: [],
    doubtfulMoves: [],
    battleForm: [],
  };
  const list: RaidAttacker[] = [];
  for (const entry of records) {
    const id = entry.canonical_id;
    if (entry.form === 'gmax') {
      // Gigamax solo existe en los combates Max: en incursiones es el mismo Pokémon que su forma normal.
      const twins = records.filter((r) => r.dex === entry.dex && r.form !== 'gmax');
      if (!twins.some((r) => JSON.stringify(r.raid) === JSON.stringify(entry.raid))) {
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
    const { raid } = entry;
    if (raid.status !== 'computed' || !raid.recommendation) {
      omitted.unavailable.push(id);
      continue;
    }
    const { dps, tdo, percentile, tier } = raid.metrics;
    if (!tier || !dps || !tdo) throw new DataError(`La evaluación de ${id} está incompleta`);
    const types = plainTypes(match.types);
    if (chart(weaknesses(types)) !== chart(entry.type_effectiveness.weaknesses)) {
      throw new DataError(`Las debilidades de ${id} no coinciden con la tabla de tipos`);
    }
    const { fast_name_en: fast, charge_name_en: charged, fast_type: fastType, charge_type: chargedType } = raid.recommendation;
    // El tipo del ataque cargado decide en qué lista sale: si PvPoke lo contradice, no se publica la ficha.
    if ((typeOfMove(charged) ?? chargedType) !== chargedType) {
      omitted.doubtfulMoves.push(id);
      continue;
    }
    const groups: RaidAttacker['groups'] = [];
    if (entry.form === 'mega') groups.push('mega');
    if (entry.form === 'shadow') groups.push('shadow');
    if (legendary.has(entry.dex)) groups.push('legendary');
    const name = NAME_ALIAS[match.speciesId] ?? match.speciesName;
    list.push({ name, dex: entry.dex, types, groups, tier, percentile, dps, tdo, fast, fastType, charged, chargedType });
  }

  if (new Set(list.map((p) => p.name)).size !== list.length) throw new DataError('Hay nombres repetidos en el resultado');
  if (omitted.unmatched.length / records.length > limits.unmatched) {
    throw new DataError(`Demasiadas fichas sin pareja segura: ${omitted.unmatched.length}`);
  }
  if (omitted.doubtfulMoves.length / records.length > limits.doubtful) {
    throw new DataError(`Demasiadas fichas con movimientos dudosos: ${omitted.doubtfulMoves.length}`);
  }
  const byType: Record<string, number> = {};
  for (const { chargedType } of list) byType[chargedType] = (byType[chargedType] ?? 0) + 1;
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
        'Datos transformados y resumidos por GO MetaHub: se ha seleccionado la evaluación de incursiones, emparejado los ' +
        'nombres y omitido las fichas no publicadas en el juego, las formas que solo existen a mitad de un combate y las que ' +
        'no se han podido comprobar. Las cifras, los tiers y los movimientos no se han modificado.',
      pokemon: list,
    },
    coverage: { records: records.length, published: list.length, byType, omitted },
  };
}
