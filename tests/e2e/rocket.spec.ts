import { expect, test, type Page } from '@playwright/test';
import { fixtures, NOW } from '../fixtures';
import { network, pick, saved } from './network';

const HOUR = 3_600_000;
const MAIN = 'event-info/main/grunts/formatted.json';
const CONTRAST = 'rocketLineups.min.json';
const ATTACKERS = 'data/rocket.json';

async function open(page: Page, hash = 'rocket') {
  await page.clock.install({ time: NOW });
  await page.goto(`/#${hash}`);
}

/** Letra tan ancha como la peor que pueda tener un dispositivo; la de las máquinas de GitHub es así. */
const wideFont = (page: Page) =>
  page.evaluate(() => (document.body.style.fontFamily = 'Verdana, "DejaVu Sans", sans-serif'));

const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};

test.describe('navegación', () => {
  for (const width of [320, 390]) {
    test(`a ${width} px: cinco accesos legibles y Fuentes en la cabecera`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 640 });
      await network(context);
      await open(page);
      const links = page.getByRole('navigation').getByRole('link');
      await expect(links).toHaveText(['PvP', 'Incursiones', 'Gimnasios', 'Eventos', 'Rocket']);
      await wideFont(page);
      const boxes = await links.evaluateAll((els) =>
        els.map((el) => {
          const label = el.lastElementChild!;
          const range = document.createRange();
          range.selectNodeContents(label);
          return { width: el.getBoundingClientRect().width, text: range.getBoundingClientRect(), font: parseFloat(getComputedStyle(label).fontSize) };
        }),
      );
      expect(new Set(boxes.map((b) => Math.round(b.width))).size).toBe(1);
      for (const [i, box] of boxes.entries()) {
        expect(box.font).toBeGreaterThan(10.5);
        expect(box.text.left).toBeGreaterThanOrEqual(0);
        expect(box.text.right).toBeLessThanOrEqual(boxes[i + 1]?.text.left ?? width);
      }
      const sources = page.getByRole('banner').getByRole('link', { name: 'Fuentes' });
      await expect(sources).toHaveAttribute('title', /estado y origen/);
      await expect(sources).toContainText('Fuentes');
      expect((await sources.boundingBox())!.height).toBeGreaterThan(43.9);
      await sources.click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fuentes');
      await expect(sources).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.source')).toHaveCount(12);
    });
  }

  test('los avisos de las fuentes se ven en la cabecera', async ({ page, context }) => {
    const net = await network(context);
    net.table[CONTRAST] = 'fail';
    await open(page, 'pvp');
    await page.clock.runFor(30_000);
    await expect(page.locator('.sources-link .nav-alert')).toBeVisible();
  });
});

