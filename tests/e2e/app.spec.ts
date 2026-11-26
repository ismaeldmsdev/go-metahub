import { expect, test, type Page } from '@playwright/test';
import { NOW, routes } from '../fixtures';
import { ALL_SOURCES, network, pick, saved } from './network';

const HOUR = 3_600_000;

async function open(page: Page, tab = 'pvp', time = NOW) {
  await page.clock.install({ time });
  await page.goto(`/#${tab}`);
}

const problems = (page: Page) => {
  const list: string[] = [];
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) list.push(m.text());
  });
  return list;
};

test.describe('secciones', () => {
  test('PvP: tres ligas, puestos, puntuaciones y movimientos en español', async ({ page, context }) => {
    const errors = problems(page);
    await network(context);
    await open(page);
    const cards = page.locator('.rank-card');
    await expect(cards.first()).toContainText('Melmetal');
    await expect(cards.first()).toContainText('93,9');
    await expect(cards.first()).toContainText('Impactrueno');
    await expect(cards.nth(2)).toContainText('Ninetales');
    await expect(cards.nth(2)).toContainText('Oscuro');
    await expect(cards.nth(2)).toContainText('Meteorobola (Fuego)');
    await page.getByRole('button', { name: /Ultra/ }).click();
    await expect(cards.first()).toContainText('Tinkaton');
    await page.getByRole('button', { name: /Máster/ }).click();
    await expect(cards.first()).toContainText('Forma Origen');
    expect(errors).toEqual([]);
  });

  test('PvP: tiers con sus recuentos y criterio visible', async ({ page, context }) => {
    await network(context);
    await open(page);
    const headings = page.locator('.tier-group h2');
    await expect(headings).toHaveText([/Tier S 30/, /Tier A 102/, /Tier B 166/, /Tier C 392/]);
    await expect(headings.first()).toContainText('90 o más');
    await expect(headings.nth(1)).toContainText('85 a 89,9');
    await page.getByText('Cómo se forman los tiers').click();
    await expect(page.locator('.method')).toContainText('no oficiales de PvPoke');
    await page.getByRole('button', { name: /^Tier A/ }).click();
    await expect(headings).toHaveText([/Tier A 102/]);
    await expect(page.locator('.rank-card')).toHaveCount(30);
    await expect(page.locator('.rank-card').first()).toContainText('31');
    await page.getByRole('button', { name: /Mostrar más \(72/ }).click();
    await expect(page.locator('.rank-card')).toHaveCount(90);
    await page.getByRole('button', { name: /Mostrar más \(12/ }).click();
    await expect(page.locator('.rank-card')).toHaveCount(102);
  });

  test('PvP: buscador, variantes y combinación de filtros', async ({ page, context }) => {
    await network(context);
    await open(page);
    const cards = page.locator('.rank-card');
    const search = page.getByRole('searchbox', { name: 'Buscar Pokémon' });
    await search.fill('ninetales alola');
    await expect(cards.first()).toContainText('Ninetales de Alola');
    const all = await cards.count();
    await pick(page, ['Variante', 'Oscuros']);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Oscuro');
    expect(all).toBeGreaterThan(1);
    // Se conserva al cambiar de sección y se puede quitar de una vez.
    await page.getByRole('link', { name: /Eventos/ }).click();
    await page.getByRole('link', { name: /PvP/ }).click();
    await expect(search).toHaveValue('ninetales alola');
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await expect(page.locator('.tier-group')).toHaveCount(4);
    // Los que no llegan al tier C solo aparecen al buscarlos.
    await search.fill('unown');
    await expect(page.locator('.tier-group h2')).toHaveText([/Sin tier 1/]);
    await search.fill('zzzz');
    await expect(page.locator('.empty')).toContainText('Ningún Pokémon');
  });

  test('incursiones: ahora, próximamente y sus fechas', async ({ page, context }) => {
    await network(context);
    // Lunes 23 de noviembre, 12:30 en Madrid: Tornadus oscuro solo sale los fines de semana.
    await open(page, 'incursiones');
    await expect(page.locator('.rb-boss')).toHaveCount(17);
    await expect(page.getByRole('heading', { name: 'Oscuras · 3 estrellas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Oscuras · 5 estrellas' })).toHaveCount(0);
    // La fecha de fin común va en la cabecera del grupo; si difiere, en cada ficha.
    const group = (name: string) => page.locator('.rb-group', { has: page.locator('.rb-boss', { hasText: name }) });
    const cresselia = page.locator('.rb-boss', { hasText: 'Cresselia' });
    await expect(group('Cresselia')).toContainText('Hasta el mar 24 nov, 22:00');
    await expect(cresselia).toContainText('Débil a');
    await expect(cresselia.getByRole('link')).toHaveAttribute('href', '#incursiones/cresselia');
    // Sin rotación propia, lo respalda el periodo en curso del calendario.
    await expect(group('Liepard')).toContainText('Hasta el mar 24 nov, 10:00');
    await expect(page.locator('.hm-timer')).toContainText('Próximo cambio');
    await expect(page.locator('.hm-timer')).toContainText('mar 24 nov, 10:00');
    await page.getByRole('link', { name: /Próximamente/ }).click();
    await expect(page).toHaveURL(/#incursiones\/proximamente$/);
    const tornadus = page.locator('.hm-card', { hasText: 'Tornadus' });
    await expect(tornadus).toContainText('Solo fines de semana: sáb 28 nov y dom 29 nov');
    await expect(tornadus.getByRole('link')).toHaveAttribute('href', '#incursiones/shadowtornadusincarnate');
    await expect(page.locator('.hm-card', { hasText: 'Deoxys' }).first()).toContainText('Del mié 25 nov, 06:00 al mar 1 dic, 22:00');
    // El método y las fechas, tras la línea ⓘ, que nombra la fuente.
    await expect(page.locator('.hm-info > summary')).toContainText('Datos de LeekDuck');
    await page.locator('.hm-info > summary').click();
    await expect(page.locator('.hm-info')).toContainText('Calendario de LeekDuck generado el 26 nov 2026');
  });

  test('incursiones: sin el calendario de LeekDuck no se confirma nada que dependa de él', async ({ page, context }) => {
    const net = await network(context);
    for (const key of Object.keys(net.table)) if (key.startsWith('leekduck.com')) net.table[key] = 'fail';
    await open(page, 'incursiones');
    await page.clock.runFor(30_000);
    await expect(page.locator('.rb-boss', { hasText: 'Cresselia' })).toContainText('Sin comprobar');
    await expect(page.locator('.rb-boss', { hasText: 'Tornadus' })).toContainText('Sin comprobar');
    await expect(page.locator('.rb-boss', { hasText: 'Liepard' })).toContainText('Sin fecha de fin');
    await expect(page.locator('.nav-alert')).not.toHaveCount(0);
  });

  test('eventos: hora peninsular, cuenta atrás y sin falsos activos', async ({ page, context }) => {
    await network(context);
    await open(page, 'eventos');
    const active = page.locator('.group', { has: page.getByRole('heading', { name: /^Activos/ }) });
    const monday = active.locator('.event', { has: page.locator('[href*="max-mondays-2026-11-23"]') });
    await expect(monday).toContainText('lun 23 nov 2026, 21:00');
    await expect(monday.locator('.countdown')).toContainText(/Termina en 08:\d\d:\d\d/);
    await expect(active).not.toContainText('Pawniard');
    const undated = page.locator('.group', { has: page.getByRole('heading', { name: /^Sin fecha/ }) });
    await expect(undated.locator('.event')).toHaveCount(2);
    await expect(undated).toContainText('Pawniard');
    await expect(page.locator('.event', { hasText: 'Noibat' }).first()).toBeAttached();
  });

  test('un evento pasa de próximo a activo sin recargar', async ({ page, context }) => {
    await network(context);
    await open(page, 'eventos', Date.parse('2026-11-24T08:59:50Z'));
    const card = page.locator('.group', { has: page.getByRole('heading', { name: /^Activos/ }) });
    const link = card.locator('[href*="twilight-wishes-2026"]');
    await expect(page.locator('.event').first()).toBeVisible();
    await expect(link).toHaveCount(0);
    await page.clock.fastForward(15_000);
    await expect(link).toHaveCount(1);
  });

  test('fuentes: tres fechas distintas', async ({ page, context }) => {
    await network(context);
    await open(page, 'fuentes');
    const raids = page.locator('.source', { has: page.getByRole('heading', { name: 'Incursiones', exact: true }) });
    await expect(raids).toContainText('Consulta al día');
    await expect(raids).toContainText('Última consulta');
    await expect(raids).toContainText('23 nov 2026, 04:13');
    await expect(raids).toContainText('ninguno desde');
  });
});

test.describe('actualización automática', () => {
  test('durante el uso: 6 h incursiones y eventos, 24 h PvP', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'fuentes');
    await expect(page.getByText('Consulta al día')).toHaveCount(13);
    net.reset();
    await page.clock.fastForward(5 * HOUR);
    expect(net.count('raids.min.json') + net.count('events.min.json')).toBe(0);
    await page.clock.fastForward(HOUR + 60_000);
    await expect.poll(() => net.count('raids.min.json')).toBe(1);
    await expect.poll(() => net.count('events.min.json')).toBe(1);
    expect(net.count('rankings-1500')).toBe(0);
    await page.clock.fastForward(17 * HOUR);
    await page.clock.fastForward(HOUR);
    await expect.poll(() => net.count('rankings-1500')).toBe(1);
  });

  test('al volver a primer plano', async ({ page, context }) => {
    const net = await network(context);
    const setVisible = (state: 'visible' | 'hidden') =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', { value, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('visibilitychange'));
      }, state);
    await open(page, 'incursiones');
    await expect(page.locator('.rb-boss')).toHaveCount(17);
    await setVisible('hidden');
    net.reset();
    await page.clock.setSystemTime(NOW + HOUR);
    await setVisible('visible');
    await page.waitForTimeout(200);
    expect(net.count('raids.min.json')).toBe(0);
    await setVisible('hidden');
    await page.clock.setSystemTime(NOW + 7 * HOUR);
    await setVisible('visible');
    await expect.poll(() => net.count('raids.min.json')).toBe(1);
  });

  test('al abrir: no repite si está vigente y actualiza si caducó', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'fuentes');
    await expect(page.getByText('Consulta al día')).toHaveCount(13);
    await saved(page, ...ALL_SOURCES);
    net.reset();
    await page.reload();
    await expect(page.getByText('Consulta al día')).toHaveCount(13);
    expect(net.count('githubusercontent')).toBe(0);
    await page.clock.setSystemTime(NOW + 7 * HOUR);
    await page.reload();
    await expect.poll(() => net.count('raids.min.json')).toBe(1);
    expect(net.count('rankings-1500')).toBe(0);
  });

  test('detecta el cambio real de los datos', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'incursiones');
    await expect(page.locator('.rb-boss')).toHaveCount(17);
    net.table['raids.min.json'] = (net.table['raids.min.json'] as unknown[]).slice(0, 15);
    await page.clock.fastForward(6 * HOUR + 60_000);
    await expect(page.locator('.rb-boss')).toHaveCount(15);
    await page.locator('.hm-info > summary').click();
    await page.locator('.status summary').first().click();
    await expect(page.locator('.status .dates').first()).toContainText(/Último cambio detectado\s*23 nov 2026/);
  });
});

