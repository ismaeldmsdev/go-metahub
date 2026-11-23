import { describe, expect, it } from 'vitest';
import { parseGamemaster, toRanking, toSprites } from '../../src/data/transform';
import { spriteId } from '../../src/domain/sprites';
import { fixtures } from '../fixtures';

const index = toSprites(fixtures.sprites());
const gm = parseGamemaster(fixtures.gamemaster());
const all = [fixtures.great, fixtures.ultra, fixtures.master].flatMap((raw) => toRanking(raw(), gm, 'x').entries);
const nameOf = (id: number | null) => Object.values(index).flat().find((f) => f.id === id)?.name ?? null;
const form = (name: string, dex: number) => nameOf(spriteId({ name, dex }, index));

describe('imagen exacta de cada forma', () => {
  it.each([
    ['Melmetal', 809, 'melmetal'],
    ['Ninetales', 38, 'ninetales'],
    ['Ninetales (Shadow)', 38, 'ninetales'],
    ['Ninetales (Alolan)', 38, 'ninetales-alola'],
    ['Ninetales (Alolan) (Shadow)', 38, 'ninetales-alola'],
    ['Corsola (Galarian)', 222, 'corsola-galar'],
    ['Electrode (Hisuian)', 101, 'electrode-hisui'],
    ['Wooper (Paldean)', 194, 'wooper-paldea'],
    ['Tauros (Blaze)', 128, 'tauros-paldea-blaze-breed'],
    ['Giratina (Altered)', 487, 'giratina-altered'],
    ['Giratina (Origin)', 487, 'giratina-origin'],
    ['Kyurem (White)', 646, 'kyurem-white'],
    ['Zacian (Crowned Sword)', 888, 'zacian-crowned'],
    ['Zacian (Hero)', 888, 'zacian'],
    ['Necrozma (Dusk Mane)', 800, 'necrozma-dusk'],
    ['Zygarde (Complete Forme)', 718, 'zygarde-complete'],
    ['Zygarde (10% Forme)', 718, 'zygarde-10'],
    ['Darmanitan (Zen)', 555, 'darmanitan-zen'],
    ['Darmanitan (Galarian)', 555, 'darmanitan-galar-standard'],
    ['Charizard (Mega X)', 6, 'charizard-mega-x'],
    ['Delphox (Mega)', 655, 'delphox-mega'],
    ['Groudon (Primal)', 383, 'groudon-primal'],
    // Formas con las que PvPoke los nombra en sus clasificaciones.
    ['Mimikyu (Busted)', 778, 'mimikyu-busted'],
    ['Aegislash (Blade)', 681, 'aegislash-blade'],
  ])('%s', (name, dex, expected) => {
    expect(form(name, dex)).toBe(expected);
  });

  it('en los datos reales, Mimikyu y Aegislash llevan la forma que nombra PvPoke', () => {
    const image = (id: string) => nameOf(spriteId(all.find((e) => e.id === id)!, index));
    expect(image('mimikyu')).toBe('mimikyu-busted');
    expect(image('aegislash_shield')).toBe('aegislash-blade');
  });

  it('ante la duda no muestra otra forma', () => {
    expect(form('Mewtwo (Armored)', 150)).toBeNull();
    expect(form('Genesect (Burn)', 649)).toBeNull();
    expect(form('Pikachu (Inventado)', 25)).toBeNull();
    expect(form('Inventado', 99999)).toBeNull();
    expect(spriteId({ name: 'Melmetal', dex: 809 }, undefined)).toBeNull();
  });

  it('cubre todas las clasificaciones salvo seis formas conocidas', () => {
    const missing = new Set(all.filter((e) => spriteId(e, index) === null).map((e) => e.name));
    expect([...missing].sort()).toEqual([
      'Cherrim (Sunshine)',
      'Genesect (Burn)',
      'Genesect (Chill)',
      'Genesect (Douse)',
      'Genesect (Shock)',
      'Mewtwo (Armored)',
    ]);
  });

  it('la imagen siempre es de la misma especie', () => {
    for (const entry of all) {
      const id = spriteId(entry, index);
      if (id !== null) expect(index[entry.dex]!.some((f) => f.id === id)).toBe(true);
    }
  });
});

describe('lista de imágenes', () => {
  it('rechaza otra estructura o un archivo cortado', () => {
    expect(() => toSprites('<html></html>')).toThrow(/estructura/);
    expect(() => toSprites('id,nombre\n1,a')).toThrow(/estructura/);
    expect(() => toSprites(fixtures.sprites().split('\n').slice(0, 300).join('\n'))).toThrow(/faltan/);
  });
});
