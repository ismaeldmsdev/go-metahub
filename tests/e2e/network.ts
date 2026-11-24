import type { BrowserContext } from '@playwright/test';
import { routes } from '../fixtures';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Simula las fuentes con copias reales y anota qué se pide. */
export async function network(context: BrowserContext) {
  const table: Record<string, unknown> = routes();
  const calls: string[] = [];
  await context.route(/^https:\/\/|\/data\/gimnasios\.json$/, async (route) => {
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
