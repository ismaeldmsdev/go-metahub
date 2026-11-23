import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/data/errors';
import { parseGamemaster, toEvents, toPokebattlerIds, toRaids, toRanking, toTranslations, usedMoves } from '../../src/data/transform';
import { normalize, plainText, leekDuckUrl } from '../../src/domain/text';
import { fixtures } from '../fixtures';

const gm = () => parseGamemaster(fixtures.gamemaster());

describe('PvP con datos reales', () => {
  it.each([
    ['Super', fixtures.great, 1156, 'melmetal', 93.9],
    ['Ultra', fixtures.ultra, 853, 'tinkaton', 94.2],
    ['Máster', fixtures.master, 410, 'palkia_origin', 98],
  ] as const)('Liga %s: clasificación completa, con puesto y puntuación originales', (_, raw, total, id, score) => {
    const source = raw();
    const { entries, discarded } = toRanking(source, gm(), 'prueba');
    expect(entries).toHaveLength(total);
    expect(discarded).toBe(0);
    expect(entries[0]).toMatchObject({ rank: 1, id, score });
    expect(entries.map((e) => [e.rank, e.id, e.score])).toEqual(
      source.map((x: any, i: number) => [i + 1, x.speciesId, x.score]),
    );
    expect(entries.every((e) => e.types.length >= 1)).toBe(true);
  });

  it('los movimientos son los de PvPoke: uno rápido y después los cargados', () => {
    const game = gm();
    const { entries } = toRanking(fixtures.great(), game, 'prueba');
    const moves = usedMoves([entries], game);
    const tiered = entries.filter((e) => e.score >= 70);
    expect(tiered.every((e) => e.moves.length >= 2 && e.moves.every((m) => moves[m]))).toBe(true);
    expect(tiered.every((e) => moves[e.moves[0]!]!.fast && e.moves.slice(1).every((m) => !moves[m]!.fast))).toBe(true);
    expect(entries.find((e) => e.id === 'unown')!.moves).not.toContain('none');
  });

  it('rechaza un ranking desordenado', () => {
    const raw = fixtures.great();
    [raw[0], raw[5]] = [raw[5], raw[0]];
    expect(() => toRanking(raw, gm(), 'prueba')).toThrow(/ordenados/);
  });

  it('rechaza un registro roto entre los Pokémon con tier', () => {
    const raw = fixtures.great();
    delete raw[500].score;
    expect(() => toRanking(raw, gm(), 'prueba')).toThrow(/con tier/);
  });

  it('por debajo de los tiers omite el registro, lo cuenta y no mueve los demás puestos', () => {
    const raw = fixtures.great();
    delete raw[1000].moveset;
    const { entries, discarded } = toRanking(raw, gm(), 'prueba');
    expect(discarded).toBe(1);
    expect(entries.find((e) => e.id === raw[1001].speciesId)!.rank).toBe(1002);
  });

  it('rechaza listas cortadas, vacías, repetidas o de otro tipo', () => {
    expect(() => toRanking(fixtures.great().slice(0, 60), gm(), 'prueba')).toThrow(/faltan/);
    expect(() => toRanking([], gm(), 'prueba')).toThrow(/vacía/);
    expect(() => toRanking({ error: 'x' }, gm(), 'prueba')).toThrow(/estructura/);
    const twice = fixtures.great();
    twice[8] = { ...twice[7] };
    expect(() => toRanking(twice, gm(), 'prueba')).toThrow(/repetidos/);
  });

  it('rechaza movimientos o Pokémon desconocidos entre los que tienen tier', () => {
    const raw = fixtures.great();
    raw[3].moveset = ['NO_EXISTE'];
    expect(() => toRanking(raw, gm(), 'prueba')).toThrow(SourceError);
    const other = fixtures.great();
    other[3].speciesId = 'no_existe';
    expect(() => toRanking(other, gm(), 'prueba')).toThrow(SourceError);
  });
});

