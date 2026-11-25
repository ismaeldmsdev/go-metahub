import type { z } from 'zod';
import type { SpriteIndex } from '../domain/sprites';
import { eventStatus } from '../domain/events';
import { TYPES } from '../domain/names';
import { leekDuckUrl, normalize, plainText } from '../domain/text';
import { tierOf } from '../domain/tiers';
import type { CountersTarget } from './config';
import { SourceError } from './errors';
import type {
  ContrastPokemon,
  ContrastTrainer,
  Counter,
  CountersData,
  CpRange,
  Featured,
  FormatFilter,
  GameEvent,
  GymData,
  MaxBoss,
  PokebattlerBosses,
  PokebattlerData,
  PvpEntry,
  PvpFormat,
  PvpMove,
  RaidAttackersData,
  RaidBoss,
  RocketAttackersData,
  RocketSlot,
  RocketTrainer,
  SeasonWeek,
  Species,
  Translations,
} from './models';
import {
  contrastTrainer,
  counters,
  gamemaster,
  gyms,
  locale,
  parseList,
  parseWith,
  pokebattler,
  pokebattlerMax,
  pvpCup,
  pvpFormat,
  raidAttackers,
  raidBoss,
  rankingEntry,
  rawEvent,
  rocketAttackers,
  rocketList,
  rocketTrainer,
} from './schemas';

type Gamemaster = z.infer<typeof gamemaster>;

export const parseGamemaster = (raw: unknown): Gamemaster =>
  parseWith(gamemaster, raw, 'los datos de Pokémon de PvPoke');

/** Menos entradas que estas indican un archivo cortado (la liga más corta tiene unas 400). */
const MIN_RANKING = 100;

/**
 * El puesto es la posición en el archivo, así que debe llegar ordenado. Entre los Pokémon con tier
 * no se tolera ningún registro defectuoso: un hueco falsearía la lista. Por debajo se omite y se cuenta.
 */
export function toRanking(
  raw: unknown,
  gm: Gamemaster,
  league: string,
  minimum = MIN_RANKING,
): { entries: PvpEntry[]; discarded: number } {
  const what = `la clasificación de ${league}`;
  const { items } = parseList(rankingEntry, raw, what, 0.05);
  if (items.length < minimum) throw new SourceError('format', `En ${what} faltan Pokémon`);
  if (items.some((entry, i) => i > 0 && entry.score > items[i - 1]!.score)) {
    throw new SourceError('format', `En ${what} los puestos no llegan ordenados`);
  }
  const species = new Map(gm.pokemon.map((p) => [p.speciesId, p]));
  const moves = new Set(gm.moves.map((m) => m.moveId));
  const entries: PvpEntry[] = [];
  const skipped: number[] = [];
  let lastTiered = -1;
  (raw as unknown[]).forEach((value, i) => {
    const parsed = rankingEntry.safeParse(value);
    const pokemon = parsed.success ? species.get(parsed.data.speciesId) : undefined;
    if (parsed.success && tierOf(parsed.data.score)) lastTiered = i;
    if (!parsed.success || !pokemon || !parsed.data.moveset.every((id) => id === 'none' || moves.has(id))) {
      skipped.push(i);
      return;
    }
    const { speciesId, speciesName, score, moveset } = parsed.data;
    const list = moveset.filter((id) => id !== 'none');
    entries.push({
      rank: i + 1,
      id: speciesId,
      name: speciesName,
      dex: pokemon.dex,
      types: pokemon.types.filter((t) => t !== 'none'),
      score,
      moves: list,
      elite: list.filter((id) => pokemon.eliteMoves?.includes(id)),
    });
  });
  if (skipped.some((i) => i <= lastTiered)) {
    throw new SourceError('format', `En ${what} hay un registro incorrecto entre los Pokémon con tier`);
  }
  if (new Set(entries.map((e) => e.id)).size !== entries.length) {
    throw new SourceError('format', `En ${what} hay Pokémon repetidos`);
  }
  return { entries, discarded: skipped.length };
}

