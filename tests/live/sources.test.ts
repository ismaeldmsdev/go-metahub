/** Comprueba las fuentes reales. Solo se ejecuta con `npm run test:live`. */
import { describe, expect, it } from 'vitest';
import { SOURCES } from '../../src/data/sources';

describe('fuentes reales', () => {
  it.each(Object.keys(SOURCES) as (keyof typeof SOURCES)[])('%s responde con la estructura esperada', async (id) => {
    const result = await SOURCES[id]({ previous: undefined });
    expect(result.viaFallback).toBe(false);
    expect(result.discarded).toBe(0);
    console.log(id, {
      sourceUpdatedAt: result.sourceUpdatedAt && new Date(result.sourceUpdatedAt).toISOString(),
      size: JSON.stringify(result.data).length,
    });
  }, 60_000);
});
