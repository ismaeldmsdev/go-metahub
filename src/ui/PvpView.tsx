import { useMemo, useState } from 'preact/hooks';
import { LEAGUES, type League } from '../data/config';
import type { PvpData, PvpEntry, Translations } from '../data/models';
import { moveName, pvpLabel } from '../domain/names';
import { spriteId, type SpriteIndex } from '../domain/sprites';
import { countTiers, filterPvp, type PvpFilters, type TierGroup } from '../domain/pvp';
import { tierOf, TIER_MIN, TIERS, VARIANTS, type Tier, type Variant } from '../domain/tiers';
import { External, PokemonName, Placeholder, SourceStatus, TypeTag } from './common';
import type { Sources } from './hooks';
import { PokemonImage } from './PokemonImage';

const LEAGUE_NAMES: Record<League, { name: string; limit: string }> = {
  1500: { name: 'Super', limit: '1500 PC' },
  2500: { name: 'Ultra', limit: '2500 PC' },
  10000: { name: 'Máster', limit: 'Sin límite' },
};

const VARIANT_NAMES: Record<Variant, string> = {
  all: 'Todas',
  normal: 'Normales',
  shadow: 'Oscuros',
  form: 'Formas',
};

/** Tarjetas que se pintan de entrada en cada tier y con cada «Mostrar más». */
const PAGE = 30;

const score = (value: number) => value.toLocaleString('es', { minimumFractionDigits: 1 });

const tierRange = (tier: Tier): string => {
  const above = TIERS[TIERS.indexOf(tier) - 1];
  return above ? `${TIER_MIN[tier]} a ${score(TIER_MIN[above] - 0.1)}` : `${TIER_MIN[tier]} o más`;
};

interface Selection extends PvpFilters {
  league: League;
}

// Se recuerda mientras la aplicación está abierta, para no perderlo al cambiar de sección.
let remembered: Selection = { league: 1500, tier: 'all', variant: 'all', search: '' };

interface ListProps {
  data: PvpData;
  tr: Translations | undefined;
  sprites: SpriteIndex | undefined;
  imagesPending: boolean;
}

