import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { build, checkAgainst, DataError, NOT_IN_GYMS, serialize, type GymFile } from '../../scripts/gyms';
import type { GymPokemon } from '../../src/data/models';
import { toGyms, toSprites, toTranslations } from '../../src/data/transform';
import { assess } from '../../src/domain/freshness';
import {
  attackersOf,
  countGymTiers,
  countPercentiles,
  filterAttackers,
  filterDefenders,
  GYM_TIERS,
  gymMove,
  rankDefenders,
  tieBlocks,
  type AttackerFilters,
} from '../../src/domain/gyms';
import { moveName, pvpLabel, typeName } from '../../src/domain/names';
import { spriteId } from '../../src/domain/sprites';
import { fixtures, NOW } from '../fixtures';

const raw = () => fixtures.gymsRaw();
const make = (edit: (r: any) => void = () => {}) => {
  const r = raw();
  edit(r);
  r.dataset.meta.record_count ??= r.dataset.records.length;
  return build(r.dataset, r.gamemaster, 1);
};
const record = (r: any, id: string) => r.dataset.records.find((x: any) => x.canonical_id === id);
const find = (file: { pokemon: GymPokemon[] }, name: string) => file.pokemon.find((p) => p.name === name);

describe('generador: emparejamiento', () => {
  it('cada ficha se publica o se omite con un motivo', () => {
    const { coverage } = make();
    const { omitted } = coverage;
    const left = Object.values(omitted).reduce((n, list) => n + list.length, 0);
    expect(coverage.published + left).toBe(coverage.records);
    expect(omitted.unreleased).toEqual(['pm_0036_mega']);
    expect(omitted.unmatched).toEqual(['pm_0263_shadow']);
    expect(omitted.gigantamax).toEqual(['pm_0003_gmax']);
    expect(new Set(omitted.notInGyms.map((id) => Number(id.slice(3, 7))))).toEqual(new Set([681, 774, 778, 877]));
  });

  it.each([
    ['Giratina (Altered)', 487],
    ['Giratina (Origin)', 487],
    ['Tauros (Aqua)', 128],
    ['Cherrim (Sunshine)', 421],
    ["Oricorio (Pa'u)", 741],
    ['Mime Jr.', 439],
    ['Zacian (Crowned Sword)', 888],
    ['Groudon (Primal)', 383],
  ])('reconoce %s', (name, dex) => {
    expect(find(make().file, name)?.dex).toBe(dex);
  });

  it('conserva sin cambios tier, percentil, puntuación y movimientos', () => {
    const { file } = make();
    const source = record(raw(), 'pm_0150_mega_y');
    expect(find(file, 'Mewtwo (Mega Y)')!.attack).toEqual({
      tier: source.gym.metrics.tier,
      percentile: source.gym.metrics.percentile,
      score: source.gym.metrics.clear_score,
      fast: source.gym.recommendation.fast_name_en,
      fastType: source.gym.recommendation.fast_type,
      charged: source.gym.recommendation.charge_name_en,
      chargedType: source.gym.recommendation.charge_type,
    });
  });

  it('no corrige las anomalías de la fuente', () => {
    const { file } = make((r) => (record(r, 'pm_0150_shadow').gym.metrics.clear_score = 1));
    expect(find(file, 'Mewtwo (Shadow)')!.attack).toMatchObject({ score: 1, tier: 'S+' });
  });

  it('si cambian las estadísticas, la forma deja de emparejarse en vez de asociarse a otra', () => {
    const { coverage } = make((r) => {
      for (const id of ['pm_0242_normal']) {
        record(r, id).base_stats.stamina -= 1;
        record(r, id).base_stats.durability = record(r, id).base_stats.stamina * record(r, id).base_stats.defense;
      }
      // Margen de la prueba: con tan pocas fichas, una más superaría el máximo.
      r.dataset.records.push(...Array.from({ length: 60 }, (_, i) => ({ ...record(r, 'pm_0681_normal'), canonical_id: `pm_0681_x${i}` })));
      r.dataset.meta.record_count = r.dataset.records.length;
    });
    expect(coverage.omitted.unmatched).toContain('pm_0242_normal');
  });

  it('sin movimientos propios no hay evaluación de ataque, pero sí resistencia', () => {
    expect(find(make().file, 'Ditto')).toMatchObject({ attack: null, bulk: 12194 });
  });
});

