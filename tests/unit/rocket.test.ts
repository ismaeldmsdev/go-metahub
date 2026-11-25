import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { build, checkAgainst, DataError, needsUpdate, serialize } from '../../scripts/rocket-attackers';
import type { RocketAttacker, Species } from '../../src/data/models';
import {
  parseGamemaster,
  toRocket,
  toRocketAttackers,
  toRocketContrast,
  toSpecies,
  toSprites,
  toTranslations,
} from '../../src/data/transform';
import type { AttackerFilters } from '../../src/domain/gyms';
import { pvpLabel, TYPES } from '../../src/domain/names';
import {
  agrees,
  bossesOf,
  compareLineups,
  countRocketTiers,
  filterRocketAttackers,
  filterSuggestions,
  gruntsOf,
  featuredSuggestions,
  isExposed,
  MIN_SUGGESTIONS,
  phrasesOf,
  rivalSpecies,
  searchTrainers,
  sharingPhrase,
  suggestionsFor,
  trainerLabel,
} from '../../src/domain/rocket';
import { spriteId } from '../../src/domain/sprites';
import { effectiveness } from '../../src/domain/types';
import { fixtures } from '../fixtures';

const tr = toTranslations(fixtures.en(), fixtures.es());
const species = toSpecies(parseGamemaster(fixtures.gamemaster()));
const trainers = () => toRocket(fixtures.rocket()).data;
const contrast = () => toRocketContrast(fixtures.rocketContrast()).data;
const attackers = toRocketAttackers(fixtures.rocketAttackers()).pokemon;
const get = (key: string) => trainers().find((t) => t.key === key)!;

describe('alineaciones de WatWowMap', () => {
  it('solo los entrenadores en activo, con sus tres posiciones', () => {
    const { data, discarded } = toRocket(fixtures.rocket());
    expect(data).toHaveLength(26);
    expect(discarded).toBe(0);
    expect(bossesOf(data).map((t) => t.name)).toEqual(['Giovanni', 'Cliff', 'Arlo', 'Sierra']);
    expect(gruntsOf(data, tr)).toHaveLength(22);
    expect(new Set(data.map((t) => t.key)).size).toBe(26);
  });

  it('alternativas, forma y captura', () => {
    const cliff = get('cliff');
    expect(cliff.slots.map((s) => s.options.length)).toEqual([1, 3, 3]);
    expect(cliff.slots.map((s) => s.reward)).toEqual([true, false, false]);
    expect(cliff.slots[1].options[2]).toEqual({ dex: 110, form: 'WEEZING_GALARIAN' });
    expect(get('giovanni').slots.map((s) => s.reward)).toEqual([false, false, true]);
  });

  it('el juego llama «Metal» al tipo Acero', () => {
    expect(get('steel-m')).toMatchObject({ type: 'steel', gender: 'm', kind: 'grunt' });
    expect(trainerLabel(get('steel-m'), tr)).toEqual({ name: 'Recluta de tipo Acero', detail: 'Hombre' });
    expect(trainerLabel(get('decoy-f'), tr)).toEqual({ name: 'Recluta señuelo', detail: 'Mujer' });
    expect(trainerLabel(get('mixed-m'), tr)).toEqual({ name: 'Recluta sin tipo', detail: 'Hombre' });
  });

  it('un entrenador desconocido se muestra aparte, sin confundirlo con otro', () => {
    const raw = fixtures.rocket();
    raw['53'] = { ...raw['7'], type: 'Gruntb', grunt: 'Gruntb', proto: 'CHARACTER_GRUNTB_FEMALE', gender: 2 };
    raw['527'] = { ...raw['41'], type: 'Cliff Unticketed', grunt: 'Event', proto: 'CHARACTER_EVENT_CLIFF_UNTICKETED' };
    const { data } = toRocket(raw);
    expect(data.find((t) => t.id === 53)).toMatchObject({ key: 'otro-53', kind: 'other', type: null });
    expect(trainerLabel(data.find((t) => t.id === 53)!, tr).name).toBe('Dúo de prueba');
    expect(data.find((t) => t.id === 527)).toMatchObject({ key: 'cliff-527', kind: 'leader', name: 'Cliff (evento)' });
    expect(data.find((t) => t.id === 41)!.key).toBe('cliff');
  });

  it('un registro incorrecto se omite y se cuenta; si son muchos, se rechaza todo', () => {
    const raw = fixtures.rocket();
    raw['7'].encounters.second = [];
    expect(toRocket(raw)).toMatchObject({ discarded: 1, data: { length: 25 } });
    for (const id of ['10', '12', '14', '16', '18', '20']) raw[id].encounters.first = [];
    expect(() => toRocket(raw)).toThrow(/incorrectos/);
  });

  it.each([
    ['vacía', {}],
    ['una lista', []],
    ['nada', null],
    ['un error', { error: 'x' }],
  ])('rechaza una respuesta inesperada: %s', (_, raw) => expect(() => toRocket(raw)).toThrow());
});

