import { useLayoutEffect, useMemo, useState } from 'preact/hooks';
import type { MaxBoss } from '../data/models';
import { formatDate } from '../domain/freshness';
import {
  announcedBosses,
  bulkOf,
  filterMax,
  filterMaxCounters,
  groupMaxBosses,
  MAX_KINDS,
  MAX_LINKS,
  MAX_SORTS,
  MAX_VARIANTS,
  maxPokemon,
  maxSlug,
  ROLES,
  roleUrl,
  type AnnouncedBoss,
  type MaxFilters,
  type MaxPokemon,
  type MaxSort,
  type MaxVariant,
} from '../domain/max';
import { typeName } from '../domain/names';
import { spriteId } from '../domain/sprites';
import { CounterCard, CountersPanel } from './BossView';
import { External, Loading, Placeholder, PokemonName, SourceStatus, TypeTag, Weaknesses } from './common';
import { Search, TypeSelect } from './GymsView';
import type { Sources } from './hooks';
import { PokemonImage } from './PokemonImage';

const PAGE = 30;

const NO_FILTERS: MaxFilters = { kind: 'all', type: 'all', sort: 'atk', search: '' };

// Se recuerdan mientras la aplicación está abierta.
let remembered = NO_FILTERS;
/** Último jefe abierto, para volver al mismo punto. */
let opened: string | null = null;

const VARIANT_NAMES: Record<MaxVariant, string> = { all: 'Todos', dinamax: 'Dinamax', gigamax: 'Gigamax' };

const SORT_NAMES: Record<MaxSort, string> = {
  atk: 'Por ataque base',
  bulk: 'Por resistencia teórica',
  hp: 'Por PS base',
  name: 'Por nombre',
};

const integer = (value: number | null | undefined): string =>
  value === null || value === undefined ? '–' : value.toLocaleString('es', { useGrouping: 'always' });

const of = (id: string, sources: Sources): MaxPokemon =>
  maxPokemon(id, sources.pvp.data?.species, sources.translations.data);

function Figure({ pokemon, sources }: { pokemon: MaxPokemon; sources: Sources }) {
  return (
    <PokemonImage
      id={spriteId(pokemon.sprite, sources.sprites.data)}
      dex={pokemon.species.dex}
      type={pokemon.species.types[0]}
      pending={sources.sprites.health.level === 'loading'}
    />
  );
}

const Kind = ({ pokemon }: { pokemon: MaxPokemon }) => <span class="chip chip-plain">{MAX_KINDS[pokemon.kind]}</span>;

/* Jefes */

function Announced({ item, sources }: { item: AnnouncedBoss; sources: Sources }) {
  const pokemon = item.boss && of(item.boss.id, sources);
  return (
    <li class={`card boss t-${pokemon?.species.types[0] ?? ''}`}>
      {pokemon && <Figure pokemon={pokemon} sources={sources} />}
      <div class="boss-body">
        {pokemon ? (
          <div class="rank-meta">
            <PokemonName label={pokemon.label} />
            <Kind pokemon={pokemon} />
          </div>
        ) : (
          <span class="pokemon-name" lang="en">
            {item.name}
          </span>
        )}
        <p class={item.status === 'active' ? 'validity ok' : 'validity'}>
          {item.status === 'active' ? `Hasta el ${formatDate(item.end)}` : `Del ${formatDate(item.start)} al ${formatDate(item.end)}`}
        </p>
        {item.boss ? (
          <a class="link boss-open" href={`#incursiones/${maxSlug(item.boss.id)}`}>
            Ver counters
          </a>
        ) : (
          <p class="fine">LeekDuck no nombra un jefe concreto o no está en el catálogo.</p>
        )}
      </div>
    </li>
  );
}

function BossTile({ boss, sources }: { boss: MaxBoss; sources: Sources }) {
  const pokemon = of(boss.id, sources);
  return (
    <li id={maxSlug(boss.id)}>
      <a class="rival" href={`#incursiones/${maxSlug(boss.id)}`}>
        <Figure pokemon={pokemon} sources={sources} />
        <PokemonName label={pokemon.label} />
        {pokemon.kind !== 'dinamax' && <Kind pokemon={pokemon} />}
      </a>
    </li>
  );
}

const Links = () => (
  <section class="group">
    <h2>Recomendaciones por papel</h2>
    <p class="note">
      Cada papel Max se mide de una forma y no hay ningún ranking abierto que se pueda incluir aquí. Estas webs, en inglés, sí
      recomiendan atacantes, defensores y curación:
    </p>
    <ul class="link-list">
      {MAX_LINKS.map(({ name, url }) => (
        <li key={url}>
          <External href={url}>{name}</External>
        </li>
      ))}
    </ul>
  </section>
);

