import { describe, expect, it } from 'vitest';
import type { GameEvent, RaidBoss } from '../../src/data/models';
import { parseGamemaster, toEvents, toPokebattlerIds, toRaids, toRanking, toTranslations, usedMoves } from '../../src/data/transform';
import { bossLabel, moveName, pvpLabel } from '../../src/domain/names';
import { countersLink, groupRaids, raidValidity } from '../../src/domain/raids';
import { fixtures, NOW } from '../fixtures';

const tr = toTranslations(fixtures.en(), fixtures.es());
const raids = toRaids(fixtures.raids()).data;
const events = toEvents(fixtures.events()).data;
const ids = toPokebattlerIds(fixtures.pokebattler());
const gm = parseGamemaster(fixtures.gamemaster());
const boss = (name: string): RaidBoss => raids.find((b) => b.name === name)!;
const fake = (name: string, change: Partial<RaidBoss> = {}): RaidBoss => ({ ...raids[0]!, name, shadow: /^Shadow/.test(name), ...change });

describe('nombres en español', () => {
  const label = (name: string, dex: number) => pvpLabel({ name, dex }, tr);

  it('formas, regiones, oscuros y megas', () => {
    expect(label('Giratina (Altered) (Shadow)', 487)).toMatchObject({ name: 'Giratina', form: 'Forma Modificada', shadow: true });
    expect(label('Ninetales (Alolan) (Shadow)', 38)).toMatchObject({ name: 'Ninetales de Alola', form: null, shadow: true });
    expect(label('Kyurem (White)', 646)).toMatchObject({ name: 'Kyurem Blanco', form: null });
    expect(label('Charizard (Mega X)', 6).name).toBe('Mega-Charizard X');
    expect(label('Zacian (Crowned Sword)', 888).form).toBe('Espada Suprema');
  });

  it('una forma desconocida se deja en su idioma, no se inventa', () => {
    expect(label('Pikachu (Kariyushi)', 25)).toMatchObject({ name: 'Pikachu', form: 'Kariyushi' });
  });

  it('todos los Pokémon con tier S o A quedan traducidos en las tres ligas', () => {
    const lists = [fixtures.great, fixtures.ultra, fixtures.master].map((raw) => toRanking(raw(), gm, 'x').entries);
    const top = lists.flat().filter((e) => e.score >= 85);
    expect(top.filter((e) => pvpLabel(e, tr).untranslated)).toEqual([]);
    const ball = Object.values(usedMoves(lists, gm)).filter((m) => m.name.startsWith('Weather Ball'));
    expect(ball.map((m) => moveName(m, tr))).toContain('Meteorobola (Fuego)');
    expect(ball.every((m) => moveName(m, tr).startsWith('Meteorobola ('))).toBe(true);
  });

  it('sin traducciones se ve el nombre original', () => {
    expect(pvpLabel({ name: 'Melmetal', dex: 809 }, undefined)).toMatchObject({ name: 'Melmetal', untranslated: true });
    expect(moveName({ name: 'Thunder Shock', type: 'electric' }, undefined)).toBe('Thunder Shock');
    expect(moveName({ name: 'Nuevo Move', type: 'fire' }, tr)).toBe('Nuevo Move');
  });

  it('los 18 jefes reales', () => {
    const labels = raids.map((b) => bossLabel(b, tr));
    expect(labels.filter((l) => l.untranslated)).toEqual([]);
    expect(labels.map((l) => l.name)).toContain('Marowak de Alola');
    expect(labels.map((l) => l.name)).toContain('Mega-Banette');
    expect(bossLabel(boss('Shadow Tornadus (Incarnate)'), tr)).toMatchObject({ name: 'Tornadus', form: 'Forma Avatar', shadow: true });
  });

  it('si el nombre no cuadra con su número de Pokédex, no lo traduce', () => {
    expect(bossLabel(fake('Party Hat Pikachu', { dex: 25 }), tr)).toMatchObject({ name: 'Party Hat Pikachu', untranslated: true });
    expect(bossLabel(fake('Cresselia', { dex: 491 }), tr).untranslated).toBe(true);
    expect(bossLabel(fake('Cresselia', { dex: null }), tr).untranslated).toBe(true);
  });
});

