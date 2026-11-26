/**
 * Copias reales de las fuentes tomadas el 23 de noviembre de 2026 (recortadas donde se indica).
 * Las de gimnasios son de doctorpokegogo.com (CC BY 4.0), recortadas, del 22 de noviembre de 2026.
 * Las de Rocket son del 25 de noviembre de 2026: WatWowMap (MIT), LeekDuck a través de ScrapedDuck y doctorpokegogo.com
 * (CC BY 4.0), recortadas. Las frases son inventadas: las del juego no se copian al repositorio.
 * Las de copas e incursiones por tipo son del 25 de noviembre: PvPoke (MIT) y doctorpokegogo.com (CC BY 4.0), recortadas.
 * Las de Pokébattler son sintéticas: sus datos reales no deben subirse al repositorio sin su permiso.
 * Las del calendario de incursiones son de LeekDuck, del 26 de noviembre de 2026: el calendario completo, la lista y los
 * eventos de ScrapedDuck de ese día, y recortes de sus páginas de eventos y periodos con solo lo que lee la aplicación.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const load = (name: string): any => JSON.parse(readFileSync(resolve('tests/fixtures', `${name}.json`), 'utf8'));

/** Momento de la captura. */
export const NOW = Date.parse('2026-11-23T11:30:00Z');

export const fixtures = {
  // Clasificaciones completas, solo con los campos que se usan.
  great: () => load('rankings-1500'),
  ultra: () => load('rankings-2500'),
  master: () => load('rankings-10000'),
  gamemaster: () => load('gamemaster'),
  raids: () => load('raids'),
  events: () => load('events'),
  // Solo nombres de Pokémon y movimientos.
  en: () => load('en'),
  es: () => load('es'),
  pokebattler: () => load('pokebattler'),
  counters: () => load('counters'),
  sprites: () => readFileSync(resolve('tests/fixtures/pokemon.csv'), 'utf8'),
  gyms: () => load('gimnasios'),
  /** Unas pocas fichas originales, con lo que PvPoke sabe de ellas. */
  gymsRaw: () => load('gyms-raw'),
  /** Los mismos counters sintéticos, como si fueran de un jefe Max. */
  maxCounters: () => {
    const raw = load('counters');
    raw.filterValue = raw.attackers[0].pokemonId = 'ESPURR';
    raw.attackers[0].boss = 'RAID_LEVEL_1_MAX';
    const { defenders } = raw.attackers[0].randomMove;
    ['ZACIAN_CROWNED_SWORD_FORM', 'LAPRAS_GIGANTAMAX', 'CHARIZARD', 'VENUSAUR_GIGANTAMAX'].forEach((id, i) => {
      defenders[i].pokemonId = id;
      defenders[i].byMove = [{ move1: 'METAL_CLAW_FAST', move2: 'MOVE_NONE', result: { estimator: 0.1 * (i + 1), edps: 200, tdi: 500_000 } }];
    });
    return raw;
  },
  mega: () => load('rankings-mega-1500'),
  laic: () => load('rankings-laic'),
  raidTypes: () => load('raid-types'),
  raidRaw: () => load('raid-raw'),
  rocket: () => load('rocket'),
  rocketContrast: () => load('rocket-contrast'),
  rocketAttackers: () => load('rocket-attackers'),
  rocketRaw: () => load('rocket-raw'),
  commit: (date: string) => [{ commit: { committer: { date } } }],
  /** Calendario, lista y eventos del 26 de noviembre de 2026, para probar la disponibilidad con fechas simuladas. */
  manifest: () => load('raid-manifest'),
  raids1126: () => load('raids-1126'),
  events1126: () => load('events-1126'),
  /** «evento-{id}» o «periodo-{slug}». */
  leekduck: (name: string): string => readFileSync(resolve('tests/fixtures/leekduck', `${name}.html`), 'utf8'),
};

/** Páginas de LeekDuck guardadas, por la parte final de su dirección. */
const LEEKDUCK_PAGES = [
  'evento-cresselia-darkrai-in-5-star-raid-battles-november-2026',
  'evento-mega-banette-in-mega-raids-november-2026',
  'evento-shadow-tornadus-incarnate-forme-in-shadow-raids-november-16-2026',
  'evento-deoxys-normal-defense-attack-speed-formes-in-5-star-raid-battles-november-2026',
  'evento-mega-metagross-in-mega-raids-november-2026',
  'periodo-cresselia-darkrai-mega-banette-november-2026',
  'periodo-shadow-tornadus-incarnate-november-december-2026',
];

const leekduckRoutes = () =>
  Object.fromEntries(
    LEEKDUCK_PAGES.map((name) => {
      const [kind, ...rest] = name.split('-');
      const path = kind === 'evento' ? `leekduck.com/events/${rest.join('-')}` : `leekduck.com/raids/${rest.join('-')}`;
      return [path, fixtures.leekduck(name)];
    }),
  );

/** Respuestas por fragmento de URL para simular la red completa. */
export const routes = (): Record<string, unknown> => ({
  // Antes que las ligas, cuyos nombres de archivo coinciden.
  'rankings/mega/overall/rankings-1500.json': fixtures.mega(),
  'rankings/laic2027gbl/overall/rankings-1500.json': fixtures.laic(),
  'data/incursiones.json': fixtures.raidTypes(),
  'raids/defenders/ESPURR/': fixtures.maxCounters(),
  'rankings-1500.json': fixtures.great(),
  'rankings-2500.json': fixtures.ultra(),
  'rankings-10000.json': fixtures.master(),
  'gamemaster.min.json': fixtures.gamemaster(),
  'raids.min.json': fixtures.raids(),
  'events.min.json': fixtures.events(),
  'locales/en.json': fixtures.en(),
  'locales/es.json': fixtures.es(),
  'csv/pokemon.csv': fixtures.sprites(),
  'data/gimnasios.json': fixtures.gyms(),
  'data/rocket.json': fixtures.rocketAttackers(),
  'event-info/main/grunts/formatted.json': fixtures.rocket(),
  'rocketLineups.min.json': fixtures.rocketContrast(),
  'repos/WatWowMap/event-info/commits': fixtures.commit('2026-10-04T04:51:19Z'),
  'raids/defenders/CRESSELIA/': fixtures.counters(),
  'fight.pokebattler.com/raids': fixtures.pokebattler(),
  'repos/pvpoke/pvpoke/commits': fixtures.commit('2026-11-20T16:56:34Z'),
  'repos/bigfoott/ScrapedDuck/commits': fixtures.commit('2026-11-23T03:13:23Z'),
  'leekduck.com/raids/manifest.json': fixtures.manifest(),
  ...leekduckRoutes(),
});