function BossList({ sources, now }: { sources: Sources; now: number }) {
  const { pokebattler, events } = sources;
  const catalog = pokebattler.data?.max;
  useLayoutEffect(() => {
    if (opened) document.getElementById(opened)?.scrollIntoView({ block: 'center' });
    opened = null;
  }, []);
  const announced = announcedBosses(events.data, catalog ?? [], now);
  const active = announced.filter((item) => item.status === 'active');
  const upcoming = announced.filter((item) => item.status === 'upcoming');
  return (
    <>
      <section class="card boss">
        <div class="boss-body">
          <h2>Pokémon compatibles con Max</h2>
          <p class="fine">Estadísticas base y tipos de su ataque Max.</p>
          <a class="link boss-open" href="#incursiones/max-pokemon">
            Ver fichas
          </a>
        </div>
      </section>
      <section class="group" aria-label="Confirmados ahora">
        <h2>
          Confirmados ahora <span class="chip chip-source">Con fecha de LeekDuck</span>
        </h2>
        {events.health.level !== 'ok' && <SourceStatus source={events} />}
        {active.length > 0 ? (
          <ul class="grid">
            {active.map((item) => (
              <Announced key={item.event.id} item={item} sources={sources} />
            ))}
          </ul>
        ) : (
          <p class="note">Ningún jefe Max tiene ahora mismo fechas confirmadas en LeekDuck.</p>
        )}
      </section>
      {upcoming.length > 0 && (
        <section class="group" aria-label="Anunciados">
          <h2>Anunciados</h2>
          <ul class="grid">
            {upcoming.map((item) => (
              <Announced key={item.event.id} item={item} sources={sources} />
            ))}
          </ul>
        </section>
      )}
      <section class="group" aria-label="Catálogo sin fecha">
        <h2>
          Catálogo <span class="chip chip-own">Sin fecha</span>
        </h2>
        <p class="note">
          Jefes que Pokébattler tiene en su catálogo. <strong>No indica cuándo aparecen</strong>: que estén aquí no significa
          que sigan activos.
        </p>
        <SourceStatus source={pokebattler} />
        {!catalog ? (
          <Placeholder source={pokebattler} />
        ) : catalog.length === 0 ? (
          <p class="empty">Pokébattler no lista ahora mismo ningún jefe Max.</p>
        ) : (
          groupMaxBosses(catalog).map(({ key, title, bosses }) => (
            <section key={key} class="group">
              <h3>
                {title} <span class="count">{bosses.length}</span>
              </h3>
              <ul class="rivals max-bosses">
                {bosses.map((boss) => (
                  <BossTile key={boss.id} boss={boss} sources={sources} />
                ))}
              </ul>
            </section>
          ))
        )}
      </section>
      <Links />
    </>
  );
}

/* Counters de un jefe */

function Explanation() {
  return (
    <details class="method">
      <summary>Qué significa cada dato</summary>
      <ul>
        <li>
          <strong>Estimator:</strong> entrenadores necesarios, aproximadamente, según Pokébattler. <strong>Menos es mejor.</strong>{' '}
          Es la medida que ordena la lista.
        </li>
        <li>
          <strong>eDPS y TDO:</strong> daño efectivo por segundo y daño total antes de debilitarse. Más es mejor.
        </li>
        <li>
          <strong>Papeles:</strong> un equipo Max son tres Pokémon, y Pokébattler mide de forma distinta a atacantes, defensores,
          cargadores, curación y escudos. Esta lista no los distingue.
        </li>
        <li>
          <strong>Movimientos:</strong> el rápido y el cargado. En un Dinamax, el ataque Max es del tipo del rápido; en un
          Gigamax, el suyo propio.
        </li>
      </ul>
      <p>
        Son resultados de Pokébattler, sin recalcular: los 30 que publica, cada uno con su mejor combinación, frente a la media
        de ataques posibles del jefe. Supone Pokémon de nivel 40 e IV perfectos. Pokébattler no publica la fecha de sus cálculos.
      </p>
    </details>
  );
}

const RoleLinks = ({ id }: { id: string }) => (
  <section class="group" aria-label="Por papel en Pokébattler">
    <h2>Por papel en Pokébattler</h2>
    <p class="note">Se abren en su web, en inglés.</p>
    <ul class="link-list link-columns">
      {ROLES.map(({ path, name }) => (
        <li key={path}>
          <External href={roleUrl(id, path)}>{name}</External>
        </li>
      ))}
    </ul>
  </section>
);

