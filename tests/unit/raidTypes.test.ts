import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { build, checkAgainst, DataError, needsUpdate, serialize } from '../../scripts/raid-attackers';
import { toRaidAttackers, toTranslations } from '../../src/data/transform';
import { TYPES } from '../../src/domain/names';
import { attackersOfType, countByType, goHubTypeUrl, type RaidFilters } from '../../src/domain/raidTypes';
import { fixtures } from '../fixtures';

const tr = toTranslations(fixtures.en(), fixtures.es());
const attackers = toRaidAttackers(fixtures.raidTypes()).pokemon;
const NONE: RaidFilters = { mega: 'with', shadow: 'with', legendary: 'with', search: '' };

describe('atacantes por tipo', () => {
  it('cada uno aparece en un solo tipo: el de su ataque cargado registrado', () => {
    const all = Object.keys(TYPES).flatMap((type) => attackersOfType(attackers, type, NONE, tr));
    expect(all).toHaveLength(attackers.length);
    expect(new Set(all).size).toBe(attackers.length);
    for (const type of Object.keys(TYPES)) {
      expect(attackersOfType(attackers, type, NONE, tr).every((p) => p.chargedType === type)).toBe(true);
    }
  });

  it('por el percentil original, sin crear posiciones ni puntuaciones', () => {
    for (const type of Object.keys(TYPES)) {
      const list = attackersOfType(attackers, type, NONE, tr);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((p, i) => i === 0 || p.percentile <= list[i - 1]!.percentile)).toBe(true);
      for (const p of list) expect(attackers).toContain(p);
    }
  });

  it('filtros y búsqueda', () => {
    expect(attackersOfType(attackers, 'fire', { ...NONE, mega: 'only' }, tr).every((p) => p.groups.includes('mega'))).toBe(true);
    expect(attackersOfType(attackers, 'fire', { ...NONE, shadow: 'without' }, tr).some((p) => p.groups.includes('shadow'))).toBe(false);
    expect(attackersOfType(attackers, 'ice', { ...NONE, search: 'kyurem negro' }, tr).map((p) => p.name)).toEqual(['Kyurem (Black)']);
    expect(countByType(attackers).get('fire')).toBe(attackersOfType(attackers, 'fire', NONE, tr).length);
    expect(goHubTypeUrl('fire')).toBe('https://db.pokemongohub.net/pokemon-list/best-per-type/fire');
  });

  it('rechaza un resumen cortado, repetido o con otra forma', () => {
    const raw = fixtures.raidTypes();
    expect(() => toRaidAttackers({ ...raw, pokemon: raw.pokemon.slice(0, 10) })).toThrow(/faltan/);
    expect(() => toRaidAttackers({ ...raw, pokemon: [...raw.pokemon, raw.pokemon[0]] })).toThrow(/repetidos/);
    expect(() => toRaidAttackers({ ...raw, pokemon: [{ ...raw.pokemon[0], dps: -1 }, ...raw.pokemon.slice(1)] })).toThrow(/estructura/);
  });
});

const LIMITS = { minRecords: 1, unmatched: 0.2, doubtful: 0.2 };
const make = (edit: (r: any) => void = () => {}) => {
  const r = fixtures.raidRaw();
  edit(r);
  return build(r.dataset, r.gamemaster, LIMITS);
};
const record = (r: any, id: string) => r.dataset.records.find((x: any) => x.canonical_id === id);

describe('generador', () => {
  it('cada ficha se publica o se omite con un motivo', () => {
    const { coverage } = make();
    const { omitted } = coverage;
    expect(coverage.published + Object.values(omitted).flat().length).toBe(coverage.records);
    expect(omitted).toEqual({
      gigantamax: ['pm_0003_gmax'],
      unmatched: ['pm_0263_shadow'],
      unreleased: ['pm_0036_mega'],
      unavailable: ['pm_0132_normal'],
      doubtfulMoves: [],
      battleForm: ['pm_0774_core'],
    });
  });

  it('conserva sin cambios tier, percentil, DPS, TDO y movimientos', () => {
    const { raid } = record(fixtures.raidRaw(), 'pm_0150_mega_y');
    const { metrics: m, recommendation: q } = raid;
    expect(make().file.pokemon.find((p) => p.name === 'Mewtwo (Mega Y)')).toEqual({
      name: 'Mewtwo (Mega Y)', dex: 150, types: ['psychic'], groups: ['mega', 'legendary'],
      tier: m.tier, percentile: m.percentile, dps: m.dps, tdo: m.tdo,
      fast: q.fast_name_en, fastType: q.fast_type, charged: q.charge_name_en, chargedType: q.charge_type,
    });
  });

  it('un movimiento que PvPoke no conoce vale; uno cuyo tipo contradice, no', () => {
    expect(make().file.pokemon.map((p) => p.name)).toContain('Manectric (Mega)');
    const { coverage } = make((r) => (record(r, 'pm_0068_shadow').raid.recommendation.charge_type = 'fire'));
    expect(coverage.omitted.doubtfulMoves).toEqual(['pm_0068_shadow']);
  });

  it.each([
    ['otra licencia', (r: any) => (r.dataset.meta.license = 'https://example.org/')],
    ['otra versión', (r: any) => (r.dataset.meta.schema_version = 4)],
    ['fichas que faltan', (r: any) => (r.dataset.meta.record_count = 999)],
    ['un tier desconocido', (r: any) => (record(r, 'pm_0068_shadow').raid.metrics.tier = 'Z')],
    ['sin DPS', (r: any) => (record(r, 'pm_0068_shadow').raid.metrics.dps = 0)],
    ['otra tabla de tipos', (r: any) => record(r, 'pm_0068_shadow').type_effectiveness.weaknesses.pop()],
    ['Gigamax distinto', (r: any) => (record(r, 'pm_0003_gmax').raid.metrics.dps += 1)],
  ])('rechaza el dataset con %s', (_, edit) => expect(() => make(edit)).toThrow(DataError));

  it('solo hay cambios si cambia el contenido, y no acepta una caída brusca', () => {
    const { file } = make();
    const next = { ...file, source: { ...file.source, version: 'otra', generatedAt: '2026-11-26T00:00:00Z' } };
    expect(needsUpdate(file, next)).toBe(false);
    expect(needsUpdate(null, file)).toBe(true);
    expect(() => checkAgainst(file, { ...next, pokemon: file.pokemon.slice(0, 2) })).toThrow(/menos atacantes/);
  });

  it('el archivo publicado es válido y cubre los 18 tipos', () => {
    const text = readFileSync('public/data/incursiones.json', 'utf8').replace(/\r\n/g, '\n');
    const data = JSON.parse(text);
    expect(serialize(data)).toBe(text);
    const { pokemon } = toRaidAttackers(data);
    expect(pokemon.length).toBeGreaterThan(1500);
    const counts = countByType(pokemon);
    for (const type of Object.keys(TYPES)) expect(counts.get(type), type).toBeGreaterThan(20);
    expect(pokemon.some((p) => p.name === 'Minior (Core)')).toBe(false);
  });
});