describe('contraste con LeekDuck', () => {
  it('hoy las dos fuentes coinciden por completo', () => {
    const comparison = compareLineups(trainers(), contrast());
    expect(agrees(comparison)).toBe(true);
    expect(comparison.matching).toBe(26);
    expect(contrast().every((t) => t.key !== null)).toBe(true);
  });

  it('el orden de las alternativas no es una diferencia', () => {
    const raw = fixtures.rocketContrast();
    for (const t of raw) t.thirdPokemon.reverse();
    expect(agrees(compareLineups(trainers(), toRocketContrast(raw).data))).toBe(true);
  });

  it('detecta Pokémon distintos y en qué posición', () => {
    const raw = fixtures.rocketContrast();
    const cliff = raw.find((t: any) => t.name === 'Cliff');
    cliff.secondPokemon[0] = { ...cliff.secondPokemon[0], name: 'Pidgey', image: cliff.secondPokemon[0].image.replace('pm143', 'pm16') };
    const comparison = compareLineups(trainers(), toRocketContrast(raw).data);
    expect([...comparison.differences]).toEqual([
      ['cliff', [{ slot: 1, main: [{ dex: 143, form: null }], contrast: [{ name: 'Pidgey', dex: 16 }] }]],
    ]);
    expect(comparison.matching).toBe(25);
  });

  it('distingue la forma regional de la normal', () => {
    const raw = fixtures.rocketContrast();
    const arlo = raw.find((t: any) => t.name === 'Arlo');
    arlo.firstPokemon[0].name = 'Grimer';
    expect(compareLineups(trainers(), toRocketContrast(raw).data).differences.get('arlo')).toHaveLength(1);
  });

  it('avisa de entrenadores que solo están en una', () => {
    const raw = fixtures.rocketContrast().filter((t: any) => t.name !== 'Sierra');
    raw.push({ ...raw[0], name: 'Jessie & James' });
    const comparison = compareLineups(trainers(), toRocketContrast(raw).data);
    expect(comparison.onlyMain.map((t) => t.key)).toEqual(['sierra']);
    expect(comparison.onlyContrast).toEqual(['Jessie & James']);
    expect(agrees(comparison)).toBe(false);
  });

  it('rechaza una lista cortada o con otra estructura', () => {
    expect(() => toRocketContrast(fixtures.rocketContrast().slice(0, 5))).toThrow(/faltan/);
    expect(() => toRocketContrast([])).toThrow(/vacía/);
    expect(() => toRocketContrast(fixtures.rocketContrast().map(({ name }: any) => ({ name })))).toThrow(/incorrectos/);
  });
});

describe('frases', () => {
  it('en español, sin etiquetas y sin repetir', () => {
    expect(phrasesOf(get('bug-m'), tr)).toEqual(['¡Prueba: colección de insectos !']);
    expect(phrasesOf(get('cliff'), tr)).toEqual(['Prueba: Cliff, uno.', 'Prueba: Cliff, dos.']);
  });

  it('las que no están traducidas no se muestran', () => expect(phrasesOf(get('decoy-f'), tr)).toEqual([]));

  it('reconoce a los que comparten frase', () => {
    expect(sharingPhrase(get('water-m'), trainers(), tr).map((t) => t.key)).toEqual(['water-f']);
    expect(sharingPhrase(get('mixed-f'), trainers(), tr).map((t) => t.key)).toEqual(['mixed-m']);
    expect(sharingPhrase(get('cliff'), trainers(), tr)).toEqual([]);
  });

  it.each([
    ['rio profundo', ['water-f', 'water-m']],
    ['PROFUNDO agua hombre', ['water-m']],
    ['acero', ['steel-m']],
    ['gyarados', ['mixed-f', 'water-m']],
    ['weezing galar', ['fairy-f', 'poison-f']],
    ['zzz', []],
  ])('buscar «%s»', (search, keys) => {
    const found = searchTrainers(gruntsOf(trainers(), tr), search, tr, species).map((t) => t.key);
    expect(found.sort()).toEqual(keys);
  });

  it('sin frases en la fuente, los nombres siguen traducidos', () => {
    const strip = (o: any) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('grunt')));
    const bare = toTranslations(strip(fixtures.en()), strip(fixtures.es()));
    expect(bare.trainers).toEqual({});
    expect(bare.pokemon).toEqual(tr.pokemon);
    expect(bare.moves).toEqual(tr.moves);
  });
});

