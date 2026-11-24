// Descarga los datos de gimnasios, los valida y genera public/data/gimnasios.json.
// Si algo no cuadra, termina con error y no toca el archivo. Con --comprobar, nunca escribe.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const OUT = fileURLToPath(new URL('../public/data/gimnasios.json', import.meta.url));
const { module: gyms } = await runnerImport(fileURLToPath(new URL('./gyms.ts', import.meta.url)), {
  configFile: false,
  logLevel: 'error',
});

async function download(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'go-metahub-gimnasios' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new gyms.DataError(`${url} ha respondido con el error ${response.status}`);
  return response.json();
}

// Para probar con copias ya descargadas: --dataset=archivo --gamemaster=archivo
const option = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const load = async (file, url) => (file ? JSON.parse(readFileSync(file, 'utf8')) : download(url));
const list = (label, ids) =>
  `- ${label}: ${ids.length}${ids.length ? ` (${ids.slice(0, 25).join(', ')}${ids.length > 25 ? '…' : ''})` : ''}`;

try {
  const [dataset, gamemaster] = await Promise.all([
    load(option('dataset'), gyms.DATASET_URL),
    load(option('gamemaster'), gyms.GAMEMASTER_URL),
  ]);
  const before = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : null;
  const { file, coverage } = gyms.build(dataset, gamemaster);
  gyms.checkAgainst(before && JSON.parse(before), file);
  const text = gyms.serialize(file);
  const changed = text !== before;
  if (changed && !process.argv.includes('--comprobar')) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
  }

  const { omitted } = coverage;
  const report = [
    `Dataset ${file.source.version}, del ${file.source.generatedAt}. ${changed ? 'Hay cambios.' : 'Sin cambios.'}`,
    '',
    `- Fichas de origen: ${coverage.records}. Publicadas: ${coverage.published}`,
    `- Atacantes: ${coverage.attackers}. Defensores: ${coverage.defenders}`,
    list('Omitidas por repetir la forma normal (Gigamax)', omitted.gigantamax),
    list('Omitidas por no poder usarse en gimnasios', omitted.notInGyms),
    list('Omitidas por no estar publicadas', omitted.unreleased),
    list('Omitidas por no tener pareja segura', omitted.unmatched),
    list('Sin evaluación de ataque', coverage.withoutAttack),
    `- Tamaño: ${Math.round(Buffer.byteLength(text) / 1024)} KB`,
  ].join('\n');
  console.log(report);
  const { GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `changed=${changed}\nversion=${file.source.version}\n`);
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `## Gimnasios\n\n${report}\n`);
} catch (error) {
  console.error(error instanceof gyms.DataError ? `Datos rechazados: ${error.message}` : error);
  process.exitCode = 1;
}
