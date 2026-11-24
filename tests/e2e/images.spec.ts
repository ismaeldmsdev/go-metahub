import { expect, test } from '@playwright/test';
import { network } from './network';

const ART = 'official-artwork';

test.describe('imágenes de Pokémon', () => {
  test('ilustración al verse y oscuros identificados', async ({ page, context }) => {
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

  test('mientras llega la ilustración no se ve ninguna otra imagen ni cambia el tamaño', async ({ page, context }) => {
    await network(context);
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await context.route(/official-artwork/, async (route) => {
      await gate;
      await route.fallback();
    });
    for (const hash of ['pvp', 'gimnasios', 'gimnasios/defensores', 'incursiones/cresselia']) {
      await page.goto(`/#${hash}`);
      const figure = page.locator('.rank-card').first().locator('.pk');
      await expect(figure.locator('.pk-art')).toBeAttached();
      await expect(page.locator('.pk-sprite, .pk-fallback')).toHaveCount(0);
      await expect(figure.locator('.pk-art')).toHaveCSS('opacity', '0');
      await expect(figure).toHaveCSS('width', '92px');
    }
    const figure = page.locator('.rank-card').first().locator('.pk');
    const before = await figure.boundingBox();
    release();
    await expect(figure.locator('.pk-ready')).toHaveCSS('opacity', '1');
    await expect(page.locator('.pk-sprite')).toHaveCount(0);
    const after = await figure.boundingBox();
    expect([after!.width, after!.height]).toEqual([before!.width, before!.height]);
    // El navegador puede redondear la posición en centésimas de píxel.
    expect(Math.abs(after!.x - before!.x)).toBeLessThan(1);
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
  });

  test('si falla la ilustración, usa el sprite de la misma forma', async ({ page, context }) => {
    const net = await network(context);
    net.table.art = 'fail';
    await page.goto('/#pvp');
    const figure = page.locator('.rank-card').first().locator('.pk');
    await expect(figure.locator('.pk-sprite')).toHaveAttribute('src', /sprites\/pokemon\/809\.png$/);
    await expect(figure.locator('.pk-art')).toHaveCount(0);
  });

  test('con ahorro de datos, solo el sprite, sin sustituirlo', async ({ page, context }) => {
    const net = await network(context);
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }));
    await page.goto('/#pvp');
    await expect(page.locator('.rank-card').first().locator('.pk-sprite')).toBeVisible();
    await page.waitForTimeout(500);
    expect(net.count(ART)).toBe(0);
  });

  test('al volver a una lista, las ya vistas salen directamente', async ({ page, context }) => {
    await network(context);
    await page.goto('/#pvp');
    await expect(page.locator('.rank-card').first().locator('.pk-ready')).toBeVisible();
    await page.getByRole('link', { name: 'Eventos' }).click();
    await page.getByRole('link', { name: 'PvP' }).click();
    const first = page.locator('.rank-card').first();
    await first.waitFor();
    expect(await first.locator('.pk-ready').count()).toBe(1);
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
    expect(names).toContain('go-metahub-ilustraciones');
    for (const key of Object.keys(net.table)) net.table[key] = 'fail';
    net.table.images = 'fail';
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.rank-card').first().locator('.pk-ready')).toBeVisible();
  });
});