describe('Pokémon de los rivales', () => {
  const rivals = trainers().flatMap((t) => t.slots.flatMap((s) => s.options));
  const sprites = toSprites(fixtures.sprites());

  it('todos se reconocen, con tipos e imagen exactos', () => {
    for (const rival of rivals) {
      const found = rivalSpecies(rival, species, tr);
      expect(found.dex).toBe(rival.dex);
      expect(found.types.length, JSON.stringify(rival)).toBeGreaterThan(0);
      expect(spriteId(found, sprites), found.name).not.toBeNull();
      expect(pvpLabel(found, tr).untranslated).toBe(false);
    }
  });

  it('los tipos coinciden con los que publica LeekDuck', () => {
    const raw = fixtures.rocketContrast();
    for (const other of toRocketContrast(raw).data) {
      const trainer = get(other.key!);
      const source = raw.find((t: any) => t.name === other.name);
      (['firstPokemon', 'secondPokemon', 'thirdPokemon'] as const).forEach((slot, i) => {
        for (const p of source[slot]) {
          const dex = Number(/pm(\d+)/.exec(p.image)![1]);
          const rival = trainer.slots[i]!.options.find((o) => o.dex === dex)!;
          expect([...rivalSpecies(rival, species, tr).types].sort(), p.name).toEqual([...p.types].sort());
        }
      });
    }
  });

  it('formas regionales', () => {
    const grimer = rivalSpecies({ dex: 88, form: 'GRIMER_ALOLA' }, species, tr);
    expect(grimer).toMatchObject({ name: 'Grimer (Alolan)', types: ['poison', 'dark'] });
    expect(pvpLabel(grimer, tr).name).toBe('Grimer de Alola');
  });

  it('una forma desconocida no hereda los tipos de otra', () => {
    expect(rivalSpecies({ dex: 88, form: 'GRIMER_RARE_FORM' }, species, tr)).toEqual({
      name: 'Grimer (Rare Form)',
      dex: 88,
      types: [],
    });
    expect(rivalSpecies({ dex: 88, form: 'GRIMER_GALARIAN' }, species, tr).types).toEqual([]);
  });

  it('sin los datos de PvPoke, el nombre se conserva y los tipos no se inventan', () => {
    expect(rivalSpecies({ dex: 143, form: null }, undefined, tr)).toEqual({ name: 'Snorlax', dex: 143, types: [] });
    expect(rivalSpecies({ dex: 143, form: null }, undefined, undefined).name).toBe('#143');
  });

  it('si la fuente no indica la forma y los tipos difieren, no se elige ninguna', () => {
    const forms: Record<string, Species> = {
      a: { name: 'X (Sandy)', dex: 9999, types: ['bug', 'ground'] },
      b: { name: 'X (Trash)', dex: 9999, types: ['bug', 'steel'] },
    };
    expect(rivalSpecies({ dex: 9999, form: null }, forms, undefined)).toEqual({ name: 'X', dex: 9999, types: [] });
  });
});

const NONE: AttackerFilters = { tier: 'all', type: 'all', mega: 'with', shadow: 'with', legendary: 'with', search: '' };

