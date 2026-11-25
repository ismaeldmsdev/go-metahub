import { expect, test, type Page } from '@playwright/test';
import { fixtures, NOW } from '../fixtures';
import { network, saved } from './network';

const DAY = 86_400_000;
const MEGA = 'rankings/mega/overall/rankings-1500.json';
const RAIDS = 'data/incursiones.json';
const ESPURR = 'raids/defenders/ESPURR/';

async function open(page: Page, hash: string, time = NOW) {
  await page.clock.install({ time });
  await page.goto(`/#${hash}`);
}

const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};

/** Como la de las máquinas de GitHub: la peor que puede tener un dispositivo. */
const wideFont = (page: Page) =>
  page.evaluate(() => (document.body.style.fontFamily = 'Verdana, "DejaVu Sans", sans-serif'));

test.describe('ligas Mega y copas', () => {
  test('las ligas normales siguen siendo la pantalla de entrada', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'pvp');
    await expect(page.getByRole('button', { name: 'Normal', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tier-group')).toHaveCount(4);
    expect(net.count('rankings/mega')).toBe(0);
  });

  test('Mega: ranking propio, sin tiers y con cuatro movimientos', async ({ page, context }) => {
    const errors = errorsOf(page);
    const net = await network(context);
    await open(page, 'pvp');
    await page.getByRole('button', { name: 'Mega', exact: true }).click();
    const cards = page.locator('.rank-card');
    await expect(cards.first()).toContainText('Mega-Sableye');
    for (const text of ['94,0', 'Puesto 1', 'Tinieblas+']) await expect(cards.first()).toContainText(text);
    await expect(cards.first().locator('.move')).toHaveCount(4);
    await expect(page.locator('.tier')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Restricciones' })).toContainText('Se permiten megaevoluciones');
    expect(net.count(MEGA)).toBe(1);
    await page.getByLabel('Variante').selectOption('mega');
    await expect(cards.nth(1)).toContainText('Mega-Malamar');
    await expect(cards.nth(1)).toContainText('Puesto 31');
    await page.getByRole('searchbox').fill('zzzz');
    await expect(page.locator('.empty')).toContainText('Ningún Pokémon');
    expect(errors).toEqual([]);
  });

  test('calendario: semana en curso, fechas peninsulares, restricciones y ranking de la copa', async ({ page, context }) => {
    await network(context);
    await open(page, 'pvp/copas');
    const now = page.locator('.group', { has: page.getByRole('heading', { name: 'Ahora' }) });
    await expect(now).toContainText('Del 18 nov 2026, 22:00 al 25 nov 2026, 22:00');
    for (const text of ['Liga Ultra', 'Liga Máster: Edición Mega', 'Copa LAIC de GO 2026']) await expect(now).toContainText(text);
    await expect(page.getByRole('link', { name: 'página oficial de la temporada' })).toHaveAttribute(
      'href',
      'https://pokemongo.com/es/news/go-battle-league-twilight-trails',
    );
    await page.getByRole('link', { name: 'Ver ranking de Copa LAIC de GO 2026' }).click();
    await expect(page.locator('h2').first()).toHaveText('Copa LAIC de GO 2026');
    const rules = page.getByRole('region', { name: 'Restricciones' });
    await expect(rules).toContainText('No se permiten los de tipo Siniestro, Hada, Fuego o Acero');
    await rules.getByText('Pokémon prohibidos').click();
    await expect(rules.getByText(/Corsola de Galar/)).toBeVisible();
    await expect(page.locator('.rank-card').first()).toContainText('Puesto 1');
    await page.getByRole('link', { name: 'Calendario y copas' }).click();
    await page.getByRole('link', { name: 'Ver ranking de Liga Máster: Edición Mega' }).click();
    await expect(page.getByRole('button', { name: /Máster/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('una copa sin ranking muestra su información y no inventa otro', async ({ page, context }) => {
    await network(context);
    await open(page, 'pvp/copas');
    const entry = page.locator('.season-entry', { hasText: 'Mega Catch Cup' });
    await expect(entry).toContainText('Hasta 1500 PC');
    await expect(entry).toContainText('Ranking aún no publicado');
    await expect(entry.getByRole('link')).toHaveCount(0);
  });

  test('si LeekDuck deja de listar la semana en curso, se conserva; si nunca se conoció, se dice', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'pvp/copas');
    await expect(page.locator('.season-week')).toHaveCount(2);
    await saved(page, 'season');
    net.table['events.min.json'] = fixtures.events().filter((e: any) => e.eventType !== 'go-battle-league');
    await page.clock.setSystemTime(NOW + 7 * 3_600_000);
    await page.reload();
    await expect(page.locator('.season-week')).toHaveCount(1);
    await expect(page.locator('.season-week')).toContainText('Copa LAIC');
    await page.evaluate(() => indexedDB.deleteDatabase('pke-meta'));
    await page.reload();
    await expect(page.getByText('no lista ahora mismo la semana en curso')).toBeVisible();
  });

  test('una semana empieza sin recargar', async ({ page, context }) => {
    await network(context);
    await open(page, 'pvp/copas', Date.parse('2026-11-25T20:59:40Z'));
    const now = page.locator('.group', { has: page.getByRole('heading', { name: 'Ahora' }) });
    await expect(now.locator('.season-week')).toHaveCount(2);
    await page.clock.fastForward(60_000);
    await expect(now.locator('.season-week')).toHaveCount(1);
    await expect(now).toContainText('Mega Catch Cup');
  });

  test('sin conexión conserva el ranking y avisa; la primera vez lo dice y deja reintentar', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'pvp/mega');
    await expect(page.locator('.rank-card').first()).toBeVisible();
    await saved(page, 'format|mega|1500', 'pvp');
    net.table[MEGA] = 'fail';
    net.table['rankings-2500.json'] = 'fail';
    await page.clock.setSystemTime(NOW + 2 * DAY);
    await page.reload();
    await expect(page.locator('.rank-card').first()).toContainText('Mega-Sableye');
    await page.clock.runFor(30_000);
    await expect(page.locator('.status-warning').first()).toContainText('últimos datos válidos');
    await page.getByRole('button', { name: /Ultra/ }).click();
    await page.clock.runFor(30_000);
    await expect(page.locator('.status-error')).toContainText('Todavía no hay datos');
    await expect(page.getByRole('button', { name: 'Actualizar' }).last()).toBeVisible();
  });

  test('una copa que ya no existe lo dice', async ({ page, context }) => {
    await network(context);
    await open(page, 'pvp/copa-inventada-1500');
    await expect(page.getByText('ya no muestra esta copa')).toBeVisible();
  });
});

test.describe('incursiones por tipo', () => {
  test('los 18 tipos, con aviso, atribución y enlaces externos', async ({ page, context }) => {
    const errors = errorsOf(page);
    await network(context);
    await open(page, 'incursiones');
    await page.getByRole('button', { name: 'Por tipo' }).click();
    await expect(page.locator('.type-links a')).toHaveCount(18);
    await expect(page.getByText('No es un ranking completo')).toBeVisible();
    await page.locator('.type-links a', { hasText: 'Hielo' }).click();
    await expect(page.getByText('Faltan los que lo usan como segunda opción')).toBeVisible();
    const first = page.locator('.rank-card').first();
    for (const text of ['Kyurem Negro', '99,6', 'S+', 'Percentil', 'DPS*', 'TDO*']) await expect(first).toContainText(text);
    // Sin puestos: la lista no es completa.
    await expect(page.locator('.rank')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'GO Hub' })).toHaveAttribute('href', 'https://db.pokemongohub.net/pokemon-list/best-per-type/ice');
    await expect(page.locator('.attribution').getByRole('link', { name: 'CC BY 4.0' })).toBeVisible();
    await page.getByText('Cómo leer estos datos').click();
    await expect(page.getByText('una sola combinación por Pokémon')).toBeVisible();
    await page.getByLabel('Megas').selectOption('only');
    await expect(page.locator('.rank-card').first()).toContainText('Mega-');
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await page.getByRole('link', { name: 'Todos los tipos' }).click();
    await expect(page.locator('.type-links a')).toHaveCount(18);
    expect(errors).toEqual([]);
  });

  test('un fallo conserva los datos y no afecta a los jefes', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'incursiones/tipo-fire');
    await expect(page.locator('.rank-card').first()).toBeVisible();
    await saved(page, 'raidTypes');
    net.table[RAIDS] = { format: 1, pokemon: [] };
    await page.clock.setSystemTime(NOW + 2 * DAY);
    await page.reload();
    await expect(page.locator('.rank-card').first()).toBeVisible();
    await page.clock.runFor(30_000);
    await expect(page.locator('.status-warning').first()).toContainText('últimos datos válidos');
    await page.goto('/#incursiones');
    await expect(page.locator('.boss')).toHaveCount(18);
  });

  test('un tipo inexistente no rompe la sección', async ({ page, context }) => {
    await network(context);
    await open(page, 'incursiones/tipo-inventado');
    await expect(page.locator('.empty')).toContainText('ya no figura');
  });
});

