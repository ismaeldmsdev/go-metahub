import { EventsView } from './EventsView';
import { PvpView } from './PvpView';
import { RaidsView } from './RaidsView';
import { SourcesView } from './SourcesView';
import { TABS, useSources, useTab, type Source, type Sources, type Tab } from './hooks';

const LABELS: Record<Tab, string> = {
  pvp: 'PvP',
  incursiones: 'Incursiones',
  eventos: 'Eventos',
  fuentes: 'Fuentes',
};

/** Trazos simples de 24×24, dibujados para esta aplicación. */
const ICONS: Record<Tab, string> = {
  pvp: 'M4 20V10M12 20V4M20 20v-7',
  incursiones: 'M12 3l8 5v8l-8 5-8-5V8zM12 8v5M12 16v.5',
  eventos: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  fuentes: 'M4 12a8 8 0 0 1 14-5l2 2M20 5v4h-4M20 12a8 8 0 0 1-14 5l-2-2M4 19v-4h4',
};

function hasIssue(tab: Tab, sources: Sources): boolean {
  const bad = (source: Source<unknown>) => source.health.level === 'warning' || source.health.level === 'error';
  switch (tab) {
    case 'pvp':
      return bad(sources.pvp);
    case 'incursiones':
      return bad(sources.raids);
    case 'eventos':
      return bad(sources.events);
    case 'fuentes':
      return Object.values(sources).some(bad);
  }
}

export function App({ storageOk }: { storageOk: boolean }) {
  const tab = useTab();
  const sources = useSources();
  return (
    <div class="app">
      <header class="header">
        <h1>{LABELS[tab]}</h1>
      </header>
      <nav class="nav" aria-label="Secciones">
        {TABS.map((id) => (
          <a key={id} href={`#${id}`} aria-current={tab === id ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={ICONS[id]} />
            </svg>
            <span>{LABELS[id]}</span>
            {hasIssue(id, sources) && <span class="nav-alert" role="img" aria-label="Hay avisos" />}
          </a>
        ))}
      </nav>
      <main class="main">
        {tab === 'pvp' && <PvpView sources={sources} />}
        {tab === 'incursiones' && <RaidsView sources={sources} />}
        {tab === 'eventos' && <EventsView sources={sources} />}
        {tab === 'fuentes' && <SourcesView sources={sources} storageOk={storageOk} />}
      </main>
    </div>
  );
}