function Boss({ boss, sources, now }: { boss: MaxBoss; sources: Sources; now: number }) {
  const pokemon = of(boss.id, sources);
  const announced = announcedBosses(sources.events.data, [boss], now).filter((item) => item.boss?.id === boss.id);
  const active = announced.find((item) => item.status === 'active');
  const next = announced.find((item) => item.status === 'upcoming');
  return (
    <>
      <a class="link back" href="#incursiones/max">
        Todos los jefes Max
      </a>
      <article class={`card boss t-${pokemon.species.types[0] ?? ''}`}>
        <Figure pokemon={pokemon} sources={sources} />
        <div class="boss-body">
          <div class="rank-meta">
            <PokemonName label={pokemon.label} />
            <Kind pokemon={pokemon} />
          </div>
          <div class="types">
            {pokemon.species.types.map((type) => (
              <TypeTag key={type} type={type} />
            ))}
          </div>
          <Weaknesses types={pokemon.species.types} />
          {active ? (
            <p class="validity ok">Confirmado hasta el {formatDate(active.end)}</p>
          ) : next ? (
            <p class="validity warn">Anunciado a partir del {formatDate(next.start)}. Puede no estar activo.</p>
          ) : (
            <p class="validity">Sin fecha: está en el catálogo, pero puede no estar activo.</p>
          )}
        </div>
      </article>
      <div class="card explain">
        <p>
          <strong>No es un equipo completo.</strong> Pokébattler ordena a todos por la misma medida, sin separar atacantes,
          defensores y curación. Para cada papel, usa sus páginas.
        </p>
      </div>
      <RoleLinks id={boss.id} />
      {boss.tier ? (
        <CountersPanel
          target={{ id: boss.id, tier: boss.tier }}
          url={roleUrl(boss.id, '')}
          sources={sources}
          now={now}
          title="Counters"
          variants={MAX_VARIANTS}
          names={VARIANT_NAMES}
          filter={filterMaxCounters}
          card={(counter) => {
            const attacker = of(counter.id, sources);
            return (
              <CounterCard
                key={counter.id}
                counter={counter}
                sources={sources}
                species={attacker.species}
                sprite={attacker.sprite}
                chip={<Kind pokemon={attacker} />}
              />
            );
          }}
          explanation={<Explanation />}
        />
      ) : (
        <p class="empty">Pokébattler lista a este jefe en varios niveles, así que no se muestran sus counters.</p>
      )}
    </>
  );
}

/* Fichas */

