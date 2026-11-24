import { describe, expect, it } from 'vitest';
import { ENDPOINTS } from '../../src/data/config';
import { parseGamemaster, toCounters, toSpecies, toTranslations } from '../../src/data/transform';
import { counterMove, counterSpecies, filterCounters, variantOf } from '../../src/domain/counters';
import { moveName, pvpLabel, TYPES } from '../../src/domain/names';
import { effectiveness, weaknesses } from '../../src/domain/types';
import { fixtures } from '../fixtures';

const target = { id: 'CRESSELIA', tier: 'RAID_LEVEL_5' };
const tr = toTranslations(fixtures.en(), fixtures.es());
const species = toSpecies(parseGamemaster(fixtures.gamemaster()));
const defenders = (raw: any): any[] => raw.attackers[0].randomMove.defenders;
const change = (edit: (raw: any) => void) => {
  const raw = fixtures.counters();
  edit(raw);
  return () => toCounters(raw, target);
};

describe('counters de Pokébattler', () => {
  const { list, megaLevel } = toCounters(fixtures.counters(), target);

  it('ordena por Estimator, de menos a más, con el mejor moveset de cada uno', () => {
    expect(list).toHaveLength(30);
    expect(list[0]).toEqual({
      id: 'VENUSAUR_MEGA',
      fast: 'HIDDEN_POWER_BUG_FAST',
      charged: 'DARK_PULSE_PLUS',
      estimator: 1.25,
      edps: 30.5,
      tdo: 2000,
    });
    expect(list.every((c, i) => i === 0 || c.estimator >= list[i - 1]!.estimator)).toBe(true);
    expect(megaLevel).toBe(4);
  });

  it('el TDO es el daño de nuestro Pokémon, no el que hace el jefe', () => {
    // La respuesta se ve desde el jefe: su «tdo» son los PS que quita y su «tdi», el daño que recibe.
    const raw = defenders(fixtures.counters()).find((d) => d.pokemonId === 'TYRANITAR').byMove[1].result;
    expect([raw.tdo, raw.tdi]).toEqual([116, 1840]);
    expect(list.find((c) => c.id === 'TYRANITAR')!.tdo).toBe(1840);
  });

  it('la resistencia por sí sola no da puestos', () => {
    const best = Math.max(...list.map((c) => c.tdo!));
    expect(list.at(-1)).toMatchObject({ id: 'BLISSEY', tdo: best });
  });

  it('solo usa parámetros documentados', () => {
    const url = new URL(ENDPOINTS.counters({ ...target, weather: 'FOG' }).url);
    expect([...url.searchParams.keys()]).toEqual(['sort', 'weatherCondition', 'dodgeStrategy', 'aggregation']);
    expect(url.searchParams.get('weatherCondition')).toBe('FOG');
  });

  it('rechaza respuestas de otro jefe, otro nivel u otro orden', () => {
    expect(change((r) => (r.filterValue = 'DARKRAI'))).toThrow(/otro jefe/);
    expect(change((r) => (r.attackers[0].pokemonId = 'DARKRAI'))).toThrow(/otro jefe/);
    expect(change((r) => (r.attackers[0].boss = 'RAID_LEVEL_MEGA'))).toThrow(/otro jefe/);
    expect(change((r) => (r.sortType = 'OVERALL'))).toThrow(/estructura/);
  });

  it('rechaza listas vacías, incompletas, repetidas o de otro nivel de atacante', () => {
    expect(change((r) => defenders(r).splice(0))).toThrow(/no tiene counters/);
    expect(change((r) => defenders(r).splice(5))).toThrow(/faltan/);
    expect(change((r) => (defenders(r)[1] = defenders(r)[0]))).toThrow(/repetidos/);
    expect(change((r) => (defenders(r)[3].stats.level = '50'))).toThrow(/nivel/);
    expect(change((r) => delete defenders(r)[0].byMove[0].result.estimator)).toThrow(/estructura/);
    expect(() => toCounters({}, target)).toThrow(/estructura/);
  });

  it('una métrica secundaria que falte queda sin dato, sin inventarla', () => {
    const raw = fixtures.counters();
    for (const d of defenders(raw)) for (const m of d.byMove) delete m.result.tdi;
    expect(toCounters(raw, target).list[0]).toMatchObject({ tdo: null, edps: 30.5 });
  });
});