describe('atacantes generales', () => {
  it('por tier y puntuación original, sin crear otra', () => {
    const groups = filterRocketAttackers(attackers, NONE, tr);
    expect(groups.flatMap((g) => g.entries)).toHaveLength(attackers.length);
    for (const { entries, tier } of groups) {
      expect(entries.every((p) => p.tier === tier)).toBe(true);
      expect(entries.every((p, i) => i === 0 || p.score <= entries[i - 1]!.score)).toBe(true);
    }
    for (const p of groups.flatMap((g) => g.entries)) expect(attackers).toContain(p);
  });

  it('filtros', () => {
    const names = (f: Partial<AttackerFilters>) => filterRocketAttackers(attackers, { ...NONE, ...f }, tr).flatMap((g) => g.entries);
    expect(names({ type: 'fighting' }).every((p) => p.chargedType === 'fighting')).toBe(true);
    expect(names({ mega: 'without' }).some((p) => p.groups.includes('mega'))).toBe(false);
    expect(names({ shadow: 'only' }).every((p) => p.groups.includes('shadow'))).toBe(true);
    expect(names({ search: 'machamp oscuro' }).map((p) => p.name)).toEqual(['Machamp (Shadow)']);
    expect(countRocketTiers(attackers).get('S+')).toBe(attackers.filter((p) => p.tier === 'S+').length);
  });
});

describe('opciones con ventaja de tipo', () => {
  const rivalTypes = [...new Set(trainers().flatMap((t) => t.slots.flatMap((s) => s.options.map((p) => rivalSpecies(p, species, tr).types.join()))))].map((t) => t.split(','));

  it('siempre ataque cargado eficaz, rápido no resistido y buena valoración general', () => {
    for (const types of rivalTypes) {
      for (const group of suggestionsFor(types, attackers, tr)) {
        expect(group.multiplier).toBeGreaterThan(1.5);
        for (const s of group.entries) {
          expect(s.attacker.chargedType).toBe(group.type);
          expect(s.charged).toBe(effectiveness(s.attacker.chargedType, types));
          expect(s.fast).toBe(effectiveness(s.attacker.fastType, types));
          expect(s.fast).toBeGreaterThan(0.99);
          expect(['S+', 'S', 'A']).toContain(s.attacker.tier);
        }
      }
    }
  });

  it('no altera al atacante ni añade puntuaciones propias', () => {
    const [group] = suggestionsFor(['rock', 'dark'], attackers, tr);
    for (const s of group!.entries) {
      expect(attackers).toContain(s.attacker);
      expect(Object.keys(s).sort()).toEqual(['attacker', 'charged', 'fast']);
    }
  });

  it('los grupos van por debilidad y, dentro, por la puntuación original', () => {
    const groups = suggestionsFor(['rock', 'dark'], attackers, tr);
    expect(groups[0]).toMatchObject({ type: 'fighting', multiplier: expect.closeTo(2.56) });
    expect(
      groups.every((g, i) => {
        const before = groups[i - 1];
        if (!before || g.multiplier < before.multiplier) return true;
        return g.multiplier === before.multiplier && g.entries[0]!.attacker.score <= before.entries[0]!.attacker.score;
      }),
    ).toBe(true);
    for (const { entries } of groups) {
      expect(entries.every((s, i) => i === 0 || s.attacker.score <= entries[i - 1]!.attacker.score)).toBe(true);
    }
  });

  it('no sugiere a quien depende de un ataque rápido resistido', () => {
    // Mega-Mewtwo X ataca con Confusión: contra un tipo Siniestro no vale, aunque su cargado sea eficaz.
    const mewtwo = attackers.find((p) => p.name === 'Mewtwo (Mega X)')!;
    expect(mewtwo).toMatchObject({ fastType: 'psychic', chargedType: 'fighting' });
    const all = suggestionsFor(['rock', 'dark'], attackers, tr).flatMap((g) => g.entries.map((s) => s.attacker));
    expect(all).not.toContain(mewtwo);
  });

  it('no sugiere a quien es débil a un tipo del rival, aunque ataque bien', () => {
    const garchomp = attackers.find((p) => p.name === 'Garchomp (Mega)')!;
    expect(isExposed(garchomp, ['dragon', 'electric'])).toBe(true);
    // Contra Cubone, que no es de tipo Dragón, la debilidad no cuenta.
    expect(isExposed(garchomp, ['ground'])).toBe(false);
    for (const types of rivalTypes) {
      for (const { attacker } of suggestionsFor(types, attackers, tr).flatMap((g) => g.entries)) {
        for (const type of types) expect(effectiveness(type, attacker.types), attacker.name).toBeLessThan(1.01);
      }
    }
  });

  it('primero, unas pocas especies distintas de los tipos que más convienen', () => {
    for (const types of rivalTypes) {
      const groups = suggestionsFor(types, attackers, tr);
      const featured = featuredSuggestions(groups);
      const shown = featured.flatMap((g) => g.entries);
      expect(shown.length).toBeLessThanOrEqual(6);
      if (groups.length > 0) expect(shown.length).toBeGreaterThan(0);
      expect(new Set(shown.map((s) => s.attacker.dex)).size).toBe(shown.length);
      expect(featured[0]?.multiplier).toBe(groups[0]?.multiplier);
      for (const s of shown) expect(groups.flatMap((g) => g.entries)).toContain(s);
    }
  });

  it('con pocas opciones o sin tipos no sugiere nada', () => {
    expect(suggestionsFor([], attackers, tr)).toEqual([]);
    expect(suggestionsFor(['desconocido'], attackers, tr)).toEqual([]);
    const fighters = attackers.filter((p) => p.chargedType === 'fighting' && p.fastType === 'fighting');
    // Las variantes de una misma especie no cuentan como opciones distintas.
    const one = fighters[0]!;
    const variants = Array.from({ length: 10 }, (_, i): RocketAttacker => ({ ...one, name: `${one.name} ${i}` }));
    expect(suggestionsFor(['normal'], variants, tr)).toEqual([]);
    const different = Array.from({ length: MIN_SUGGESTIONS }, (_, i): RocketAttacker => ({ ...one, name: `P${i}`, dex: i + 1 }));
    expect(suggestionsFor(['normal'], different, tr)[0]!.entries).toHaveLength(MIN_SUGGESTIONS);
  });

  it('los filtros solo quitan', () => {
    const groups = suggestionsFor(['rock', 'dark'], attackers, tr);
    const filtered = filterSuggestions(groups, { mega: 'without', shadow: 'without', legendary: 'without' });
    expect(filtered.flatMap((g) => g.entries).every((s) => s.attacker.groups.length === 0)).toBe(true);
    expect(filtered.length).toBeLessThanOrEqual(groups.length);
  });

  it('con el archivo publicado, casi todos los rivales tienen opciones', () => {
    const full = toRocketAttackers(JSON.parse(readFileSync('public/data/rocket.json', 'utf8'))).pokemon;
    const covered = rivalTypes.filter((types) => suggestionsFor(types, full, tr).length > 0);
    expect(covered.length / rivalTypes.length).toBeGreaterThan(0.95);
  });
});

