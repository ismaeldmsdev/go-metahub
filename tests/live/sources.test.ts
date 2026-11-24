/** Comprueba las fuentes reales. Solo se ejecuta con `npm run test:live`. */
import { describe, expect, it } from 'vitest';
import { ENDPOINTS } from '../../src/data/config';
import { fetchJson } from '../../src/data/http';
import { SOURCES } from '../../src/data/sources';
import { toCounters } from '../../src/data/transform';

describe('fuentes reales', () => {
  // «gyms» es un archivo propio: lo comprueba `npm run gimnasios -- --comprobar`.
  it.each((Object.keys(SOURCES) as (keyof typeof SOURCES)[]).filter((id) => id !== 'gyms'))('%s responde con la estructura esperada', async (id) => {
    const result = await SOURCES[id]({ previous: undefined });
    expect(result.viaFallback).toBe(false);
    expect(result.discarded).toBe(0);
    console.log(id, {
      sourceUpdatedAt: result.sourceUpdatedAt && new Date(result.sourceUpdatedAt).toISOString(),
      size: JSON.stringify(result.data).length,
    });
  }, 60_000);
});

describe('significado de los counters de Pokébattler', () => {
  // Las pruebas normales usan datos sintéticos: esto es lo único que detectaría un cambio de criterio en la fuente.
  it('«tdo» sigue siendo los PS de nuestro Pokémon y «tdi», su daño', async () => {
    const bosses = (await SOURCES.pokebattler({ previous: undefined })).data;
    const found = Object.entries(bosses).find(([, tier]) => tier === 'RAID_LEVEL_5');
    expect(found, 'no hay jefes de 5 estrellas').toBeDefined();
    const target = { id: found![0], tier: found![1]! };
    const raw: any = await fetchJson(ENDPOINTS.counters({ ...target, weather: 'NO_WEATHER' }).url);
    expect(toCounters(raw, target).list.length).toBeGreaterThanOrEqual(6);
    let varied = 0;
    for (const { pokemonId, byMove } of raw.attackers[0].randomMove.defenders) {
      const values = (key: string): number[] => byMove.map((m: any) => m.result[key]);
      // Los PS no dependen de los movimientos (con margen de redondeo); el daño, sí.
      expect(Math.max(...values('tdo')) - Math.min(...values('tdo')), pokemonId).toBeLessThanOrEqual(1);
      if (new Set(values('tdi')).size > 1) varied += 1;
    }
    expect(varied).toBeGreaterThan(raw.attackers[0].randomMove.defenders.length / 2);
  }, 60_000);
});
