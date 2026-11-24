import { useLayoutEffect } from 'preact/hooks';
import { TYPES } from '../domain/names';
import { bossSlug, groupRaids, typeRankingUrl } from '../domain/raids';
import { BossSummary } from './BossSummary';
import { BossView } from './BossView';
import { Placeholder, SourceStatus } from './common';
import { useNow, type Sources } from './hooks';

function TypeRankings() {
  return (
    <section class="group">
      <h2>Mejores atacantes por tipo</h2>
      <p class="note">Se abren en la web de Pokébattler, en inglés.</p>
      <ul class="type-links">
        {Object.keys(TYPES).map((type) => (
          <li key={type}>
            <a class={`type t-${type}`} href={typeRankingUrl(type)} target="_blank" rel="noopener noreferrer">
              {TYPES[type]}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Último jefe abierto, para volver al mismo punto de la lista. */
let opened: string | null = null;

function BossList({ sources, now }: { sources: Sources; now: number }) {
  const { raids } = sources;
  useLayoutEffect(() => {
    if (opened) document.getElementById(`jefe-${opened}`)?.scrollIntoView({ block: 'center' });
    opened = null;
  }, []);
  return (
    <>
      <SourceStatus source={raids} />
      <p class="note">
        Jefes que LeekDuck listaba en la última lectura. La fuente no da fechas: solo se indica un final cuando un evento
        de rotación nombra a ese jefe.
      </p>
      {!raids.data ? (
        <Placeholder source={raids} />
      ) : (
        groupRaids(raids.data).map((group) => (
          <section key={group.key} class={group.shadow ? 'group group-shadow' : 'group'}>
            <h2>{group.title}</h2>
            <ul class="grid">
              {group.bosses.map((boss) => (
                <li key={boss.name} id={`jefe-${bossSlug(boss)}`} class={`card boss t-${boss.types[0] ?? ''}`}>
                  <BossSummary boss={boss} sources={sources} now={now} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <TypeRankings />
    </>
  );
}

export function RaidsView({ sources, slug }: { sources: Sources; slug: string | null }) {
  const now = useNow(30_000);
  const { raids } = sources;
  if (slug === null) return <BossList sources={sources} now={now} />;
  opened = slug;
  const boss = raids.data?.find((candidate) => bossSlug(candidate) === slug);
  if (boss) return <BossView key={slug} boss={boss} sources={sources} now={now} />;
  if (!raids.data) return <Placeholder source={raids} />;
  return (
    <div class="empty">
      <p>Este jefe ya no figura en las incursiones actuales.</p>
      <a class="link" href="#incursiones">
        Ver los jefes actuales
      </a>
    </div>
  );
}