describe('incursiones por nivel', () => {
  it('separa las oscuras, que la fuente mezcla en el mismo nivel', () => {
    expect(groupRaids(raids).map((g) => [g.title, g.bosses.length])).toEqual([
      ['Megaincursiones', 1],
      ['5 estrellas', 2],
      ['3 estrellas', 3],
      ['1 estrella', 4],
      ['Oscuras · 5 estrellas', 1],
      ['Oscuras · 3 estrellas', 3],
      ['Oscuras · 1 estrella', 4],
    ]);
  });

  it('un nivel nuevo se muestra tal cual y al final de su bloque', () => {
    const groups = groupRaids([fake('X', { tier: 'Super Mega Raids' }), ...raids.filter((b) => !b.shadow)]);
    expect(groups.at(-1)!.title).toBe('Super Mega Raids');
  });
});

describe('vigencia de las rotaciones', () => {
  it('solo la respalda un evento que nombra al jefe', () => {
    expect(raidValidity(boss('Cresselia'), events, NOW)).toMatchObject({ kind: 'announced', end: Date.parse('2026-11-24T21:00:00Z') });
    expect(raidValidity(boss('Mega Banette'), events, NOW).kind).toBe('announced');
    expect(raidValidity(boss('Shadow Tornadus (Incarnate)'), events, NOW).kind).toBe('announced');
    expect(raidValidity(boss('Liepard'), events, NOW)).toEqual({ kind: 'unknown' });
    expect(raidValidity(boss('Shadow Larvitar'), events, NOW)).toEqual({ kind: 'unknown' });
  });

  it('avisa si la rotación anunciada ya terminó o aún no ha empezado', () => {
    expect(raidValidity(boss('Cresselia'), events, Date.parse('2026-11-25T00:00:00Z')).kind).toBe('expired');
    expect(raidValidity(fake('Deoxys (Attack)'), events, NOW).kind).toBe('upcoming');
  });

  it('no confunde un jefe normal con su versión oscura', () => {
    expect(raidValidity(fake('Shadow Cresselia'), events, NOW).kind).toBe('unknown');
    expect(raidValidity(fake('Tornadus (Incarnate)'), events, NOW).kind).toBe('unknown');
  });

  it('sin eventos o con rotación sin fechas, queda sin confirmar', () => {
    expect(raidValidity(boss('Cresselia'), undefined, NOW).kind).toBe('unknown');
    const undated: GameEvent[] = events.map((e) => ({ ...e, start: null, end: null }));
    expect(raidValidity(boss('Cresselia'), undated, NOW).kind).toBe('unknown');
  });
});

describe('enlaces a Pokebattler', () => {
  const id = (name: string) => countersLink(fake(name), ids).url.split('/raids')[1];

  it('los 18 jefes reales llevan a su página exacta', () => {
    expect(raids.filter((b) => !countersLink(b, ids).exact)).toEqual([]);
    expect(id('Shadow Tornadus (Incarnate)')).toBe('/TORNADUS_SHADOW_FORM');
    expect(id('Alolan Meowth')).toBe('/MEOWTH_ALOLA_FORM');
    expect(id('Mega Banette')).toBe('/BANETTE_MEGA');
    expect(id('Deoxys (Attack)')).toBe('/DEOXYS_ATTACK_FORM');
  });

  it('ante la duda enlaza al índice, nunca a otra forma', () => {
    expect(id('Inventado')).toBe('');
    expect(countersLink(fake('Deoxys (Rara)'), [...ids, 'DEOXYS']).exact).toBe(false);
    expect(countersLink(fake('Shadow Tornadus (Therian)'), ids).exact).toBe(false);
    expect(countersLink(fake('Alolan Darkrai'), ids).exact).toBe(false);
    expect(countersLink(boss('Cresselia'), undefined)).toEqual({ url: 'https://www.pokebattler.com/raids', exact: false });
  });
});
