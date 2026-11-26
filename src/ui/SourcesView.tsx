import { HOUR, TTL, type SourceId } from '../data/config';
import { formatDate } from '../domain/freshness';
import { External, RefreshButton, SourceDates } from './common';
import type { Sources } from './hooks';

const INFO: Record<SourceId, { title: string; credit: string; url: string; note: string }> = {
  pvp: {
    title: 'PvP',
    credit: 'PvPoke',
    url: 'https://pvpoke.com',
    note: 'Clasificaciones, movimientos, copas y estadísticas base. Los rankings de ligas Mega y copas se piden al abrirlos. Licencia MIT, © 2019 pvpoke.',
  },
  raids: {
    title: 'Incursiones',
    credit: 'ScrapedDuck',
    url: 'https://github.com/bigfoott/ScrapedDuck',
    note: 'Datos de LeekDuck.com. La fecha de publicación indica cuándo se ejecutó la fuente, no que haya cambios.',
  },
  events: {
    title: 'Eventos',
    credit: 'ScrapedDuck',
    url: 'https://github.com/bigfoott/ScrapedDuck',
    note: 'Datos de LeekDuck.com. La fecha de publicación indica cuándo se ejecutó la fuente, no que haya cambios.',
  },
  translations: {
    title: 'Nombres en español',
    credit: 'WatWowMap',
    url: 'https://github.com/WatWowMap/pogo-translations',
    note: 'Nombres de Pokémon y movimientos, y frases del Team GO Rocket. Esta fuente no informa de su fecha aquí.',
  },
  sprites: {
    title: 'Imágenes de Pokémon',
    credit: 'PokéAPI',
    url: 'https://github.com/PokeAPI/sprites',
    note: 'Lista de formas. Las imágenes se descargan solo al verlas. No informa de su fecha aquí.',
  },
  gyms: {
    title: 'Gimnasios',
    credit: 'doctorpokegogo.com',
    url: 'https://doctorpokegogo.com/',
    note: 'Evaluación de atacantes y resistencia, CC BY 4.0. Resumen transformado por GO MetaHub; los originales se publican de forma irregular.',
  },
  rocket: {
    title: 'Alineaciones de Rocket',
    credit: 'WatWowMap',
    url: 'https://github.com/WatWowMap/event-info',
    note: 'Licencia MIT, © 2022 WatWowMap. La fecha de publicación es la del último cambio en las alineaciones.',
  },
  rocketContrast: {
    title: 'Contraste de Rocket',
    credit: 'ScrapedDuck',
    url: 'https://github.com/bigfoott/ScrapedDuck',
    note: 'Datos de LeekDuck.com. Solo sirven para avisar si no coinciden con las alineaciones. No informa de su fecha aquí.',
  },
  season: {
    title: 'Calendario de la Liga Combates GO',
    credit: 'ScrapedDuck',
    url: 'https://github.com/bigfoott/ScrapedDuck',
    note: 'Datos de LeekDuck.com. Si deja de listar la semana en curso, se conserva la última conocida hasta que termine.',
  },
  raidTypes: {
    title: 'Atacantes por tipo',
    credit: 'doctorpokegogo.com',
    url: 'https://doctorpokegogo.com/',
    note: 'Evaluación de incursiones, CC BY 4.0, con una sola combinación de movimientos por Pokémon. Resumen transformado por GO MetaHub; los originales se publican de forma irregular.',
  },
  rocketAttackers: {
    title: 'Atacantes para Rocket',
    credit: 'doctorpokegogo.com',
    url: 'https://doctorpokegogo.com/',
    note: 'Evaluación general, CC BY 4.0. Resumen transformado por GO MetaHub; los originales se publican de forma irregular.',
  },
  raidSchedule: {
    title: 'Calendario de incursiones',
    credit: 'LeekDuck',
    url: 'https://leekduck.com/raid-bosses/',
    note: 'Periodos con hora local, los jefes del periodo en curso y el resumen y las fechas de cada rotación cercana. Sirve para confirmar qué hay ahora: sin él, nada se da por confirmado.',
  },
  pokebattler: {
    title: 'Counters y catálogo Max',
    credit: 'Pokébattler',
    url: 'https://www.pokebattler.com',
    note: 'Lista de jefes de incursión y Max, y Pokémon compatibles con Max. Los counters de cada uno se piden al abrirlo y se guardan 24 h. No informa de su fecha.',
  },
};

const ORDER: SourceId[] = [
  'pvp',
  'season',
  'raids',
  'raidSchedule',
  'raidTypes',
  'gyms',
  'events',
  'rocket',
  'rocketContrast',
  'rocketAttackers',
  'translations',
  'sprites',
  'pokebattler',
];

export function SourcesView({ sources, storageOk }: { sources: Sources; storageOk: boolean }) {
  return (
    <>
      {!storageOk && (
        <p class="status status-error" role="alert">
          Este navegador no permite guardar datos. La aplicación funciona, pero no habrá información sin conexión.
        </p>
      )}
      <ul class="grid">
        {ORDER.map((id) => {
          const source = sources[id];
          const info = INFO[id];
          return (
            <li key={id} class={`card source status-${source.health.level}`}>
              <h2>
                <span class="dot" aria-hidden="true" /> {info.title}
              </h2>
              <p class="fine">
                <External href={info.url}>{info.credit}</External> · cada {TTL[id] / HOUR} h
              </p>
              {source.health.level === 'loading' && <p class="fine">Cargando…</p>}
              {source.health.level === 'ok' && <p class="validity ok">Consulta al día</p>}
              {source.health.messages.map((message) => (
                <p key={message} class="validity warn">
                  {message}
                </p>
              ))}
              {source.failedAt > source.checkedAt && (
                <p class="fine">Último intento fallido: {formatDate(source.failedAt)}</p>
              )}
              <SourceDates source={source} />
              <p class="fine">{info.note}</p>
              <RefreshButton source={source} />
            </li>
          );
        })}
      </ul>
      <section class="credits">
        <img class="credits-logo" src="./logo.webp" alt="" width="448" height="448" loading="lazy" />
        <h2>Créditos</h2>
        <p>
          Eventos, incursiones e imágenes: <External href="https://leekduck.com">LeekDuck.com</External>, a través de{' '}
          <External href="https://github.com/bigfoott/ScrapedDuck">ScrapedDuck</External>. Clasificaciones:{' '}
          <External href="https://pvpoke.com">PvPoke</External>. Counters:{' '}
          <External href="https://www.pokebattler.com">Pokébattler</External>. Alineaciones del Team GO Rocket:{' '}
          <External href="https://github.com/WatWowMap/event-info">WatWowMap</External> (
          <External href="https://github.com/WatWowMap/event-info/blob/main/LICENSE">MIT</External>), contrastadas con{' '}
          <External href="https://leekduck.com/rocket-lineups/">LeekDuck</External>. Gimnasios, incursiones por tipo y atacantes
          para Rocket:{' '}
          <External href="https://doctorpokegogo.com/">doctorpokegogo.com</External>,{' '}
          <External href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</External>, transformados y resumidos. Nombres y frases en español:{' '}
          <External href="https://github.com/WatWowMap/pogo-translations">WatWowMap</External>. Ilustraciones y sprites:{' '}
          <External href="https://github.com/PokeAPI/sprites">PokéAPI</External>, © The Pokémon Company.
        </p>
        <p class="fine">
          Aplicación personal sin ánimo de lucro, no afiliada a Niantic, Nintendo ni The Pokémon Company. Pokémon y sus
          nombres, imágenes y frases pertenecen a sus titulares.
        </p>
      </section>
    </>
  );
}
