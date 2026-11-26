import { expect, test, type Page } from '@playwright/test';
import { NOW } from '../fixtures';
import { network, pick, saved } from './network';

const CRESSELIA = 'raids/defenders/CRESSELIA/';
const DAY = 86_400_000;

async function open(page: Page, hash = 'incursiones/cresselia') {
  await page.clock.install({ time: NOW });
  await page.goto(`/#${hash}`);
}

test.describe('counters de un jefe', () => {
  test('desde la lista, con imagen, nombre, movimientos y métricas', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const net = await network(context);
    await open(page, 'incursiones');
    await expect(page.locator('.rb-boss')).toHaveCount(17);
    // Nada se pide hasta abrir un jefe.
    expect(net.count('raids/defenders')).toBe(0);
    const boss = page.locator('.rb-boss', { hasText: 'Cresselia' });
    // Toda la ficha es pulsable, no solo el texto del enlace.
    await boss.click({ position: { x: 40, y: 40 } });
    await expect(page).toHaveURL(/#incursiones\/cresselia$/);
    // Los PC, que ya no van en la cuadrícula, siguen en la ficha.
    await expect(page.locator('.hm-dex')).toContainText('1555–1633');
    // Primero, los seis mejores con sus movimientos; la lista completa con sus cifras, plegada.
    const team = page.locator('.top-counters > li');
    await expect(team).toHaveCount(6);
    for (const text of ['Mega-Venusaur', 'Poder Oculto (Bicho)', 'Pulso Umbrío+']) await expect(team.first()).toContainText(text);
    await expect(team.first().locator('.pk-ready')).toBeVisible();
    await page.getByText('Ver los 30 con sus cifras').click();
    const cards = page.locator('.rank-card');
    await expect(cards).toHaveCount(30);
    const first = cards.first();
    for (const text of ['Puesto 1', 'Mega-Venusaur', 'Planta', 'Veneno', 'Poder Oculto (Bicho)', 'Pulso Umbrío+', '1,25', '30,5', '2.000']) {
      await expect(first).toContainText(text);
    }
    await expect(first.locator('.pk-ready')).toBeVisible();
    await expect(cards.nth(4)).toContainText('Pidgeot');
    await expect(cards.nth(4)).toContainText('Oscuro');
    expect(net.count('raids/defenders')).toBe(1);
    expect(errors).toEqual([]);
  });

  test('tipos, debilidades, atribución y significado de las métricas', async ({ page, context }) => {
    await network(context);
    await open(page);
    const weak = page.getByRole('region', { name: 'Debilidades' });
    for (const type of ['Bicho', 'Fantasma', 'Siniestro']) await expect(weak).toContainText(`${type} ×1,6`);
    // En un móvil, el primer counter se ve sin desplazarse.
    await expect(page.locator('.top-counters > li').first().locator('.moves')).toBeInViewport({ ratio: 1 });
    // Atribución siempre a la vista en el rótulo ⓘ; el enlace y el método, al desplegarlo.
    const info = page.locator('.hm-info', { hasText: 'Counters de Pokébattler' });
    await info.locator('> summary').click();
    await expect(info.getByRole('link', { name: 'Pokébattler' })).toHaveAttribute('href', 'https://www.pokebattler.com/raids/CRESSELIA');
    await page.getByText('Qué significa cada dato').click();
    await expect(page.locator('.method')).toContainText('Menos es mejor');
    await expect(page.locator('.method')).toContainText('megaevoluciones de nivel 4');
  });

  test('variantes y clima', async ({ page, context }) => {
    const net = await network(context);
    await open(page);
    const cards = page.locator('.rank-card');
    await expect(cards).toHaveCount(30);
    await page.getByRole('button', { name: /^Oscuros/ }).click();
    await expect(cards.first()).toContainText('Puesto 5');
    await page.getByRole('button', { name: /^Normales/ }).click();
    await expect(cards.first()).toContainText('Puesto 4');
    expect(net.count(CRESSELIA)).toBe(1);
    await pick(page, ['Clima', 'Niebla']);
    await expect.poll(() => net.count('weatherCondition=FOG')).toBe(1);
    await pick(page, ['Clima', 'Sin clima favorable']);
    await page.waitForTimeout(200);
    expect(net.count(CRESSELIA)).toBe(2);
  });

  test('volver deja la lista en el mismo jefe', async ({ page, context }) => {
    await network(context);
    await open(page, 'incursiones');
    const boss = page.locator('.rb-boss', { hasText: 'Cranidos' });
    await boss.getByRole('link').click();
    await expect(page.getByRole('link', { name: /Todos los jefes/ })).toBeVisible();
    await page.goBack();
    await expect(boss).toBeInViewport();
  });

  test('un jefe que ya no está o que Pokébattler no lista no muestra counters de otro', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'incursiones/inventado');
    await expect(page.locator('.empty')).toContainText('ya no figura');
    net.table['fight.pokebattler.com/raids'] = { tiers: [{ tier: 'RAID_LEVEL_5', raids: [{ pokemon: 'DARKRAI' }] }] };
    await page.evaluate(() => indexedDB.deleteDatabase('pke-meta'));
    await page.goto('/#incursiones/cresselia');
    await page.reload();
    await expect(page.locator('.empty')).toContainText('no lista ahora mismo');
    await expect(page.locator('.rank-card')).toHaveCount(0);
  });
});

