import { describe, expect, it } from 'vitest';
import { parseGamemaster, toRanking, toTranslations } from '../../src/data/transform';
import { countTiers, filterPvp, type PvpFilters } from '../../src/domain/pvp';
import { hasForm, isShadow, matchesVariant, tierOf } from '../../src/domain/tiers';
import { fixtures } from '../fixtures';

const gm = parseGamemaster(fixtures.gamemaster());
const tr = toTranslations(fixtures.en(), fixtures.es());
const great = toRanking(fixtures.great(), gm, 'x').entries;
const ultra = toRanking(fixtures.ultra(), gm, 'x').entries;
const master = toRanking(fixtures.master(), gm, 'x').entries;

const run = (filters: Partial<PvpFilters>, list = great) =>
  filterPvp(list, { tier: 'all', variant: 'all', search: '', ...filters }, tr);
const names = (filters: Partial<PvpFilters>, list = great) => run(filters, list).flatMap((g) => g.entries.map((e) => e.id));

describe('tiers', () => {
  it.each([
    [100, 'S'], [90, 'S'], [89.9, 'A'], [85, 'A'], [84.9, 'B'], [80, 'B'], [79.9, 'C'], [70, 'C'], [69.9, null], [0, null],
  ])('puntuación %s: %s', (score, tier) => {
    expect(tierOf(score)).toBe(tier);
  });

  it('recuentos reales de las tres ligas', () => {
    expect(countTiers(great)).toEqual({ S: 30, A: 102, B: 166, C: 392 });
    expect(countTiers(ultra)).toEqual({ S: 29, A: 96, B: 153, C: 279 });
    expect(countTiers(master)).toEqual({ S: 18, A: 17, B: 20, C: 68 });
  });

  it('cada grupo respeta el orden de PvPoke y ningún Pokémon aparece dos veces', () => {
    const groups = run({});
    expect(groups.map((g) => g.tier)).toEqual(['S', 'A', 'B', 'C']);
    const ranks = groups.flatMap((g) => g.entries.map((e) => e.rank));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(690);
  });
});

describe('variantes', () => {
  it('distingue normales, oscuros y formas, que pueden coincidir', () => {
    const both = { name: 'Ninetales (Alolan) (Shadow)' };
    expect([isShadow(both), hasForm(both)]).toEqual([true, true]);
    expect([isShadow({ name: 'Ninetales (Shadow)' }), hasForm({ name: 'Ninetales (Shadow)' })]).toEqual([true, false]);
    expect(matchesVariant({ name: 'Ninetales' }, 'normal')).toBe(true);
    expect(matchesVariant(both, 'normal')).toBe(false);
  });

  it('normales, oscuros y formas cubren toda la lista', () => {
    for (const entry of great) {
      expect(['normal', 'shadow', 'form'].some((v) => matchesVariant(entry, v as 'normal'))).toBe(true);
    }
    expect(great.filter((e) => matchesVariant(e, 'shadow'))).toHaveLength(374);
    expect(great.every((e) => isShadow(e) === e.id.endsWith('_shadow'))).toBe(true);
  });
});

describe('búsqueda y filtros', () => {
  it('por nombre español o inglés, sin acentos ni mayúsculas, y por número', () => {
    expect(names({ search: 'ALOLA ninetales' })).toContain('ninetales_alolan');
    expect(names({ search: 'ninetales alolan' })).toContain('ninetales_alolan');
    expect(names({ search: 'ninetales oscuro' })).toContain('ninetales_shadow');
    expect(names({ search: '809' })).toEqual(['melmetal']);
    expect(names({ search: 'espada suprema' }, master)).toEqual(['zacian_crowned_sword']);
  });

  it('un número no se confunde con parte de otro', () => {
    expect(run({ search: '38' }).flatMap((g) => g.entries).every((e) => e.dex === 38)).toBe(true);
  });

  it('sin tier: solo al buscar y sin filtrar por tier', () => {
    expect(names({})).not.toContain('unown');
    expect(names({ search: 'unown' })).toEqual(['unown']);
    expect(run({ search: 'unown' })[0]!.tier).toBeNull();
    expect(names({ search: 'unown', tier: 'S' })).toEqual([]);
  });

  it('combina liga, tier, variante y texto', () => {
    const groups = run({ tier: 'S', variant: 'shadow' });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries.every((e) => e.score >= 90 && isShadow(e))).toBe(true);
    expect(names({ search: 'no existe' })).toEqual([]);
    expect(names({ search: '   ' })).toHaveLength(690);
  });

  it('funciona sin traducciones', () => {
    const groups = filterPvp(great, { tier: 'all', variant: 'all', search: 'melmetal' }, undefined);
    expect(groups[0]!.entries[0]!.id).toBe('melmetal');
  });
});
