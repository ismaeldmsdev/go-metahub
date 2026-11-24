/**
 * Copias reales de las fuentes tomadas el 23 de noviembre de 2026 (recortadas donde se indica).
 * Las de Pokébattler son sintéticas: sus datos reales no deben subirse al repositorio sin su permiso.
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
  commit: (date: string) => [{ commit: { committer: { date } } }],
};

/** Respuestas por fragmento de URL para simular la red completa. */
export const routes = (): Record<string, unknown> => ({
  'rankings-1500.json': fixtures.great(),
  'rankings-2500.json': fixtures.ultra(),
  'rankings-10000.json': fixtures.master(),
  'gamemaster.min.json': fixtures.gamemaster(),
  'raids.min.json': fixtures.raids(),
  'events.min.json': fixtures.events(),
  'locales/en.json': fixtures.en(),
  'locales/es.json': fixtures.es(),
  'csv/pokemon.csv': fixtures.sprites(),
  'raids/defenders/CRESSELIA/': fixtures.counters(),
  'fight.pokebattler.com/raids': fixtures.pokebattler(),
  'repos/pvpoke/pvpoke/commits': fixtures.commit('2026-11-20T16:56:34Z'),
  'repos/bigfoott/ScrapedDuck/commits': fixtures.commit('2026-11-23T03:13:23Z'),
});
