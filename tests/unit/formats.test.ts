import { describe, expect, it } from 'vitest';
import type { PvpFormat, SeasonWeek } from '../../src/data/models';
import { MIN_FORMAT, parseGamemaster, toFormats, toRanking, toSeason, toSpecies, toTranslations, usedMoves } from '../../src/data/transform';
import {
  entryLabel,
  filterFormat,
  formatFor,
  groupSeason,
  officialSeasonUrl,
  parseEntry,
  restrictionsOf,
} from '../../src/domain/formats';
import { moveName } from '../../src/domain/names';
import { fixtures, NOW } from '../fixtures';

const gm = () => parseGamemaster(fixtures.gamemaster());
const tr = toTranslations(fixtures.en(), fixtures.es());
const species = toSpecies(gm());
const formats = toFormats(gm());
const format = (title: string, cup = title.toLowerCase().replace(/\W/g, ''), cp = 1500): PvpFormat => ({ title, cup, cp, include: [], exclude: [] });

describe('formatos de PvPoke', () => {
  it('solo los que enseña y tienen ranking', () => {
    const names = formats.map((f) => f.title);
    expect(names).toEqual(expect.arrayContaining(['Mega Great League', 'Mega Ultra League', 'Mega Master League', 'LAIC 2027 Cup (GBL)']));
    // Restos ocultos, listas sin ranking y el formato libre.
    for (const hidden of ['Catch Cup', 'Little Cup', 'Master Premier Cup', 'Custom']) expect(names).not.toContain(hidden);
  });

  it('si cambian de forma, quedan vacíos y las ligas siguen', () => {
    for (const value of [undefined, null, 'x', {}, [{ title: 'Roto' }]]) {
      const raw = { ...fixtures.gamemaster(), formats: value };
      expect(toFormats(parseGamemaster(raw))).toEqual([]);
      expect(toRanking(fixtures.great(), parseGamemaster(raw), 'x').entries).toHaveLength(1156);
    }
    const evil = fixtures.gamemaster();
    evil.formats = [{ title: 'Mala', cup: '../../otro', cp: 1500, showCup: true, showFormat: true }];
    expect(toFormats(parseGamemaster(evil))).toEqual([]);
  });

  it('los filtros que solo afectan a otra liga no se aplican', () => {
    const raw = fixtures.gamemaster();
    raw.formats = [{ title: 'Retro Cup', cup: 'retro', cp: 1500, showCup: true, showFormat: true }];
    raw.cups.find((c: any) => c.name === 'retro').exclude.push({ filterType: 'id', values: ['smeargle'], leagues: [500] });
    expect(toFormats(parseGamemaster(raw))[0]!.exclude.some((f) => f.kind === 'id')).toBe(false);
  });
});

describe('rankings reales', () => {
  it('liga Mega: admite el cuarto movimiento de las supermegas', () => {
    const { entries, discarded } = toRanking(fixtures.mega(), gm(), 'x', MIN_FORMAT);
    expect(discarded).toBe(0);
    expect(entries[0]).toMatchObject({ rank: 1, name: 'Sableye (Mega)', score: 94 });
    expect(entries[0]!.moves).toHaveLength(4);
    const moves = usedMoves([entries], gm());
    expect(entries[0]!.moves.map((id) => moveName(moves[id]!, tr))).toContain('Tinieblas+');
  });

  it('copa LAIC', () => {
    const { entries } = toRanking(fixtures.laic(), gm(), 'x', MIN_FORMAT);
    expect(entries).toHaveLength(60);
    for (const e of entries) for (const type of ['dark', 'fairy', 'fire', 'steel']) expect(e.types).not.toContain(type);
  });

  it('una copa pequeña vale; un archivo cortado, no', () => {
    expect(toRanking(fixtures.laic().slice(0, 25), gm(), 'x', MIN_FORMAT).entries).toHaveLength(25);
    expect(() => toRanking(fixtures.laic().slice(0, 10), gm(), 'x', MIN_FORMAT)).toThrow(/faltan/);
  });

  it('filtra sin cambiar los puestos', () => {
    const { entries } = toRanking(fixtures.mega(), gm(), 'x', MIN_FORMAT);
    const mega = filterFormat(entries, { variant: 'mega', search: '' }, tr);
    expect(mega.map((e) => e.name)).toContain('Malamar (Mega)');
    expect(mega.find((e) => e.name === 'Malamar (Mega)')!.rank).toBe(31);
    expect(filterFormat(entries, { variant: 'shadow', search: '' }, tr).every((e) => /Shadow/.test(e.name))).toBe(true);
    expect(filterFormat(entries, { variant: 'all', search: 'mega sableye' }, tr)).toHaveLength(1);
  });
});

