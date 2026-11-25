import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/data/models';
import { parseGamemaster, toCounters, toEvents, toPokebattlerData, toSpecies, toSprites, toTranslations } from '../../src/data/transform';
import {
  announcedBosses,
  bulkOf,
  filterMax,
  filterMaxCounters,
  groupMaxBosses,
  kindOf,
  maxPokemon,
  maxSlug,
  roleUrl,
  type MaxFilters,
} from '../../src/domain/max';
import { spriteId } from '../../src/domain/sprites';
import { fixtures, NOW } from '../fixtures';

const tr = toTranslations(fixtures.en(), fixtures.es());
const species = toSpecies(parseGamemaster(fixtures.gamemaster()));
const sprites = toSprites(fixtures.sprites());
const data = toPokebattlerData(fixtures.pokebattler());
const events = toEvents(fixtures.events()).data;
const of = (id: string) => maxPokemon(id, species, tr);

describe('catálogo Max', () => {
  it('separa los jefes Max de los de incursión y deja fuera pasados y futuros', () => {
    expect(data.raids).not.toHaveProperty('ESPURR');
    expect(data.max.map((b) => b.id)).toEqual(['SQUIRTLE', 'ESPURR', 'CHARIZARD', 'CRYOGONAL', 'LAPRAS_GIGANTAMAX', 'ETERNATUS_ETERNAMAX_FORM']);
    expect(data.max[1]).toEqual({ id: 'ESPURR', tier: 'RAID_LEVEL_1_MAX' });
    // En dos niveles: no se sabe cuál pedir.
    expect(data.max[2]!.tier).toBeNull();
    expect(data.dynamax).toContain('LAPRAS_GIGANTAMAX');
  });

  it('si la parte Max cambia de forma, los jefes de incursión siguen', () => {
    const raw = fixtures.pokebattler();
    raw.tiers.find((t: any) => t.tier === 'RAID_LEVEL_1_MAX').raids[0].pokemon = '../otro';
    expect(toPokebattlerData(raw)).toMatchObject({ max: [], dynamax: [] });
    expect(toPokebattlerData(raw).raids).toEqual(data.raids);
    const bare = fixtures.pokebattler();
    delete bare.dynamaxPokemon;
    expect(toPokebattlerData(bare).dynamax).toEqual([]);
  });

  it('agrupa de mayor a menor nivel y los ambiguos al final', () => {
    expect(groupMaxBosses(data.max).map((g) => g.title)).toEqual(['6 estrellas', '3 estrellas', '1 estrella', 'Varios niveles']);
  });
});

describe('Pokémon Max', () => {
  it('Gigamax y Dinamax Infinito comparten especie, pero no imagen', () => {
    const lapras = of('LAPRAS_GIGANTAMAX');
    expect(lapras).toMatchObject({ kind: 'gigamax', label: { name: 'Lapras' }, species: { types: ['water', 'ice'] } });
    expect(lapras.species.stats).toEqual(of('LAPRAS').species.stats);
    expect(spriteId(lapras.sprite, sprites)).not.toBe(spriteId(of('LAPRAS').sprite, sprites));
    expect(of('ETERNATUS_ETERNAMAX_FORM').kind).toBe('eternamax');
    expect(spriteId(of('ETERNATUS_ETERNAMAX_FORM').sprite, sprites)).not.toBeNull();
  });

  it('formas: la que Pokébattler no nombra es la habitual', () => {
    expect(of('DARMANITAN').species.name).toBe('Darmanitan (Standard)');
    expect(of('ZACIAN_CROWNED_SWORD_FORM').label.form).toBe('Espada Suprema');
    expect(of('SANDSHREW_ALOLA_FORM').label.name).toBe('Sandshrew de Alola');
  });

  it('todos los del catálogo tienen nombre, tipos e imagen', () => {
    for (const id of [...data.dynamax, ...data.max.map((b) => b.id)]) {
      const pokemon = of(id);
      expect(pokemon.species.types.length, id).toBeGreaterThan(0);
      expect(pokemon.label.untranslated, id).toBe(false);
      expect(spriteId(pokemon.sprite, sprites), id).not.toBeNull();
    }
  });

  it('estadísticas base y tipos del ataque Max', () => {
    const { species: blissey } = of('BLISSEY');
    expect(blissey.stats).toEqual({ atk: 129, def: 169, hp: 496 });
    expect(bulkOf(blissey)).toBe(169 * 496);
    // Con Poder Oculto, siempre Normal.
    expect(species.unown!.fastTypes).toEqual(['normal']);
    expect(of('CHARIZARD').species.fastTypes).toEqual(expect.arrayContaining(['fire', 'dragon']));
  });

  it('sin PvPoke no se inventan datos', () => {
    const bare = maxPokemon('LAPRAS_GIGANTAMAX', undefined, tr);
    expect(bare.label.name).toBe('Lapras');
    expect(bare.species.types).toEqual([]);
    expect(bulkOf(bare.species)).toBeNull();
  });
});

