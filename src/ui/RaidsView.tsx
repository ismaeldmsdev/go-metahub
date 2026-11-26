import { useLayoutEffect } from 'preact/hooks';
import { TYPES } from '../domain/names';
import { bossSlug } from '../domain/raids';
import { BossView } from './BossView';
import { Placeholder } from './common';
import { Back, Pin } from './frame';
import { useNow, type Sources } from './hooks';
import { MaxView } from './MaxView';
import { buildBoard, RaidTabs, type BoardTab } from './RaidBoard';
import { CatalogBossView, CatalogView } from './RaidCatalog';
import { NowView, UpcomingView } from './RaidStyles';
import { RaidTypesView } from './RaidTypesView';

const MODES = [
  { id: 'jefes', name: 'Jefes', hash: 'incursiones' },
  { id: 'tipos', name: 'Por tipo', hash: 'incursiones/tipos' },
  { id: 'max', name: 'Max', hash: 'incursiones/max' },
] as const;

function Modes({ mode }: { mode: (typeof MODES)[number]['id'] }) {
  return (
    <Pin>
      <div class="segmented" role="group" aria-label="Incursiones">
        {MODES.map(({ id, name, hash }) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => (location.hash = hash)}>
            {name}
          </button>
        ))}
      </div>
    </Pin>
  );
}

/** Último jefe abierto, para volver al mismo punto de la lista. */
let opened: string | null = null;

function BossList({ sources, now, tab }: { sources: Sources; now: number; tab: BoardTab }) {
  const { raids } = sources;
  const board = buildBoard(sources, now);
  useLayoutEffect(() => {
    if (opened) document.getElementById(`jefe-${opened}`)?.scrollIntoView({ block: 'center' });
    opened = null;
  }, []);
  return (
    <>
      <RaidTabs active={tab} board={board} />
      {tab === 'catalogo' ? (
        <CatalogView sources={sources} now={now} />
      ) : !board ? (
        <Placeholder source={raids} />
      ) : tab === 'proximamente' ? (
        <UpcomingView sources={sources} now={now} board={board} />
      ) : (
        <NowView sources={sources} now={now} board={board} />
      )}
    </>
  );
}

export function RaidsView({ sources, slug }: { sources: Sources; slug: string | null }) {
  const now = useNow(30_000);
  const { raids } = sources;
  if (slug === null) {
    return (
      <>
        <Modes mode="jefes" />
        <BossList sources={sources} now={now} tab="ahora" />
      </>
    );
  }
  if (slug === 'proximamente' || slug === 'catalogo') {
    return (
      <>
        <Modes mode="jefes" />
        <BossList sources={sources} now={now} tab={slug} />
      </>
    );
  }
  if (slug.startsWith('catalogo-')) return <CatalogBossView slug={slug} sources={sources} now={now} />;
  if (slug === 'tipos') {
    return (
      <>
        <Modes mode="tipos" />
        <RaidTypesView sources={sources} type={null} />
      </>
    );
  }
  const type = /^tipo-([a-z]+)$/.exec(slug)?.[1];
  if (type && Object.hasOwn(TYPES, type)) return <RaidTypesView sources={sources} type={type} />;
  if (slug === 'max') {
    return (
      <>
        <Modes mode="max" />
        <MaxView sources={sources} section="max" now={now} />
      </>
    );
  }
  // Los demás identificadores de jefe no llevan guiones.
  if (slug.startsWith('max-')) return <MaxView sources={sources} section={slug} now={now} />;
  opened = slug;
  const boss = raids.data?.find((candidate) => bossSlug(candidate) === slug);
  if (boss) return <BossView key={slug} boss={boss} sources={sources} now={now} />;
  return (
    <>
      <Pin>
        <Back href="#incursiones" label="Todos los jefes" title="Jefe" />
      </Pin>
      {!raids.data ? (
        <Placeholder source={raids} />
      ) : (
        <div class="empty">
          <p>Este jefe ya no figura en la lista de LeekDuck.</p>
          <a class="link" href="#incursiones">
            Ver los jefes actuales
          </a>
        </div>
      )}
    </>
  );
}
