// Descarga la evaluación de incursiones, la valida y genera public/data/incursiones.json.
// Si algo no cuadra, termina con error y no toca el archivo. Con --comprobar, nunca escribe.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const OUT = fileURLToPath(new URL('../public/data/incursiones.json', import.meta.url));
const { module: raids } = await runnerImport(fileURLToPath(new URL('./raid-attackers.ts', import.meta.url)), {
  configFile: false,
  logLevel: 'error',
});

async function download(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'go-metahub-incursiones' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new raids.DataError(`${url} ha respondido con el error ${response.status}`);
  return response.json();
}

// Para probar con copias ya descargadas: --dataset=archivo --gamemaster=archivo
const option = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const load = async (file, url) => (file ? JSON.parse(readFileSync(file, 'utf8')) : download(url));
const list = (label, ids) =>
  `- ${label}: ${ids.length}${ids.length ? ` (${ids.slice(0, 25).join(', ')}${ids.length > 25 ? '…' : ''})` : ''}`;

try {
  const [dataset, gamemaster] = await Promise.all([
    load(option('dataset'), raids.DATASET_URL),
    load(option('gamemaster'), raids.GAMEMASTER_URL),
  ]);
  const before = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : null;
  const { file, coverage } = raids.build(dataset, gamemaster);
  const previous = before && JSON.parse(before);
  raids.checkAgainst(previous, file);
  const text = raids.serialize(file);
  const changed = raids.needsUpdate(previous, file);
  if (changed && !process.argv.includes('--comprobar')) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
  }

  const { omitted, byType } = coverage;
  const report = [
    `Dataset ${file.source.version}, del ${file.source.generatedAt}. ${changed ? 'Hay cambios.' : 'Sin cambios.'}`,
    '',
    `- Fichas de origen: ${coverage.records}. Publicadas: ${coverage.published}`,
    `- Por tipo de ataque: ${Object.entries(byType).map(([type, n]) => `${type} ${n}`).join(', ')}`,
    list('Omitidas por repetir la forma normal (Gigamax)', omitted.gigantamax),
    list('Omitidas por no estar publicadas', omitted.unreleased),
    list('Omitidas por no tener pareja segura', omitted.unmatched),
    list('Omitidas por no tener evaluación', omitted.unavailable),
    list('Omitidas por existir solo a mitad de un combate', omitted.battleForm),
    list('Omitidas por movimientos dudosos', omitted.doubtfulMoves),
    `- Tamaño: ${Math.round(Buffer.byteLength(text) / 1024)} KB`,
  ].join('\n');
  console.log(report);
  const { GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `changed=${changed}\nversion=${file.source.version}\n`);
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `## Incursiones\n\n${report}\n`);
} catch (error) {
  console.error(error instanceof raids.DataError ? `Datos rechazados: ${error.message}` : error);
  process.exitCode = 1;
}