test.describe('combates Max', () => {
  test('distingue confirmados, anunciados y catálogo sin fecha', async ({ page, context }) => {
    const errors = errorsOf(page);
    await network(context);
    await open(page, 'incursiones');
    await page.getByRole('button', { name: 'Max', exact: true }).click();
    const confirmed = page.getByRole('region', { name: 'Confirmados ahora' });
    await expect(confirmed).toContainText('Espurr');
    await expect(confirmed).toContainText('Hasta el 23 nov 2026, 21:00');
    const catalog = page.getByRole('region', { name: 'Catálogo sin fecha' });
    await expect(catalog).toContainText('No indica cuándo aparecen');
    await expect(catalog.locator('.rival')).toHaveCount(6);
    await expect(catalog).toContainText('Gigamax');
    await expect(page.getByRole('region', { name: 'Anunciados' })).not.toContainText('Lapras');
    await expect(page.getByRole('link', { name: /Pokébattler: combates Max/ })).toHaveAttribute('href', 'https://www.pokebattler.com/max');
    expect(errors).toEqual([]);
  });

  test('sin fechas, ningún jefe se da por actual', async ({ page, context }) => {
    const net = await network(context);
    net.table['events.min.json'] = fixtures.events().map((e: any) => ({ ...e, start: null, end: null }));
    await open(page, 'incursiones/max');
    await expect(page.getByText('Ningún jefe Max tiene ahora mismo fechas confirmadas')).toBeVisible();
    await page.locator('.rival', { hasText: 'Espurr' }).click();
    await expect(page.getByText('Sin fecha: está en el catálogo')).toBeVisible();
  });

  test('counters de un jefe: API documentada, formas y enlaces por papel', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'incursiones/max-espurr');
    const cards = page.locator('.rank-card');
    await expect(cards).toHaveCount(30);
    await expect(page.getByText('Confirmado hasta el 23 nov 2026, 21:00')).toBeVisible();
    await expect(page.getByText('No es un equipo completo')).toBeVisible();
    await expect(cards.first()).toContainText('Zacian');
    await expect(cards.first().locator('.move')).toHaveCount(1);
    await expect(cards.nth(1)).toContainText('Gigamax');
    await page.getByRole('button', { name: /^Gigamax/ }).click();
    await expect(cards).toHaveCount(2);
    await expect(cards.last()).toContainText('Puesto 4');
    const roles = page.getByRole('region', { name: 'Por papel en Pokébattler' });
    await expect(roles.getByRole('link')).toHaveCount(6);
    await expect(roles.getByRole('link', { name: 'Curación' })).toHaveAttribute(
      'href',
      'https://www.pokebattler.com/max/DYNAMAX_ESPURR/TOTAL_HEAL',
    );
    expect(net.count(ESPURR)).toBe(1);
    expect(net.count('includeLegendary')).toBe(0);
  });

  test('un jefe en varios niveles no pide counters de ninguno', async ({ page, context }) => {
    const net = await network(context);
    await open(page, 'incursiones/max-charizard');
    await expect(page.getByText('en varios niveles')).toBeVisible();
    expect(net.count('raids/defenders/')).toBe(0);
  });

  test('fichas: estadísticas teóricas, sin ranking ni tiers', async ({ page, context }) => {
    await network(context);
    await open(page, 'incursiones/max-pokemon');
    await expect(page.getByText('Datos teóricos, no un ranking')).toBeVisible();
    const cards = page.locator('.rank-card');
    await expect(cards).toHaveCount(10);
    await page.getByLabel('Orden').selectOption('hp');
    await expect(cards.first()).toContainText('Blissey');
    for (const text of ['129', '83.824', '496']) await expect(cards.first()).toContainText(text);
    await expect(page.locator('.rank, .tier')).toHaveCount(0);
    await page.getByLabel('Clase').selectOption('gigamax');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('Gigamax propio');
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await page.getByLabel('Tipo del ataque Max').selectOption('dragon');
    await expect(page.getByText('Los Gigamax tienen su propio ataque')).toBeVisible();
  });

  test('si Pokébattler falla, los jefes con fecha se ven y las incursiones también', async ({ page, context }) => {
    const net = await network(context);
    net.table['fight.pokebattler.com/raids'] = 'fail';
    await open(page, 'incursiones/max');
    await page.clock.runFor(30_000);
    await expect(page.getByRole('region', { name: 'Confirmados ahora' })).toContainText('Dynamax Espurr');
    await expect(page.locator('.status-error')).toContainText('Todavía no hay datos');
    await page.getByRole('button', { name: 'Jefes' }).click();
    await expect(page.locator('.boss')).toHaveCount(18);
  });
});