describe('variantes', () => {
  it('distingue normales, oscuros, megas y primigenios', () => {
    expect(variantOf('TYRANITAR_SHADOW_FORM')).toBe('shadow');
    expect(variantOf('MEWTWO_MEGA_Y')).toBe('mega');
    expect(variantOf('GROUDON_PRIMAL')).toBe('mega');
    expect(variantOf('MEGANIUM')).toBe('normal');
    expect(variantOf('CALYREX_SHADOW_RIDER_FORM')).toBe('normal');
  });

  it('filtrar conserva el puesto original', () => {
    const { list } = toCounters(fixtures.counters(), target);
    expect(filterCounters(list, 'shadow')[0]).toMatchObject({ id: 'PIDGEOT_SHADOW_FORM', rank: 5 });
    const total = (['normal', 'shadow', 'mega'] as const).reduce((n, v) => n + filterCounters(list, v).length, 0);
    expect(total).toBe(filterCounters(list, 'all').length);
  });
});

describe('nombres', () => {
  const { list } = toCounters(fixtures.counters(), target);
  const label = (id: string) => pvpLabel(counterSpecies(id, species, tr), tr);

  it('todas las formas tienen tipos y nombre en español', () => {
    for (const { id } of list) {
      expect(counterSpecies(id, species, tr).types.length, id).toBeGreaterThan(0);
      expect(label(id).untranslated, id).toBe(false);
    }
    expect(label('HOUNDOOM_MEGA').name).toBe('Mega-Houndoom');
    expect(label('MEWTWO_MEGA_Y').name).toBe('Mega-Mewtwo Y');
    expect(label('NECROZMA_DAWN_WINGS_FORM')).toMatchObject({ name: 'Necrozma', form: 'Alas del Alba' });
    expect(label('TYRANITAR_SHADOW_FORM')).toMatchObject({ name: 'Tyranitar', shadow: true });
    expect(label('MAROWAK_ALOLA_FORM').name).toBe('Marowak de Alola');
  });

  it('los movimientos están en español', () => {
    const ids = list.flatMap((c) => [c.fast, c.charged]);
    expect(ids.filter((id) => moveName(counterMove(id), tr) === counterMove(id).name)).toEqual([]);
    expect(moveName(counterMove('HIDDEN_POWER_BUG_FAST'), tr)).toBe('Poder Oculto (Bicho)');
    expect(counterMove('DARK_PULSE_PLUS').name).toBe('Dark Pulse+');
  });

  it('sin forma indicada, solo da los tipos que comparten todas', () => {
    expect(counterSpecies('KELDEO', species, tr)).toEqual({ name: 'Keldeo', dex: 647, types: ['water', 'fighting'] });
    expect(counterSpecies('DARMANITAN', species, tr)).toEqual({ name: 'Darmanitan', dex: 555, types: [] });
  });

  it('una forma desconocida conserva su especie y no se cambia por otra', () => {
    const name = 'Pikachu (Gofest 2030)';
    expect(counterSpecies('PIKACHU_GOFEST_2030_FORM', species, tr)).toEqual({ name, dex: 25, types: [] });
    expect(counterSpecies('TYRANITAR_SHADOW_FORM', undefined, tr)).toMatchObject({ name: 'Tyranitar (Shadow)', dex: 248 });
    expect(counterSpecies('INVENTADO', species, tr)).toEqual({ name: 'Inventado', dex: 0, types: [] });
  });
});

describe('debilidades', () => {
  it('simples, dobles y anuladas', () => {
    const types = (defender: string[]) => weaknesses(defender).map((w) => w.type);
    expect(types(['psychic']).sort()).toEqual(['bug', 'dark', 'ghost']);
    expect(weaknesses(['dragon', 'flying'])[0]).toEqual({ type: 'ice', multiplier: expect.closeTo(2.56) });
    expect(types(['water', 'ground'])).toEqual(['grass']);
    expect(effectiveness('ground', ['electric', 'flying'])).toBeCloseTo(0.625);
    expect(effectiveness('poison', ['steel'])).toBeCloseTo(0.390625);
  });

  it('la tabla tiene los 120 cruces especiales del juego', () => {
    const all = Object.keys(TYPES);
    const count = (value: number) =>
      all.flatMap((a) => all.map((d) => effectiveness(a, [d]))).filter((m) => m === value).length;
    expect([count(1.6), count(0.625), count(0.390625)]).toEqual([51, 61, 8]);
  });

  it('con un tipo desconocido no da datos incompletos', () => {
    expect(weaknesses(['psychic', 'nuevo'])).toEqual([]);
    expect(weaknesses([])).toEqual([]);
  });
});