describe('generador: quién puede defender', () => {
  const bulk = (name: string) => find(make().file, name)!.bulk;
  it('los Pokémon corrientes y Meltan y Melmetal', () => {
    expect(bulk('Blissey')).toBe(169 * 496);
    expect(bulk('Meltan')).not.toBeNull();
    expect(bulk('Melmetal')).not.toBeNull();
    expect(bulk('Ursaluna')).not.toBeNull();
  });
  it.each(['Mewtwo', 'Venusaur (Mega)', 'Groudon (Primal)', 'Zacian (Hero)', 'Celesteela', 'Cosmog'])(
    '%s no',
    (name) => {
      expect(bulk(name)).toBeNull();
    },
  );
  it('los oscuros pueden, pero sin resistencia propia', () => {
    expect(bulk('Venusaur (Shadow)')).toBeNull();
  });
  it('los que no pueden usarse en gimnasios no salen en ninguna lista', () => {
    const { file } = make();
    expect(file.pokemon.some((p) => NOT_IN_GYMS.has(p.dex))).toBe(false);
  });
  it('legendarios, singulares y ultraentes comparten grupo, también en formas oscuras y mega', () => {
    const { file } = make();
    expect(find(file, 'Mewtwo (Shadow)')!.groups).toEqual(['shadow', 'legendary']);
    expect(find(file, 'Mewtwo (Mega X)')!.groups).toEqual(['mega', 'legendary']);
    expect(find(file, 'Celesteela')!.groups).toEqual(['legendary']);
    expect(find(file, 'Venusaur')!.groups).toEqual([]);
  });
});

describe('generador: rechaza datos que no cuadran', () => {
  it.each<[string, (r: any) => void, RegExp]>([
    ['otro esquema', (r) => (r.dataset.meta.schema_version = 4), /estructura/],
    ['otra licencia', (r) => (r.dataset.meta.license = 'https://example.com'), /estructura/],
    ['fichas de menos', (r) => r.dataset.records.pop(), /faltan fichas/],
    ['fichas repetidas', (r) => (r.dataset.records[1] = r.dataset.records[0]), /repetidas/],
    ['un tier nuevo', (r) => (record(r, 'pm_0242_normal').gym.metrics.tier = 'SS'), /estructura/],
    ['percentil imposible', (r) => (record(r, 'pm_0242_normal').gym.metrics.percentile = 120), /estructura/],
    ['otra fórmula de resistencia', (r) => (record(r, 'pm_0242_normal').base_stats.durability += 1), /resistencia/],
    ['evaluación a medias', (r) => (record(r, 'pm_0242_normal').gym.recommendation = null), /incompleta/],
    ['Gigamax distinto', (r) => (record(r, 'pm_0003_gmax').gym.metrics.percentile = 1), /Gigamax/],
    ['otras debilidades', (r) => record(r, 'pm_0242_normal').type_effectiveness.weaknesses.pop(), /debilidades/],
    ['demasiadas sin pareja', (r) => (r.gamemaster.pokemon = r.gamemaster.pokemon.slice(0, 8)), /sin pareja/],
  ])('%s', (_, edit, message) => {
    expect(() => make(edit)).toThrow(DataError);
    expect(() => make(edit)).toThrow(message);
  });

  it('por defecto exige el dataset completo', () => {
    const { dataset, gamemaster } = raw();
    expect(() => build(dataset, gamemaster)).toThrow(/faltan fichas/);
  });

  it('no sustituye por algo más antiguo ni con muchos menos Pokémon', () => {
    const { file } = make();
    const older: GymFile = { ...file, source: { ...file.source, generatedAt: '2026-01-01T00:00:00Z' } };
    expect(() => checkAgainst(file, older)).toThrow(/antiguo/);
    expect(() => checkAgainst(file, { ...file, pokemon: file.pokemon.slice(0, 10) })).toThrow(/menos/);
    expect(() => checkAgainst(file, file)).not.toThrow();
    expect(() => checkAgainst(null, file)).not.toThrow();
  });

  it('el mismo origen da siempre el mismo archivo', () => {
    const text = serialize(make().file);
    expect(text).toBe(serialize(make().file));
    expect(JSON.parse(text)).toEqual(make().file);
  });
});

