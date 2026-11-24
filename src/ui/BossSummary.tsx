import type { RaidBoss } from '../data/models';
import { formatDate } from '../domain/freshness';
import { bossLabel, weatherName } from '../domain/names';
import { bossSlug, raidValidity, type Validity } from '../domain/raids';
import { Picture, PokemonName, TypeTag, Weaknesses } from './common';
import type { Sources } from './hooks';

function ValidityNote({ validity }: { validity: Validity }) {
  switch (validity.kind) {
    case 'announced':
      return <p class="validity ok">Rotación anunciada hasta el {formatDate(validity.end)}</p>;
    case 'upcoming':
      return <p class="validity warn">Anunciado a partir del {formatDate(validity.start)}. Puede no estar activo.</p>;
    case 'expired':
      return <p class="validity warn">Su rotación terminó el {formatDate(validity.end)}. Probablemente ya no esté.</p>;
    case 'unknown':
      return <p class="validity">Vigencia sin confirmar</p>;
  }
}

interface BossProps {
  boss: RaidBoss;
  sources: Sources;
  now: number;
  /** Con los counters a la vista se sustituyen los PC por las debilidades. */
  detail?: boolean;
}

export function BossSummary({ boss, sources, now, detail = false }: BossProps) {
  return (
    <>
      <Picture src={boss.image} className="boss-image" />
      <div class="boss-body">
        <PokemonName label={bossLabel(boss, sources.translations.data)} />
        <div class="types">
          {boss.types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
          {boss.shiny && <span class="chip chip-shiny">✦ Variocolor posible</span>}
        </div>
        {detail && <Weaknesses types={boss.types} />}
        {!detail && (
          <dl class="cp">
            <div>
              <dt>PC</dt>
              <dd>{boss.cp ? `${boss.cp.min}–${boss.cp.max}` : 'no indicado'}</dd>
            </div>
            {boss.boostedCp && (
              <div>
                <dt>Con {boss.weather.length > 0 ? boss.weather.map(weatherName).join(' o ') : 'clima favorable'}</dt>
                <dd>{`${boss.boostedCp.min}–${boss.boostedCp.max}`}</dd>
              </div>
            )}
          </dl>
        )}
        <ValidityNote validity={raidValidity(boss, sources.events.data, now)} />
        {!detail && (
          <a class="link boss-open" href={`#incursiones/${bossSlug(boss)}`}>
            Ver mejores counters
          </a>
        )}
      </div>
    </>
  );
}