/** Solo los movimientos que aparecen en las clasificaciones. */
export function usedMoves(lists: PvpEntry[][], gm: Gamemaster): Record<string, PvpMove> {
  const used = new Set(lists.flat().flatMap((entry) => entry.moves));
  return Object.fromEntries(
    gm.moves
      .filter((m) => used.has(m.moveId))
      .map((m): [string, PvpMove] => [m.moveId, { name: m.name, type: m.type, fast: m.energyGain > 0 }]),
  );
}

/** Nombre, número, tipos y estadísticas de cada forma, para identificar a los Pokémon de otras fuentes. */
export function toSpecies(gm: Gamemaster): Record<string, Species> {
  const moveTypes = new Map(gm.moves.map((m) => [m.moveId, m.type]));
  return Object.fromEntries(
    gm.pokemon.map((p): [string, Species] => {
      const entry: Species = { name: p.speciesName, dex: p.dex, types: p.types.filter((t) => t !== 'none') };
      if (p.baseStats) entry.stats = p.baseStats;
      if (p.fastMoves) {
        // Con Poder Oculto, el ataque Max siempre es de tipo Normal.
        const types = p.fastMoves.map((id) => (id.startsWith('HIDDEN_POWER') ? 'normal' : moveTypes.get(id)));
        entry.fastTypes = [...new Set(types.filter((t): t is string => t !== undefined))];
      }
      return [p.speciesId, entry];
    }),
  );
}

const FILTER_KINDS = new Set(['type', 'tag', 'id', 'evolution']);

