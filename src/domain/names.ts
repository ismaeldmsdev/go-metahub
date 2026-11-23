import type { PvpMove, Translations } from '../data/models';
import { normalize } from './text';

/*
 * Los nombres de Pokémon y movimientos llegan de la fuente de traducciones.
 * Aquí solo hay términos contrastados con los textos en español del juego.
 * Lo que no esté en estas listas se muestra en su idioma original.
 */

export const TYPES: Record<string, string> = {
  normal: 'Normal',
  fighting: 'Lucha',
  flying: 'Volador',
  poison: 'Veneno',
  ground: 'Tierra',
  rock: 'Roca',
  bug: 'Bicho',
  ghost: 'Fantasma',
  steel: 'Acero',
  fire: 'Fuego',
  water: 'Agua',
  grass: 'Planta',
  electric: 'Eléctrico',
  psychic: 'Psíquico',
  ice: 'Hielo',
  dragon: 'Dragón',
  dark: 'Siniestro',
  fairy: 'Hada',
};

export const typeName = (type: string): string => TYPES[type] ?? type;

const WEATHER: Record<string, string> = {
  sunny: 'Despejado',
  clear: 'Despejado',
  sunnyclear: 'Despejado',
  rainy: 'Lluvioso',
  partlycloudy: 'Parcialmente nublado',
  partly: 'Parcialmente nublado',
  cloudy: 'Cielo cubierto',
  windy: 'Viento',
  snow: 'Nieve',
  fog: 'Niebla',
  foggy: 'Niebla',
};

export const weatherName = (weather: string): string => WEATHER[normalize(weather)] ?? weather;

/** Formas cuyo nombre no depende del Pokémon. */
const FORMS: Record<string, string> = {
  altered: 'Forma Modificada',
  origin: 'Forma Origen',
  incarnate: 'Forma Avatar',
  therian: 'Forma Tótem',
  resolute: 'Forma Brío',
  ordinary: 'Forma Habitual',
  aria: 'Forma Lírica',
  pirouette: 'Forma Danza',
  land: 'Forma Tierra',
  sky: 'Forma Cielo',
  attack: 'Forma Ataque',
  defense: 'Forma Defensa',
  speed: 'Forma Velocidad',
  'complete forme': 'Forma Completa',
  '50% forme': 'Forma 50%',
  '10% forme': 'Forma 10%',
  busted: 'Forma Descubierta',
  disguised: 'Forma Encubierta',
  'dawn wings': 'Alas del Alba',
  'dusk mane': 'Melena Crepuscular',
  'crowned sword': 'Espada Suprema',
  'crowned shield': 'Escudo Supremo',
  blade: 'Forma Filo',
  shield: 'Forma Escudo',
  amped: 'Forma Aguda',
  'low key': 'Forma Grave',
  gorging: 'Forma Engulletodo',
  gulping: 'Forma Tragatodo',
  'full belly': 'Forma Saciada',
  hangry: 'Forma Voraz',
  'rapid strike': 'Estilo Fluido',
  'single strike': 'Estilo Brusco',
  curly: 'Forma Curvada',
  droopy: 'Forma Lánguida',
  stretchy: 'Forma Recta',
  midday: 'Forma Diurna',
  midnight: 'Forma Nocturna',
  dusk: 'Forma Crepuscular',
  school: 'Forma Banco',
  solo: 'Forma Individual',
  baile: 'Estilo Apasionado',
  "pa'u": 'Estilo Plácido',
  'pom-pom': 'Estilo Animado',
  sensu: 'Estilo Refinado',
  noice: 'Cara Deshielo',
  aqua: 'Variedad Acuática',
  blaze: 'Variedad Ardiente',
  combat: 'Variedad Combatiente',
  female: 'Hembra',
  male: 'Macho',
};

/** Formas que significan cosas distintas según el Pokémon. */
const SPECIES_FORMS: Record<string, string> = {
  '386:normal': 'Forma Normal',
  '888:hero': 'Guerrero Avezado',
  '889:hero': 'Guerrero Avezado',
  '351:rainy': 'Forma Lluvia',
  '351:snowy': 'Forma Nieve',
  '351:sunny': 'Forma Sol',
  '421:overcast': 'Forma Encapotado',
  '421:sunshine': 'Forma Soleado',
  '555:standard': 'Modo Normal',
  '555:zen': 'Modo Daruma',
  '412:plant': 'Tronco Planta',
  '412:sandy': 'Tronco Arena',
  '412:trash': 'Tronco Basura',
  '413:plant': 'Tronco Planta',
  '413:sandy': 'Tronco Arena',
  '413:trash': 'Tronco Basura',
  '710:average': 'Tamaño Normal',
  '710:large': 'Tamaño Grande',
  '710:small': 'Tamaño Pequeño',
  '710:super': 'Tamaño Extragrande',
  '711:average': 'Tamaño Normal',
  '711:large': 'Tamaño Grande',
  '711:small': 'Tamaño Pequeño',
  '711:super': 'Tamaño Extragrande',
  '774:meteor': 'Forma Meteorito',
  '649:burn': 'PiroROM',
  '649:chill': 'CrioROM',
  '649:douse': 'HidroROM',
  '649:shock': 'FulgoROM',
};