const LIMITS = { minRecords: 1, unmatched: 0.1, doubtful: 0.1 };
const make = (edit: (r: any) => void = () => {}) => {
  const r = fixtures.rocketRaw();
  edit(r);
  return build(r.dataset, r.gamemaster, LIMITS);
};
const record = (r: any, id: string) => r.dataset.records.find((x: any) => x.canonical_id === id);

describe('generador', () => {
  it('cada ficha se publica o se omite con un motivo', () => {
    const { coverage, file } = make();
    const omitted = Object.values(coverage.omitted).flat();
    expect(coverage.published + omitted.length).toBe(coverage.records);
    expect(coverage.omitted.gigantamax).toEqual(['pm_0003_gmax']);
    expect(coverage.omitted.unavailable).toEqual(['pm_0235_normal']);
    expect(coverage.omitted.unmatched).toEqual(['pm_0263_shadow']);
    expect(coverage.omitted.unreleased).toEqual(['pm_0036_mega', 'pm_0681_blade']);
    // La fuente da un tipo distinto del que tiene ese movimiento: no se publica.
    expect(coverage.omitted.doubtfulMoves).toEqual(['pm_0649_normal']);
    expect(file.pokemon.map((p) => p.name)).toContain('Machamp (Shadow)');
  });

  it('conserva sin cambios tier, puntuación y movimientos', () => {
    const { file } = make();
    const { rocket } = record(fixtures.rocketRaw(), 'pm_0068_shadow');
    expect(file.pokemon.find((p) => p.name === 'Machamp (Shadow)')).toEqual({
      name: 'Machamp (Shadow)',
      dex: 68,
      types: ['fighting'],
      groups: ['shadow'],
      tier: rocket.tier,
      score: rocket.score,
      fast: rocket.recommendation.fast_name_en,
      fastType: 'fighting',
      charged: rocket.recommendation.charge_name_en,
      chargedType: 'fighting',
    });
  });

  it('cita la fuente y dice qué se ha transformado', () => {
    const { source, changes } = make().file;
    expect(source).toMatchObject({ name: 'doctorpokegogo.com', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' });
    expect(changes).toContain('no se han modificado');
  });

  it.each([
    ['otra licencia', (r: any) => (r.dataset.meta.license = 'https://example.org/')],
    ['otra versión', (r: any) => (r.dataset.meta.schema_version = 4)],
    ['fichas que faltan', (r: any) => (r.dataset.meta.record_count = 999)],
    ['un tier desconocido', (r: any) => (record(r, 'pm_0068_normal').rocket.tier = 'Z')],
    ['sin puntuación', (r: any) => delete record(r, 'pm_0068_normal').rocket.score],
    ['otra tabla de tipos', (r: any) => record(r, 'pm_0068_normal').type_effectiveness.weaknesses.pop()],
    ['Gigamax distinto', (r: any) => (record(r, 'pm_0003_gmax').rocket.score += 1)],
  ])('rechaza el dataset con %s', (_, edit) => expect(() => make(edit)).toThrow(DataError));

  it('demasiadas fichas omitidas indican un cambio en la fuente', () => {
    const r = fixtures.rocketRaw();
    expect(() => build(r.dataset, r.gamemaster, { ...LIMITS, unmatched: 0.02 })).toThrow(/sin pareja/);
    expect(() => build(r.dataset, r.gamemaster, { ...LIMITS, doubtful: 0.01 })).toThrow(/dudosos/);
    expect(() => build(r.dataset, r.gamemaster)).toThrow(/faltan fichas/);
  });

  it('no acepta una caída brusca ni datos más antiguos', () => {
    const { file } = make();
    expect(() => checkAgainst(null, file)).not.toThrow();
    expect(() => checkAgainst(file, { ...file, pokemon: file.pokemon.slice(0, 3) })).toThrow(/menos atacantes/);
    const older = { ...file, source: { ...file.source, generatedAt: '2020-01-01T00:00:00Z' } };
    expect(() => checkAgainst(file, older)).toThrow(/más antiguo/);
  });

  it('solo hay cambios si cambia el contenido; la fecha se renueva de vez en cuando', () => {
    const { file } = make();
    const stamped = (generatedAt: string) => ({ ...file, source: { ...file.source, generatedAt, version: 'otra' } });
    const start = Date.parse(file.source.generatedAt);
    const after = (days: number) => stamped(new Date(start + days * 86_400_000).toISOString());
    expect(needsUpdate(null, file)).toBe(true);
    expect(needsUpdate(file, after(1))).toBe(false);
    expect(needsUpdate(file, after(31))).toBe(true);
    const [first, ...rest] = file.pokemon;
    expect(needsUpdate(file, { ...after(1), pokemon: [{ ...first!, score: first!.score + 1 }, ...rest] })).toBe(true);
  });

  it('no incluye formas que solo aparecen a mitad de un combate', () => {
    const names = (JSON.parse(readFileSync('public/data/rocket.json', 'utf8')).pokemon as RocketAttacker[]).map((p) => p.name);
    for (const form of ['Minior (Core)', 'Aegislash (Blade)', 'Darmanitan (Zen)', 'Morpeko (Hangry)', 'Mimikyu (Busted)', 'Meloetta (Pirouette)']) {
      expect(names).not.toContain(form);
    }
  });

  it('el archivo publicado es válido y está bien formado', () => {
    const text = readFileSync('public/data/rocket.json', 'utf8').replace(/\r\n/g, '\n');
    const data = JSON.parse(text);
    expect(serialize(data)).toBe(text);
    const { pokemon } = toRocketAttackers(data);
    expect(pokemon.length).toBeGreaterThan(1500);
    for (const p of pokemon) for (const type of [...p.types, p.fastType, p.chargedType]) expect(TYPES).toHaveProperty(type);
  });
});

describe('lectura del resumen', () => {
  it('rechaza un archivo cortado o repetido', () => {
    const raw = fixtures.rocketAttackers();
    expect(() => toRocketAttackers({ ...raw, pokemon: raw.pokemon.slice(0, 10) })).toThrow(/faltan/);
    expect(() => toRocketAttackers({ ...raw, pokemon: [...raw.pokemon, raw.pokemon[0]] })).toThrow(/repetidos/);
    expect(() => toRocketAttackers({ ...raw, format: 2 })).toThrow(/estructura/);
  });
});
