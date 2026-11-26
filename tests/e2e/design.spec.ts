import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { NOW } from '../fixtures';
import { network, pick } from './network';

const LISTS = ['pvp', 'pvp/mega', 'gimnasios', 'gimnasios/defensores', 'incursiones/cresselia', 'incursiones/tipo-ghost', 'incursiones/max-pokemon', 'rocket/atacantes'];

const clocked = new WeakSet<Page>();
const open = async (page: Page, hash: string, item = '.rank-card') => {
  // A la fecha de los datos: lo que se ve en Incursiones depende de la hora.
  if (!clocked.has(page)) await page.clock.install({ time: NOW });
  clocked.add(page);
  await page.goto(`/#${hash}`);
  // En la ficha de un jefe de incursión, la lista completa está plegada bajo los seis primeros: se despliega.
  if (/^incursiones\/[a-z]+$/.test(hash) && hash !== 'incursiones/tipos' && hash !== 'incursiones/max') {
    await expect(page.locator('.top-counters > li').first()).toBeVisible();
    await page.locator('details.rb-all').evaluate((d) => ((d as HTMLDetailsElement).open = true));
  }
  await expect(page.locator(item).first()).toBeVisible();
};

test.describe('cabecera al desplazarse', () => {
  for (const [hash, item] of [
    ['pvp', '.rank-card'],
    ['incursiones', '.rb-boss'],
    ['incursiones/cresselia', '.tc'],
    ['rocket/reclutas', '.trainer'],
    ['gimnasios', '.rank-card'],
  ] as const) {
    test(`${hash}: queda una fila fija que no salta, no cambia de altura y no tapa la cabecera`, async ({ page, context }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await network(context);
      await open(page, hash, item);
      await page.waitForTimeout(500);
      const steps = await page.evaluate(async () => {
        const shifts: number[] = [];
        new PerformanceObserver((list) => list.getEntries().forEach((e) => shifts.push((e as unknown as { value: number }).value))).observe({ type: 'layout-shift' });
        const pin = document.querySelector('.pin')!;
        const out: { y: number; top: number; height: number; gap: number }[] = [];
        const start = pin.getBoundingClientRect().top;
        for (const y of [0, 10, 40, 80, 120, 160, 200, 260, 400, 900, 400, 260, 200, 160, 120, 80, 40, 10, 0]) {
          window.scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const box = pin.getBoundingClientRect();
          out.push({ y: window.scrollY, top: box.top, height: box.height, gap: box.top - Math.max(0, start - window.scrollY) });
        }
        await new Promise((r) => setTimeout(r, 300));
        return { out, shifts };
      });
      // Sigue al dedo al píxel hasta quedar arriba, y vuelve por el mismo camino.
      for (const step of steps.out) expect(Math.abs(step.gap), JSON.stringify(step)).toBeLessThanOrEqual(1);
      expect(new Set(steps.out.map((s) => Math.round(s.height))).size).toBe(1);
      expect(steps.shifts.reduce((a, b) => a + b, 0)).toBeLessThan(0.02);
    });
  }

  test('filtrar a media lista deja el primer resultado justo bajo la fila fija', async ({ page, context }) => {
    await network(context);
    await open(page, 'pvp');
    await page.evaluate(() => window.scrollTo(0, 2500));
    await page.getByRole('searchbox').fill('tinkaton');
    await expect(page.locator('.rank-card')).toHaveCount(1);
    await expect(page.locator('.rank-card')).toBeInViewport({ ratio: 1 });
    const free = await page.evaluate(() => document.querySelector('.tier-group')!.getBoundingClientRect().top - document.querySelector('.pin')!.getBoundingClientRect().bottom);
    expect(free).toBeGreaterThanOrEqual(0);
  });

  test('abrir y cerrar los filtros no mueve la página ni pierde el foco', async ({ page, context }) => {
    await network(context);
    await open(page, 'gimnasios');
    await page.evaluate(() => window.scrollTo(0, 1200));
    const before = await page.evaluate(() => window.scrollY);
    const button = page.getByRole('button', { name: 'Filtros' });
    await button.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test.describe('filtros', () => {
  test('se ve cuántos hay activos y cuáles, y se quitan de uno en uno o todos', async ({ page, context }) => {
    await network(context);
    await open(page, 'gimnasios');
    await expect(page.getByRole('group', { name: 'Filtros activos' })).toHaveCount(0);
    await pick(page, ['Tier', 'S'], ['Megas', 'Sin megas'], ['Oscuros', 'Solo oscuros']);
    const chips = page.getByRole('group', { name: 'Filtros activos' });
    await expect(page.getByRole('button', { name: 'Filtros 3 activos' })).toBeVisible();
    for (const name of ['Tier S', 'Sin megas', 'Solo oscuros']) await expect(chips).toContainText(name);
    await expect(page.getByRole('group', { name: 'Tier', exact: true }).getByRole('button', { name: /^Tier S ?[0-9]/ })).toHaveAttribute('aria-pressed', 'true');
    // Siguen a la vista a media lista.
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expect(chips).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: 'Quitar Sin megas' }).click();
    await expect(page.getByRole('button', { name: 'Filtros 2 activos' })).toBeVisible();
    await page.getByRole('button', { name: 'Quitar todos' }).click();
    await expect(chips).toHaveCount(0);
    await expect(page.locator('.tier-group')).toHaveCount(6);
  });

  test('restablecer desde la hoja quita todos a la vez', async ({ page, context }) => {
    await network(context);
    await open(page, 'incursiones/max-pokemon');
    await pick(page, ['Clase', 'Gigamax'], ['Orden', 'Por nombre']);
    await page.getByRole('button', { name: 'Filtros 2 activos' }).click();
    await page.getByRole('button', { name: 'Restablecer' }).click();
    await page.getByRole('button', { name: 'Ver resultados' }).click();
    await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toBeVisible();
    await expect(page.locator('.rank-card')).toHaveCount(10);
  });

  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`hoja a ${width} px: cabe, se desplaza por dentro y todo se puede pulsar`, async ({ page, context }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await network(context);
      await open(page, 'gimnasios');
      await page.evaluate(() => (document.body.style.fontFamily = 'Verdana, "DejaVu Sans", sans-serif'));
      await page.getByRole('button', { name: 'Filtros' }).click();
      const box = (await page.getByRole('dialog').boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      await expect(page.getByRole('button', { name: 'Ver resultados' })).toBeInViewport({ ratio: 1 });
      const bad = await page.locator('dialog button').evaluateAll((els) =>
        els.filter((e) => e.getBoundingClientRect().height < 43.9 || e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
      );
      expect(bad).toEqual([]);
      await page.getByRole('button', { name: 'Hada' }).click();
      await expect(page.getByRole('button', { name: 'Hada', exact: true })).toHaveAttribute('aria-pressed', 'true');
    });
  }
});

test.describe('fichas', () => {
  for (const width of [320, 375, 390, 430]) {
    test(`a ${width} px, textos enteros y cifras en la misma columna, también con los nombres más largos`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 800 });
      await network(context);
      for (const hash of LISTS) {
        await open(page, hash);
        // Con todas las fichas a la vista y sin aplazar ninguna.
        // También con la letra de las máquinas de GitHub, la más ancha que puede tener un dispositivo.
        for (const font of ['', 'Verdana, "DejaVu Sans", sans-serif']) {
          await page.evaluate((value) => (document.body.style.fontFamily = value), font);
          const result = await page.evaluate(() => {
            document.querySelectorAll<HTMLElement>('.rank-card').forEach((el) => (el.style.contentVisibility = 'visible'));
            const range = document.createRange();
            const problems: string[] = [];
            const cards = [...document.querySelectorAll('.rank-card')];
            for (const card of cards) {
              const name = card.querySelector('.pokemon-name')!.textContent;
              const figure = card.querySelector('.rank-figure')!.getBoundingClientRect();
              const box = card.getBoundingClientRect();
              for (const el of card.querySelectorAll('.rank-body > *')) {
                range.selectNodeContents(el);
                for (const r of range.getClientRects()) {
                  if (r.right > figure.left + 2) problems.push(`${name}: se mete bajo la ilustración`);
                  if (r.bottom > box.bottom + 1) problems.push(`${name}: se sale por abajo`);
                }
              }
              const score = card.querySelector('.score')?.getBoundingClientRect();
              const art = card.querySelector('.rank-figure .pk')!.getBoundingClientRect();
              if (score && score.top < art.bottom - 1) problems.push(`${name}: la cifra tapa la ilustración`);
              // Movimientos: en una línea, o partidos solo entre palabras.
              for (const move of card.querySelectorAll('.move-name')) {
                const text = move.firstChild as Text;
                for (const match of text.data.matchAll(/\S+/g)) {
                  range.setStart(text, match.index);
                  range.setEnd(text, match.index + match[0].length);
                  if (range.getClientRects().length > 1) problems.push(`${name}: «${match[0]}» partido`);
                }
              }
            }
            const right = new Set(
              cards.flatMap((card) => {
                const b = card.querySelector('.score b');
                return b ? [Math.round(b.getBoundingClientRect().right - card.getBoundingClientRect().left)] : [];
              }),
            );
            const columns = new Set(
              [...document.querySelectorAll('.metrics > div:nth-child(2)')].map((el) => Math.round(el.getBoundingClientRect().left - el.closest('.rank-card')!.getBoundingClientRect().left)),
            );
            return { total: cards.length, problems: [...new Set(problems)].slice(0, 5), right: right.size, columns: columns.size };
          });
          expect(result.problems, `${hash} ${font}`).toEqual([]);
          expect(result.right, hash).toBe(1);
          expect(result.columns, hash).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  test('movimientos legibles: 14 px o más, seminegrita y uno por línea', async ({ page, context }) => {
    await network(context);
    await open(page, 'pvp');
    const moves = await page
      .locator('.rank-card')
      .first()
      .locator('.move')
      .evaluateAll((els) => els.map((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), weight: Number(getComputedStyle(el).fontWeight), top: el.getBoundingClientRect().top })));
    expect(moves.length).toBe(3);
    for (const move of moves) {
      expect(move.size).toBeGreaterThanOrEqual(14);
      expect(move.weight).toBeGreaterThanOrEqual(600);
    }
    expect(new Set(moves.map((m) => m.top)).size).toBe(3);
  });
});

test('el logo es el archivo original, entero y sin recortar', async ({ page, context }) => {
  await network(context);
  const hash = (file: string) => createHash('sha1').update(readFileSync(file)).digest('hex');
  expect(hash('public/logo-small.webp')).toBe(hash('dist/logo-small.webp'));
  for (const [route, selector] of [
    ['pvp', '.brand'],
    ['fuentes', '.credits-logo'],
  ] as const) {
    await page.goto(`/#${route}`);
    const logo = page.locator(selector);
    await expect(logo).toBeVisible();
    for (const [property, value] of [
      ['border-radius', '0px'],
      ['filter', 'none'],
      ['clip-path', 'none'],
      ['opacity', '1'],
    ] as const) {
      await expect(logo).toHaveCSS(property, value);
    }
    const ratio = await logo.evaluate((img: HTMLImageElement) => img.getBoundingClientRect().width / img.getBoundingClientRect().height);
    expect(ratio).toBeCloseTo(1, 2);
  }
});