test.describe('entrenadores', () => {
  test('líderes y Giovanni: alineación, alternativas, frase y fecha', async ({ page, context }) => {
    const errors = errorsOf(page);
    await network(context);
    await open(page);
    const cards = page.locator('.trainer');
    await expect(cards).toHaveCount(4);
    await expect(cards.locator('.rank-meta > .pokemon-name')).toHaveText(['Giovanni', 'Cliff', 'Arlo', 'Sierra']);
    for (const text of ['Prueba: el jefe.', 'Persian', 'Kangaskhan', 'Rhyperior', 'Machamp', 'Zekrom']) {
      await expect(cards.first()).toContainText(text);
    }
    await expect(cards.nth(1)).toContainText('Weezing de Galar');
    await expect(page.getByText('sin cambios desde el 4 oct 2026, 06:51')).toBeVisible();
    await expect(page.getByText(/Coinciden con las de LeekDuck en los 26 entrenadores/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('reclutas: buscar por frase y distinguir a los que la comparten', async ({ page, context }) => {
    await network(context);
    await open(page);
    await page.getByRole('button', { name: 'Reclutas' }).click();
    await expect(page.locator('.trainer')).toHaveCount(22);
    await page.getByRole('searchbox').fill('rio profundo');
    const cards = page.locator('.trainer');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('Mujer');
    await expect(cards.last()).toContainText('Hombre');
    await expect(cards.last()).toContainText('Magikarp, Feebas');
    await cards.last().getByRole('link').click();
    await expect(page.getByText('Comparte frase con')).toContainText('Recluta de tipo Agua (mujer)');
    await page.getByRole('link', { name: 'Recluta de tipo Agua (mujer)' }).click();
    await expect(page.locator('article.trainer')).toContainText('Mujer');
    await page.getByRole('link', { name: 'Todos los reclutas' }).click();
    await expect(page.getByRole('searchbox')).toHaveValue('rio profundo');
    await page.getByRole('button', { name: 'Quitar búsqueda' }).click();
    await expect(cards).toHaveCount(22);
  });

  test('sin frase en español se muestra la categoría o el tipo, y con frase, su origen', async ({ page, context }) => {
    await network(context);
    await open(page, 'rocket/decoy-f');
    await expect(page.locator('article.trainer')).toContainText('Recluta señuelo');
    await expect(page.locator('.phrase')).toHaveCount(0);
    await expect(page.getByText('Frases del juego')).toHaveCount(0);
    await page.goto('/#rocket/fire-f');
    await expect(page.locator('article.trainer')).toContainText('Fuego');
    await expect(page.locator('.phrase')).toHaveCount(0);
    await page.goto('/#rocket/water-f');
    await expect(page.locator('.phrase')).toHaveText('«Prueba: río profundo.»');
    await expect(page.getByText('Frases del juego, a través de WatWowMap')).toBeVisible();
  });

  test('un entrenador que ya no está lo dice', async ({ page, context }) => {
    await network(context);
    await open(page, 'rocket/jessie');
    await expect(page.getByText('ya no figura en las alineaciones')).toBeVisible();
  });
});

test.describe('rival elegido', () => {
  test('debilidades y opciones, con su origen y sus límites a la vista', async ({ page, context }) => {
    const errors = errorsOf(page);
    await network(context);
    await open(page, 'rocket/cliff');
    const panel = page.getByRole('region', { name: 'Pokémon elegido' });
    await expect(panel.getByRole('heading', { name: /Cubone/ })).toBeVisible();
    const tyranitar = page.getByRole('button', { name: 'Tyranitar' });
    await tyranitar.click();
    await expect(tyranitar).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByRole('region', { name: 'Debilidades' })).toContainText('Lucha ×2,56');
    const options = page.getByRole('region', { name: 'Opciones con ventaja de tipo' });
    for (const text of [
      'Sugerencia de GO MetaHub',
      'No son counters exactos ni una simulación',
      'los escudos, la resistencia, los ataques del rival ni el equipo completo',
    ]) {
      await expect(options).toContainText(text);
    }
    await expect(options.locator('.attribution')).toContainText('doctorpokegogo.com');
    const fighting = page.getByRole('region', { name: 'Ataques de tipo Lucha' });
    // Primero unas pocas; el resto, al pedirlo.
    await expect(fighting.locator('.rank-card')).toHaveCount(3);
    expect(await options.locator('.rank-card').count()).toBeLessThanOrEqual(6);
    const first = fighting.locator('.rank-card').first();
    for (const text of ['Tipo cargado', 'Tipo rápido', 'Punt. general', '×2,56', 'S+ ·']) await expect(first).toContainText(text);
    // Sin puestos ni tier que parezca medido contra este rival.
    await expect(options.locator('.rank, .tier')).toHaveCount(0);
    await page.getByText('Qué viene de la fuente y qué no').click();
    await expect(options.getByText('no mide su rendimiento contra Tyranitar')).toBeVisible();
    await page.getByRole('button', { name: /^Ver más opciones/ }).click();
    await expect(fighting.locator('.rank-card')).toHaveCount(4);
    await expect(page.getByRole('region', { name: 'Ataques de tipo Hada' })).toBeVisible();
    await page.getByRole('button', { name: /^Más de Lucha/ }).click();
    expect(await fighting.locator('.rank-card').count()).toBeGreaterThan(4);
    expect(errors).toEqual([]);
  });

  test('no sugiere a quien es débil al rival', async ({ page, context }) => {
    await network(context);
    await open(page, 'rocket/giovanni');
    await page.getByRole('button', { name: 'Zekrom' }).click();
    const options = page.getByRole('region', { name: 'Opciones con ventaja de tipo' });
    await expect(options).toContainText('que no sean débiles a sus tipos');
    await page.getByRole('button', { name: /^Ver más opciones/ }).click();
    await expect(options.locator('.rank-card').first()).toBeVisible();
    await expect(options.locator('.rank-card', { hasText: 'Mega-Garchomp' })).toHaveCount(0);
  });

  test('filtros de megas, oscuros y legendarios', async ({ page, context }) => {
    await network(context);
    await open(page, 'rocket/cliff');
    const options = page.getByRole('region', { name: 'Opciones con ventaja de tipo' });
    await pick(page, ['Megas', 'Sin megas'], ['Legendarios', 'Sin legendarios'], ['Oscuros', 'Solo oscuros']);
    await expect(options.locator('.rank-card').first()).toContainText('Oscuro');
    await expect(options.locator('.rank-card', { hasText: /Mega-|Primigenio/ })).toHaveCount(0);
  });

  test('sin opciones suficientes: debilidades y atacantes generales', async ({ page, context }) => {
    const net = await network(context);
    const data = fixtures.rocketAttackers();
    data.pokemon = data.pokemon.map((p: any) => ({ ...p, tier: 'C' }));
    net.table[ATTACKERS] = data;
    await open(page, 'rocket/cliff');
    await expect(page.getByRole('region', { name: 'Debilidades' })).toContainText('Agua');
    await expect(page.getByText('No hay suficientes opciones fiables')).toBeVisible();
    await expect(page.locator('.rank-card')).toHaveCount(0);
    await page.getByRole('link', { name: 'Ver los mejores atacantes generales' }).click();
    await expect(page.locator('.tier-group')).toHaveCount(1);
  });

  test('sin el archivo de atacantes, quedan las debilidades', async ({ page, context }) => {
    const net = await network(context);
    net.table[ATTACKERS] = 'fail';
    await open(page, 'rocket/cliff');
    await page.clock.runFor(30_000);
    await expect(page.getByRole('region', { name: 'Debilidades' })).toContainText('Agua');
    await expect(page.getByText('solo se pueden mostrar las debilidades')).toBeVisible();
  });

  test('sin los datos de PvPoke no se inventan tipos', async ({ page, context }) => {
    const net = await network(context);
    net.table['gamemaster.min.json'] = 'fail';
    await open(page, 'rocket/cliff');
    await page.clock.runFor(30_000);
    await expect(page.getByRole('button', { name: 'Tyranitar' })).toBeVisible();
    await expect(page.getByText('Sus tipos aún no se han podido cargar')).toBeVisible();
    await expect(page.locator('.rank-card')).toHaveCount(0);
  });
});

test.describe('atacantes generales', () => {
  test('tier, puntuación y movimientos originales, con atribución', async ({ page, context }) => {
    await network(context);
    await open(page);
    await page.getByRole('link', { name: 'Ver atacantes generales' }).click();
    await expect(page.getByText('Es una evaluación general, no contra un rival concreto')).toBeVisible();
    await expect(page.getByText('Datos de doctorpokegogo', { exact: true })).toBeVisible();
    const note = page.locator('.attribution');
    await expect(note.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    await expect(note).toContainText('transformados y resumidos');
    const data = fixtures.rocketAttackers().pokemon;
    const machamp = data.find((p: any) => p.name === 'Machamp (Shadow)');
    await page.getByRole('searchbox').fill('machamp oscuro');
    const card = page.locator('.rank-card');
    await expect(card).toHaveCount(1);
    for (const text of [`Tier general ${machamp.tier}`, String(machamp.score), 'Contraataque', 'Lucha', 'Oscuro']) {
      await expect(card).toContainText(text);
    }
    await expect(page.locator('.rank')).toHaveCount(0);
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Pokémon' })).toContainText(`${data.length} Pokémon`);
  });
});

test.describe('fuentes que no coinciden', () => {
  test('lo avisa en la lista, en la ficha y dentro, con lo que dice cada una', async ({ page, context }) => {
    const net = await network(context);
    const raw = fixtures.rocketContrast();
    const cliff = raw.find((t: any) => t.name === 'Cliff');
    cliff.secondPokemon[0] = { ...cliff.secondPokemon[0], name: 'Pidgey', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm16.icon.png' };
    net.table[CONTRAST] = raw.filter((t: any) => t.name !== 'Sierra');
    await open(page);
    const warning = page.getByRole('region', { name: 'Diferencias entre fuentes' });
    await expect(warning).toContainText('WatWowMap y LeekDuck no coinciden');
    await expect(warning).toContainText('Pokémon distintos: Cliff');
    await expect(warning).toContainText('LeekDuck no lista a: Sierra');
    await expect(page.getByText(/Coinciden con las de LeekDuck/)).toHaveCount(0);
    await expect(page.locator('#rocket-cliff')).toContainText('Las fuentes no coinciden');
    await warning.getByRole('link', { name: 'Cliff' }).click();
    await expect(warning).toContainText('Segundo: solo WatWowMap indica Snorlax; solo LeekDuck indica Pidgey');
    await page.goto('/#rocket/sierra');
    await expect(page.getByText('puede no estar activo')).toBeVisible();
  });
});

test.describe('fallos y conexión', () => {
  for (const [name, reply] of [
    ['sin conexión', 'fail'],
    ['HTML inesperado', '<html></html>'],
    ['lista vacía', {}],
  ] as const) {
    test(`${name}: conserva las alineaciones y avisa`, async ({ page, context }) => {
      const net = await network(context);
      await open(page);
      await expect(page.locator('.trainer')).toHaveCount(4);
      await saved(page, 'rocket');
      net.table[MAIN] = reply;
      await page.clock.setSystemTime(NOW + 7 * HOUR);
      await page.reload();
      await expect(page.locator('.trainer')).toHaveCount(4);
      await page.clock.runFor(30_000);
      await expect(page.locator('.status-warning').first()).toContainText('últimos datos válidos');
    });
  }

  test('sin el contraste, las alineaciones se ven y lo dice', async ({ page, context }) => {
    const net = await network(context);
    net.table[CONTRAST] = 'fail';
    await open(page);
    await expect(page.locator('.trainer')).toHaveCount(4);
    await expect(page.getByText('Todavía no se han podido contrastar con LeekDuck')).toBeVisible();
  });

  test('una alineación nueva aparece al volver a consultar', async ({ page, context }) => {
    const net = await network(context);
    await open(page);
    await expect(page.locator('#rocket-giovanni')).toContainText('Zekrom');
    const next = fixtures.rocket();
    next['44'].encounters.third = [{ id: 643 }];
    net.table[MAIN] = next;
    await page.clock.setSystemTime(NOW + 6 * HOUR + 60_000);
    await page.clock.runFor(90_000);
    await expect(page.locator('#rocket-giovanni')).toContainText('Reshiram');
  });

  test('si no hay ningún dato, se puede reintentar y el resto funciona', async ({ page, context }) => {
    const net = await network(context);
    net.table[MAIN] = 'fail';
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
      [768, 1024],
      [1440, 900],
    ] as const) {
      test(`${scheme}, ${width} px: sin desbordes y con controles cómodos`, async ({ page, context }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height });
        await network(context);
        for (const hash of ['rocket', 'rocket/reclutas', 'rocket/cliff', 'rocket/atacantes']) {
          await page.goto(`/#${hash}`);
          await expect(page.locator(hash === 'rocket/atacantes' ? '.rank-card' : '.trainer').first()).toBeVisible();
          await wideFont(page);
          for (const size of ['16px', '20px']) {
            await page.evaluate((value) => (document.documentElement.style.fontSize = value), size);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
          }
          await page.evaluate(() => (document.documentElement.style.fontSize = document.body.style.fontFamily = ''));
          const problems = await page.locator('nav a, .sources-link, .back, button:not(.text-button), input, select').evaluateAll((els) =>
            els
              .filter((e) => e.checkVisibility())
              .filter((e) => e.getBoundingClientRect().height < 43.9 || (e.tagName === 'BUTTON' && e.scrollWidth > e.clientWidth + 1))
              .map((e) => e.textContent),
          );
          expect(problems).toEqual([]);
        }
      });
    }
  }

  for (const width of [760, 768, 820, 899, 900, 960, 1023, 1024, 1280]) {
    test(`cabecera a ${width} px: nada se monta`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 700 });
      await network(context);
      for (const hash of ['pvp', 'incursiones', 'gimnasios', 'rocket', 'fuentes']) {
        await page.goto(`/#${hash}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await wideFont(page);
        const boxes = await page.evaluate(() =>
          ['.brand', '.header h1', '.sources-link', ...[1, 2, 3, 4, 5].map((i) => `.nav a:nth-child(${i})`)].map((s) => {
            const range = document.createRange();
            const el = document.querySelector(s)!;
            range.selectNode(el);
            const box = el.tagName === 'IMG' ? el.getBoundingClientRect() : range.getBoundingClientRect();
            return { s, left: box.left, right: box.right };
          }),
        );
        for (const [i, box] of boxes.entries()) {
          if (i > 0) expect(box.left, `${hash} ${box.s}`).toBeGreaterThanOrEqual(boxes[i - 1]!.right - 1);
          expect(box.right, `${hash} ${box.s}`).toBeLessThanOrEqual(width);
        }
      }
    });
  }
});