test.describe('caché y fallos', () => {
  test('al reabrir no repite la petición; pasado un día, sí', async ({ page, context }) => {
    const net = await network(context);
    await open(page);
    await expect(page.locator('.rank-card')).toHaveCount(30);
    await saved(page, 'counters|', 'raids', 'pokebattler');
    net.reset();
    await page.reload();
    await expect(page.locator('.rank-card')).toHaveCount(30);
    expect(net.count(CRESSELIA)).toBe(0);
    await page.clock.setSystemTime(NOW + DAY + 60_000);
    await page.reload();
    await expect.poll(() => net.count(CRESSELIA)).toBe(1);
  });

  for (const [name, reply] of [
    ['sin conexión', 'fail'],
    ['HTML', '<html></html>'],
    ['otro jefe', { sortType: 'ESTIMATOR', filterValue: 'DARKRAI', attackers: [] }],
  ] as const) {
    test(`${name}: avisa y conserva lo último válido`, async ({ page, context }) => {
      const net = await network(context);
      await open(page);
      await expect(page.locator('.rank-card')).toHaveCount(30);
      await saved(page, 'counters|', 'raids', 'pokebattler');
      net.table[CRESSELIA] = reply;
      await page.clock.setSystemTime(NOW + 8 * DAY);
      await page.reload();
      await expect(page.locator('.rank-card')).toHaveCount(30);
      await page.clock.runFor(30_000);
      await expect(page.locator('.status-warning').first()).toContainText('últimos datos válidos');
      await expect(page.locator('.status-warning').first()).toContainText('hace 8 días');
    });
  }

  test('primera vez sin Pokébattler: lo dice, permite reintentar y el resto funciona', async ({ page, context }) => {
    const net = await network(context);
    const reply = net.table[CRESSELIA];
    net.table[CRESSELIA] = 'fail';
    await open(page);
    await page.clock.runFor(30_000);
    await expect(page.locator('.status-error')).toContainText('Todavía no hay datos');
    await expect(page.getByRole('region', { name: 'Debilidades' })).toBeVisible();
    net.table[CRESSELIA] = reply;
    await page.getByRole('button', { name: 'Actualizar' }).last().click();
    await expect(page.locator('.rank-card')).toHaveCount(30);
  });

  test('sin los datos de PvPoke, los counters siguen con nombre en español', async ({ page, context }) => {
    const net = await network(context);
    net.table['gamemaster.min.json'] = 'fail';
    await open(page);
    await expect(page.locator('.rank-card').first()).toContainText('Mega-Venusaur');
  });
});

test.describe('enlaces por tipo', () => {
  test('los 18 tipos llevan a su clasificación', async ({ page, context }) => {
    await network(context);
    await open(page, 'incursiones/tipos');
    const links = page.locator('.type-links a');
    await expect(links).toHaveCount(18);
    await links.filter({ hasText: 'Dragón' }).click();
    await expect(page.locator('.note').getByRole('link', { name: 'Pokébattler' })).toHaveAttribute(
      'href',
      'https://www.pokebattler.com/raids/attackers/type/dragon',
    );
  });
});

test.describe('diseño adaptable', () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`ficha del jefe sin desbordes a ${width} px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height });
      await network(context);
      await open(page);
      await expect(page.locator('.rank-card')).toHaveCount(30);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      const small = await page
        .locator('nav a, .back, button:not(.text-button), select')
        .evaluateAll((els) => els.filter((e) => e.checkVisibility() && e.getBoundingClientRect().height < 43.9).length);
      expect(small).toBe(0);
    });
  }
});
