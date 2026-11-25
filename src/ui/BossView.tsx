import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { WEATHERS, type Weather } from '../data/config';
import type { Counter, RaidBoss, Species } from '../data/models';
import {
  COUNTER_VARIANTS,
  counterMove,
  counterSpecies,
  filterCounters,
  type CounterVariant,
  type RankedCounter,
} from '../domain/counters';
import { bossLabel, moveName, pvpLabel, weatherName } from '../domain/names';
import { countersLink } from '../domain/raids';
import { spriteId } from '../domain/sprites';
import { BossSummary } from './BossSummary';
import { formatAge, hasKnownCheck } from '../domain/freshness';
import { External, Loading, Move, MoveLegend, Placeholder, SourceStatus } from './common';
import { Back, Pin } from './frame';
import { useCounters, type Sources } from './hooks';
import { PokemonImage } from './PokemonImage';
import { RankCard } from './RankCard';

const VARIANT_NAMES: Record<CounterVariant, string> = {
  all: 'Todos',
  normal: 'Normales',
  shadow: 'Oscuros',
  mega: 'Megas',
};

const number = (value: number, digits: number): string =>
  value.toLocaleString('es', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: 'always' });

interface CounterCardProps {
  counter: RankedCounter;
  sources: Sources;
  species: Species;
  /** Nombre con el que buscar la imagen, si no es el suyo. */
  sprite?: { name: string; dex: number };
  chip?: ComponentChildren;
}

export function CounterCard({ counter, sources, species, sprite = species, chip }: CounterCardProps) {
  const tr = sources.translations.data;
  const label = pvpLabel(species, tr);
  return (
    <RankCard
      label={label}
      types={species.types}
      rank={counter.rank}
      chip={chip}
      figure={
        <PokemonImage
          id={spriteId(sprite, sources.sprites.data)}
          dex={species.dex}
          type={species.types[0]}
          shadow={label.shadow}
          pending={sources.sprites.health.level === 'loading'}
        />
      }
      moves={
        <>
          <Move fast name={moveName(counterMove(counter.fast), tr)} />
          {/* En combates Max, a veces lo mejor es no usar el cargado. */}
          {counter.charged !== 'MOVE_NONE' && <Move fast={false} name={moveName(counterMove(counter.charged), tr)} />}
        </>
      }
      value={{ text: number(counter.estimator, 2), label: 'Estimator' }}
      metrics={[
        ['eDPS', counter.edps === null ? '–' : number(counter.edps, 1)],
        ['TDO', counter.tdo === null ? '–' : number(counter.tdo, 0)],
      ]}
    />
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

interface PanelProps<V extends string> extends CountersProps {
  title?: string;
  back: ComponentChildren;
  /** El jefe, antes de sus counters. */
  subject: ComponentChildren;
  /** El primero es el de partida. */
  variants: readonly V[];
  names: Record<V, string>;
  filter: (list: Counter[], variant: V) => RankedCounter[];
  card: (counter: RankedCounter) => ComponentChildren;
  explanation: ComponentChildren | ((megaLevel: number | null) => ComponentChildren);
}

export function CountersPanel<V extends string>(props: PanelProps<V>) {
  const { target, url, now, variants, names, filter, card, explanation, title = 'Mejores counters', back, subject } = props;
  const [weather, setWeather] = useState<Weather>('NO_WEATHER');
  const [variant, setVariant] = useState<V>(variants[0]!);
  const counters = useCounters({ ...target, weather });
  const list = counters.data?.list;
  const shown = list ? filter(list, variant) : [];
  // Sin avisos, el estado va después de la lista: lo primero son los counters.
  const healthy = list && counters.health.level === 'ok';
  return (
    <>
      <Pin
        title="Clima y filtros"
        groups={[
          {
            label: 'Clima',
            value: weather,
            onChange: (id) => setWeather(id as Weather),
            options: WEATHERS.map((id) => ({ value: id, name: id === 'NO_WEATHER' ? 'Sin clima favorable' : weatherName(id) })),
          },
          {
            label: 'Variante',
            value: variant,
            onChange: (id) => setVariant(id as V),
            options: variants.map((id) => ({ value: id, name: names[id], count: list ? filter(list, id).length : null })),
          },
        ]}
      >
        {back}
      </Pin>
      {subject}
      <h2>{title}</h2>
      <div class="tier-filter variant-filter" role="group" aria-label="Variante" style={{ '--n': variants.length }}>
        {variants.map((id) => (
          <button key={id} type="button" aria-pressed={variant === id} onClick={() => setVariant(id)}>
            {names[id]}
            <small>{list ? filter(list, id).length : '–'}</small>
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
              {shown.map(card)}
            </ol>
          )}
          <MoveLegend />
          {typeof explanation === 'function' ? explanation(counters.data!.megaLevel) : explanation}
          {healthy && <SourceStatus source={counters} />}
        </>
      )}
    </>
  );
}

function Counters(props: CountersProps & { back: ComponentChildren; subject: ComponentChildren }) {
  const { sources } = props;
  return (
    <CountersPanel
      {...props}
      variants={COUNTER_VARIANTS}
      names={VARIANT_NAMES}
      filter={filterCounters}
      card={(counter) => (
        <CounterCard
          key={counter.id}
          counter={counter}
          sources={sources}
          species={counterSpecies(counter.id, sources.pvp.data?.species, sources.translations.data)}
        />
      )}
      explanation={(megaLevel) => <Explanation megaLevel={megaLevel} />}
    />
  );
}

export function BossView({ boss, sources, now }: { boss: RaidBoss; sources: Sources; now: number }) {
  const link = countersLink(boss, sources.pokebattler.data?.raids);
  const back = (
    <Back href="#incursiones" label="Todos los jefes" title={bossLabel(boss, sources.translations.data).name} />
  );
  const subject = (
    <article class={`card boss boss-detail t-${boss.types[0] ?? ''}`}>
      <BossSummary boss={boss} sources={sources} now={now} detail />
    </article>
  );
  if (link.target) {
    return <Counters target={link.target} url={link.url} sources={sources} now={now} back={back} subject={subject} />;
  }
  return (
    <>
      <Pin>{back}</Pin>
      {subject}
      {sources.pokebattler.health.level === 'loading' ? (
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
