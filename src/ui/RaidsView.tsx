import type { RaidBoss } from '../data/models';
import { formatDate } from '../domain/freshness';
import { bossLabel, weatherName } from '../domain/names';
import { countersLink, groupRaids, raidValidity, type Validity } from '../domain/raids';
import { External, Picture, Placeholder, PokemonName, SourceStatus, TypeTag } from './common';
import { useNow, type Sources } from './hooks';

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

function BossCard({ boss, sources, now }: { boss: RaidBoss; sources: Sources; now: number }) {
  const label = bossLabel(boss, sources.translations.data);
  const link = countersLink(boss, sources.pokebattler.data);
  return (
    <li class="card boss">
      <Picture src={boss.image} className="boss-image" />
      <div class="boss-body">
        <PokemonName label={label} />
        <div class="types">
          {boss.types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
          {boss.shiny && <span class="chip chip-shiny">✦ Variocolor posible</span>}
        </div>
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
        <ValidityNote validity={raidValidity(boss, sources.events.data, now)} />
        <External href={link.url}>
          {link.exact ? 'Mejores counters en Pokebattler' : 'Buscar en Pokebattler (sin página exacta confirmada)'}
        </External>
      </div>
    </li>
  );
}

export function RaidsView({ sources }: { sources: Sources }) {
  const now = useNow(30_000);
  const { raids } = sources;
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
                <BossCard key={boss.name} boss={boss} sources={sources} now={now} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
