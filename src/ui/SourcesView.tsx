import { HOUR, TTL, type SourceId } from '../data/config';
import { formatDate } from '../domain/freshness';
import { External, RefreshButton, SourceDates } from './common';
import type { Sources } from './hooks';

const INFO: Record<SourceId, { title: string; credit: string; url: string; note: string }> = {
  pvp: {
    title: 'PvP',
    credit: 'PvPoke',
    url: 'https://pvpoke.com',
    note: 'Clasificaciones y movimientos. Licencia MIT, © 2019 pvpoke.',
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
    note: 'Nombres de Pokémon y movimientos. Esta fuente no informa de su fecha aquí.',
  },
  sprites: {
    title: 'Imágenes de Pokémon',
    credit: 'PokéAPI',
    url: 'https://github.com/PokeAPI/sprites',
    note: 'Lista de formas. Las imágenes se descargan solo al verlas. No informa de su fecha aquí.',
  },
  pokebattler: {
    title: 'Counters',
    credit: 'Pokébattler',
    url: 'https://www.pokebattler.com',
    note: 'Lista de jefes. Los counters de cada uno se piden al abrirlo y se guardan 24 h. No informa de su fecha.',
  },
};

const ORDER: SourceId[] = ['pvp', 'raids', 'events', 'translations', 'sprites', 'pokebattler'];

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
          <External href="https://www.pokebattler.com">Pokébattler</External>. Nombres en español:{' '}
          <External href="https://github.com/WatWowMap/pogo-translations">WatWowMap</External>. Ilustraciones y sprites:{' '}
          <External href="https://github.com/PokeAPI/sprites">PokéAPI</External>, © The Pokémon Company.
        </p>
        <p class="fine">
          Aplicación personal sin ánimo de lucro, no afiliada a Niantic, Nintendo ni The Pokémon Company. Pokémon y sus
          nombres e imágenes pertenecen a sus titulares.
        </p>
      </section>
    </>
  );
}