function Card({ pokemon, sources }: { pokemon: MaxPokemon; sources: Sources }) {
  const { species, kind } = pokemon;
  return (
    <li class={`card rank-card t-${species.types[0] ?? ''}`}>
      <div class="rank-figure">
        <Figure pokemon={pokemon} sources={sources} />
      </div>
      <div class="rank-body">
        <PokemonName label={pokemon.label} />
        <div class="rank-meta">
          <Kind pokemon={pokemon} />
          {species.types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
        </div>
        <p class="fine max-types">
          Ataque Max:{' '}
          {kind === 'dinamax'
            ? species.fastTypes?.length
              ? species.fastTypes.map((type) => <TypeTag key={type} type={type} />)
              : 'sin datos'
            : `${MAX_KINDS[kind]} propio`}
        </p>
        <dl class="metrics">
          <div>
            <dt>Ataque base</dt>
            <dd>{integer(species.stats?.atk)}</dd>
          </div>
          <div>
            <dt>Resistencia</dt>
            <dd>{integer(bulkOf(species))}</dd>
          </div>
          <div>
            <dt>PS base</dt>
            <dd>{integer(species.stats?.hp)}</dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

function Cards({ sources }: { sources: Sources }) {
  const { pokebattler, pvp } = sources;
  const [filters, setFilters] = useState(remembered);
  const [shown, setShown] = useState(PAGE);
  const tr = sources.translations.data;
  const ids = pokebattler.data?.dynamax;
  const species = pvp.data?.species;
  const all = useMemo(() => (ids ?? []).map((id) => maxPokemon(id, species, tr)), [ids, species, tr]);
  const list = useMemo(() => filterMax(all, filters, tr), [all, filters, tr]);
  const change = (part: Partial<MaxFilters>) => {
    remembered = { ...filters, ...part };
    setFilters(remembered);
    setShown(PAGE);
  };
  const rest = list.length - shown;
  return (
    <>
      <a class="link back" href="#incursiones/max">
        Combates Max
      </a>
      <h2>Pokémon compatibles con Max</h2>
      <section class="card explain" aria-label="Qué se muestra">
        <p>
          <strong>Datos teóricos, no un ranking.</strong> El orden es solo el de una estadística base. No tiene en cuenta
          movimientos, tipos, nivel ni al jefe, y no dice quién es mejor atacante, tanque o apoyo.
        </p>
      </section>
      <p class="note">
        Lista de <External href="https://www.pokebattler.com/max">Pokébattler</External>; estadísticas y movimientos de{' '}
        <External href="https://pvpoke.com">PvPoke</External>.
      </p>
      <SourceStatus source={pokebattler} />
      {!ids ? (
        <Placeholder source={pokebattler} />
      ) : (
        <>
          <div class="filters">
            <div class="filter-row filter-search">
              <Search value={filters.search} onChange={(search) => change({ search })} />
            </div>
            <div class="filter-row filter-groups filter-three">
              <select
                aria-label="Clase"
                value={filters.kind}
                onChange={(e) => change({ kind: e.currentTarget.value as MaxFilters['kind'] })}
              >
                {MAX_VARIANTS.map((id) => (
                  <option key={id} value={id}>
                    {VARIANT_NAMES[id]}
                  </option>
                ))}
              </select>
              <TypeSelect
                label="Tipo del ataque Max"
                all="Todo ataque"
                prefix="Ataque "
                value={filters.type}
                onChange={(type) => change({ type })}
              />
              <select
                aria-label="Orden"
                value={filters.sort}
                onChange={(e) => change({ sort: e.currentTarget.value as MaxSort })}
              >
                {MAX_SORTS.map((id) => (
                  <option key={id} value={id}>
                    {SORT_NAMES[id]}
                  </option>
                ))}
              </select>
            </div>
            {filters.type !== 'all' && (
              <p class="note">
                Dinamax que pueden conocer un ataque rápido de tipo {typeName(filters.type)}. Los Gigamax tienen su propio
                ataque y no entran en este filtro.
              </p>
            )}
            <p class="result-count" role="status">
              {list.length} Pokémon
              {JSON.stringify(filters) !== JSON.stringify(NO_FILTERS) && (
                <button class="text-button" type="button" onClick={() => change(NO_FILTERS)}>
                  Quitar filtros
                </button>
              )}
            </p>
          </div>
          <details class="method">
            <summary>Qué significa cada dato</summary>
            <ul>
              <li>
                <strong>Ataque base:</strong> influye en el daño de sus ataques, también los Max.
              </li>
              <li>
                <strong>Resistencia:</strong> defensa base × PS base. Es el mismo criterio teórico que en los defensores de
                gimnasio.
              </li>
              <li>
                <strong>PS base:</strong> los puntos de salud de partida.
              </li>
              <li>
                <strong>Ataque Max:</strong> en un Dinamax es del tipo de su ataque rápido, según{' '}
                <External href="https://bulbapedia.bulbagarden.net/wiki/Max_Move_(GO)">Bulbapedia</External>. Un Gigamax tiene un
                ataque propio que no cambia.
              </li>
              <li>
                <strong>Gigamax:</strong> tiene las mismas estadísticas que la forma normal.
              </li>
            </ul>
          </details>
          {list.length === 0 ? (
            <p class="empty">Ningún Pokémon coincide con los filtros.</p>
          ) : (
            <ul class="ranking">
              {list.slice(0, shown).map((pokemon) => (
                <Card key={pokemon.id} pokemon={pokemon} sources={sources} />
              ))}
            </ul>
          )}
          {rest > 0 && (
            <button class="button more" type="button" onClick={() => setShown(shown + PAGE * 2)}>
              Mostrar más ({rest} restantes)
            </button>
          )}
        </>
      )}
      <Links />
    </>
  );
}

/** `section` es lo que sigue a «max»: null en la lista. */
export function MaxView({ sources, section, now }: { sources: Sources; section: string; now: number }) {
  const { pokebattler } = sources;
  if (section === 'max') return <BossList sources={sources} now={now} />;
  if (section === 'max-pokemon') return <Cards sources={sources} />;
  opened = section;
  const boss = pokebattler.data?.max.find(({ id }) => maxSlug(id) === section);
  if (boss) return <Boss key={section} boss={boss} sources={sources} now={now} />;
  if (pokebattler.health.level === 'loading') return <Loading />;
  if (!pokebattler.data) return <Placeholder source={pokebattler} />;
  return (
    <div class="empty">
      <p>Este jefe ya no figura en el catálogo Max.</p>
      <a class="link" href="#incursiones/max">
        Ver los combates Max
      </a>
    </div>
  );
}