describe('nombres del calendario', () => {
  it.each([
    ['Great League: Mega Edition', 'Liga Super: Edición Mega'],
    ['Master League', 'Liga Máster'],
    ['Mountain Cup: Great League Edition', 'Copa Montaña'],
    ['Holiday Cup: Great League Edition', 'Copa Festividades'],
    ['2027 GO EUIC Cup', 'Copa EUIC de GO 2027'],
    ['Little Cup', 'Copa Chica'],
  ])('%s', (text, name) => expect(entryLabel(parseEntry(text))).toEqual({ name, untranslated: false }));

  it('una copa desconocida se deja en inglés', () => {
    expect(entryLabel(parseEntry('Mega Catch Cup: Great League Edition'))).toEqual({ name: 'Mega Catch Cup', untranslated: true });
  });

  // Títulos con los que PvPoke publicó las copas de la temporada Twilight Trails.
  it.each([
    ['Willpower Cup: Great League Edition', 'Willpower Cup', 1500],
    ['Retro Cup: Great League Edition', 'Retro Cup', 1500],
    ['Mega Color Cup: Great League Edition', 'Mega Color Cup', 1500],
    ['Little Cup', 'Little Cup', 500],
    ['Fantasy Cup: Great League Edition', 'Fantasy Cup', 1500],
    ['Mega Halloween Cup: Great League Edition', 'Mega Halloween Cup', 1500],
    ['2026 GO LAIC Cup', 'LAIC 2027 Cup (GBL)', 1500],
  ])('%s se empareja con «%s»', (text, title, cp) => {
    const list = [
      format('Fantasy Cup'), format('Retro Cup'), format('Willpower Cup'), format('Mega Color Cup'), format('Little Cup', 'little', 500),
      format('Mega Halloween Cup'), format('LAIC 2027 Cup (GBL)', 'laic2027gbl'), format('LAIC 2027 Championship Series Cup', 'laic2027'),
      format('Devon Trail Cup'), format('Mega Great League', 'mega'),
    ];
    expect(formatFor(parseEntry(text), list)).toMatchObject({ title, cp });
  });

  it('nunca el ranking de otra copa', () => {
    const find = (text: string, list = formats) => formatFor(parseEntry(text), list);
    expect(find('Mega Catch Cup: Great League Edition', [format('Catch Cup')])).toBeNull();
    expect(find('Retro Cup: Ultra League Edition', [format('Retro Cup')])).toBeNull();
    expect(find('Retro Cup: Great League Edition', [format('Retro Cup'), format('Retro Cup', 'retro2')])).toBeNull();
    expect(find('Mountain Cup: Great League Edition')).toBeNull();
    // La liga normal no tiene formato propio: es la de siempre.
    expect(find('Great League')).toBeNull();
    expect(find('Ultra League: Mega Edition')).toMatchObject({ cup: 'mega', cp: 2500 });
  });
});