/** Combinaciones con nombre propio completo. */
const FULL_NAMES: Record<string, string> = {
  '646:black': 'Kyurem Negro',
  '646:white': 'Kyurem Blanco',
  '800:ultra': 'Ultra-Necrozma',
  '720:confined': 'Hoopa Contenido',
  '720:unbound': 'Hoopa Desatado',
  '479:fan': 'Rotom Ventilador',
  '479:frost': 'Rotom Frío',
  '479:heat': 'Rotom Calor',
  '479:mow': 'Rotom Corte',
  '479:wash': 'Rotom Lavado',
  '382:primal': 'Kyogre Primigenio',
  '383:primal': 'Groudon Primigenio',
};

const REGIONS: Record<string, string> = {
  alolan: 'Alola',
  galarian: 'Galar',
  hisuian: 'Hisui',
  paldean: 'Paldea',
};

export interface PokemonLabel {
  name: string;
  /** Forma, en español si se conoce y si no en su idioma original. */
  form: string | null;
  shadow: boolean;
  /** El nombre no se ha podido traducir con seguridad. */
  untranslated: boolean;
}

function applyForms(base: string, dex: number, forms: string[]): Omit<PokemonLabel, 'untranslated'> {
  const label = { name: base, form: null as string | null, shadow: false };
  const rest: string[] = [];
  for (const form of forms) {
    const key = form.toLowerCase();
    const mega = /^mega(?: ([xyz]))?$/i.exec(form);
    if (key === 'shadow') label.shadow = true;
    else if (REGIONS[key]) label.name = `${label.name} de ${REGIONS[key]}`;
    else if (mega) label.name = `Mega-${label.name}${mega[1] ? ` ${mega[1].toUpperCase()}` : ''}`;
    else if (FULL_NAMES[`${dex}:${key}`]) label.name = FULL_NAMES[`${dex}:${key}`]!;
    else rest.push(SPECIES_FORMS[`${dex}:${key}`] ?? FORMS[key] ?? form);
  }
  if (rest.length > 0) label.form = rest.join(', ');
  return label;
}

/** PvPoke escribe las formas entre paréntesis: «Giratina (Altered) (Shadow)». */
export function pvpLabel(entry: { name: string; dex: number }, tr: Translations | undefined): PokemonLabel {
  const forms = [...entry.name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!);
  const english = entry.name.replace(/\s*\([^)]*\)/g, '').trim();
  const spanish = tr?.pokemon[entry.dex]?.es;
  return { ...applyForms(spanish ?? english, entry.dex, forms), untranslated: spanish === undefined };
}

export interface ParsedBoss {
  base: string;
  shadow: boolean;
  /** Formas en inglés tal como las nombra la fuente. */
  forms: string[];
}

/** LeekDuck antepone región, mega o «Shadow»: «Shadow Tornadus (Incarnate)», «Mega Charizard X». */
export function parseBossName(name: string): ParsedBoss {
  const forms = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!);
  let base = name.replace(/\s*\([^)]*\)/g, '').trim();
  let shadow = false;
  for (;;) {
    const prefix = /^(Shadow|Mega|Primal|Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/i.exec(base);
    if (!prefix) break;
    const word = prefix[1]!.toLowerCase();
    base = prefix[2]!;
    if (word === 'shadow') shadow = true;
    else if (word === 'mega') {
      const letter = /^(.+) ([XYZ])$/.exec(base);
      if (letter) base = letter[1]!;
      forms.push(letter ? `Mega ${letter[2]}` : 'Mega');
    } else forms.push(word[0]!.toUpperCase() + word.slice(1));
  }
  return { base, shadow, forms };
}

/** Solo traduce si la especie reconocida coincide con el número de Pokédex. */
export function bossLabel(boss: { name: string; dex: number | null }, tr: Translations | undefined): PokemonLabel {
  const parsed = parseBossName(boss.name);
  const known = boss.dex === null ? undefined : tr?.pokemon[boss.dex];
  if (boss.dex === null || !known || normalize(known.en) !== normalize(parsed.base)) {
    return { name: boss.name, form: null, shadow: parsed.shadow, untranslated: true };
  }
  return { ...applyForms(known.es, boss.dex, parsed.forms), shadow: parsed.shadow, untranslated: false };
}

/** Movimientos cuyo tipo cambia: en el juego comparten nombre, así que se añade el tipo. */
const TYPED_MOVE = /^(Weather Ball|Techno Blast|Hidden Power) \(\w+\)$/;

export function moveName(move: Pick<PvpMove, 'name' | 'type'>, tr: Translations | undefined): string {
  const exact = tr?.moves[normalize(move.name)];
  if (exact) return exact;
  const family = TYPED_MOVE.exec(move.name)?.[1];
  const translated = family && tr?.moves[normalize(family)];
  return translated ? `${translated} (${typeName(move.type)})` : move.name;
}

const EVENT_TYPES: Record<string, string> = {
  event: 'Evento',
  'community-day': 'Día de la Comunidad',
  'raid-hour': 'Hora de Incursiones',
  'raid-day': 'Día de Incursiones',
  'raid-battles': 'Incursiones',
  'elite-raids': 'Incursiones Élite',
  'pokemon-spotlight-hour': 'Hora del Pokémon Destacado',
  'go-battle-league': 'Liga Combates GO',
  'max-battles': 'Combates Max',
  'timed-research': 'Investigación temporal',
  'special-research': 'Investigación especial',
  research: 'Investigación',
  season: 'Temporada',
  'go-pass': 'Pase de GO',
  'pokemon-go-fest': 'Festival de Pokémon GO',
  'pokestop-showcase': 'Exhibición de Poképarada',
  'city-safari': 'Safari de ciudad',
  update: 'Actualización',
};

export const eventTypeName = (event: { type: string; heading: string }): string =>
  EVENT_TYPES[event.type] ?? event.heading;
