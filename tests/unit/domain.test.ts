import { describe, expect, it } from 'vitest';
import type { RaidBoss } from '../../src/data/models';
import { parseGamemaster, toEvents, toPokebattlerBosses, toRaids, toRanking, toTranslations, usedMoves } from '../../src/data/transform';
import { bossLabel, moveName, pvpLabel } from '../../src/domain/names';
import { countersLink, groupRaids, rotationIncludes } from '../../src/domain/raids';
import { fixtures } from '../fixtures';

const tr = toTranslations(fixtures.en(), fixtures.es());
const raids = toRaids(fixtures.raids()).data;
const events = toEvents(fixtures.events()).data;
const ids = toPokebattlerBosses(fixtures.pokebattler());
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

describe('rotaciones que nombran a un jefe', () => {
  const rotation = (id: string) => events.find((e) => e.id === id)!;
  const cresselia = rotation('cresselia-darkrai-in-5-star-raid-battles-november-2026');
  const tornadus = rotation('shadow-tornadus-incarnate-forme-in-shadow-raids-november-16-2026');

  it('solo cuenta el jefe exacto que nombra el evento', () => {
    expect(rotationIncludes(cresselia, boss('Cresselia'))).toBe(true);
    expect(rotationIncludes(tornadus, boss('Shadow Tornadus (Incarnate)'))).toBe(true);
    expect(rotationIncludes(cresselia, boss('Liepard'))).toBe(false);
  });

  it('no confunde un jefe normal con su versión oscura', () => {
    expect(rotationIncludes(cresselia, fake('Shadow Cresselia'))).toBe(false);
    expect(rotationIncludes(tornadus, fake('Tornadus (Incarnate)'))).toBe(false);
  });
});

describe('enlaces a Pokébattler', () => {
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
    expect(countersLink(fake('Deoxys (Rara)'), { ...ids, DEOXYS: 'RAID_LEVEL_5' }).exact).toBe(false);
    expect(countersLink(fake('Shadow Tornadus (Therian)'), ids).exact).toBe(false);
    expect(countersLink(fake('Alolan Darkrai'), ids).exact).toBe(false);
    expect(countersLink(boss('Cresselia'), undefined)).toEqual({
      url: 'https://www.pokebattler.com/raids',
      exact: false,
      target: null,
    });
  });

  it('da el nivel que publica Pokébattler, y ninguno si es ambiguo', () => {
    expect(countersLink(boss('Cresselia'), ids).target).toEqual({ id: 'CRESSELIA', tier: 'RAID_LEVEL_5' });
    expect(countersLink(boss('Shadow Tornadus (Incarnate)'), ids).target?.tier).toBe('RAID_LEVEL_5_SHADOW');
    expect(raids.filter((b) => !countersLink(b, ids).target)).toEqual([]);
    expect(countersLink(boss('Cresselia'), { CRESSELIA: null })).toMatchObject({ exact: true, target: null });
  });
});
