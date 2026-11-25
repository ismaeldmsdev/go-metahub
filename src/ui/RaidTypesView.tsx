import { useMemo, useState } from 'preact/hooks';
import type { RaidAttacker, RaidAttackersData } from '../data/models';
import { GYM_GROUPS, gymMove, PRESENCES, type Presence } from '../domain/gyms';
import { moveName, pvpLabel, typeName, TYPES } from '../domain/names';
import { attackersOfType, countByType, goHubTypeUrl, type RaidFilters } from '../domain/raidTypes';
import { typeRankingUrl } from '../domain/raids';
import { spriteId } from '../domain/sprites';
import { External, Move, MoveLegend, Placeholder, PokemonName, SourceStatus, TypeTag } from './common';
import { Attribution, GROUP_LABELS, PRESENCE_NAMES, Search, tierClass } from './GymsView';
import type { Sources } from './hooks';
import { PokemonImage } from './PokemonImage';

const PAGE = 30;

const NO_FILTERS: RaidFilters = { mega: 'with', shadow: 'with', legendary: 'with', search: '' };

// Se recuerdan mientras la aplicación está abierta.
let remembered = NO_FILTERS;

const decimal = (value: number, digits: number): string =>
  value.toLocaleString('es', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: 'always' });

function AttackerCard({ attacker, sources }: { attacker: RaidAttacker; sources: Sources }) {
  const tr = sources.translations.data;
  const label = pvpLabel(attacker, tr);
  return (
    <li class={`card rank-card t-${attacker.types[0] ?? ''}`}>
      <div class="rank-figure">
        <PokemonImage
          id={spriteId(attacker, sources.sprites.data)}
          dex={attacker.dex}
          type={attacker.types[0]}
          shadow={label.shadow}
          pending={sources.sprites.health.level === 'loading'}
        />
      </div>
      <div class="rank-body">
        <PokemonName label={label} />
        <div class="rank-meta">
          <span class={attacker.tier === 'E' ? 'tier tier-D' : tierClass(attacker.tier)}>
            <span class="sr-only">Tier </span>
            {attacker.tier}
          </span>
          {attacker.types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
        </div>
        <ul class="moves">
          <Move fast name={moveName(gymMove(attacker.fast, attacker.fastType), tr)} />
          <Move fast={false} name={moveName(gymMove(attacker.charged, attacker.chargedType), tr)} />
        </ul>
        <dl class="metrics">
          <div>
            <dt>Percentil</dt>
            <dd>{decimal(attacker.percentile, 1)}</dd>
          </div>
          <div>
            <dt>DPS*</dt>
            <dd>{decimal(attacker.dps, 0)}</dd>
          </div>
          <div>
            <dt>TDO*</dt>
            <dd>{decimal(attacker.tdo / 1e6, 0)} M</dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

function Method({ data }: { data: RaidAttackersData }) {
  return (
    <details class="method">
      <summary>Cómo leer estos datos</summary>
      <ul>
        <li>
          <strong>Qué sale en cada tipo:</strong> la fuente da una sola combinación por Pokémon, la que considera mejor. Cada
          uno aparece únicamente en el tipo de ese ataque cargado, así que faltan los que también sirven con otros
          movimientos: Mamoswine oscuro, por ejemplo, sale en Tierra y no en Hielo.
        </li>
        <li>
          <strong>Orden:</strong> por el percentil que publica doctorpokegogo entre todas las formas; con el mismo, por nombre.
          No hay puestos, porque la lista no es completa.
        </li>
        <li>
          <strong>Tier y percentil:</strong> los originales. No siempre concuerdan entre sí; se muestran ambos sin corregir.
        </li>
        <li>
          <strong>DPS* y TDO*:</strong> en la escala propia de la fuente, que no es la de otras webs. TDO en millones. Sirven para
          comparar aquí, no con los counters de un jefe.
        </li>
        <li>
          <strong>Movimientos:</strong> alguno puede requerir una MT élite. Los legendarios incluyen singulares y ultraentes.
        </li>
      </ul>
      <p>
        <External href={data.source.methodologyUrl}>Metodología de doctorpokegogo</External> (en inglés). Versión de los datos:{' '}
        {data.source.version}. {data.changes}
      </p>
    </details>
  );
}

/** Los 18 tipos, con cuántos hay en cada uno. */
function TypeGrid({ data }: { data: RaidAttackersData }) {
  const counts = useMemo(() => countByType(data.pokemon), [data]);
  return (
    <ul class="type-links">
      {Object.keys(TYPES).map((type) => (
        <li key={type}>
          <a class={`type t-${type}`} href={`#incursiones/tipo-${type}`}>
            {TYPES[type]}
            <small>{counts.get(type) ?? 0}</small>
          </a>
        </li>
      ))}
    </ul>
  );
}

const Warning = ({ type }: { type?: string }) => (
  <section class="card explain" aria-label="Qué se muestra">
    <p>
      <strong>No es un ranking completo.</strong> Son Pokémon cuyo mejor conjunto registrado ataca con{' '}
      {type ? `el tipo ${typeName(type)}` : 'ese tipo'}. Faltan los que lo usan como segunda opción.
    </p>
  </section>
);

function TypeList({ data, type, sources }: { data: RaidAttackersData; type: string; sources: Sources }) {
  const [filters, setFilters] = useState(remembered);
  const [shown, setShown] = useState(PAGE);
  const tr = sources.translations.data;
  const change = (part: Partial<RaidFilters>) => {
    remembered = { ...filters, ...part };
    setFilters(remembered);
    setShown(PAGE);
  };
  const list = useMemo(() => attackersOfType(data.pokemon, type, filters, tr), [data, type, filters, tr]);
  const rest = list.length - shown;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  return (
    <>
      <h2>
        Ataque de tipo <TypeTag type={type} />
      </h2>
      <Warning type={type} />
      <p class="note">
        Listas completas: <External href={typeRankingUrl(type)}>Pokébattler</External> y{' '}
        <External href={goHubTypeUrl(type)}>GO Hub</External> (en inglés).
      </p>
      <Attribution data={data} />
      <div class="filters">
        <div class="filter-row filter-search">
          <Search value={filters.search} onChange={(search) => change({ search })} />
        </div>
        <div class="filter-row filter-groups filter-three">
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
        <p class="result-count" role="status">
          {list.length} Pokémon
          {filtered && (
            <button class="text-button" type="button" onClick={() => change(NO_FILTERS)}>
              Quitar filtros
            </button>
          )}
        </p>
      </div>
      <Method data={data} />
      {list.length === 0 ? (
        <p class="empty">Ningún Pokémon coincide con los filtros.</p>
      ) : (
        <ul class="ranking">
          {list.slice(0, shown).map((attacker) => (
            <AttackerCard key={attacker.name} attacker={attacker} sources={sources} />
          ))}
        </ul>
      )}
      {rest > 0 && (
        <button class="button more" type="button" onClick={() => setShown(shown + PAGE * 2)}>
          Mostrar más ({rest} restantes)
        </button>
      )}
      <MoveLegend />
    </>
  );
}

export function RaidTypesView({ sources, type }: { sources: Sources; type: string | null }) {
  const { raidTypes } = sources;
  return (
    <>
      {type && (
        <a class="link back" href="#incursiones/tipos">
          Todos los tipos
        </a>
      )}
      <SourceStatus source={raidTypes} />
      {!raidTypes.data ? (
        <Placeholder source={raidTypes} />
      ) : type ? (
        <TypeList key={type} data={raidTypes.data} type={type} sources={sources} />
      ) : (
        <>
          <Warning />
          <Attribution data={raidTypes.data} />
          <TypeGrid data={raidTypes.data} />
          <p class="note">Cada tipo enlaza a listas externas más completas, en inglés.</p>
        </>
      )}
    </>
  );
}