test.describe('fallos', () => {
  test('con la app abierta reintenta cada 15 minutos, no antes, y se recupera sola', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'incursiones');
    await expect(page.locator('.rb-boss')).toHaveCount(17);
    net.table['raids.min.json'] = '<html></html>';
    await page.clock.fastForward(6 * HOUR + 60_000);
    await expect(page.locator('.status-warning')).toContainText('últimos datos válidos');
    net.reset();
    await page.clock.fastForward(10 * 60_000);
    await page.waitForTimeout(200);
    expect(net.count('raids.min.json')).toBe(0);
    Object.assign(net.table, routes());
    await page.clock.fastForward(6 * 60_000);
    await expect.poll(() => net.count('raids.min.json')).toBe(1);
    await page.clock.fastForward(60_000);
    await expect(page.getByText('últimos datos válidos')).toHaveCount(0);
  });

  for (const [name, reply] of [
    ['sin conexión', 'fail'],
    ['lista vacía', []],
    ['formato nuevo', { bosses: [] }],
    ['HTML', '<html></html>'],
  ] as const) {
    test(`${name}: avisa y conserva lo último válido`, async ({ page, context }) => {
      const net = await network(context);
      await open(page, 'incursiones');
      await expect(page.locator('.rb-boss')).toHaveCount(17);
      await saved(page, 'raids');
      net.table['raids.min.json'] = reply;
      await page.clock.setSystemTime(NOW + 7 * HOUR);
      await page.reload();
      await expect(page.locator('.rb-boss')).toHaveCount(17);
      await page.clock.runFor(30_000);
      await expect(page.locator('.status-warning')).toContainText('últimos datos válidos');
      await expect(page.locator('.status-warning')).toContainText('hace 7 h');
      await expect(page.locator('.nav-alert')).not.toHaveCount(0);
    });
  }

  test('fuente parada: avisa aunque la consulta funcione', async ({ page, context }) => {
    await network(context);
    await open(page, 'incursiones', NOW + 10 * HOUR);
    await expect(page.locator('.status-warning')).toContainText('La fuente no publica desde hace 18 h');
  });

  test('primera apertura sin red: lo dice y permite reintentar', async ({ page, context }) => {
    const net = await network(context);
    for (const key of Object.keys(net.table)) net.table[key] = 'fail';
    await open(page, 'pvp');
    await page.clock.runFor(30_000);
    await expect(page.locator('.status-error')).toContainText('Todavía no hay datos');
    Object.assign(net.table, routes());
    await page.getByRole('button', { name: 'Actualizar' }).last().click();
    await expect(page.locator('.rank-card').first()).toBeVisible();
  });
});