describe('restricciones en español', () => {
  const texts = (f: PvpFormat) => restrictionsOf(f, species, tr).map((r) => r.text);
  const cup = (name: string): PvpFormat => {
    const raw = fixtures.gamemaster();
    raw.formats = [{ title: name, cup: name, cp: 1500, showCup: true, showFormat: true }];
    return toFormats(parseGamemaster(raw))[0]!;
  };

  it('tipos, categorías y Pokémon prohibidos', () => {
    expect(texts(cup('retro'))).toEqual(['Hasta 1500 PC', 'No se permiten los de tipo Siniestro, Hada o Acero', 'No se permiten megaevoluciones']);
    expect(texts(cup('halloweenmega'))).toEqual(['Hasta 1500 PC', 'Solo de tipo Veneno, Fantasma, Bicho, Siniestro o Hada']);
    const laic = restrictionsOf(formats.find((f) => f.cup === 'laic2027gbl')!, species, tr);
    expect(laic.map((r) => r.text)).toEqual([
      'Hasta 1500 PC',
      'No se permiten los de tipo Siniestro, Hada, Fuego o Acero',
      'No se permiten legendarios, singulares, ultraentes y megaevoluciones',
      'Pokémon prohibidos',
    ]);
    expect(laic.at(-1)!.names).toEqual(expect.arrayContaining(['Corsola de Galar', 'Snorlax', 'Wobbuffet']));
  });

  it('evolución, ligas Mega y condiciones que no se saben explicar', () => {
    expect(texts(cup('little'))).toContain('Solo Pokémon que pueden evolucionar y aún no lo han hecho');
    expect(texts(formats.find((f) => f.cup === 'mega' && f.cp === 10000)!)).toEqual(['Sin límite de PC', 'Se permiten megaevoluciones']);
    expect(texts(cup('cauldron')).filter((t) => t.includes('otras condiciones'))).toHaveLength(1);
  });
});

describe('calendario', () => {
  const raw = () => fixtures.events();
  const weeks = toSeason(raw(), [], NOW);

  it('separa las ligas y copas de cada semana', () => {
    expect(weeks.map((w) => w.entries)).toEqual([
      ['Ultra League', 'Master League: Mega Edition', '2026 GO LAIC Cup'],
      ['Master League', 'Mega Catch Cup: Great League Edition'],
    ]);
    expect(weeks[0]).toMatchObject({ season: 'Twilight Trails', start: '2026-11-18T21:00:00.000Z' });
    expect(groupSeason(weeks, NOW).current.map((w) => w.id)).toEqual([weeks[0]!.id]);
    expect(groupSeason(weeks, NOW).upcoming.map((w) => w.id)).toEqual([weeks[1]!.id]);
  });

  it('conserva la semana en curso si la fuente deja de listarla, y la olvida al terminar', () => {
    const without = raw().filter((e: any) => e.eventType !== 'go-battle-league');
    expect(toSeason(without, weeks, NOW).map((w) => w.id)).toEqual([weeks[0]!.id]);
    const later = Date.parse('2026-11-26T00:00:00Z');
    expect(toSeason(without, weeks, later).map((w) => w.id)).toEqual([weeks[1]!.id]);
    expect(toSeason(without, weeks, Date.parse('2026-12-02T00:00:00Z'))).toEqual([]);
  });

  it('no conserva las futuras que desaparecen ni repite las conocidas', () => {
    expect(toSeason(raw(), weeks, NOW)).toEqual(weeks);
    const gone: SeasonWeek = { ...weeks[1]!, id: 'otra' };
    expect(toSeason(raw(), [gone], NOW).some((w) => w.id === 'otra')).toBe(false);
  });

  it('enlaza a la página oficial en español', () => {
    expect(officialSeasonUrl('Daydream Destinations')).toBe('https://pokemongo.com/es/news/go-battle-league-daydream-destinations');
  });

  it('sin fechas nunca es la semana actual', () => {
    const undated = weeks.map((w) => ({ ...w, start: null, end: null }));
    expect(groupSeason(undated, NOW)).toMatchObject({ current: [], upcoming: [] });
    expect(groupSeason(undated, NOW).undated).toHaveLength(2);
  });
});
