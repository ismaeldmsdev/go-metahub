import { EventsView } from './EventsView';
import { GymsView } from './GymsView';
import { PvpView } from './PvpView';
import { RaidsView } from './RaidsView';
import { RocketView } from './RocketView';
import { SourcesView } from './SourcesView';
import { NAV_TABS, useRoute, useSources, type Source, type Sources, type Tab } from './hooks';

const LABELS: Record<Tab, string> = {
  pvp: 'PvP',
  incursiones: 'Incursiones',
  gimnasios: 'Gimnasios',
  eventos: 'Eventos',
  rocket: 'Rocket',
  fuentes: 'Fuentes',
};

/** Trazos simples de 24×24, dibujados para esta aplicación. */
const ICONS: Record<Tab, string> = {
  pvp: 'M8 4h8v5a4 4 0 0 1-8 0zM8 5.500H5c0 3 1 4.500 3.300 4.500M16 5.500h3c0 3-1 4.500-3.300 4.500M12 13v4M8.500 20h7M10 17h4v3h-4z',
  incursiones:
    'M12.500 3c.5 3.500 5 5.500 5 10.500a5.500 5.500 0 0 1-11 0c0-2.300 1-3.800 2.200-5 .2 1.700.9 2.600 2 3C10.300 8.700 10.800 5.500 12.500 3z',
  gimnasios: 'M12 3.500 4.500 8v2h15V8zM6.500 10v7M10.200 10v7M13.800 10v7M17.500 10v7M4.500 20.500v-3h15v3z',
  eventos: 'M6 5.500h12a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.500a2 2 0 0 1 2-2zM4 10.500h16M8 3.500v4M16 3.500v4M9 15l2 2 4-4',
  rocket:
    'M12 3c3.300 2.300 4.800 5.400 4.800 9l-1.800 4H9l-1.800-4c0-3.600 1.500-6.700 4.800-9zM7.200 12 4.500 15.500V19L9 16M16.800 12l2.700 3.500V19L15 16M12 9.200v.1M10.500 19v1.500M13.500 19v1.500',
  fuentes:
    'M12 4c4.400 0 7 1.100 7 2.500S16.400 9 12 9 5 7.900 5 6.500 7.600 4 12 4zM5 6.500V12c0 1.400 2.600 2.500 7 2.500s7-1.100 7-2.500V6.500M5 12v5.500C5 18.900 7.600 20 12 20s7-1.100 7-2.500V12',
};

function hasIssue(tab: Tab, sources: Sources): boolean {
  const bad = (source: Source<unknown>) => source.health.level === 'warning' || source.health.level === 'error';
  switch (tab) {
    case 'pvp':
      return bad(sources.pvp);
    case 'incursiones':
      return bad(sources.raids);
    case 'gimnasios':
      return bad(sources.gyms);
    case 'eventos':
      return bad(sources.events);
    case 'rocket':
      return bad(sources.rocket);
    case 'fuentes':
      return Object.values(sources).some(bad);
  }
}

export function App({ storageOk }: { storageOk: boolean }) {
  const { tab, detail } = useRoute();
  const sources = useSources();
  // Un color por modalidad; los combates Max tienen el suyo dentro de Incursiones.
  const theme = tab === 'incursiones' && detail?.startsWith('max') ? 'max' : tab;
  return (
    <div class={`app th-${theme}`}>
      <div class="statusbar" aria-hidden="true" />
      <div class="topbar">
        <header class="header">
          <img class="brand" src="./logo-small.webp" alt="" width="48" height="48" />
          <div>
            <p class="brand-name">GO MetaHub</p>
            <h1>{LABELS[tab]}</h1>
          </div>
          <a
            class="sources-link"
            href="#fuentes"
            title="Fuentes: estado y origen de los datos"
            aria-current={tab === 'fuentes' ? 'page' : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={ICONS.fuentes} />
            </svg>
            <span>Fuentes</span>
            {hasIssue('fuentes', sources) && <span class="nav-alert" role="img" aria-label="Hay avisos" />}
          </a>
        </header>
        <nav class="nav" aria-label="Secciones">
          {NAV_TABS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => {
                // Como en una aplicación nativa: pulsar la sección abierta vuelve arriba.
                if (tab === id && !detail) window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <span class="nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={ICONS[id]} />
                </svg>
              </span>
              <span>{LABELS[id]}</span>
              {hasIssue(id, sources) && <span class="nav-alert" role="img" aria-label="Hay avisos" />}
            </a>
          ))}
        </nav>
      </div>
      <main key={`${tab}/${detail}`} class="main">
        {tab === 'pvp' && <PvpView sources={sources} section={detail} />}
        {tab === 'incursiones' && <RaidsView sources={sources} slug={detail} />}
        {tab === 'gimnasios' && <GymsView sources={sources} section={detail} />}
        {tab === 'eventos' && <EventsView sources={sources} />}
        {tab === 'rocket' && <RocketView sources={sources} section={detail} />}
        {tab === 'fuentes' && <SourcesView sources={sources} storageOk={storageOk} />}
      </main>
    </div>
  );
}
