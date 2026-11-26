/** Conserva el «+», que distingue variantes de un mismo movimiento. */
export const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(/[^a-z0-9+]/g, '');

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Los textos se extraen de HTML: se quitan etiquetas y entidades. Siempre se pintan como texto. */
export const plainText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (match: string, dec?: string, hex?: string, name?: string) => {
      if (name) return ENTITIES[name.toLowerCase()] ?? match;
      const code = dec ? Number(dec) : parseInt(hex ?? '', 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/\s+/g, ' ')
    .trim();

/** Solo se enlazan recursos https de LeekDuck, de donde proceden los datos. */
export function leekDuckUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const ok = url.protocol === 'https:' && /^(?:[\w-]+\.)?leekduck\.com$/.test(url.hostname);
    return ok ? url.href : null;
  } catch {
    return null;
  }
}

/** Número de Pokédex de una imagen de LeekDuck («pm25.fGOFEST….icon.png», «pokemon_icon_488_00.png»). */
export const dexFromImage = (url: string | null): number | null => {
  const match = /\/(?:pm|pokemon_icon_)0*(\d+)[._]/.exec(url ?? '');
  return match ? Number(match[1]) : null;
};
