import { useMemo, useState } from 'preact/hooks';
import type { GymData, GymPokemon, Translations } from '../data/models';
import { formatDate } from '../domain/freshness';
import {
  attackersOf,
  countGymTiers,
  countPercentiles,
  filterAttackers,
  filterDefenders,
  GYM_GROUPS,
  GYM_TIERS,
  gymMove,
  PRESENCES,
  rankDefenders,
  type AttackerFilters,
  type AttackerGroup,
  type GymAttacker,
  type GymDefender,
  type GymGroup,
  type GymTier,
  type Presence,
} from '../domain/gyms';
import { moveName, pvpLabel, typeName, TYPES } from '../domain/names';
import { spriteId } from '../domain/sprites';
import { External, Move, MoveLegend, PokemonName, Placeholder, Rank, SourceStatus, TypeTag, Weaknesses } from './common';
import type { Sources } from './hooks';
import { PokemonImage } from './PokemonImage';

const PAGE = 30;

/** «S+» no puede ser parte de un nombre de clase. */
const tierClass = (tier: GymTier): string => `tier tier-${tier === 'S+' ? 'Splus' : tier}`;

const decimal = (value: number, digits: number): string =>
  value.toLocaleString('es', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: 'always' });

const PRESENCE_NAMES: Record<GymGroup, Record<Presence, string>> = {
  mega: { with: 'Con megas', without: 'Sin megas', only: 'Solo megas' },
  shadow: { with: 'Con oscuros', without: 'Sin oscuros', only: 'Solo oscuros' },
  legendary: { with: 'Con legendarios', without: 'Sin legendarios', only: 'Solo legendarios' },
};

const GROUP_LABELS: Record<GymGroup, string> = { mega: 'Megas', shadow: 'Oscuros', legendary: 'Legendarios' };

const NO_FILTERS: AttackerFilters = {
  tier: 'all',
  type: 'all',
  mega: 'with',
  shadow: 'with',
  legendary: 'with',
  search: '',
};

// Se recuerdan mientras la aplicación está abierta.
let rememberedAttackers = NO_FILTERS;
let rememberedDefenders = { type: 'all', search: '' };

interface TypeSelectProps {
  label: string;
  all: string;
  value: string;
  onChange: (type: string) => void;
}

function TypeSelect({ label, all, value, onChange }: TypeSelectProps) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
      <option value="all">{all}</option>
      {Object.keys(TYPES).map((type) => (
        <option key={type} value={type}>
          {typeName(type)}
        </option>
      ))}
    </select>
  );
}

function Search({ value, onChange }: { value: string; onChange: (search: string) => void }) {
  return (
    <input
      type="search"
      value={value}
      placeholder="Buscar Pokémon"
      aria-label="Buscar Pokémon"
      autocomplete="off"
      onInput={(e) => onChange(e.currentTarget.value)}
    />
  );
}

/** Atribución siempre a la vista: origen, licencia, fecha y cambios hechos. */
function Attribution({ data }: { data: GymData }) {
  const { source } = data;
  return (
    <p class="note attribution">
      Datos de <External href={source.url}>{source.name}</External>,{' '}
      <External href={source.licenseUrl}>{source.license}</External>, transformados y resumidos por GO MetaHub. Origen:{' '}
      {formatDate(Date.parse(source.generatedAt))}.
    </p>
  );
}

interface CardProps {
  pokemon: GymPokemon;
  sources: Sources;
  tr: Translations | undefined;
}

function Figure({ pokemon, sources, tr }: CardProps) {
  return (
    <PokemonImage
      id={spriteId(pokemon, sources.sprites.data)}
      dex={pokemon.dex}
      type={pokemon.types[0]}
      shadow={pvpLabel(pokemon, tr).shadow}
      pending={sources.sprites.health.level === 'loading'}
    />
  );
}

interface AttackerCardProps extends CardProps {
  pokemon: GymAttacker;
  /** Cuántos comparten su percentil, contándolo a él. */
  tied: number;
}