test.describe('sin conexión con la aplicación instalada', () => {
  test.use({ serviceWorkers: 'allow' });
  test('abre y muestra los últimos datos', async ({ page, context }) => {
    const net = await network(context);
    // A la fecha de los datos: la disponibilidad de las incursiones depende de la hora.
    await page.clock.install({ time: NOW });
    await page.goto('/#pvp');
    await expect(page.locator('.rank-card').first()).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect(page.locator('.rank-card').first()).toBeVisible();
    await saved(page, 'pvp', 'raids', 'events', 'raidSchedule');
    for (const key of Object.keys(net.table)) net.table[key] = 'fail';
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.rank-card').first()).toBeVisible();
    await page.getByRole('link', { name: /Incursiones/ }).click();
    await expect(page.locator('.rb-boss')).toHaveCount(17);
    // Los datos no deben duplicarse en la caché de Workbox.
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(r.url);
      return urls;
    });
    const isImage = (url: string) => /\/PokeAPI\/sprites\/.*\.png$/.test(url);
    expect(cached.filter((url) => /githubusercontent|pokebattler|api\.github/.test(url) && !isImage(url))).toEqual([]);
    expect(cached.some((url) => url.includes('index.html'))).toBe(true);
  });
});

test.describe('diseño adaptable', () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`sin desbordes a ${width} px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height });
      await network(context);
      await open(page);
      await expect(page.locator('.rank-card').first()).toBeVisible();
      for (const tab of ['PvP', 'Incursiones', 'Eventos', 'Rocket', 'Fuentes']) {
        const place = page.getByRole(tab === 'Fuentes' ? 'banner' : 'navigation');
        await place.getByRole('link', { name: tab }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(tab);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        // Solo lo que se ve: un botón dentro de un desplegable cerrado no se puede pulsar.
        const small = await page.locator('nav a, .sources-link, button:not(.text-button), input, select').evaluateAll((els) =>
          els
            .filter((e) => e.checkVisibility() && e.getBoundingClientRect().height < 43.9)
            .map((e) => `${e.textContent} (${e.getBoundingClientRect().height} px)`),
        );
        expect(small).toEqual([]);
      }
    });
  }
});