describe('jefes confirmados', () => {
  it('solo los eventos Max con principio y fin', () => {
    const [current] = announcedBosses(events, data.max, NOW);
    expect(current).toMatchObject({ name: 'Dynamax Espurr', status: 'active', boss: { id: 'ESPURR' } });
    const undated: GameEvent[] = events.map((e) => ({ ...e, start: null, end: null }));
    expect(announcedBosses(undated, data.max, NOW)).toEqual([]);
    expect(announcedBosses(undefined, data.max, NOW)).toEqual([]);
  });

  it('estar en el catálogo no confirma a nadie', () => {
    const none = events.filter((e) => !['max-mondays', 'max-battles'].includes(e.type));
    expect(announcedBosses(none, data.max, NOW)).toEqual([]);
  });

  const event = (name: string): GameEvent => ({
    ...events[0]!, id: name, name, type: 'max-battles', start: '2026-11-23T10:00:00.000', end: '2026-11-23T20:00:00.000',
  });
  it.each([
    ['Gigantamax Lapras Max Battle Day', 'LAPRAS_GIGANTAMAX'],
    ['Dynamax Cryogonal during Max Monday', 'CRYOGONAL'],
    ['Eternamax Eternatus in Max Battles', 'ETERNATUS_ETERNAMAX_FORM'],
    ['Max Battle Day', null],
    ['Dynamax Alolan Sandshrew during Max Monday', null],
    ['Gigantamax Cryogonal Max Battle Day', null],
  ])('%s', (name, id) => {
    expect(announcedBosses([event(name)], data.max, NOW)[0]!.boss?.id ?? null).toBe(id);
  });

  it('una forma regional se reconoce exactamente', () => {
    const catalog = [{ id: 'SANDSHREW', tier: 'RAID_LEVEL_1_MAX' }, { id: 'SANDSHREW_ALOLA_FORM', tier: 'RAID_LEVEL_1_MAX' }];
    expect(announcedBosses([event('Dynamax Alolan Sandshrew during Max Monday')], catalog, NOW)[0]!.boss!.id).toBe('SANDSHREW_ALOLA_FORM');
    expect(announcedBosses([event('Dynamax Sandshrew during Max Monday')], catalog, NOW)[0]!.boss!.id).toBe('SANDSHREW');
  });
});

describe('counters y enlaces', () => {
  it('counters de la API documentada, ordenados por Estimator', () => {
    const { list } = toCounters(fixtures.maxCounters(), { id: 'ESPURR', tier: 'RAID_LEVEL_1_MAX' });
    expect(list.every((c, i) => i === 0 || c.estimator >= list[i - 1]!.estimator)).toBe(true);
    expect(list[0]).toMatchObject({ id: 'ZACIAN_CROWNED_SWORD_FORM', charged: 'MOVE_NONE' });
    expect(filterMaxCounters(list, 'gigamax').map((c) => [c.id, c.rank])).toEqual([['LAPRAS_GIGANTAMAX', 2], ['VENUSAUR_GIGANTAMAX', 4]]);
    expect(filterMaxCounters(list, 'dinamax').every((c) => kindOf(c.id) !== 'gigamax')).toBe(true);
    expect(() => toCounters(fixtures.maxCounters(), { id: 'ESPURR', tier: 'RAID_LEVEL_3_MAX' })).toThrow(/otro jefe/);
  });

  it('direcciones propias y de Pokébattler', () => {
    expect(maxSlug('LAPRAS_GIGANTAMAX')).toBe('max-lapras-gigantamax');
    expect(roleUrl('CRYOGONAL', '/TANK')).toBe('https://www.pokebattler.com/max/DYNAMAX_CRYOGONAL/TANK');
    expect(roleUrl('LAPRAS_GIGANTAMAX', '')).toBe('https://www.pokebattler.com/max/LAPRAS_GIGANTAMAX');
    expect(roleUrl('ETERNATUS_ETERNAMAX_FORM', '/ATTACKERS')).toBe('https://www.pokebattler.com/max/ETERNATUS_ETERNAMAX_FORM/ATTACKERS');
  });
});

describe('fichas', () => {
  const all = data.dynamax.map(of);
  const run = (f: Partial<MaxFilters>) =>
    filterMax(all, { kind: 'all', type: 'all', sort: 'atk', search: '', ...f }, tr).map((p) => p.id);

  it('ordena por una estadística base, sin puntuación propia', () => {
    expect(run({ sort: 'hp' })[0]).toBe('BLISSEY');
    const atk = run({}).map((id) => of(id).species.stats!.atk);
    expect(atk).toEqual([...atk].sort((a, b) => b - a));
    expect(run({ sort: 'name' })[0]).toBe('BLISSEY');
  });

  it('filtros', () => {
    expect(run({ kind: 'gigamax' }).sort()).toEqual(['LAPRAS_GIGANTAMAX', 'VENUSAUR_GIGANTAMAX']);
    expect(run({ type: 'fire' })).toContain('CHARIZARD');
    // Los Gigamax tienen su propio ataque.
    expect(run({ type: 'grass' })).not.toContain('VENUSAUR_GIGANTAMAX');
    expect(run({ search: 'venusaur gigamax' })).toEqual(['VENUSAUR_GIGANTAMAX']);
  });
});
