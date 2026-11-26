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
import { statusOf, type BossStatus } from '../domain/availability';
import { countersLink } from '../domain/raids';
import { spriteId } from '../domain/sprites';
import { BossSummary } from './BossSummary';
import { formatAge, hasKnownCheck } from '../domain/freshness';
import { External, InfoLine, Loading, Move, MoveLegend, Placeholder, PokemonName, Rank, sourceAlerts, SourceStatus } from './common';
import { Back, Pin } from './frame';
import { useCounters, type Sources } from './hooks';
import { PokemonImage } from './PokemonImage';
import { buildBoard } from './RaidBoard';
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
  /** Si se da, los seis primeros van en fichas compactas y la lista completa con sus cifras queda plegada. */
  tile?: (counter: RankedCounter) => ComponentChildren;
}

/** Un equipo de incursión. */
const TEAM = 6;

export function CountersPanel<V extends string>(props: PanelProps<V>) {
  const { target, url, now, variants, names, filter, card, explanation, title = 'Mejores counters', back, subject, tile } = props;
  const [weather, setWeather] = useState<Weather>('NO_WEATHER');
  const [variant, setVariant] = useState<V>(variants[0]!);
  const counters = useCounters({ ...target, weather });
  const list = counters.data?.list;
  const shown = list ? filter(list, variant) : [];
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
      <h2 class="hm-bar">{title}</h2>
      {/* Los filtros más usados, a un toque; el clima y lo demás, en «Clima y filtros». */}
      <div class="tier-filter variant-filter" role="group" aria-label="Variante" style={{ '--n': variants.length }}>
        {variants.map((id) => (
          <button key={id} type="button" aria-pressed={variant === id} onClick={() => setVariant(id)}>
            {names[id]}
            <small>{list ? filter(list, id).length : '–'}</small>
          </button>
        ))}
      </div>
      {!list ? (
        <Placeholder source={counters} />
      ) : (
        <>
          {shown.length === 0 ? (
            <p class="empty">Ninguno de los {list.length} mejores es de este grupo.</p>
          ) : tile ? (
            <>
              <ol class="top-counters">{shown.slice(0, TEAM).map(tile)}</ol>
              <details class="rb-all">
                <summary>Ver {shown.length > TEAM ? `los ${shown.length}` : 'todos'} con sus cifras</summary>
                <p class="note">Orden por Estimator: menos es mejor.</p>
                <ol class="ranking">{shown.map(card)}</ol>
              </details>
            </>
          ) : (
            <ol class="ranking">{shown.map(card)}</ol>
          )}
        </>
      )}
      {/* Lo técnico, en un solo desplegable; la atribución a Pokébattler queda siempre a la vista en su rótulo. */}
      <InfoLine label="Counters de Pokébattler" alerts={sourceAlerts([counters])}>
        <p class="note">
          Datos de <External href={url}>Pokébattler</External>
          {hasKnownCheck(counters.checkedAt) && `, consultados hace ${formatAge(now - counters.checkedAt)}`}.
        </p>
        <MoveLegend />
        {list && (typeof explanation === 'function' ? explanation(counters.data!.megaLevel) : explanation)}
        <SourceStatus source={counters} />
      </InfoLine>
    </>
  );
}

/** Ficha compacta de los seis primeros: ilustración, nombre y movimientos. Las cifras, en la lista completa. */
function CounterTile({ counter, sources, species }: { counter: RankedCounter; sources: Sources; species: Species }) {
  const tr = sources.translations.data;
  const label = pvpLabel(species, tr);
  return (
    <li class={`tc t-${species.types[0] ?? ''}`}>
      <div class="tc-art">
        <Rank value={counter.rank} />
        <PokemonImage
          id={spriteId(species, sources.sprites.data)}
          dex={species.dex}
          type={species.types[0]}
          shadow={label.shadow}
          pending={sources.sprites.health.level === 'loading'}
        />
      </div>
      <PokemonName label={label} />
      <ul class="moves">
        <Move fast name={moveName(counterMove(counter.fast), tr)} />
        {counter.charged !== 'MOVE_NONE' && <Move fast={false} name={moveName(counterMove(counter.charged), tr)} />}
      </ul>
    </li>
  );
}

export function Counters(props: CountersProps & { back: ComponentChildren; subject: ComponentChildren }) {
  const { sources } = props;
  const species = (counter: RankedCounter) =>
    counterSpecies(counter.id, sources.pvp.data?.species, sources.translations.data);
  return (
    <CountersPanel
      {...props}
      title="Qué Pokémon llevar"
      variants={COUNTER_VARIANTS}
      names={VARIANT_NAMES}
      filter={filterCounters}
      card={(counter) => <CounterCard key={counter.id} counter={counter} sources={sources} species={species(counter)} />}
      tile={(counter) => <CounterTile key={counter.id} counter={counter} sources={sources} species={species(counter)} />}
      explanation={(megaLevel) => <Explanation megaLevel={megaLevel} />}
    />
  );
}

export function BossView({ boss, sources, now }: { boss: RaidBoss; sources: Sources; now: number }) {
  const board = buildBoard(sources, now);
  const status: BossStatus = board ? statusOf(boss, board) : { kind: 'listed' };
  const link = countersLink(boss, sources.pokebattler.data?.raids);
  const back = <Back href="#incursiones" label="Todos los jefes" title={bossLabel(boss, sources.translations.data).name} />;
  const subject = <BossSummary boss={boss} sources={sources} status={status} />;
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
