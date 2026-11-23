import { z } from 'zod';
import { SourceError } from './errors';

// Sin generación dinámica de código, que la política de seguridad de la página no permite.
z.config({ jitless: true });

/* Solo se declaran los campos que se usan. Zod ignora los demás. */

export const rankingEntry = z.object({
  speciesId: z.string().min(1),
  speciesName: z.string().min(1),
  score: z.number().min(0).max(100),
  moveset: z.array(z.string().min(1)).min(1).max(3),
});

export const gamemaster = z.object({
  pokemon: z.array(
    z.object({
      speciesId: z.string(),
      dex: z.number().int().positive(),
      types: z.array(z.string()),
      eliteMoves: z.array(z.string()).optional(),
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
