import type { z } from 'zod';
import type { SpriteIndex } from '../domain/sprites';
import { leekDuckUrl, normalize, plainText } from '../domain/text';
import { tierOf } from '../domain/tiers';
import type { CountersTarget } from './config';
import { SourceError } from './errors';
import type {
  Counter,
  CountersData,
  CpRange,
  Featured,
  GameEvent,
  PokebattlerBosses,
  PvpEntry,
  PvpMove,
  RaidBoss,
  Species,
  Translations,
} from './models';
import { counters, gamemaster, locale, parseList, parseWith, pokebattler, raidBoss, rankingEntry, rawEvent } from './schemas';

type Gamemaster = z.infer<typeof gamemaster>;

export const parseGamemaster = (raw: unknown): Gamemaster =>
  parseWith(gamemaster, raw, 'los datos de Pokémon de PvPoke');

/** Menos entradas que estas indican un archivo cortado (la liga más corta tiene unas 400). */
const MIN_RANKING = 100;

/**
 * El puesto es la posición en el archivo, así que debe llegar ordenado. Entre los Pokémon con tier
 * no se tolera ningún registro defectuoso: un hueco falsearía la lista. Por debajo se omite y se cuenta.
 */
export function toRanking(raw: unknown, gm: Gamemaster, league: string): { entries: PvpEntry[]; discarded: number } {
  const what = `la clasificación de ${league}`;
  const { items } = parseList(rankingEntry, raw, what, 0.05);
  if (items.length < MIN_RANKING) throw new SourceError('format', `En ${what} faltan Pokémon`);
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

/** Nombre, número y tipos de cada forma, para identificar a los Pokémon de otras fuentes. */
export const toSpecies = (gm: Gamemaster): Record<string, Species> =>
  Object.fromEntries(
    gm.pokemon.map((p): [string, Species] => [
      p.speciesId,
      { name: p.speciesName, dex: p.dex, types: p.types.filter((t) => t !== 'none') },
    ]),
  );

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
  const candidates = new Map<string, { en: string; es: Set<string> }>();
  for (const [key, english] of Object.entries(en)) {
    const spanish = es[key];
    if (typeof english !== 'string' || typeof spanish !== 'string' || !english || !spanish) continue;
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
  return { pokemon, moves };
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
