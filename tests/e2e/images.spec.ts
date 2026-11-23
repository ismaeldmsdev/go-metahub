import { expect, test } from '@playwright/test';
import { network } from './network';

const ART = 'official-artwork';

test.describe('imágenes de Pokémon', () => {
  test('sprite inmediato, ilustración al verse y oscuros identificados', async ({ page, context }) => {
    await network(context);
    await page.goto('/#pvp');
    const cards = page.locator('.rank-card');
    await expect(cards.first().locator('.pk-art.pk-ready')).toHaveAttribute('src', /official-artwork\/809\.png$/);
    const shadow = cards.filter({ hasText: 'Ninetales' }).first();
    await expect(shadow.locator('.pk')).toHaveClass(/pk-shadow/);
    await expect(shadow).toContainText('Oscuro');
    const mimikyu = cards.filter({ hasText: 'Mimikyu' }).first();
    await mimikyu.scrollIntoViewIfNeeded();
    await expect(mimikyu.locator('.pk-ready')).toHaveAttribute('src', /\/10143\.png$/);
  });

  test('solo descarga ilustraciones de lo que está a la vista', async ({ page, context }) => {
    const net = await network(context);
    await page.goto('/#pvp');
    await expect(page.locator('.pk-ready').first()).toBeVisible();
    await page.waitForTimeout(600);
    expect(await page.locator('.rank-card').count()).toBeGreaterThan(100);
    expect(net.count(ART)).toBeLessThanOrEqual(10);
  });

  test('al desplazarse deprisa no descarga las que pasan de largo', async ({ page, context }) => {
    const net = await network(context);
    await page.goto('/#pvp');
    await expect(page.locator('.pk-ready').first()).toBeVisible();
    net.reset();
    await page.evaluate(async () => {
      for (let y = 0; y < 8000; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => r(0)));
      }
    });
    await page.waitForTimeout(600);
    expect(net.count(ART)).toBeLessThanOrEqual(14);
  });

  test('sin imagen exacta: número de Pokédex, nunca otra forma', async ({ page, context }) => {
    await network(context);
    await page.goto('/#pvp');
    await page.getByRole('button', { name: /Ultra/ }).click();
    await page.getByRole('searchbox').fill('genesect burn');
    await expect(page.locator('.rank-card').first().locator('.pk')).toHaveText('#649');
    await expect(page.locator('.rank-card').first().locator('img')).toHaveCount(0);
  });

  test('si las imágenes fallan, la lista sigue completa', async ({ page, context }) => {
    const net = await network(context);
    net.table.images = 'fail';
    await page.goto('/#pvp');
    await expect(page.locator('.rank-card').first()).toContainText('Melmetal');
    await expect(page.locator('.rank-card').first().locator('.pk')).toHaveText('#809');
    await expect(page.locator('.rank-card').first()).toContainText('93,9');
  });

  test('si falla la lista de formas, PvP sigue funcionando', async ({ page, context }) => {
    const net = await network(context);
    net.table['csv/pokemon.csv'] = '<html></html>';
    await page.goto('/#pvp');
    await expect(page.locator('.rank-card').first()).toContainText('Melmetal');
    await expect(page.locator('.rank-card').first().locator('.pk')).toHaveText('#809');
  });
});

test.describe('imágenes sin conexión', () => {
  test.use({ serviceWorkers: 'allow' });

  test('las ya vistas se conservan, con cachés limitadas y separadas', async ({ page, context }) => {
    const net = await network(context);
    await page.goto('/#pvp');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect(page.locator('.pk-ready').first()).toBeVisible();
    await page.waitForTimeout(500);
    const names = await page.evaluate(() => caches.keys());
    expect(names).toEqual(expect.arrayContaining(['go-metahub-ilustraciones', 'go-metahub-sprites']));
    for (const key of Object.keys(net.table)) net.table[key] = 'fail';
    net.table.images = 'fail';
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.rank-card').first().locator('.pk-ready')).toBeVisible();
  });
});