function Card({ entry, data, tr, sprites, imagesPending }: ListProps & { entry: PvpEntry }) {
  const tier = tierOf(entry.score);
  const label = pvpLabel(entry, tr);
  return (
    <li class="card rank-card">
      <PokemonImage
        id={spriteId(entry, sprites)}
        dex={entry.dex}
        type={entry.types[0]}
        shadow={label.shadow}
        pending={imagesPending}
      />
      <div class="rank-body">
        <div class="rank-head">
          <PokemonName label={label} />
          <span class="score" title="Puntuación de PvPoke">
            <span class="sr-only">Puntuación </span>
            {score(entry.score)}
          </span>
        </div>
        <div class="rank-meta">
          <span class={`tier tier-${tier ?? 'none'}`}>
            <span class="sr-only">Tier </span>
            {tier ?? '–'}
          </span>
          <span class="rank">Puesto {entry.rank}</span>
          {entry.types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
        </div>
        <ul class="moves">
          {entry.moves.map((id) => {
            const move = data.moves[id];
            if (!move) return null;
            return (
              <li key={id} class={move.fast ? 'move move-fast' : 'move'}>
                <span class="sr-only">{move.fast ? 'Ataque rápido: ' : 'Ataque cargado: '}</span>
                {moveName(move, tr)}
                {entry.elite.includes(id) && (
                  <abbr title="Movimiento especial: puede requerir una MT élite o un evento">★</abbr>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

function Group({ group, ...list }: ListProps & { group: TierGroup }) {
  const [shown, setShown] = useState(PAGE);
  const rest = group.entries.length - shown;
  return (
    <section class="group tier-group">
      <h2>
        <span class={`tier tier-${group.tier ?? 'none'}`}>{group.tier ?? '–'}</span>
        {group.tier ? `Tier ${group.tier}` : 'Sin tier'} <span class="count">{group.entries.length}</span>
        <small>{group.tier ? `Puntuación ${tierRange(group.tier)}` : `Menos de ${TIER_MIN.C}`}</small>
      </h2>
      <ol class="ranking">
        {group.entries.slice(0, shown).map((entry) => (
          <Card key={entry.id} entry={entry} {...list} />
        ))}
      </ol>
      {rest > 0 && (
        <button class="button more" type="button" onClick={() => setShown(shown + PAGE * 2)}>
          Mostrar más ({rest} restantes)
        </button>
      )}
    </section>
  );
}

export function PvpView({ sources }: { sources: Sources }) {
  const [selection, setSelection] = useState<Selection>(remembered);
  const { pvp, translations } = sources;
  const tr = translations.data;
  const change = (part: Partial<Selection>) => {
    remembered = { ...selection, ...part };
    setSelection(remembered);
  };
  const { league, tier, variant, search } = selection;
  const entries = pvp.data?.leagues[league];
  const counts = useMemo(() => (entries ? countTiers(entries) : undefined), [entries]);
  const groups = useMemo(
    () => (entries ? filterPvp(entries, { tier, variant, search }, tr) : []),
    [entries, tier, variant, search, tr],
  );
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const filtered = tier !== 'all' || variant !== 'all' || search.trim() !== '';

  return (
    <>
      <div class="segmented" role="group" aria-label="Liga">
        {LEAGUES.map((id) => (
          <button key={id} type="button" aria-pressed={league === id} onClick={() => change({ league: id })}>
            {LEAGUE_NAMES[id].name}
            <small>{LEAGUE_NAMES[id].limit}</small>
          </button>
        ))}
      </div>
      <SourceStatus source={pvp} />
      {!tr && pvp.data && (
        <p class="note">Las traducciones aún no están disponibles. Se muestran los nombres originales.</p>
      )}
      {!pvp.data || !counts ? (
        <Placeholder source={pvp} />
      ) : (
        <>
          <div class="filters">
            <div class="tier-filter" role="group" aria-label="Tier">
              <button type="button" aria-pressed={tier === 'all'} onClick={() => change({ tier: 'all' })}>
                Todos
              </button>
              {TIERS.map((id) => (
                <button key={id} type="button" aria-pressed={tier === id} onClick={() => change({ tier: id })}>
                  <span class={`tier tier-${id}`}>
                    <span class="sr-only">Tier </span>
                    {id}
                  </span>
                  <small>{counts[id]}</small>
                </button>
              ))}
            </div>
            <div class="filter-row">
              <input
                type="search"
                value={search}
                placeholder="Buscar Pokémon"
                aria-label="Buscar Pokémon"
                autocomplete="off"
                onInput={(e) => change({ search: e.currentTarget.value })}
              />
              <select
                aria-label="Variante"
                value={variant}
                onChange={(e) => change({ variant: e.currentTarget.value as Variant })}
              >
                {VARIANTS.map((id) => (
                  <option key={id} value={id}>
                    {VARIANT_NAMES[id]}
                  </option>
                ))}
              </select>
            </div>
            <p class="result-count" role="status">
              {total} Pokémon
              {filtered && (
                <button
                  class="text-button"
                  type="button"
                  onClick={() => change({ tier: 'all', variant: 'all', search: '' })}
                >
                  Quitar filtros
                </button>
              )}
            </p>
          </div>
          <details class="method">
            <summary>Cómo se forman los tiers</summary>
            <p>
              Son categorías propias de esta aplicación, no oficiales de <External href="https://pvpoke.com">PvPoke</External>.
              El puesto, la puntuación y los movimientos son los originales de PvPoke, sin recalcular.
            </p>
            <ul>
              {TIERS.map((id) => (
                <li key={id}>
                  <strong>Tier {id}:</strong> puntuación {tierRange(id)}
                </li>
              ))}
            </ul>
            <p>
              Por debajo de {TIER_MIN.C} no hay tier, pero puedes encontrar al Pokémon con el buscador. Las puntuaciones
              son relativas a cada liga y no sirven para comparar entre ligas. Una diferencia de décimas no es
              significativa.
            </p>
          </details>
          {groups.length === 0 ? (
            <p class="empty">
              {search.trim()
                ? 'Ningún Pokémon de esta liga coincide con la búsqueda y los filtros.'
                : 'Ningún Pokémon coincide con los filtros.'}
            </p>
          ) : (
            groups.map((group) => (
              <Group
                key={`${league}-${group.tier}-${tier}-${variant}-${search}`}
                group={group}
                data={pvp.data!}
                tr={tr}
                sprites={sources.sprites.data}
                imagesPending={sources.sprites.health.level === 'loading'}
              />
            ))
          )}
          <p class="legend">
            El movimiento con fondo es el rápido. ★ indica un movimiento que PvPoke marca como especial, no siempre
            disponible.
          </p>
        </>
      )}
    </>
  );
}