describe('archivo publicado', () => {
  const text = readFileSync('public/data/gimnasios.json', 'utf8').replace(/\r\n/g, '\n');
  const file = JSON.parse(text);
  const data = toGyms(file);

  it('lleva atribución, licencia, fecha y cambios, y es mucho menor que el original', () => {
    expect(data.source).toMatchObject({
      name: 'doctorpokegogo.com',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    });
    expect(data.changes).toMatch(/transformados y resumidos/);
    expect(text.length).toBeLessThan(500_000);
    expect(serialize(file)).toBe(text);
  });

  // Las traducciones de prueba no se actualizan: se deja margen para que un Pokémon nuevo no bloquee los datos.
  it('casi todos tienen nombre en español e imagen exacta', () => {
    const sprites = toSprites(fixtures.sprites());
    const tr = toTranslations(fixtures.en(), fixtures.es());
    const missing = data.pokemon.filter((p) => spriteId(p, sprites) === null);
    expect(missing.length / data.pokemon.length).toBeLessThan(0.02);
    const unnamed = data.pokemon.filter((p) => pvpLabel(p, tr).untranslated);
    expect(unnamed.length / data.pokemon.length).toBeLessThan(0.02);
  });

  it('los movimientos se traducen o se llaman igual en español', () => {
    const tr = toTranslations(fixtures.en(), fixtures.es());
    const same = new Set<string>();
    for (const { attack } of data.pokemon) {
      if (!attack) continue;
      for (const [name, type] of [[attack.fast, attack.fastType], [attack.charged, attack.chargedType]] as const) {
        const move = gymMove(name, type);
        if (moveName(move, tr) === move.name) same.add(name);
      }
    }
    expect(same.size).toBeLessThan(12);
  });
});

describe('lectura en la aplicación', () => {
  it.each<[string, (f: any) => void, RegExp]>([
    ['otro formato', (f) => (f.format = 2), /estructura/],
    ['sin licencia', (f) => delete f.source.licenseUrl, /estructura/],
    ['enlace peligroso', (f) => (f.source.url = 'javascript:alert(1)'), /estructura/],
    ['cortado', (f) => (f.pokemon = f.pokemon.slice(0, 20)), /faltan/],
    ['repetidos', (f) => f.pokemon.push(f.pokemon[0]), /repetidos/],
  ])('rechaza: %s', (_, edit, message) => {
    const file = fixtures.gyms();
    edit(file);
    expect(() => toGyms(file)).toThrow(message);
  });

  it('avisa si los datos de origen son muy antiguos', () => {
    const state = {
      snapshot: {
        data: {}, sourceUpdatedAt: NOW - 60 * 86_400_000, firstSeenAt: NOW, changedAt: null, discarded: 0, viaFallback: false,
      },
      checkedAt: NOW, failedAt: 0, error: null, lifetime: 86_400_000, fetching: false,
    };
    expect(assess('gyms', state, NOW).messages[0]).toMatch(/datos de origen son de hace 60 días/);
  });
});

