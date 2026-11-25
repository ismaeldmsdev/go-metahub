import { expect, type BrowserContext, type Page } from '@playwright/test';
import { routes } from '../fixtures';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Simula las fuentes con copias reales y anota qué se pide. */
export async function network(context: BrowserContext) {
  const table: Record<string, unknown> = routes();
  const calls: string[] = [];
  await context.route(/^https:\/\/|\/data\/(?:gimnasios|rocket)\.json$/, async (route) => {
    const url = route.request().url();
    calls.push(url);
    const broken = table.images === 'fail' || (table.art === 'fail' && url.includes('official-artwork'));
    if (url.includes('/PokeAPI/sprites/') && !broken) {
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' },
        body: PIXEL,
      });
    }
    const match = Object.entries(table).find(([part]) => url.includes(part));
    if (!match || match[1] === 'fail') return route.abort();
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' },
      body: typeof match[1] === 'string' ? match[1] : JSON.stringify(match[1]),
    });
  });
  const count = (part: string) => calls.filter((url) => url.includes(part)).length;
  return { table, count, reset: () => void (calls.length = 0) };
}

/** El guardado termina después de pintar: antes de recargar hay que esperar a que estén las claves que empiezan así. */
export const saved = (page: Page, ...prefixes: string[]) =>
  expect
    .poll(() =>
      page.evaluate(
        (wanted) =>
          new Promise<string[]>((resolve, reject) => {
            const open = indexedDB.open('pke-meta');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const keys = open.result.transaction('sources').objectStore('sources').getAllKeys();
              keys.onsuccess = () => {
                open.result.close();
                resolve(wanted.filter((prefix) => !keys.result.some((key) => String(key).startsWith(prefix))));
              };
            };
          }),
        prefixes,
      ),
    )
    .toEqual([]);

export const ALL_SOURCES = [
  'pvp', 'raids', 'events', 'translations', 'pokebattler', 'sprites', 'gyms', 'rocket', 'rocketContrast', 'rocketAttackers',
];
