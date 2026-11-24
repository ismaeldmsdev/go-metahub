import { expect, test } from '@playwright/test';
import { network } from './network';

const BASE = 'http://localhost:4184/go-metahub/';

test.describe('en una subcarpeta, como en GitHub Pages', () => {
  test.use({ serviceWorkers: 'allow' });

  test('todas las rutas quedan dentro de la subcarpeta', async ({ page, context }) => {
    await network(context);
    const outside: string[] = [];
    const failed: string[] = [];
    page.on('response', (r) => {
      const url = r.url();
      if (!url.startsWith('http://localhost:4184')) return;
      if (!url.startsWith(BASE)) outside.push(url);
      if (r.status() >= 400) failed.push(url);
    });
    await page.goto(BASE);
    await expect(page.locator('.rank-card').first()).toBeVisible();
    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return { scope: ready.scope, script: ready.active!.scriptURL };
    });
    expect(registration).toEqual({ scope: BASE, script: `${BASE}sw.js` });

    const manifest = await page.evaluate(async () => {
      const href = document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href;
      const data = await (await fetch(href)).json();
      const at = (path: string) => new URL(path, href).href;
      const icons = data.icons.map((i: { src: string }) => at(i.src));
      const status = await Promise.all(icons.map(async (i: string) => (await fetch(i)).status));
      return { name: data.name, short: data.short_name, start: at(data.start_url), scope: at(data.scope), id: data.id, icons, status };
    });
    await expect(page).toHaveTitle('GO MetaHub');
    expect([manifest.name, manifest.short]).toEqual(['GO MetaHub', 'GO MetaHub']);
    expect(manifest.start).toBe(BASE);
    expect(manifest.scope).toBe(BASE);
    expect(manifest.id).toBeUndefined();
    expect(manifest.icons.every((i: string) => i.startsWith(BASE))).toBe(true);
    expect(manifest.status).toEqual([200, 200, 200]);
    expect(outside).toEqual([]);
    expect(failed).toEqual([]);
  });

  test('abre sin conexión y conserva las secciones', async ({ page, context }) => {
    const net = await network(context);
    await page.goto(`${BASE}#incursiones`);
    await expect(page.locator('.boss')).toHaveCount(18);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect(page.locator('.boss')).toHaveCount(18);
    for (const key of Object.keys(net.table)) net.table[key] = 'fail';
    await context.setOffline(true);
    await page.goto(`${BASE}#eventos`);
    await page.reload();
    await expect(page.locator('.event').first()).toBeVisible();
    // El logo pequeño se guarda con la aplicación; los originales del logo, no.
    const brand = page.locator('.brand');
    expect(await brand.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(128);
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(r.url);
      return urls;
    });
    expect(cached.filter((url) => /logo-meta|icon-(192|512|maskable)/.test(url))).toEqual([]);
  });
});
