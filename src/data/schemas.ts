import { z } from 'zod';
import { SourceError } from './errors';

// Sin generación dinámica de código, que la política de seguridad de la página no permite.
z.config({ jitless: true });

/* Solo se declaran los campos que se usan. Zod ignora los demás. */

export const rankingEntry = z.object({
  speciesId: z.string().min(1),
  speciesName: z.string().min(1),
  score: z.number().min(0).max(100),
  // Las supermegaevoluciones llevan un cuarto movimiento.
  moveset: z.array(z.string().min(1)).min(1).max(4),
});

export const gamemaster = z.object({
  pokemon: z.array(
    z.object({
      speciesId: z.string(),
      speciesName: z.string(),
      dex: z.number().int().positive(),
      types: z.array(z.string()),
      eliteMoves: z.array(z.string()).optional(),
      baseStats: z
        .object({ atk: z.number().positive(), def: z.number().positive(), hp: z.number().positive() })
        .optional()
        .catch(undefined),
      fastMoves: z.array(z.string()).optional().catch(undefined),
    }),
  ),
  moves: z.array(
    z.object({
      moveId: z.string(),
      name: z.string(),
      type: z.string(),
      energyGain: z.number(),
    }),
  ),
  // Se validan aparte: si cambian, las ligas siguen funcionando.
  formats: z.unknown().optional(),
  cups: z.unknown().optional(),
});

/** Va en direcciones y claves: solo letras y números. */
const cupId = z.string().regex(/^[a-z0-9]+$/);

export const pvpFormat = z.object({
  title: z.string().min(1),
  cup: cupId,
  cp: z.number().int().positive(),
  showCup: z.boolean().optional(),
  showFormat: z.boolean().optional(),
  hideRankings: z.boolean().optional(),
});

const cupFilter = z.object({
  filterType: z.string(),
  values: z.array(z.union([z.string(), z.number()])),
  leagues: z.array(z.number()).optional(),
});

export const pvpCup = z.object({
  name: cupId,
  include: z.array(cupFilter),
  exclude: z.array(cupFilter),
});

const named = z.object({ name: z.string().min(1) });
const cpRange = z.object({ min: z.number(), max: z.number() });

export const raidBoss = z.object({
  name: z.string().min(1),
  tier: z.string(),
  canBeShiny: z.boolean(),
  types: z.array(named),
  combatPower: z.object({ normal: cpRange, boosted: cpRange }),
  boostedWeather: z.array(named),
  image: z.string(),
});

const featured = z.object({
  name: z.string().min(1),
  image: z.string().optional(),
  canBeShiny: z.boolean().optional(),
});

/** Calendario de incursiones de LeekDuck. Fechas «2026-11-25 06:00:00 -0800»: con local_time, el desfase no cuenta. */
export const manifestPeriod = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  start_date: z.string().regex(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?: [+-]\d{4})?$/),
  end_date: z.string().regex(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?: [+-]\d{4})?$/),
  local_time: z.boolean(),
  tags: z.array(z.string()).catch([]),
});

export const raidManifest = z.object({
  generated_at: z.iso.datetime(),
  regular_raids: z.array(z.unknown()),
  shadow_raids: z.array(z.unknown()),
});

