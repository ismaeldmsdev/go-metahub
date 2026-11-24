import { useState } from 'preact/hooks';
import { WEATHERS, type Weather } from '../data/config';
import type { RaidBoss } from '../data/models';
import {
  COUNTER_VARIANTS,
  counterMove,
  counterSpecies,
  filterCounters,
  type CounterVariant,
  type RankedCounter,
} from '../domain/counters';
import { moveName, pvpLabel, weatherName } from '../domain/names';
import { countersLink } from '../domain/raids';
import { spriteId } from '../domain/sprites';
import { BossSummary } from './BossSummary';
import { formatAge, hasKnownCheck } from '../domain/freshness';
import { External, Loading, Move, MoveLegend, Placeholder, PokemonName, Rank, SourceStatus, TypeTag } from './common';
import { useCounters, type Sources } from './hooks';
import { PokemonImage } from './PokemonImage';

const VARIANT_NAMES: Record<CounterVariant, string> = {
  all: 'Todos',
  normal: 'Normales',
  shadow: 'Oscuros',
  mega: 'Megas',
};

const number = (value: number, digits: number): string =>
  value.toLocaleString('es', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: 'always' });

function CounterCard({ counter, sources }: { counter: RankedCounter; sources: Sources }) {
  const tr = sources.translations.data;
  const species = counterSpecies(counter.id, sources.pvp.data?.species, tr);
  const label = pvpLabel(species, tr);
  return (
    <li class={`card rank-card t-${species.types[0] ?? ''}`}>
      <div class="rank-figure">
        <PokemonImage
          id={spriteId(species, sources.sprites.data)}
          dex={species.dex}
          type={species.types[0]}
          shadow={label.shadow}
          pending={sources.sprites.health.level === 'loading'}
        />
        <Rank value={counter.rank} />
      </div>
      <div class="rank-body">
        <PokemonName label={label} />
        <div class="rank-meta">
          {species.types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
        </div>
        <ul class="moves">
          <Move fast name={moveName(counterMove(counter.fast), tr)} />
          <Move fast={false} name={moveName(counterMove(counter.charged), tr)} />
        </ul>
        <dl class="metrics">
          <div>
            <dt>Estimator</dt>
            <dd>{number(counter.estimator, 2)}</dd>
          </div>
          <div>
            <dt>eDPS</dt>
            <dd>{counter.edps === null ? '–' : number(counter.edps, 1)}</dd>
          </div>
          <div>
            <dt>TDO</dt>
            <dd>{counter.tdo === null ? '–' : number(counter.tdo, 0)}</dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

function Explanation({ megaLevel }: { megaLevel: number | null }) {
  return (
    <details class="method">
      <summary>Qué significa cada dato</summary>
      <ul>
        <li>
          <strong>Estimator:</strong> entrenadores necesarios, aproximadamente, para ganar usando ese Pokémon.{' '}
          <strong>Menos es mejor.</strong> Es la medida que ordena la lista.
        </li>
        <li>
          <strong>eDPS:</strong> daño efectivo por segundo a lo largo del combate. Más es mejor.
        </li>
        <li>
          <strong>TDO:</strong> daño que hace cada Pokémon antes de debilitarse. Más es mejor, pero por sí solo premia la
          resistencia.
        </li>
      </ul>
      <p>
        Son resultados de Pokébattler, sin recalcular: los 30 mejores que publica, cada uno con su mejor combinación de
        movimientos, frente a la media de ataques posibles del jefe. Supone Pokémon de nivel 40, IV perfectos, sin
        amistad y esquivando con reflejos normales
        {megaLevel === null ? '' : `, y megaevoluciones de nivel ${megaLevel}`}. Solo sirven para este jefe y no se comparan
        con las puntuaciones PvP. Puede incluir movimientos que requieren una MT élite. Pokébattler no publica la fecha de
        sus cálculos: solo se conoce cuándo se consultaron.
      </p>
    </details>
  );
}

interface CountersProps {
  target: { id: string; tier: string };
  url: string;
  sources: Sources;
  now: number;
}

function Counters({ target, url, sources, now }: CountersProps) {
  const [weather, setWeather] = useState<Weather>('NO_WEATHER');
  const [variant, setVariant] = useState<CounterVariant>('all');
  const counters = useCounters({ ...target, weather });
  const list = counters.data?.list;
  const shown = list ? filterCounters(list, variant) : [];
  // Sin avisos, el estado va después de la lista: lo primero son los counters.
  const healthy = list && counters.health.level === 'ok';
  return (
    <>
      <div class="counters-head">
        <h2>Mejores counters</h2>
        <select aria-label="Clima" value={weather} onChange={(e) => setWeather(e.currentTarget.value as Weather)}>
          {WEATHERS.map((id) => (
            <option key={id} value={id}>
              {id === 'NO_WEATHER' ? 'Sin clima favorable' : weatherName(id)}
            </option>
          ))}
        </select>
      </div>
      <div class="tier-filter variant-filter" role="group" aria-label="Variante">
        {COUNTER_VARIANTS.map((id) => (
          <button key={id} type="button" aria-pressed={variant === id} onClick={() => setVariant(id)}>
            {VARIANT_NAMES[id]}
            <small>{list ? filterCounters(list, id).length : '–'}</small>
          </button>
        ))}
      </div>
      {!healthy && <SourceStatus source={counters} />}
      {!list ? (
        <Placeholder source={counters} />
      ) : (
        <>
          <p class="note">
            Datos de <External href={url}>Pokébattler</External>
            {hasKnownCheck(counters.checkedAt) && `, consultados hace ${formatAge(now - counters.checkedAt)}`}. Orden por
            Estimator: menos es mejor.
          </p>
          {shown.length === 0 ? (
            <p class="empty">Ninguno de los {list.length} mejores es de este grupo.</p>
          ) : (
            <ol class="ranking">
              {shown.map((counter) => (
                <CounterCard key={counter.id} counter={counter} sources={sources} />
              ))}
            </ol>
          )}
          <MoveLegend />
          <Explanation megaLevel={counters.data!.megaLevel} />
          {healthy && <SourceStatus source={counters} />}
        </>
      )}
    </>
  );
}

export function BossView({ boss, sources, now }: { boss: RaidBoss; sources: Sources; now: number }) {
  const link = countersLink(boss, sources.pokebattler.data);
  return (
    <>
      <a class="link back" href="#incursiones">
        Todos los jefes
      </a>
      <article class={`card boss t-${boss.types[0] ?? ''}`}>
        <BossSummary boss={boss} sources={sources} now={now} detail />
      </article>
      {link.target ? (
        <Counters target={link.target} url={link.url} sources={sources} now={now} />
      ) : sources.pokebattler.health.level === 'loading' ? (
        <Loading />
      ) : (
        <div class="empty">
          <p>Pokébattler no lista ahora mismo a este jefe exacto, así que no se muestran counters de otro.</p>
          <External href={link.url}>Buscar en Pokébattler</External>
        </div>
      )}
    </>
  );
}
