import { expect, test, type Page } from '@playwright/test';
import { NOW } from '../fixtures';
import { network } from './network';

const FILE = 'data/gimnasios.json';
const DAY = 86_400_000;

async function open(page: Page, hash = 'gimnasios') {
  await page.clock.install({ time: NOW });
  await page.goto(`/#${hash}`);
}

/** ¿Ya están guardados en el dispositivo? */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('pke-meta');
        open.onsuccess = () => {
          const keys = open.result.transaction('sources').objectStore('sources').getAllKeys();
          keys.onsuccess = () => {
            open.result.close();
            resolve(keys.result.includes('gyms'));
          };
        };
      }),
  );

test.describe('atacantes de gimnasio', () => {
  test('tier, percentil, puntuación, movimientos, imagen y nombre en español', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await network(context);
    await open(page);
    await expect(page.locator('.tier-group')).toHaveCount(6);
    const card = page.locator('.rank-card', { hasText: 'Mega-Gengar' });
    for (const text of ['Tier S+', 'Fantasma', 'Veneno', 'Bola Sombra', '99,6', '322,58']) await expect(card).toContainText(text);
    await expect(card.locator('.pk-sprite, .pk-art').first()).toBeAttached();
    // Sin orden global: ningún atacante lleva puesto y el empate se ve.
    await expect(page.locator('.rank')).toHaveCount(0);
    await expect(card).toContainText('Empatan 9');
    await expect(page.getByText('aparecer primero no significa ser el mejor')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('atribución visible: fuente, licencia, fecha y transformación', async ({ page, context }) => {
    await network(context);
    for (const hash of ['gimnasios', 'gimnasios/defensores']) {
      await page.goto(`/#${hash}`);
      const note = page.locator('.attribution');
      await expect(note).toBeInViewport();
      await expect(note).toContainText('transformados y resumidos');
      await expect(note).toContainText('22 nov 2026');
      await expect(note.getByRole('link', { name: 'doctorpokegogo.com' })).toHaveAttribute('href', 'https://doctorpokegogo.com/');
      await expect(note.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    }
  });

  test('el filtro por tipo avisa de que no es exhaustivo', async ({ page, context }) => {
    await network(context);
    await open(page);
    await page.getByLabel('Tipo del ataque cargado').selectOption('poison');
    await expect(page.locator('.filters')).toContainText('No es una lista completa');
    const used = await page.locator('.rank-card .metrics div:last-child dd').allTextContents();
    expect(used.length).toBeGreaterThan(0);
    expect(new Set(used)).toEqual(new Set(['Veneno']));
    await page.getByText('Cómo leer estos datos').click();
    await expect(page.locator('.method')).toContainText('no sirve para comparar ataques de tipos distintos');
    await expect(page.locator('.method')).toContainText('2026.11.22.1');
  });

  test('megas, oscuros, legendarios, tier y buscador', async ({ page, context }) => {
    await network(context);
    await open(page);
    await page.getByRole('button', { name: /Tier S\+/ }).click();
    await expect(page.locator('.tier-group')).toHaveCount(1);
    await page.getByLabel('Megas').selectOption('only');
    await page.getByLabel('Legendarios').selectOption('only');
    await expect(page.locator('.rank-card').filter({ hasText: 'Mega-Mewtwo' })).toHaveCount(2);
    for (const name of await page.locator('.rank-card .pokemon-name').allTextContents()) expect(name).toMatch(/Mega-|Primigenio/);
    await page.getByLabel('Megas').selectOption('without');
    await expect(page.locator('.rank-card', { hasText: 'Mega-' })).toHaveCount(0);
    await page.getByLabel('Buscar Pokémon').fill('zzz');
    await expect(page.locator('.empty')).toContainText('Ningún Pokémon');
    // Al ir a otra sección y volver se conservan.
    await page.getByRole('link', { name: 'Eventos' }).click();
    await page.getByRole('link', { name: 'Gimnasios' }).click();
    await expect(page.getByLabel('Buscar Pokémon')).toHaveValue('zzz');
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await expect(page.locator('.tier-group')).toHaveCount(6);
  });

  test('«Mostrar más» no pierde fichas', async ({ page, context }) => {
    await network(context);
    await open(page);
    const splus = page.locator('.tier-group').first();
    await expect(splus.locator('.rank-card')).toHaveCount(30);
    await splus.getByRole('button', { name: /Mostrar más/ }).click();
    await expect(splus.locator('.rank-card')).toHaveCount(72);
  });
});

test.describe('defensores de gimnasio', () => {
  test('orden por resistencia, puestos, tipos y debilidades', async ({ page, context }) => {
    await network(context);
    await open(page, 'gimnasios');
    await page.getByRole('button', { name: 'Defensores' }).click();
    await expect(page).toHaveURL(/#gimnasios\/defensores$/);
    const cards = page.locator('.rank-card');
    for (const text of ['Puesto 1', 'Blissey', 'Normal', '83.824', 'Lucha ×1,6']) await expect(cards.first()).toContainText(text);
    await expect(cards.nth(4)).toContainText('Puesto 5');
    await expect(cards.nth(5)).toContainText('Puesto 5');
    await expect(cards.nth(6)).toContainText('Puesto 7');
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Atacantes' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('explica el cálculo a la vista y no muestra tiers ni movimientos', async ({ page, context }) => {
    await network(context);
    await open(page, 'gimnasios/defensores');
    const explain = page.getByRole('region', { name: 'Cómo se calcula' });
    await expect(explain).toBeInViewport({ ratio: 1 });
    for (const text of ['defensa base × aguante base', 'no una simulación', 'movimientos', 'motivación', 'enfrentamientos']) {
      await expect(explain).toContainText(text);
    }
    await expect(page.locator('.rank-card').first()).toBeVisible();
    await expect(page.locator('.tier, .moves, .move')).toHaveCount(0);
  });

  test('los que no pueden defender no aparecen y se explica por qué', async ({ page, context }) => {
    await network(context);
    await open(page, 'gimnasios/defensores');
    for (const name of ['mewtwo', 'aegislash', 'gengar mega']) {
      await page.getByLabel('Buscar Pokémon').fill(name);
      await expect(page.locator('.rank-card')).toHaveCount(0);
    }
    await page.getByLabel('Buscar Pokémon').fill('melmetal');
    await expect(page.locator('.rank-card')).toHaveCount(1);
    await page.getByLabel('Buscar Pokémon').fill('snorlax oscuro');
    await expect(page.locator('.empty')).toContainText('los oscuros, que sí pueden');
    await page.getByText('Qué Pokémon se incluyen').click();
    await expect(page.locator('.method')).toContainText('sí pueden defender gimnasios');
    await expect(page.locator('.method')).toContainText('no por una prohibición del juego');
    for (const text of ['salvo Meltan y Melmetal', 'ultraentes', 'Morpeko', 'Oscuros', 'sin repetir especie']) {
      await expect(page.locator('.method')).toContainText(text);
    }
  });

  test('filtrar por tipo conserva el puesto', async ({ page, context }) => {
    await network(context);
    await open(page, 'gimnasios/defensores');
    await page.getByLabel('Tipo del Pokémon').selectOption('water');
    await expect(page.locator('.rank-card').first()).toContainText('Puesto 4');
    await expect(page.locator('.rank-card').first()).toContainText('Dondozo');
  });
});

test.describe('datos y fallos', () => {
  test('no se descarga el dataset completo y, pasado un día, se vuelve a consultar', async ({ page, context }) => {
    const net = await network(context);
    await open(page);
    await expect(page.locator('.rank-card').first()).toBeVisible();
    expect(net.count('doctorpokegogo')).toBe(0);
    // El guardado termina después de pintar la lista.
    await expect.poll(() => stored(page)).toBe(true);
    net.reset();
    await page.reload();
    await expect(page.locator('.rank-card').first()).toBeVisible();
    expect(net.count(FILE)).toBe(0);
    await page.clock.setSystemTime(NOW + DAY + 60_000);
    await page.reload();
    await expect.poll(() => net.count(FILE)).toBe(1);
  });

  for (const [name, reply] of [
    ['sin conexión', 'fail'],
    ['HTML', '<html></html>'],
    ['archivo cortado', { format: 1, pokemon: [] }],
  ] as const) {
    test(`${name}: avisa y conserva lo último válido`, async ({ page, context }) => {
      const net = await network(context);
      await open(page);
      await expect(page.locator('.rank-card').first()).toBeVisible();
      net.table[FILE] = reply;
      await page.clock.setSystemTime(NOW + 3 * DAY);
      await page.reload();
      await expect(page.locator('.rank-card').first()).toBeVisible();
      await page.clock.runFor(30_000);
      await expect(page.locator('.status-warning').first()).toContainText('últimos datos válidos');
    });
  }

  test('si faltan los datos de gimnasios, el resto funciona', async ({ page, context }) => {
    const net = await network(context);
    net.table[FILE] = 'fail';
    await open(page);
    await page.clock.runFor(30_000);
    await expect(page.locator('.status-error')).toContainText('Todavía no hay datos');
    await page.getByRole('link', { name: 'PvP' }).click();
    await expect(page.locator('.rank-card').first()).toBeVisible();
  });
});

test.describe('diseño adaptable', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [1440, 900],
    ] as const) {
      test(`${scheme}, ${width} px: sin desbordes y con controles cómodos`, async ({ page, context }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height });
        await network(context);
        for (const hash of ['gimnasios', 'gimnasios/defensores']) {
          await page.goto(`/#${hash}`);
          await expect(page.locator('.rank-card').first()).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
          const problems = await page.locator('nav a, button:not(.text-button), input, select').evaluateAll((els) =>
            els
              .filter((e) => e.checkVisibility())
              .filter((e) => e.getBoundingClientRect().height < 44 || (e.tagName === 'BUTTON' && e.scrollWidth > e.clientWidth + 1))
              .map((e) => e.textContent),
          );
          expect(problems).toEqual([]);
        }
      });
    }
  }
});
