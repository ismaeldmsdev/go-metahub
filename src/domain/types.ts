/** Tabla de tipos del juego: qué tipos atacantes son eficaces, poco eficaces o casi inútiles contra cada defensor. */
const DEFENSE: Record<string, { weak: string; resists: string; immune?: string }> = {
  normal: { weak: 'fighting', resists: '', immune: 'ghost' },
  fighting: { weak: 'flying psychic fairy', resists: 'rock bug dark' },
  flying: { weak: 'rock electric ice', resists: 'fighting bug grass', immune: 'ground' },
  poison: { weak: 'ground psychic', resists: 'fighting poison bug grass fairy' },
  ground: { weak: 'water grass ice', resists: 'poison rock', immune: 'electric' },
  rock: { weak: 'fighting ground steel water grass', resists: 'normal flying poison fire' },
  bug: { weak: 'flying rock fire', resists: 'fighting ground grass' },
  ghost: { weak: 'ghost dark', resists: 'poison bug', immune: 'normal fighting' },
  steel: {
    weak: 'fighting ground fire',
    resists: 'normal flying rock bug steel grass psychic ice dragon fairy',
    immune: 'poison',
  },
  fire: { weak: 'ground rock water', resists: 'bug steel fire grass ice fairy' },
  water: { weak: 'grass electric', resists: 'steel fire water ice' },
  grass: { weak: 'flying poison bug fire ice', resists: 'ground water grass electric' },
  electric: { weak: 'ground', resists: 'flying steel electric' },
  psychic: { weak: 'bug ghost dark', resists: 'fighting psychic' },
  ice: { weak: 'fighting rock steel fire', resists: 'ice' },
  dragon: { weak: 'ice dragon fairy', resists: 'fire water grass electric' },
  dark: { weak: 'fighting bug fairy', resists: 'ghost dark', immune: 'psychic' },
  fairy: { weak: 'poison steel', resists: 'fighting bug dark', immune: 'dragon' },
};

const has = (list: string | undefined, type: string): boolean => list?.split(' ').includes(type) ?? false;

/** Multiplicador de Pokémon GO: 1,6 por debilidad, 0,625 por resistencia y 0,390625 por inmunidad. */
export function effectiveness(attack: string, defender: string[]): number {
  return defender.reduce((total, type) => {
    const chart = DEFENSE[type];
    if (has(chart?.weak, attack)) return total * 1.6;
    if (has(chart?.resists, attack)) return total * 0.625;
    if (has(chart?.immune, attack)) return total * 0.390625;
    return total;
  }, 1);
}

export interface Weakness {
  type: string;
  multiplier: number;
}

/** De mayor a menor. Vacía si algún tipo no se reconoce: mejor callar que dar datos incompletos. */
export function weaknesses(defender: string[]): Weakness[] {
  if (defender.length === 0 || defender.some((type) => !DEFENSE[type])) return [];
  return Object.keys(DEFENSE)
    .map((type) => ({ type, multiplier: effectiveness(type, defender) }))
    .filter(({ multiplier }) => multiplier > 1.01)
    .sort((a, b) => b.multiplier - a.multiplier);
}
