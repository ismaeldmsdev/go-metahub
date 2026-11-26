import { useMemo, useState } from 'preact/hooks';
import { LEAGUES, type League } from '../data/config';
import type { PvpEntry, PvpMove, Translations } from '../data/models';
import { moveName, pvpLabel } from '../domain/names';
import { spriteId, type SpriteIndex } from '../domain/sprites';
import { countTiers, filterPvp, type PvpFilters, type TierGroup } from '../domain/pvp';
import { tierOf, TIER_MIN, TIERS, VARIANTS, type Tier, type Variant } from '../domain/tiers';
import { External, InfoLine, Move, MoveLegend, Placeholder, sourceAlerts, SourceStatus } from './common';
import { Head, Pin } from './frame';
import { Search, TierCells, tierGroup } from './GymsView';
import type { Sources } from './hooks';
import { CupsView, CupView, MegaView, parseFormatSlug } from './FormatsView';
import { PokemonImage } from './PokemonImage';
import { RankCard } from './RankCard';

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
  moves: Record<string, PvpMove>;
  tr: Translations | undefined;
  sprites: SpriteIndex | undefined;
  imagesPending: boolean;
}

interface CardProps extends ListProps {
  entry: PvpEntry;
  /** Los tiers propios solo se aplican a las tres ligas. */
  tiered?: boolean;
}

export function PvpCard({ entry, moves, tr, sprites, imagesPending, tiered = true }: CardProps) {
  const tier = tierOf(entry.score);
  const label = pvpLabel(entry, tr);
  return (
    <RankCard
      label={label}
      types={entry.types}
      rank={entry.rank}
      figure={
        <PokemonImage
          id={spriteId(entry, sprites)}
          dex={entry.dex}
          type={entry.types[0]}
          shadow={label.shadow}
          pending={imagesPending}
        />
      }
      tier={
        tiered && (
          <span class={`tier tier-${tier ?? 'none'}`}>
            <span class="sr-only">Tier </span>
            {tier ?? '–'}
          </span>
        )
      }
      moves={entry.moves.map((id) => {
        const move = moves[id];
        if (!move) return null;
        return <Move key={id} name={moveName(move, tr)} fast={move.fast} elite={entry.elite.includes(id)} />;
      })}
      value={{ text: score(entry.score), label: 'puntos', title: 'Puntuación de PvPoke' }}
    />
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
          <PvpCard key={entry.id} entry={entry} {...list} />
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

export function LeagueButtons({ league, onChange }: { league: League; onChange: (league: League) => void }) {
  return (
    <div class="leagues" role="group" aria-label="Liga">
      {LEAGUES.map((id) => (
        <button key={id} type="button" aria-pressed={league === id} onClick={() => onChange(id)}>
          {LEAGUE_NAMES[id].name}
          <small>{LEAGUE_NAMES[id].limit}</small>
        </button>
      ))}
    </div>
  );
}

function LeaguesView({ sources, initial }: { sources: Sources; initial: League | null }) {
  const [selection, setSelection] = useState<Selection>(() => {
    if (initial) remembered = { ...remembered, league: initial };
    return remembered;
  });
  const { pvp, translations } = sources;
  const tr = translations.data;
  const change = (part: Partial<Selection>) => {
    remembered = { ...remembered, ...part };
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
      <Head>
        <LeagueButtons league={league} onChange={(id) => change({ league: id })} />
      </Head>
      <Pin
        search={search}
        groups={[
          tierGroup(TIERS, counts, tier, (id) => change({ tier: id })),
          {
            label: 'Variante',
            value: variant,
            onChange: (id) => change({ variant: id as Variant }),
            options: VARIANTS.map((id) => ({ value: id, name: VARIANT_NAMES[id] })),
          },
        ]}
      >
        <Search value={search} onChange={(value) => change({ search: value })} />
      </Pin>
      <div class="meta">
        <InfoLine label="Rankings de PvPoke" alerts={sourceAlerts([pvp])}>
          <p>
            Puesto, puntuación y movimientos de <External href="https://pvpoke.com">PvPoke</External>, sin recalcular.
          </p>
          <SourceStatus source={pvp} />
        </InfoLine>
        {counts && (
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
        )}
      </div>
      {!tr && pvp.data && (
        <p class="note">Las traducciones aún no están disponibles. Se muestran los nombres originales.</p>
      )}
      {!pvp.data || !counts ? (
        <Placeholder source={pvp} />
      ) : (
        <>
          <TierCells tiers={TIERS} counts={counts} value={tier} onChange={(id) => change({ tier: id })} />
          <details class="method">
            <summary>Cómo se forman los tiers</summary>
            <p>Son categorías propias de esta aplicación, no oficiales de PvPoke.</p>
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
                moves={pvp.data!.moves}
                tr={tr}
                sprites={sources.sprites.data}
                imagesPending={sources.sprites.health.level === 'loading'}
              />
            ))
          )}
          <MoveLegend>
            <span>★ Movimiento que PvPoke marca como especial, no siempre disponible</span>
          </MoveLegend>
        </>
      )}
    </>
  );
}

const MODES = [
  { id: 'normal', name: 'Normal', hash: 'pvp' },
  { id: 'mega', name: 'Mega', hash: 'pvp/mega' },
  { id: 'copas', name: 'Copas', hash: 'pvp/copas' },
] as const;

export function PvpView({ sources, section }: { sources: Sources; section: string | null }) {
  const target = section === null ? null : parseFormatSlug(section);
  if (target) return <CupView key={section} target={target} sources={sources} />;
  // «liga-1500» y «mega-2500» abren directamente esa liga, desde el calendario.
  const direct = /^(liga|mega)-(1500|2500|10000)$/.exec(section ?? '');
  const initial = direct ? (Number(direct[2]) as League) : null;
  const mode = section === 'copas' ? 'copas' : section === 'mega' || direct?.[1] === 'mega' ? 'mega' : 'normal';
  const modes = (
    <div class="segmented" role="group" aria-label="Formato">
      {MODES.map(({ id, name, hash }) => (
        <button key={id} type="button" aria-pressed={mode === id} onClick={() => (location.hash = hash)}>
          {name}
        </button>
      ))}
    </div>
  );
  return (
    <>
      {mode === 'copas' ? <Pin>{modes}</Pin> : <Head>{modes}</Head>}
            {mode === 'normal' && <LeaguesView sources={sources} initial={initial} />}
      {mode === 'mega' && <MegaView sources={sources} initial={initial} />}
      {mode === 'copas' && <CupsView sources={sources} />}
    </>
  );
}
