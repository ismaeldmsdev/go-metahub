import type { GameEvent, PokebattlerBosses, RaidBoss } from '../data/models';
import { parseBossName } from './names';
import { normalize } from './text';

export interface RaidGroup {
  key: string;
  title: string;
  shadow: boolean;
  bosses: RaidBoss[];
}

/** Los niveles desconocidos conservan el texto de la fuente y van al final. */
function tierInfo(boss: RaidBoss): { title: string; order: number } {
  const stars = /^(?:Tier\s*)?(\d)(?:-Star)?(?:\s+(?:Shadow\s+)?Raids?)?$/i.exec(boss.tier)?.[1];
  if (stars) {
    const plural = stars === '1' ? 'estrella' : 'estrellas';
    return { title: `${stars} ${plural}`, order: Number(stars) };
  }
  if (/^Mega(?:\s+Raids?)?$/i.test(boss.tier)) return { title: 'Megaincursiones', order: 10 };
  if (/^Elite(?:\s+Raids?)?$/i.test(boss.tier)) return { title: 'Incursiones Élite', order: 11 };
  return { title: boss.tier || 'Nivel no indicado', order: 20 };
}

export function groupRaids(bosses: RaidBoss[]): RaidGroup[] {
  const groups = new Map<string, RaidGroup & { order: number }>();
  for (const boss of bosses) {
    const { title, order } = tierInfo(boss);
    const key = `${boss.shadow ? 'shadow-' : ''}${title}`;
    const group = groups.get(key) ?? {
      key,
      title: boss.shadow ? `Oscuras · ${title}` : title,
      shadow: boss.shadow,
      bosses: [],
      order: order + (boss.shadow ? 100 : 0),
    };
    group.bosses.push(boss);
    groups.set(key, group);
  }
  // Lo más buscado primero: mega y cinco estrellas antes que los niveles bajos.
  const rank = (o: number) => (o >= 100 ? 100 : 0) - (o % 100 === 20 ? -50 : o % 100);
  return [...groups.values()].sort((a, b) => rank(a.order) - rank(b.order));
}

export const isShadowRotation = (event: GameEvent): boolean =>
  /\bshadow\b/i.test(`${event.name} ${event.id.replace(/-/g, ' ')}`);

export function rotationIncludes(event: GameEvent, boss: Pick<RaidBoss, 'name' | 'shadow'>): boolean {
  if (isShadowRotation(event) !== boss.shadow) return false;
  const name = normalize(boss.name.replace(/^shadow\s+/i, ''));
  return event.raidBosses.some((other) => normalize(other.replace(/^shadow\s+/i, '')) === name);
}

const POKEBATTLER = 'https://www.pokebattler.com/raids';
const REGION_IDS: Record<string, string> = { Alolan: 'ALOLA', Galarian: 'GALARIAN', Hisuian: 'HISUIAN', Paldean: 'PALDEA' };
/** Pokébattler omite a veces estas formas porque son las habituales de su especie. */
const DEFAULT_FORMS = new Set(['Incarnate', 'Altered', 'Ordinary', 'Normal', 'Land']);
const DEFAULT_FORM_ID = new RegExp(`^([A-Z0-9_]+?)_(?:${[...DEFAULT_FORMS].map((f) => f.toUpperCase()).join('|')})_FORM$`);

/**
 * Pokébattler responde a «DEOXYS_NORMAL_FORM» con «DEOXYS» (comprobado el 26-11-2026 también con
 * LANDORUS_INCARNATE_FORM y GIRATINA_ALTERED_FORM). Las formas alternativas conservan su identificador,
 * así que solo se admite este alias para las formas habituales de su especie.
 */
export function defaultFormAlias(id: string): string | null {
  return DEFAULT_FORM_ID.exec(id)?.[1] ?? null;
}

const toId = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’.]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

function candidateIds(boss: RaidBoss): string[] {
  const { base, shadow, forms } = parseBossName(boss.name);
  const id = toId(base);
  const suffix = shadow ? '_SHADOW_FORM' : '';
  if (forms.length === 0) return [id + suffix];
  if (forms.length > 1) return [];
  const form = forms[0]!;
  if (/^Mega\b/.test(form) || form === 'Primal') return [`${id}_${toId(form)}`];
  const region = REGION_IDS[form];
  const formId = region ?? toId(form);
  const exact = shadow ? `${id}_${formId}_SHADOW_FORM` : `${id}_${formId}_FORM`;
  return DEFAULT_FORMS.has(form) ? [exact, id + suffix] : [exact];
}

export interface CountersLink {
  url: string;
  /** El jefe exacto figura en la rotación actual de Pokébattler. */
  exact: boolean;
  /** Lo necesario para pedir sus counters, si figura con un único nivel. */
  target: { id: string; tier: string } | null;
}

/**
 * Pokébattler responde bien incluso a jefes inventados, así que solo se enlaza a una página
 * concreta si su identificador está en la lista que publica. Si no, a su índice de incursiones.
 */
export function countersLink(boss: RaidBoss, bosses: PokebattlerBosses | undefined): CountersLink {
  const id = candidateIds(boss).find((candidate) => bosses && Object.hasOwn(bosses, candidate));
  if (!id) return { url: POKEBATTLER, exact: false, target: null };
  const tier = bosses![id];
  return { url: `${POKEBATTLER}/${id}`, exact: true, target: tier ? { id, tier } : null };
}

/** Clasificación de Pokébattler de atacantes con algún movimiento de ese tipo. */
export const typeRankingUrl = (type: string): string => `${POKEBATTLER}/attackers/type/${type}`;

/** Identificador del jefe en las direcciones de la aplicación. */
export const bossSlug = (boss: Pick<RaidBoss, 'name'>): string => normalize(boss.name);