describe('atacantes', () => {
  const tr = toTranslations(fixtures.en(), fixtures.es());
  const all = attackersOf(toGyms(fixtures.gyms()).pokemon);
  const none: AttackerFilters = { tier: 'all', type: 'all', mega: 'with', shadow: 'with', legendary: 'with', search: '' };
  const names = (f: Partial<AttackerFilters>) =>
    filterAttackers(all, { ...none, ...f }, tr).flatMap((g) => g.entries);

  it('agrupa por el tier de la fuente y, dentro, por percentil', () => {
    const groups = filterAttackers(all, none, tr);
    expect(groups.map((g) => g.tier)).toEqual(GYM_TIERS);
    for (const { tier, entries } of groups) {
      expect(entries.every((p) => p.attack.tier === tier)).toBe(true);
      expect(entries.every((p, i) => i === 0 || entries[i - 1]!.attack.percentile >= p.attack.percentile)).toBe(true);
    }
    expect(groups.reduce((n, g) => n + g.entries.length, 0)).toBe(all.length);
    expect(Object.values(countGymTiers(all)).reduce((a, b) => a + b)).toBe(all.length);
  });

  it('los empates van por tipo de ataque y se cuentan', () => {
    const [first] = filterAttackers(all, none, tr);
    const tied = first!.entries.filter((p) => p.attack.percentile === 99.6).map((p) => typeName(p.attack.chargedType));
    expect(tied).toHaveLength(9);
    expect(tied).toEqual([...tied].sort((a, b) => a.localeCompare(b, 'es')));
    expect(countPercentiles(all).get(99.6)).toBe(9);
  });

  it('los empates amplios forman bloque sin perder ni reordenar a nadie', () => {
    for (const { entries } of filterAttackers(all, none, tr)) {
      const blocks = tieBlocks(entries);
      expect(blocks.flatMap((b) => b.entries)).toEqual(entries);
      for (const block of blocks) {
        if (block.percentile === null) continue;
        expect(block.entries.length).toBeGreaterThanOrEqual(4);
        expect(block.entries.every((p) => p.attack.percentile === block.percentile)).toBe(true);
      }
    }
    const [top, next] = tieBlocks(filterAttackers(all, none, tr)[0]!.entries);
    expect([top!.percentile, top!.entries.length]).toEqual([99.6, 9]);
    expect([next!.percentile, next!.entries.length]).toEqual([99.5, 16]);
  });

  it('la puntuación no interviene en el orden', () => {
    const [first] = filterAttackers(all, none, tr);
    const scores = first!.entries.map((p) => p.attack.score);
    expect(scores).not.toEqual([...scores].sort((a, b) => b - a));
  });

  it('el filtro por tipo usa el ataque cargado recomendado', () => {
    const list = names({ type: 'poison' });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => p.attack.chargedType === 'poison')).toBe(true);
    expect(list.map((p) => p.name)).toContain('Beedrill (Mega)');
  });

  it.each(['mega', 'shadow', 'legendary'] as const)('%s: con, sin y solo', (group) => {
    const only = names({ [group]: 'only' });
    const without = names({ [group]: 'without' });
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((p) => p.groups.includes(group))).toBe(true);
    expect(without.some((p) => p.groups.includes(group))).toBe(false);
    expect(only.length + without.length).toBe(all.length);
  });

  it('combina filtros y busca en español e inglés', () => {
    expect(names({ mega: 'only', legendary: 'only', search: 'mewtwo' })).toHaveLength(2);
    expect(names({ search: 'mega beedrill' }).map((p) => p.name)).toEqual(['Beedrill (Mega)']);
  });

  it('escribe los movimientos de tipo variable como el resto de la aplicación', () => {
    expect(gymMove('Weather Ball Ice', 'ice').name).toBe('Weather Ball (Ice)');
    expect(gymMove('Hidden Power', 'normal').name).toBe('Hidden Power');
    expect(gymMove('Ice Beam', 'ice').name).toBe('Ice Beam');
  });
});

describe('defensores', () => {
  const tr = toTranslations(fixtures.en(), fixtures.es());
  const all = rankDefenders(toGyms(fixtures.gyms()).pokemon);

  it('ordena por resistencia y los empates comparten puesto', () => {
    expect(all.slice(0, 7).map((p) => [p.rank, p.name, p.bulk])).toEqual([
      [1, 'Blissey', 83824],
      [2, 'Chansey', 62336],
      [3, 'Snorlax', 55770],
      [4, 'Dondozo', 55536],
      [5, 'Umbreon', 51840],
      [5, 'Avalugg', 51840],
      [7, 'Avalugg (Hisuian)', 51408],
    ]);
  });

  it('no incluye megas, oscuros ni legendarios', () => {
    expect(all.filter((p) => p.groups.length > 0).map((p) => p.name)).toEqual(['Melmetal']);
  });

  it('filtrar no cambia los puestos', () => {
    const water = filterDefenders(all, { type: 'water', search: '' }, tr);
    expect(water[0]).toMatchObject({ name: 'Dondozo', rank: 4 });
    expect(filterDefenders(all, { type: 'all', search: 'snorlax' }, tr)[0]!.rank).toBe(3);
    expect(filterDefenders(all, { type: 'all', search: 'mewtwo' }, tr)).toEqual([]);
  });
});