describe('Incursiones con datos reales', () => {
  it('convierte los 18 jefes sin perder ninguno', () => {
    const { data, discarded } = toRaids(fixtures.raids());
    expect(data).toHaveLength(18);
    expect(discarded).toBe(0);
    expect(data.filter((b) => b.shadow)).toHaveLength(8);
    expect(data.every((b) => b.dex !== null && b.cp !== null && b.image)).toBe(true);
    expect(data.find((b) => b.name === 'Cresselia')).toMatchObject({
      dex: 488,
      tier: '5-Star Raids',
      cp: { min: 1555, max: 1633 },
      boostedCp: { min: 1944, max: 2041 },
    });
  });

  it('el PC ausente (-1 en la fuente) queda como desconocido', () => {
    const raw = fixtures.raids();
    raw[0].combatPower.normal = { min: -1, max: -1 };
    expect(toRaids(raw).data[0]!.cp).toBeNull();
  });

  it('descarta un registro suelto pero rechaza una lista mayoritariamente rota o vacía', () => {
    const one = fixtures.raids();
    one[0] = { name: 'Roto' };
    expect(toRaids(one)).toMatchObject({ discarded: 1 });
    expect(() => toRaids(fixtures.raids().map(() => ({})))).toThrow(/Demasiados/);
    expect(() => toRaids([])).toThrow(/vacía/);
  });

  it('no acepta imágenes de dominios ajenos', () => {
    const raw = fixtures.raids();
    raw[0].image = 'https://evil.example/pm52.icon.png';
    raw[1].image = 'javascript:alert(1)';
    const { data } = toRaids(raw);
    expect([data[0]!.image, data[1]!.image]).toEqual([null, null]);
  });
});

describe('Eventos con datos reales', () => {
  it('conserva los 39, incluidos los que no tienen fecha', () => {
    const { data } = toEvents(fixtures.events());
    expect(data).toHaveLength(39);
    expect(data.filter((e) => !e.start || !e.end)).toHaveLength(2);
    expect(data.filter((e) => e.bonuses.length > 0)).toHaveLength(3);
  });

  it('extrae la bonificación de la hora destacada y los jefes de una rotación', () => {
    const { data } = toEvents(fixtures.events());
    expect(data.find((e) => e.type === 'pokemon-spotlight-hour')?.bonuses).toEqual(['2× Catch Candy']);
    const raids = data.find((e) => e.id.startsWith('cresselia-darkrai'));
    expect(raids?.raidBosses).toEqual(['Cresselia', 'Darkrai']);
  });

  it('unos detalles con formato nuevo no eliminan el evento', () => {
    const raw = fixtures.events();
    raw[0].extraData = { communityday: 'otro formato', spotlight: 3 };
    raw[1].extraData = 'texto';
    expect(toEvents(raw)).toMatchObject({ discarded: 0 });
  });
});

describe('Traducciones reales', () => {
  const tr = toTranslations(fixtures.en(), fixtures.es());

  it('cubre a todos los Pokémon con tier y sus movimientos, salvo las familias que cambian de tipo', () => {
    const game = gm();
    const lists = [fixtures.great, fixtures.ultra, fixtures.master].map((raw) =>
      toRanking(raw(), game, 'prueba').entries.filter((e) => e.score >= 70),
    );
    expect(lists.flat().filter((e) => !tr.pokemon[e.dex])).toEqual([]);
    const missing = Object.values(usedMoves(lists, game)).filter((m) => !tr.moves[normalize(m.name)]);
    expect(missing.map((m) => m.name).filter((n) => !/^(Weather Ball|Techno Blast|Hidden Power) \(/.test(n))).toEqual([]);
  });

  it('no confunde un movimiento con su variante «+»', () => {
    expect(tr.moves[normalize('Aerial Ace')]).toBe('Golpe Aéreo');
    expect(tr.moves[normalize('Aeroblast++')]).toBe('Aerochorro++');
  });

  it('entre un texto en inglés y otro traducido elige el traducido', () => {
    expect(tr.moves[normalize('Thunder Cage')]).toBe('Electrojaula');
  });

  it('rechaza un archivo casi vacío', () => {
    expect(() => toTranslations({}, {})).toThrow(/Faltan/);
  });
});

describe('Pokebattler', () => {
  it('lista solo jefes actuales', () => {
    const ids = toPokebattlerIds(fixtures.pokebattler());
    expect(ids).toContain('CRESSELIA');
    expect(ids).toContain('TORNADUS_SHADOW_FORM');
    expect(ids).not.toContain('ABOMASNOW_MEGA');
  });
});

describe('textos', () => {
  it('limpia HTML y entidades', () => {
    expect(plainText('A &amp; B&#39;s <b>x</b>&nbsp;&desconocida;')).toBe("A & B's x &desconocida;");
  });
  it('solo enlaza https de LeekDuck', () => {
    expect(leekDuckUrl('https://cdn.leekduck.com/a.png')).toBe('https://cdn.leekduck.com/a.png');
    expect(leekDuckUrl('http://leekduck.com/a')).toBeNull();
    expect(leekDuckUrl('https://leekduck.com.evil.com/a')).toBeNull();
  });
});