export const rawEvent = z.object({
  eventID: z.string().min(1),
  name: z.string().min(1),
  eventType: z.string(),
  heading: z.string(),
  link: z.string(),
  image: z.string(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  // Detalles opcionales y cambiantes: si no encajan se omiten, pero el evento se conserva.
  extraData: z
    .object({
      generic: z
        .object({ hasSpawns: z.boolean().optional(), hasFieldResearchTasks: z.boolean().optional() })
        .optional()
        .catch(undefined),
      communityday: z
        .object({
          spawns: z.array(featured).catch([]),
          bonuses: z.array(z.object({ text: z.string().min(1) })).catch([]),
          bonusDisclaimers: z.array(z.string()).catch([]),
        })
        .optional()
        .catch(undefined),
      spotlight: z
        .object({ bonus: z.string().catch(''), list: z.array(featured).catch([]) })
        .optional()
        .catch(undefined),
      raidbattles: z
        .object({ bosses: z.array(featured).catch([]), shinies: z.array(featured).catch([]) })
        .optional()
        .catch(undefined),
    })
    .nullable()
    .catch(null),
});

export const locale = z.record(z.string(), z.unknown());

export const pokebattler = z.object({
  tiers: z
    .array(
      z.object({
        tier: z.string(),
        raids: z.array(z.object({ pokemon: z.string() })),
      }),
    )
    .min(1),
});

/** Aparte de los jefes de incursión: si cambia, estos siguen funcionando. */
export const pokebattlerMax = z.object({
  tiers: z.array(z.object({ tier: z.string(), raids: z.array(z.object({ pokemon: z.string().regex(/^[A-Z0-9_]+$/) })) })),
  dynamaxPokemon: z.array(z.string().regex(/^[A-Z0-9_]+$/)).catch([]),
});

const metric = z.number().positive().nullable().catch(null);

/** En la respuesta, «attackers» es el jefe y «defenders» son nuestros Pokémon. */
export const counters = z.object({
  sortType: z.literal('ESTIMATOR'),
  filterValue: z.string(),
  megaLevel: z.number().nullable().catch(null),
  attackers: z
    .array(
      z.object({
        pokemonId: z.string(),
        boss: z.string(),
        // Media frente a los distintos ataques del jefe.
        randomMove: z.object({
          defenders: z.array(
            z.object({
              pokemonId: z.string().min(1),
              stats: z.object({ level: z.union([z.string(), z.number()]) }),
              byMove: z
                .array(
                  z.object({
                    move1: z.string().min(1),
                    move2: z.string().min(1),
                    result: z.object({ estimator: z.number().positive(), edps: metric, tdi: metric }),
                  }),
                )
                .min(1),
            }),
          ),
        }),
      }),
    )
    .length(1),
});

const httpsUrl = z.string().regex(/^https:\/\//);

export const gyms = z.object({
  format: z.literal(1),
  source: z.object({
    name: z.string().min(1),
    url: httpsUrl,
    license: z.string().min(1),
    licenseUrl: httpsUrl,
    methodologyUrl: httpsUrl,
    version: z.string().min(1),
    generatedAt: z.iso.datetime(),
  }),
  changes: z.string().min(1),
  pokemon: z.array(
    z.object({
      name: z.string().min(1),
      dex: z.number().int().positive(),
      types: z.array(z.string()).min(1).max(2),
      groups: z.array(z.enum(['mega', 'shadow', 'legendary'])),
      attack: z
        .object({
          tier: z.enum(['S+', 'S', 'A', 'B', 'C', 'D']),
          percentile: z.number().min(0).max(100),
          score: z.number().positive(),
          fast: z.string().min(1),
          fastType: z.string(),
          charged: z.string().min(1),
          chargedType: z.string(),
        })
        .nullable(),
      bulk: z.number().positive().nullable(),
    }),
  ),
});

const rocketSlot = z
  .array(z.object({ id: z.number().int().positive(), template: z.string().min(1).optional() }))
  .min(1);

export const rocketTrainer = z.object({
  proto: z.string().min(1),
  type: z.string().min(1),
  gender: z.number().int(),
  grunt: z.string(),
  firstReward: z.boolean(),
  secondReward: z.boolean(),
  thirdReward: z.boolean(),
  encounters: z.object({ first: rocketSlot, second: rocketSlot, third: rocketSlot }),
});

/** Los que no están en activo no llevan Pokémon: solo se valida el resto. */
export const rocketList = z.record(z.string().regex(/^\d+$/), z.looseObject({ active: z.boolean() }));

const contrastSlot = z.array(z.object({ name: z.string().min(1), image: z.string() })).min(1);

export const contrastTrainer = z.object({
  name: z.string().min(1),
  firstPokemon: contrastSlot,
  secondPokemon: contrastSlot,
  thirdPokemon: contrastSlot,
});

export const rocketAttackers = z.object({
  format: z.literal(1),
  source: gyms.shape.source,
  changes: z.string().min(1),
  pokemon: z.array(
    z.object({
      name: z.string().min(1),
      dex: z.number().int().positive(),
      types: z.array(z.string()).min(1).max(2),
      groups: z.array(z.enum(['mega', 'shadow', 'legendary'])),
      tier: z.enum(['S+', 'S', 'A', 'B', 'C', 'D']),
      score: z.number().positive(),
      fast: z.string().min(1),
      fastType: z.string().min(1),
      charged: z.string().min(1),
      chargedType: z.string().min(1),
    }),
  ),
});

export const raidAttackers = z.object({
  format: z.literal(1),
  source: gyms.shape.source,
  changes: z.string().min(1),
  pokemon: z.array(
    z.object({
      name: z.string().min(1),
      dex: z.number().int().positive(),
      types: z.array(z.string()).min(1).max(2),
      groups: z.array(z.enum(['mega', 'shadow', 'legendary'])),
      tier: z.enum(['S+', 'S', 'A', 'B', 'C', 'D', 'E']),
      percentile: z.number().min(0).max(100),
      dps: z.number().positive(),
      tdo: z.number().positive(),
      fast: z.string().min(1),
      fastType: z.string().min(1),
      charged: z.string().min(1),
      chargedType: z.string().min(1),
    }),
  ),
});

export const commits = z
  .array(z.object({ commit: z.object({ committer: z.object({ date: z.iso.datetime() }) }) }))
  .min(1);

export function parseWith<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SourceError('format', `La estructura de ${what} ha cambiado`);
  return result.data;
}

/** Un registro defectuoso se descarta; si hay demasiados, se rechaza toda la descarga. */
export function parseList<T>(
  schema: z.ZodType<T>,
  value: unknown,
  what: string,
  maxInvalidRatio = 0.2,
): { items: T[]; discarded: number } {
  if (!Array.isArray(value)) throw new SourceError('format', `La estructura de ${what} ha cambiado`);
  if (value.length === 0) throw new SourceError('empty', `La fuente ha devuelto la lista de ${what} vacía`);
  const items: T[] = [];
  for (const entry of value) {
    const result = schema.safeParse(entry);
    if (result.success) items.push(result.data);
  }
  const discarded = value.length - items.length;
  if (discarded / value.length > maxInvalidRatio) {
    throw new SourceError('format', `Demasiados registros incorrectos en la lista de ${what}`);
  }
  return { items, discarded };
}