function AttackerCard({ pokemon, sources, tr, tied }: AttackerCardProps) {
  const { attack } = pokemon;
  return (
    <li class={`card rank-card t-${pokemon.types[0] ?? ''}`}>
      <div class="rank-figure">
        <Figure pokemon={pokemon} sources={sources} tr={tr} />
      </div>
      <div class="rank-body">
        <PokemonName label={pvpLabel(pokemon, tr)} />
        <div class="rank-meta">
          <span class={tierClass(attack.tier)}>
            <span class="sr-only">Tier </span>
            {attack.tier}
          </span>
          {pokemon.types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
        </div>
        <ul class="moves">
          <Move fast name={moveName(gymMove(attack.fast, attack.fastType), tr)} />
          <Move fast={false} name={moveName(gymMove(attack.charged, attack.chargedType), tr)} />
        </ul>
        <dl class="metrics">
          <div>
            <dt>Percentil</dt>
            <dd>
              {decimal(attack.percentile, 1)}
              {tied > 1 && <small class="tied">Empatan {tied}</small>}
            </dd>
          </div>
          <div>
            <dt>Puntuación</dt>
            <dd>{decimal(attack.score, 2)}</dd>
          </div>
          <div>
            <dt>Ataca con</dt>
            <dd>{typeName(attack.chargedType)}</dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

interface TierSectionProps {
  group: AttackerGroup;
  ties: Map<number, number>;
  sources: Sources;
  tr: Translations | undefined;
}

function TierSection({ group, ties, sources, tr }: TierSectionProps) {
  const [shown, setShown] = useState(PAGE);
  const rest = group.entries.length - shown;
  return (
    <section class="group tier-group">
      <h2>
        <span class={tierClass(group.tier)}>{group.tier}</span>
        Tier {group.tier} <span class="count">{group.entries.length}</span>
        <small>Sin puestos</small>
      </h2>
      <ul class="ranking">
        {group.entries.slice(0, shown).map((pokemon) => (
          <AttackerCard
            key={pokemon.name}
            pokemon={pokemon}
            tied={ties.get(pokemon.attack.percentile) ?? 1}
            sources={sources}
            tr={tr}
          />
        ))}
      </ul>
      {rest > 0 && (
        <button class="button more" type="button" onClick={() => setShown(shown + PAGE * 2)}>
          Mostrar más ({rest} restantes)
        </button>
      )}
    </section>
  );
}

function AttackersMethod({ data }: { data: GymData }) {
  return (
    <details class="method">
      <summary>Cómo leer estos datos</summary>
      <ul>
        <li>
          <strong>Tier y percentil:</strong> los que publica doctorpokegogo, sin cambios. El tier sale del percentil (de 0 a
          100, más es mejor).
        </li>
        <li>
          <strong>Puntuación:</strong> 10.000 entre los segundos que tarda en ganar tres rondas simuladas al defensor de
          referencia de cada tipo. Como ese defensor cambia, <strong>no sirve para comparar ataques de tipos distintos</strong>.
        </li>
        <li>
          <strong>Movimientos:</strong> solo hay una combinación por Pokémon, la que recomienda la fuente para gimnasios.
        </li>
        <li>
          <strong>Filtro por tipo:</strong> usa el tipo de ese ataque cargado. No es una lista completa de atacantes del tipo:
          un Pokémon puede servir también con otros movimientos que aquí no aparecen.
        </li>
        <li>
          <strong>Orden:</strong> por tier y, dentro, por percentil; los empates, por orden alfabético. No hay puestos, porque la fuente no ofrece un orden global
          fiable. Incluso en un mismo tipo, percentil y puntuación no siempre ordenan igual; se muestran ambos sin corregir.
        </li>
        <li>
          <strong>Legendarios:</strong> el filtro incluye también singulares y ultraentes.
        </li>
      </ul>
      <p>
        <External href={data.source.methodologyUrl}>Metodología de doctorpokegogo</External> (en inglés). Versión de los datos:{' '}
        {data.source.version}. {data.changes} No se incluyen las formas Gigamax, que fuera de los combates Max son el mismo
        Pokémon, ni las que no pueden combatir en gimnasios: Aegislash, Cramorant, Mimikyu, Minior y Morpeko. Alguna
        recomendación puede requerir una MT élite.
      </p>
    </details>
  );
}

function Attackers({ data, sources }: { data: GymData; sources: Sources }) {
  const [filters, setFilters] = useState(rememberedAttackers);
  const tr = sources.translations.data;
  const change = (part: Partial<AttackerFilters>) => {
    rememberedAttackers = { ...filters, ...part };
    setFilters(rememberedAttackers);
  };
  const all = useMemo(() => attackersOf(data.pokemon), [data]);
  const counts = useMemo(() => countGymTiers(all), [all]);
  const ties = useMemo(() => countPercentiles(all), [all]);
  const groups = useMemo(() => filterAttackers(all, filters, tr), [all, filters, tr]);
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const key = JSON.stringify(filters);
  const filtered = key !== JSON.stringify(NO_FILTERS);
  return (
    <>
      <Attribution data={data} />
      <div class="filters">
        <div class="tier-filter gym-tiers" role="group" aria-label="Tier">
          <button type="button" aria-pressed={filters.tier === 'all'} onClick={() => change({ tier: 'all' })}>
            Todos
          </button>
          {GYM_TIERS.map((tier) => (
            <button key={tier} type="button" aria-pressed={filters.tier === tier} onClick={() => change({ tier })}>
              <span class={tierClass(tier)}>
                <span class="sr-only">Tier </span>
                {tier}
              </span>
              <small>{counts[tier]}</small>
            </button>
          ))}
        </div>
        <div class="filter-row filter-search">
          <Search value={filters.search} onChange={(search) => change({ search })} />
        </div>
        <div class="filter-row filter-groups">
          <TypeSelect
            label="Tipo del ataque cargado"
            all="Todos los tipos"
            value={filters.type}
            onChange={(type) => change({ type })}
          />
          {GYM_GROUPS.map((group) => (
            <select
              key={group}
              aria-label={GROUP_LABELS[group]}
              value={filters[group]}
              onChange={(e) => change({ [group]: e.currentTarget.value as Presence })}
            >
              {PRESENCES.map((id) => (
                <option key={id} value={id}>
                  {PRESENCE_NAMES[group][id]}
                </option>
              ))}
            </select>
          ))}
        </div>
        {filters.type !== 'all' && (
          <p class="note">
            Pokémon cuyo ataque cargado recomendado es de tipo {typeName(filters.type)}. No es una lista completa de atacantes
            de ese tipo.
          </p>
        )}
        <p class="result-count" role="status">
          {total} Pokémon
          {filtered && (
            <button class="text-button" type="button" onClick={() => change(NO_FILTERS)}>
              Quitar filtros
            </button>
          )}
        </p>
      </div>
      <AttackersMethod data={data} />
      {groups.length === 0 ? (
        <p class="empty">Ningún Pokémon coincide con los filtros.</p>
      ) : (
        <>
          <p class="note">
            Se agrupan por tier y percentil. Los empates van por orden alfabético:{' '}
            <strong>aparecer primero no significa ser el mejor</strong>.
          </p>
          {groups.map((group) => (
            <TierSection key={`${group.tier}-${key}`} group={group} ties={ties} sources={sources} tr={tr} />
          ))}
        </>
      )}
      <MoveLegend />
    </>
  );
}

function DefenderCard({ pokemon, sources, tr }: CardProps & { pokemon: GymDefender }) {
  return (
    <li class={`card rank-card t-${pokemon.types[0] ?? ''}`}>
      <div class="rank-figure">
        <Figure pokemon={pokemon} sources={sources} tr={tr} />
        <Rank value={pokemon.rank} />
      </div>
      <div class="rank-body">
        <div class="rank-head">
          <PokemonName label={pvpLabel(pokemon, tr)} />
          <span class="score" title="Resistencia: defensa base × aguante base">
            <span class="sr-only">Resistencia </span>
            {decimal(pokemon.bulk, 0)}
          </span>
        </div>
        <div class="rank-meta">
          {pokemon.types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
        </div>
        <Weaknesses types={pokemon.types} />
      </div>
    </li>
  );
}

function DefendersMethod({ data }: { data: GymData }) {
  return (
    <details class="method">
      <summary>Qué Pokémon se incluyen</summary>
      <ul>
        <li>
          <strong>No pueden defender</strong> las megaevoluciones ni las formas primigenias (ayuda oficial), los legendarios,
          los singulares —salvo Meltan y Melmetal— y los ultraentes (Bulbapedia y wiki de Pokémon GO).
        </li>
        <li>
          <strong>Tampoco</strong> Aegislash, Cramorant, Mimikyu, Minior y Morpeko, según la wiki de Pokémon GO, por tener formas
          que solo existen en combate. No hay confirmación oficial, y alguna lista sí incluye a Aegislash.
        </li>
        <li>
          <strong>Oscuros:</strong> sí pueden defender gimnasios, salvo los que tampoco podrían en su forma normal. No llevan
          ficha propia por una <strong>limitación de los datos, no por una prohibición del juego</strong>: la fuente les da la
          misma resistencia que a la forma normal, sin contar el daño extra que reciben en combate.
        </li>
        <li>
          <strong>En cada gimnasio</strong> caben seis defensores, uno por entrenador, sin repetir especie (ayuda oficial). Tampoco se puede
          dejar al compañero activo (wiki).
        </li>
      </ul>
      <p>
        <External href="https://scopelyexplore.helpshift.com/hc/en/5-pokemon-go/faq/1171-battling-at-gyms/">Ayuda oficial</External>
        {' · '}
        <External href="https://bulbapedia.bulbagarden.net/wiki/Gym_(GO)">Bulbapedia</External>
        {' · '}
        <External href="https://pokemongo.fandom.com/wiki/Gym">Wiki de Pokémon GO</External>. Comprobado el 24 de noviembre de
        2026. Versión de los datos: {data.source.version}. {data.changes}
      </p>
    </details>
  );
}

function Defenders({ data, sources }: { data: GymData; sources: Sources }) {
  const [filters, setFilters] = useState(rememberedDefenders);
  const [shown, setShown] = useState(PAGE);
  const tr = sources.translations.data;
  const change = (part: Partial<typeof filters>) => {
    rememberedDefenders = { ...filters, ...part };
    setFilters(rememberedDefenders);
    setShown(PAGE);
  };
  const ranked = useMemo(() => rankDefenders(data.pokemon), [data]);
  const list = useMemo(() => filterDefenders(ranked, filters, tr), [ranked, filters, tr]);
  const filtered = filters.type !== 'all' || filters.search.trim() !== '';
  const rest = list.length - shown;
  return (
    <>
      <section class="card explain" aria-label="Cómo se calcula">
        <p>
          <strong>Resistencia = defensa base × aguante base.</strong> Es una clasificación provisional y teórica,{' '}
          <strong>no una simulación</strong>: no tiene en cuenta movimientos, motivación, nivel, tipos ni enfrentamientos
          concretos.
        </p>
      </section>
      <Attribution data={data} />
      <div class="filters">
        <div class="filter-row">
          <Search value={filters.search} onChange={(search) => change({ search })} />
          <TypeSelect label="Tipo del Pokémon" all="Todo tipo" value={filters.type} onChange={(type) => change({ type })} />
        </div>
        <p class="result-count" role="status">
          {list.length} Pokémon
          {filtered && (
            <button class="text-button" type="button" onClick={() => change({ type: 'all', search: '' })}>
              Quitar filtros
            </button>
          )}
        </p>
      </div>
      <DefendersMethod data={data} />
      {list.length === 0 ? (
        <p class="empty">
          Ningún Pokémon coincide. Aquí no aparecen los que no pueden defender gimnasios ni los oscuros, que sí pueden pero no
          tienen datos propios.
        </p>
      ) : (
        <ol class="ranking">
          {list.slice(0, shown).map((pokemon) => (
            <DefenderCard key={pokemon.name} pokemon={pokemon} sources={sources} tr={tr} />
          ))}
        </ol>
      )}
      {rest > 0 && (
        <button class="button more" type="button" onClick={() => setShown(shown + PAGE * 2)}>
          Mostrar más ({rest} restantes)
        </button>
      )}
    </>
  );
}

export function GymsView({ sources, section }: { sources: Sources; section: string | null }) {
  const { gyms } = sources;
  const defending = section === 'defensores';
  return (
    <>
      <div class="segmented segmented-2" role="group" aria-label="Clasificación">
        <button type="button" aria-pressed={!defending} onClick={() => (location.hash = 'gimnasios')}>
          Atacantes
        </button>
        <button type="button" aria-pressed={defending} onClick={() => (location.hash = 'gimnasios/defensores')}>
          Defensores
        </button>
      </div>
      <SourceStatus source={gyms} />
      {!sources.translations.data && gyms.data && (
        <p class="note">Las traducciones aún no están disponibles. Se muestran los nombres originales.</p>
      )}
      {!gyms.data ? (
        <Placeholder source={gyms} />
      ) : defending ? (
        <Defenders data={gyms.data} sources={sources} />
      ) : (
        <Attackers data={gyms.data} sources={sources} />
      )}
    </>
  );
}
