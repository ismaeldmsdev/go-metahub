/** Comprueba las fuentes reales. Solo se ejecuta con `npm run test:live`. */
import { describe, expect, it } from 'vitest';
import { ENDPOINTS } from '../../src/data/config';
import { fetchJson } from '../../src/data/http';
import { loadFormat, SOURCES } from '../../src/data/sources';
import { formatFor, parseEntry, restrictionsOf } from '../../src/domain/formats';
import { maxPokemon } from '../../src/domain/max';
import { toCounters } from '../../src/data/transform';
import { compareLineups, phrasesOf } from '../../src/domain/rocket';

describe('fuentes reales', () => {
  // Son archivos propios: los comprueban `npm run gimnasios -- --comprobar` y `npm run rocket -- --comprobar`.
  const own = ['gyms', 'rocketAttackers', 'raidTypes'];
  it.each((Object.keys(SOURCES) as (keyof typeof SOURCES)[]).filter((id) => !own.includes(id)))('%s responde con la estructura esperada', async (id) => {
    const result = await SOURCES[id]({ previous: undefined });
    expect(result.viaFallback).toBe(false);
    expect(result.discarded).toBe(0);
    console.log(id, {
      sourceUpdatedAt: result.sourceUpdatedAt && new Date(result.sourceUpdatedAt).toISOString(),
      size: JSON.stringify(result.data).length,
    });
  }, 60_000);
});

describe('alineaciones del Team GO Rocket', () => {
  it('las dos fuentes hablan de los mismos entrenadores y hay frases en español', async () => {
    const [main, contrast, tr] = await Promise.all([
      SOURCES.rocket({ previous: undefined }),
      SOURCES.rocketContrast({ previous: undefined }),
      SOURCES.translations({ previous: undefined }),
    ]);
    expect(contrast.data.filter((t) => t.key === null).map((t) => t.name)).toEqual([]);
    expect(main.data.filter((t) => t.kind === 'other').map((t) => t.name)).toEqual([]);
    const comparison = compareLineups(main.data, contrast.data);
    console.log('rocket', { coinciden: comparison.matching, distintos: [...comparison.differences.keys()] });
    // Que difieran alguna vez es normal; que difieran casi todos indica que han dejado de entenderse.
    expect(comparison.matching).toBeGreaterThan(main.data.length / 2);
    expect(main.data.filter((t) => phrasesOf(t, tr.data).length === 0).map((t) => t.key)).toEqual([]);
  }, 60_000);
});

describe('copas, ligas Mega y Max', () => {
  it('los formatos que nombra el calendario tienen ranking propio y restricciones', async () => {
    const [{ data: pvp }, { data: weeks }, { data: tr }] = await Promise.all([
      SOURCES.pvp({ previous: undefined }),
      SOURCES.season({ previous: undefined }),
      SOURCES.translations({ previous: undefined }),
    ]);
    const entries = [...new Set(weeks.flatMap((week) => week.entries))];
    const found = entries.map((text) => [text, formatFor(parseEntry(text), pvp.formats)] as const);
    console.log('copas', found.map(([text, format]) => `${text} → ${format?.title ?? 'sin ranking'}`));
    const mega = pvp.formats.filter((f) => f.cup === 'mega');
    expect(mega.map((f) => f.cp).sort((a, b) => a - b)).toEqual([1500, 2500, 10000]);
    for (const { cup, cp } of mega) {
      const { data, discarded } = await loadFormat({ cup, cp }, { previous: undefined });
      expect(discarded).toBe(0);
      console.log(cup, cp, data.entries.length, data.entries[0]!.name);
    }
    for (const format of pvp.formats) expect(restrictionsOf(format, pvp.species, tr).length).toBeGreaterThan(0);
  }, 90_000);

  it('los Pokémon y jefes Max se reconocen con tipos y estadísticas', async () => {
    const [{ data }, { data: pvp }, { data: tr }] = await Promise.all([
      SOURCES.pokebattler({ previous: undefined }),
      SOURCES.pvp({ previous: undefined }),
      SOURCES.translations({ previous: undefined }),
    ]);
    expect(data.dynamax.length).toBeGreaterThan(50);
    const unknown = [...data.dynamax, ...data.max.map((b) => b.id)].filter((id) => !maxPokemon(id, pvp.species, tr).species.stats);
    console.log('max', { compatibles: data.dynamax.length, jefes: data.max.length, unknown });
    expect(unknown.length).toBeLessThan(5);
  }, 60_000);
});

describe('significado de los counters de Pokébattler', () => {
  // Las pruebas normales usan datos sintéticos: esto es lo único que detectaría un cambio de criterio en la fuente.
  it('«tdo» sigue siendo los PS de nuestro Pokémon y «tdi», su daño', async () => {
    const bosses = (await SOURCES.pokebattler({ previous: undefined })).data.raids;
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