/** Copas y ligas Mega que PvPoke enseña. Si cambian de forma, se omiten sin afectar a las ligas. */
export function toFormats(gm: Gamemaster): PvpFormat[] {
  const list = <T>(schema: z.ZodType<T>, value: unknown): T[] =>
    (Array.isArray(value) ? value : []).flatMap((item) => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  const cups = new Map(list(pvpCup, gm.cups).map((cup) => [cup.name, cup]));
  const formats: PvpFormat[] = [];
  for (const { title, cup: id, cp, showCup, showFormat, hideRankings } of list(pvpFormat, gm.formats)) {
    const cup = cups.get(id);
    // Los ocultos son restos de temporadas pasadas o listas sin ranking propio.
    if (!cup || !(showCup && showFormat) || hideRankings || id === 'all' || id === 'custom') continue;
    const filters = (items: typeof cup.include): FormatFilter[] =>
      items
        .filter((f) => !f.leagues || f.leagues.includes(cp))
        .map((f) => ({
          kind: FILTER_KINDS.has(f.filterType) ? (f.filterType as FormatFilter['kind']) : 'other',
          values: f.values.map(String),
        }));
    formats.push({ title, cup: id, cp, include: filters(cup.include), exclude: filters(cup.exclude) });
  }
  return formats;
}

/** La copa más restrictiva que se espera tiene unas decenas de Pokémon. */
export const MIN_FORMAT = 20;

/**
 * Semanas de la Liga Combates GO. LeekDuck deja a veces de listar la que está en curso: si ya se conocía, se conserva
 * hasta que termine. Las futuras que desaparecen, no.
 */
export function toSeason(raw: unknown, previous: SeasonWeek[], now: number): SeasonWeek[] {
  const weeks = toEvents(raw)
    .data.filter((event) => event.type === 'go-battle-league')
    .map((event): SeasonWeek => {
      const [list = '', season = ''] = event.name.split(/\s*\|\s*/);
      const entries = list.split(/,\s*(?:and\s+)?|\s+and\s+/).map((entry) => entry.trim());
      const { id, start, end, link } = event;
      return { id, season, start, end, link, entries: entries.filter(Boolean) };
    });
  const known = new Set(weeks.map((week) => week.id));
  const kept = previous.filter((week) => !known.has(week.id) && eventStatus(week, now) === 'active');
  return [...kept, ...weeks];
}

const validRange = (range: CpRange): CpRange | null =>
  range.min > 0 && range.max >= range.min ? { min: range.min, max: range.max } : null;

const dexFromImage = (url: string): number | null => {
  const match = /\/(?:pm|pokemon_icon_)0*(\d+)[._]/.exec(url);
  return match ? Number(match[1]) : null;
};

export function toRaids(raw: unknown): { data: RaidBoss[]; discarded: number } {
  const { items, discarded } = parseList(raidBoss, raw, 'incursiones');
  const data = items.map((boss): RaidBoss => {
    const name = plainText(boss.name);
    return {
      name,
      tier: plainText(boss.tier),
      // La fuente no marca las oscuras en el nivel; solo se reconocen por el nombre.
      shadow: /^shadow\s/i.test(name) || /shadow/i.test(boss.tier),
      dex: dexFromImage(boss.image),
      types: boss.types.map((t) => t.name.toLowerCase()),
      shiny: boss.canBeShiny,
      cp: validRange(boss.combatPower.normal),
      boostedCp: validRange(boss.combatPower.boosted),
      weather: boss.boostedWeather.map((w) => w.name.toLowerCase()),
      image: leekDuckUrl(boss.image),
    };
  });
  return { data, discarded };
}

const toFeatured = (list: { name: string; image?: string | undefined }[]): Featured[] =>
  list.map((p) => ({ name: plainText(p.name), image: leekDuckUrl(p.image) }));

export function toEvents(raw: unknown): { data: GameEvent[]; discarded: number } {
  const { items, discarded } = parseList(rawEvent, raw, 'eventos');
  const data = items.map((event): GameEvent => {
    const { communityday, spotlight, raidbattles, generic } = event.extraData ?? {};
    const raidList = raidbattles?.bosses.length ? raidbattles.bosses : (raidbattles?.shinies ?? []);
    return {
      id: event.eventID,
      name: plainText(event.name),
      type: event.eventType,
      heading: plainText(event.heading),
      link: leekDuckUrl(event.link),
      image: leekDuckUrl(event.image),
      start: event.start,
      end: event.end,
      bonuses: [...(communityday?.bonuses.map((b) => b.text) ?? []), spotlight?.bonus ?? '']
        .map(plainText)
        .filter(Boolean),
      notes: communityday?.bonusDisclaimers.map(plainText).filter(Boolean) ?? [],
      featured: toFeatured(communityday?.spawns ?? spotlight?.list ?? raidbattles?.bosses ?? []),
      raidBosses: raidList.map((p) => plainText(p.name)),
      hasSpawns: generic?.hasSpawns ?? false,
      hasResearch: generic?.hasFieldResearchTasks ?? false,
    };
  });
  return { data, discarded };
}

export function toTranslations(rawEn: unknown, rawEs: unknown): Translations {
  const en = parseWith(locale, rawEn, 'las traducciones');
  const es = parseWith(locale, rawEs, 'las traducciones');
  const pokemon: Translations['pokemon'] = {};
  const trainers: Translations['trainers'] = {};
  const candidates = new Map<string, { en: string; es: Set<string> }>();
  for (const [key, english] of Object.entries(en)) {
    const spanish = es[key];
    if (typeof english !== 'string' || typeof spanish !== 'string' || !english || !spanish) continue;
    // «grunt_39» es el nombre; «grunt_quote_39», «grunt_quote_39_2»…, sus frases. Sin traducir no se usan.
    const trainer = /^grunt_(quote_)?(\d+)(_\d+)?$/.exec(key);
    if (trainer) {
      if (spanish === english) continue;
      const entry = (trainers[trainer[2]!] ??= { name: null, phrases: [] });
      const text = plainText(spanish);
      if (trainer[1]) {
        if (text && !entry.phrases.includes(text)) entry.phrases.push(text);
      } else if (!trainer[3]) entry.name = text || null;
      continue;
    }
    const dex = /^poke_(\d+)$/.exec(key)?.[1];
    if (dex) {
      pokemon[dex] = { en: english, es: spanish };
    } else if (/^move_\d+$/.test(key)) {
      const id = normalize(english);
      const entry = candidates.get(id) ?? { en: english, es: new Set<string>() };
      entry.es.add(spanish);
      candidates.set(id, entry);
    }
  }
  const moves: Record<string, string> = {};
  for (const [id, { en: english, es: options }] of candidates) {
    // Si hay dos textos, se descarta el que se quedó en inglés; si aún hay duda, no se traduce.
    const translated = options.size > 1 ? [...options].filter((o) => o !== english) : [...options];
    if (translated.length === 1) moves[id] = translated[0]!;
  }
  if (Object.keys(pokemon).length < 800 || Object.keys(moves).length < 200) {
    throw new SourceError('format', 'Faltan demasiadas traducciones en la fuente');
  }
  return { pokemon, moves, trainers };
}

const CURRENT_TIER = /^RAID_LEVEL_(?:[1-6]|MEGA|MEGA_5|ELITE|ULTRA_BEAST|[1-6]_SHADOW|[1-6]_MEGA_ENHANCED)$/;

export function toPokebattlerBosses(raw: unknown): PokebattlerBosses {
  const { tiers } = parseWith(pokebattler, raw, 'la lista de Pokébattler');
  const bosses: PokebattlerBosses = {};
  for (const { tier, raids } of tiers) {
    if (!CURRENT_TIER.test(tier)) continue;
    for (const { pokemon } of raids) bosses[pokemon] = pokemon in bosses && bosses[pokemon] !== tier ? null : tier;
  }
  if (Object.keys(bosses).length === 0) throw new SourceError('empty', 'Pokébattler no lista ningún jefe actual');
  return bosses;
}

const MAX_TIER = /^RAID_LEVEL_[1-6](?:_5)?_MAX$/;

/** Catálogo Max de la misma respuesta. Si cambia de forma, queda vacío sin afectar a los jefes de incursión. */
export function toPokebattlerData(raw: unknown): PokebattlerData {
  const raids = toPokebattlerBosses(raw);
  const parsed = pokebattlerMax.safeParse(raw);
  if (!parsed.success) return { raids, max: [], dynamax: [] };
  const bosses = new Map<string, MaxBoss>();
  for (const { tier, raids: list } of parsed.data.tiers) {
    if (!MAX_TIER.test(tier)) continue;
    for (const { pokemon: id } of list) {
      const known = bosses.get(id);
      bosses.set(id, { id, tier: known && known.tier !== tier ? null : tier });
    }
  }
  return { raids, max: [...bosses.values()], dynamax: [...new Set(parsed.data.dynamaxPokemon)] };
}

/** Un equipo de incursión son seis: con menos, la respuesta está incompleta. */
const MIN_COUNTERS = 6;

/**
 * Resultados ya calculados por Pokébattler, sin recalcular. Cada Pokémon lleva su mejor moveset según
 * el Estimator. Pokébattler responde también a jefes inexistentes: se exige que confirme el pedido.
 */
export function toCounters(raw: unknown, { id, tier }: Pick<CountersTarget, 'id' | 'tier'>): CountersData {
  const what = 'los counters de Pokébattler';
  const data = parseWith(counters, raw, what);
  const boss = data.attackers[0]!;
  if (boss.pokemonId !== id || data.filterValue !== id || boss.boss !== tier) {
    throw new SourceError('format', 'Pokébattler ha respondido con otro jefe');
  }
  const { defenders } = boss.randomMove;
  if (defenders.length === 0) throw new SourceError('empty', 'Pokébattler no tiene counters para este jefe');
  if (defenders.length < MIN_COUNTERS || new Set(defenders.map((d) => d.pokemonId)).size !== defenders.length) {
    throw new SourceError('format', `En ${what} faltan Pokémon o están repetidos`);
  }
  if (defenders.some((d) => Number(d.stats.level) !== 40)) {
    throw new SourceError('format', `En ${what} ha cambiado el nivel de los atacantes`);
  }
  const list = defenders.map(({ pokemonId, byMove }): Counter => {
    const best = byMove.reduce((a, b) => (b.result.estimator < a.result.estimator ? b : a));
    return {
      id: pokemonId,
      fast: best.move1,
      charged: best.move2,
      estimator: best.result.estimator,
      edps: best.result.edps,
      // La respuesta habla desde el jefe: el daño que recibe («tdi») es el que hace nuestro Pokémon.
      tdo: best.result.tdi,
    };
  });
  return { list: list.sort((a, b) => a.estimator - b.estimator), megaLevel: data.megaLevel };
}

/** Con menos que estos, el archivo está incompleto. */
const MIN_GYM = 50;

/** El resumen ya está validado al generarse; aquí se comprueba que ha llegado entero. */
export function toGyms(raw: unknown): GymData {
  const what = 'los datos de gimnasios';
  const { source, changes, pokemon } = parseWith(gyms, raw, what);
  if (pokemon.filter((p) => p.attack).length < MIN_GYM || pokemon.filter((p) => p.bulk !== null).length < MIN_GYM) {
    throw new SourceError('format', `En ${what} faltan Pokémon`);
  }
  if (new Set(pokemon.map((p) => p.name)).size !== pokemon.length) {
    throw new SourceError('format', `En ${what} hay Pokémon repetidos`);
  }
  return { source, changes, pokemon };
}

/** Con menos entrenadores que estos, la lista está incompleta (lo habitual son 26). */
const MIN_TRAINERS = 10;

const LEADERS: Record<string, string> = { GIOVANNI: 'Giovanni', CLIFF: 'Cliff', ARLO: 'Arlo', SIERRA: 'Sierra' };
/** El juego llama así a estos tipos en los reclutas. */
const GRUNT_TYPES: Record<string, string> = { metal: 'steel', darkness: 'dark' };

/** Alineaciones de WatWowMap: solo los entrenadores en activo. */
export function toRocket(raw: unknown): { data: RocketTrainer[]; discarded: number } {
  const what = 'las alineaciones del Team GO Rocket';
  const active = Object.entries(parseWith(rocketList, raw, what)).filter(([, trainer]) => trainer.active);
  if (active.length < MIN_TRAINERS) throw new SourceError('empty', `En ${what} faltan entrenadores`);
  const data: RocketTrainer[] = [];
  for (const [number, value] of active) {
    const parsed = rocketTrainer.safeParse(value);
    if (!parsed.success) continue;
    const { proto, type, grunt, gender: sex, encounters } = parsed.data;
    const slot = (list: typeof encounters.first, reward: boolean): RocketSlot => ({
      reward,
      options: list.map(({ id, template }) => ({ dex: id, form: template?.replace(/_NORMAL$/, '') ?? null })),
    });
    const id = Number(number);
    const leader = /_(GIOVANNI|CLIFF|ARLO|SIERRA)(?:_|$)/.exec(proto)?.[1];
    const gender = sex === 1 ? 'm' : sex === 2 ? 'f' : null;
    const known = GRUNT_TYPES[type.toLowerCase()] ?? type.toLowerCase();
    const typed = Object.hasOwn(TYPES, known);
    const isGrunt = !leader && grunt === 'Grunt' && (typed || known === 'mixed' || known === 'decoy');
    let key = leader ? leader.toLowerCase() : isGrunt ? `${known}-${gender ?? 'x'}` : `otro-${id}`;
    // Los de evento, o un tipo con dos nombres, no deben confundirse con los habituales.
    const event = leader !== undefined && grunt === 'Event';
    if (event || data.some((other) => other.key === key)) key += `-${id}`;
    data.push({
      id,
      key,
      kind: leader === 'GIOVANNI' ? 'giovanni' : leader ? 'leader' : isGrunt ? 'grunt' : 'other',
      name: leader ? LEADERS[leader]! + (event ? ' (evento)' : '') : plainText(type),
      type: isGrunt && typed ? known : null,
      gender,
      slots: [
        slot(encounters.first, parsed.data.firstReward),
        slot(encounters.second, parsed.data.secondReward),
        slot(encounters.third, parsed.data.thirdReward),
      ],
    });
  }
  const discarded = active.length - data.length;
  if (discarded / active.length > 0.2) throw new SourceError('format', `Demasiados registros incorrectos en ${what}`);
  return { data, discarded };
}

/** «Cliff», «Water-type Female Grunt», «Male Grunt», «Decoy Female Grunt». */
function contrastKey(name: string): string | null {
  if (/^(?:Giovanni|Cliff|Arlo|Sierra)$/.test(name)) return name.toLowerCase();
  const grunt = /^(?:(\w+)-type )?(Decoy )?(Male|Female) Grunt$/.exec(name);
  if (!grunt) return null;
  const type = grunt[1]?.toLowerCase() ?? (grunt[2] ? 'decoy' : 'mixed');
  return `${type}-${grunt[3] === 'Male' ? 'm' : 'f'}`;
}

/** Alineaciones de LeekDuck. Sin número de Pokédex no se pueden comparar, así que el entrenador se descarta. */
export function toRocketContrast(raw: unknown): { data: ContrastTrainer[]; discarded: number } {
  const what = 'alineaciones de LeekDuck';
  const { items, discarded } = parseList(contrastTrainer, raw, what);
  const data: ContrastTrainer[] = [];
  for (const { name, firstPokemon, secondPokemon, thirdPokemon } of items) {
    const slots = [firstPokemon, secondPokemon, thirdPokemon].map((list) =>
      list.flatMap((p): ContrastPokemon[] => {
        const dex = dexFromImage(p.image);
        return dex === null ? [] : [{ name: plainText(p.name), dex }];
      }),
    );
    if (slots.flat().length !== firstPokemon.length + secondPokemon.length + thirdPokemon.length) continue;
    const text = plainText(name);
    data.push({ key: contrastKey(text), name: text, slots: slots as ContrastTrainer['slots'] });
  }
  if (data.length < MIN_TRAINERS) throw new SourceError('format', `En la lista de ${what} faltan entrenadores`);
  return { data, discarded: discarded + items.length - data.length };
}

/** El resumen ya está validado al generarse; aquí se comprueba que ha llegado entero. */
export function toRocketAttackers(raw: unknown): RocketAttackersData {
  const what = 'los atacantes para Rocket';
  const { source, changes, pokemon } = parseWith(rocketAttackers, raw, what);
  if (pokemon.length < MIN_GYM) throw new SourceError('format', `En ${what} faltan Pokémon`);
  if (new Set(pokemon.map((p) => p.name)).size !== pokemon.length) {
    throw new SourceError('format', `En ${what} hay Pokémon repetidos`);
  }
  return { source, changes, pokemon };
}

/** El resumen ya está validado al generarse; aquí se comprueba que ha llegado entero. */
export function toRaidAttackers(raw: unknown): RaidAttackersData {
  const what = 'los atacantes de incursión';
  const { source, changes, pokemon } = parseWith(raidAttackers, raw, what);
  if (pokemon.length < MIN_GYM) throw new SourceError('format', `En ${what} faltan Pokémon`);
  if (new Set(pokemon.map((p) => p.name)).size !== pokemon.length) {
    throw new SourceError('format', `En ${what} hay Pokémon repetidos`);
  }
  return { source, changes, pokemon };
}

/** Lista de Pokémon de PokéAPI (CSV sin comillas): número de imagen, nombre y especie de cada forma. */
export function toSprites(raw: unknown): SpriteIndex {
  const what = 'la lista de imágenes';
  const [header = '', ...lines] = String(raw).trim().split(/\r?\n/);
  const columns = header.split(',');
  const at = (name: string) => columns.indexOf(name);
  const [id, identifier, species, isDefault] = ['id', 'identifier', 'species_id', 'is_default'].map(at) as [
    number, number, number, number,
  ];
  if ([id, identifier, species, isDefault].some((i) => i < 0)) {
    throw new SourceError('format', `La estructura de ${what} ha cambiado`);
  }
  const index: SpriteIndex = {};
  let valid = 0;
  for (const line of lines) {
    const cells = line.split(',');
    const form = { id: Number(cells[id]), name: cells[identifier] ?? '' };
    if (cells.length !== columns.length || !(form.id > 0) || !form.name || !(Number(cells[species]) > 0)) continue;
    valid += 1;
    const forms = (index[cells[species]!] ??= []);
    if (cells[isDefault] === '1') forms.unshift(form);
    else forms.push(form);
  }
  if (valid < 1000 || valid < lines.length * 0.95) throw new SourceError('format', `En ${what} faltan Pokémon`);
  return index;
}