test.describe('sin conexión con la aplicación instalada', () => {
  test.use({ serviceWorkers: 'allow' });
  test('ranking Mega, tipos y Max siguen disponibles', async ({ page, context }) => {
    const net = await network(context);
    await page.goto('/#pvp/mega');
    await expect(page.locator('.rank-card').first()).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await saved(page, 'format|mega|1500', 'pvp', 'season', 'raidTypes', 'pokebattler', 'events');
    for (const key of Object.keys(net.table)) net.table[key] = 'fail';
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.rank-card').first()).toContainText('Mega-Sableye');
    await page.goto('/#incursiones/tipo-fire');
    await expect(page.locator('.rank-card').first()).toBeVisible();
    await page.goto('/#incursiones/max');
    await expect(page.locator('.rival')).toHaveCount(6);
    await page.goto('/#pvp/copas');
    await expect(page.locator('.season-week, .empty').first()).toBeVisible();
  });
});

test.describe('diseño adaptable', () => {
  const SCREENS: [string, string][] = [
    ['pvp', '.rank-card'],
    ['pvp/mega', '.rank-card'],
    ['pvp/copas', '.season-week'],
    ['pvp/copa-laic2027gbl-1500', '.rank-card'],
    ['incursiones', '.boss'],
    ['incursiones/tipos', '.type-links a'],
    ['incursiones/tipo-water', '.rank-card'],
    ['incursiones/max', '.rival'],
    ['incursiones/max-espurr', '.rank-card'],
    ['incursiones/max-pokemon', '.rank-card'],
  ];
  for (const scheme of ['light', 'dark'] as const) {
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [768, 1024],
      [1440, 900],
    ] as const) {
      test(`${scheme}, ${width} px: sin desbordes y con controles cómodos`, async ({ page, context }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height });
        await network(context);
        for (const [hash, item] of SCREENS) {
          await page.goto(`/#${hash}`);
          await expect(page.locator(item).first()).toBeVisible();
          await wideFont(page);
          for (const size of ['16px', '20px']) {
            await page.evaluate((value) => (document.documentElement.style.fontSize = value), size);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            expect(overflow, `${hash} ${size}`).toBeLessThanOrEqual(0);
          }
          await page.evaluate(() => (document.documentElement.style.fontSize = document.body.style.fontFamily = ''));
          const problems = await page
            .locator('nav a, .sources-link, .back, .season-open, .type-links a, .link-list a, button:not(.text-button), input, select')
            .evaluateAll((els) =>
              els
                .filter((e) => e.checkVisibility())
                .filter((e) => e.getBoundingClientRect().height < 43.9 || (e.tagName === 'BUTTON' && e.scrollWidth > e.clientWidth + 1))
                .map((e) => e.textContent),
            );
          expect(problems, hash).toEqual([]);
        }
      });
    }
  }
});
