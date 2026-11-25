import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { RocketAttacker, RocketAttackersData, RocketPokemon, RocketTrainer, Species } from '../data/models';
import { formatAge, formatDate, hasKnownCheck } from '../domain/freshness';
import {
  GYM_GROUPS,
  gymMove,
  PRESENCES,
  type AttackerFilters,
  type GymGroup,
  type GymTier,
  type Presence,
} from '../domain/gyms';
import { bossLabel, moveName, pvpLabel, typeName } from '../domain/names';
import {
  agrees,
  bossesOf,
  compareLineups,
  countRocketTiers,
  countSuggestions,
  featuredSuggestions,
  countScores,
  filterRocketAttackers,
  filterSuggestions,
  gruntsOf,
  isBoss,
  phrasesOf,
  rivalSpecies,
  searchTrainers,
  sharingPhrase,
  SLOT_NAMES,
  suggestionsFor,
  trainerLabel,
  type Comparison,
  type RocketTierGroup,
  type SlotDifference,
  type Suggestion,
  type SuggestionGroup,
} from '../domain/rocket';
import { spriteId } from '../domain/sprites';
import { External, Move, MoveLegend, multiplier, Placeholder, PokemonName, SourceStatus, TypeTag, Weaknesses } from './common';
import { Attribution, GROUP_LABELS, PRESENCE_NAMES, Search, tierClass, TypeSelect } from './GymsView';
import { useNow, type Sources } from './hooks';
import { PokemonImage } from './PokemonImage';

const PAGE = 30;
/** Sugerencias visibles de cada tipo antes de pedir más. */
const SUGGESTED = 4;

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
let rememberedGroups: Record<GymGroup, Presence> = { mega: 'with', shadow: 'with', legendary: 'with' };
let rememberedSearch = '';
const rememberedRival = new Map<string, string>();
/** Último entrenador abierto, para volver al mismo punto de la lista. */
let opened: string | null = null;

const list = (items: string[]): string => new Intl.ListFormat('es', { type: 'conjunction' }).format(items);

const href = (trainer: RocketTrainer): string => `#rocket/${trainer.key}`;

const fullName = (trainer: RocketTrainer, sources: Sources): string => {
  const { name, detail } = trainerLabel(trainer, sources.translations.data);
  return isBoss(trainer) || !detail ? name : `${name} (${detail.toLowerCase()})`;
};

const speciesOf = (rival: RocketPokemon, sources: Sources): Species =>
  rivalSpecies(rival, sources.pvp.data?.species, sources.translations.data);

/* Contraste entre fuentes */

function useComparison(sources: Sources): Comparison | null {
  const main = sources.rocket.data;
  const contrast = sources.rocketContrast.data;
  return useMemo(() => (main && contrast ? compareLineups(main, contrast) : null), [main, contrast]);
}

function Agreement({ comparison, sources, now }: { comparison: Comparison | null; sources: Sources; now: number }) {
  const { rocket, rocketContrast } = sources;
  const date = rocket.snapshot?.sourceUpdatedAt;
  const old = rocketContrast.health.level !== 'ok' && hasKnownCheck(rocketContrast.checkedAt);
  return (
    <p class="note">
      {date ? (
        <>
          Alineaciones sin cambios desde el <strong>{formatDate(date)}</strong>
        </>
      ) : (
        'No se conoce la fecha del último cambio'
      )}
      , según <External href="https://github.com/WatWowMap/event-info">WatWowMap</External>.{' '}
      {!comparison ? (
        'Todavía no se han podido contrastar con LeekDuck.'
      ) : agrees(comparison) ? (
        <>
          Coinciden con las de <External href="https://leekduck.com/rocket-lineups/">LeekDuck</External> en los{' '}
          {comparison.matching} entrenadores
          {old && `, con sus datos de hace ${formatAge(now - rocketContrast.checkedAt)}`}.
        </>
      ) : null}
    </p>
  );
}

function Mismatches({ comparison, sources, now }: { comparison: Comparison | null; sources: Sources; now: number }) {
  const main = sources.rocket.data;
  if (!comparison || agrees(comparison) || !main) return null;
  const { checkedAt } = sources.rocketContrast;
  const different = main.filter((t) => comparison.differences.has(t.key));
  const links = (trainers: RocketTrainer[]) =>
    trainers.map((trainer, i) => (
      <span key={trainer.key}>
        {i > 0 && ', '}
        <a class="link" href={href(trainer)}>
          {fullName(trainer, sources)}
        </a>
      </span>
    ));
  return (
    <section class="status status-warning rocket-warning" aria-label="Diferencias entre fuentes">
      <p>
        <strong>WatWowMap y LeekDuck no coinciden.</strong> Puede haber un cambio en curso. Se muestra WatWowMap.
        {hasKnownCheck(checkedAt) && ` LeekDuck, consultado hace ${formatAge(now - checkedAt)}.`}
      </p>
      <ul>
        {different.length > 0 && <li>Pokémon distintos: {links(different)}.</li>}
        {comparison.onlyMain.length > 0 && <li>LeekDuck no lista a: {links(comparison.onlyMain)}.</li>}
        {comparison.onlyContrast.length > 0 && (
          <li>
            Solo los lista LeekDuck: <span lang="en">{comparison.onlyContrast.join(', ')}</span>.
          </li>
        )}
      </ul>
    </section>
  );
}

function TrainerMismatch({ differences, sources }: { differences: SlotDifference[]; sources: Sources }) {
  const tr = sources.translations.data;
  const label = ({ name, form }: { name: string; form: string | null }) => (form ? `${name} (${form})` : name);
  return (
    <section class="status status-warning rocket-warning" aria-label="Diferencias entre fuentes">
      <p>
        <strong>Las fuentes no coinciden.</strong> Se muestra la alineación de WatWowMap.
      </p>
      <ul>
        {differences.map(({ slot, main, contrast }) => {
          const here = main.map((p) => label(pvpLabel(rivalSpecies(p, sources.pvp.data?.species, tr), tr)));
          const there = contrast.map((p) => label(bossLabel(p, tr)));
          return (
            <li key={slot}>
              {SLOT_NAMES[slot]}: {here.length > 0 && `solo WatWowMap indica ${list(here)}`}
              {here.length > 0 && there.length > 0 && '; '}
              {there.length > 0 && `solo LeekDuck indica ${list(there)}`}.
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* Listas de entrenadores */

function Rival({ rival, sources }: { rival: RocketPokemon; sources: Sources }) {
  const species = speciesOf(rival, sources);
  return (
    <>
      <PokemonImage
        id={spriteId(species, sources.sprites.data)}
        dex={species.dex}
        type={species.types[0]}
        shadow
        pending={sources.sprites.health.level === 'loading'}
      />
      <PokemonName label={pvpLabel(species, sources.translations.data)} />
    </>
  );
}

function TrainerTitle({ trainer, sources }: { trainer: RocketTrainer; sources: Sources }) {
  const label = trainerLabel(trainer, sources.translations.data);
  return (
    <div class="rank-meta">
      {/* El tipo ya va en su etiqueta. */}
      <span class="pokemon-name">
        {trainer.type ? (
          <span>
            Recluta<span class="sr-only"> de tipo</span>
          </span>
        ) : (
          label.name
        )}
      </span>
      {trainer.type && <TypeTag type={trainer.type} />}
      {label.detail && <span class="chip chip-plain">{label.detail}</span>}
    </div>
  );
}

const slotNames = (trainer: RocketTrainer, slot: number, sources: Sources): string =>
  trainer.slots[slot]!.options
    .map((p) => {
      const tr = sources.translations.data;
      return pvpLabel(rivalSpecies(p, sources.pvp.data?.species, tr), tr).name;
    })
    .join(', ');

interface TrainerCardProps {
  trainer: RocketTrainer;
  comparison: Comparison | null;
  sources: Sources;
}

function TrainerCard({ trainer, comparison, sources }: TrainerCardProps) {
  const [phrase] = phrasesOf(trainer, sources.translations.data);
  return (
    <li id={`rocket-${trainer.key}`} class={`card boss trainer t-${trainer.type ?? ''}`}>
      <div class="boss-body">
        <TrainerTitle trainer={trainer} sources={sources} />
        {phrase && <p class="phrase">«{phrase}»</p>}
        {comparison?.differences.has(trainer.key) && <p class="validity warn">Las fuentes no coinciden</p>}
        {isBoss(trainer) ? (
          <div class="lineup">
            {trainer.slots.map(({ options }, i) => (
              <div key={i}>
                <span class="slot-name">{SLOT_NAMES[i]}</span>
                <ul class="lineup-options">
                  {options.map((rival) => (
                    <li key={`${rival.dex}${rival.form}`} class="rival rival-small">
                      <Rival rival={rival} sources={sources} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <dl class="slots">
            {trainer.slots.map((_, i) => (
              <div key={i}>
                <dt>{SLOT_NAMES[i]}</dt>
                <dd>{slotNames(trainer, i, sources)}</dd>
              </div>
            ))}
          </dl>
        )}
        <a class="link boss-open" href={href(trainer)} aria-label={`Ver debilidades: ${fullName(trainer, sources)}`}>
          Ver debilidades
        </a>
      </div>
    </li>
  );
}

function GeneralLink() {
  return (
    <section class="card boss">
      <div class="boss-body">
        <h2>Mejores atacantes generales</h2>
        <p class="fine">
          Los tiers y puntuaciones de doctorpokegogo para el Team GO Rocket. No dependen de a quién te enfrentes.
        </p>
        <a class="link boss-open" href="#rocket/atacantes">
          Ver atacantes generales
        </a>
      </div>
    </section>
  );
}

function TrainerList({ sources, grunts, now }: { sources: Sources; grunts: boolean; now: number }) {
  const { rocket } = sources;
  const tr = sources.translations.data;
  const species = sources.pvp.data?.species;
  const [search, setSearch] = useState(rememberedSearch);
  const comparison = useComparison(sources);
  useLayoutEffect(() => {
    if (opened) document.getElementById(`rocket-${opened}`)?.scrollIntoView({ block: 'center' });
    opened = null;
  }, []);
  const trainers = useMemo(() => {
    if (!rocket.data) return [];
    return grunts ? searchTrainers(gruntsOf(rocket.data, tr), search, tr, species) : bossesOf(rocket.data);
  }, [rocket.data, grunts, search, tr, species]);
  const hasPhrases = rocket.data?.some((t) => phrasesOf(t, tr).length > 0) ?? false;
  const change = (value: string) => {
    rememberedSearch = value;
    setSearch(value);
  };
  return (
    <>
      <div class="segmented segmented-2" role="group" aria-label="Entrenadores">
        <button type="button" aria-pressed={!grunts} onClick={() => (location.hash = 'rocket')}>
          Líderes y Giovanni
        </button>
        <button type="button" aria-pressed={grunts} onClick={() => (location.hash = 'rocket/reclutas')}>
          Reclutas
        </button>
      </div>
      <SourceStatus source={rocket} />
      {!rocket.data ? (
        <Placeholder source={rocket} />
      ) : (
        <>
          <Mismatches comparison={comparison} sources={sources} now={now} />
          <Agreement comparison={comparison} sources={sources} now={now} />
          {!tr && <p class="note">Las traducciones aún no están disponibles. Se muestran los nombres originales.</p>}
          {grunts && (
            <div class="filters">
              <div class="filter-row filter-search">
                <Search value={search} onChange={change} label="Frase, tipo o Pokémon" />
              </div>
              <p class="result-count" role="status">
                {trainers.length} {trainers.length === 1 ? 'recluta' : 'reclutas'}
                {search.trim() !== '' && (
                  <button class="text-button" type="button" onClick={() => change('')}>
                    Quitar búsqueda
                  </button>
                )}
              </p>
            </div>
          )}
          {grunts && hasPhrases && (
            <p class="note">
              Frases del juego en español, a través de{' '}
              <External href="https://github.com/WatWowMap/pogo-translations">WatWowMap</External>.
            </p>
          )}
          {tr && !hasPhrases && <p class="note">Las frases en español no están disponibles ahora mismo.</p>}
          {trainers.length === 0 ? (
            <p class="empty">
              {grunts ? 'Ningún recluta coincide con la búsqueda.' : 'Ahora mismo no hay líderes en activo en la fuente.'}
            </p>
          ) : (
            <ul class="grid">
              {trainers.map((trainer) => (
                <TrainerCard key={trainer.key} trainer={trainer} comparison={comparison} sources={sources} />
              ))}
            </ul>
          )}
          <GeneralLink />
        </>
      )}
    </>
  );
}

/* Atacantes */

interface AttackerCardProps {
  attacker: RocketAttacker;
  sources: Sources;
  /** Sus ventajas contra el rival abierto. Sin ellas, la ficha es la general. */
  suggestion?: Suggestion;
  tied?: number;
}

function AttackerCard({ attacker, sources, suggestion, tied = 1 }: AttackerCardProps) {
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
          {!suggestion && (
            <span class={tierClass(attacker.tier)}>
              <span class="sr-only">Tier general </span>
              {attacker.tier}
            </span>
          )}
          {attacker.types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
        </div>
        <ul class="moves">
          <Move fast name={moveName(gymMove(attacker.fast, attacker.fastType), tr)} />
          <Move fast={false} name={moveName(gymMove(attacker.charged, attacker.chargedType), tr)} />
        </ul>
        {suggestion ? (
          <dl class="metrics">
            <div>
              <dt>Tipo cargado</dt>
              <dd>{multiplier(suggestion.charged)}</dd>
            </div>
            <div>
              <dt>Tipo rápido</dt>
              <dd>{multiplier(suggestion.fast)}</dd>
            </div>
            <div>
              <dt>Punt. general</dt>
              <dd>
                {attacker.tier} · {attacker.score}
              </dd>
            </div>
          </dl>
        ) : (
          <dl class="metrics">
            <div>
              <dt>Puntuación general</dt>
              <dd>
                {attacker.score}
                {tied > 1 && <small class="tied">Empatan {tied}</small>}
              </dd>
            </div>
            <div>
              <dt>Ataca con</dt>
              <dd>{typeName(attacker.chargedType)}</dd>
            </div>
          </dl>
        )}
      </div>
    </li>
  );
}

interface GroupSelectsProps {
  value: Record<GymGroup, Presence>;
  onChange: (part: Partial<Record<GymGroup, Presence>>) => void;
}

function GroupSelects({ value, onChange }: GroupSelectsProps) {
  return (
    <>
      {GYM_GROUPS.map((group) => (
        <select
          key={group}
          aria-label={GROUP_LABELS[group]}
          value={value[group]}
          onChange={(e) => onChange({ [group]: e.currentTarget.value as Presence })}
        >
          {PRESENCES.map((id) => (
            <option key={id} value={id}>
              {PRESENCE_NAMES[group][id]}
            </option>
          ))}
        </select>
      ))}
    </>
  );
}

/** Con «brief», solo se muestran las que ya vienen elegidas. */
function SuggestedType({ group, sources, brief }: { group: SuggestionGroup; sources: Sources; brief: boolean }) {
  const [shown, setShown] = useState(SUGGESTED);
  const rest = group.entries.length - shown;
  return (
    <section class="group suggested-type" aria-label={`Ataques de tipo ${typeName(group.type)}`}>
      <h3>
        Ataque <TypeTag type={group.type} /> {multiplier(group.multiplier)}
      </h3>
      <ul class="ranking">
        {group.entries.slice(0, shown).map((suggestion) => (
          <AttackerCard
            key={suggestion.attacker.name}
            attacker={suggestion.attacker}
            suggestion={suggestion}
            sources={sources}
          />
        ))}
      </ul>
      {!brief && rest > 0 && (
        <button class="button more" type="button" onClick={() => setShown(shown + PAGE)}>
          Más de {typeName(group.type)} ({rest})
        </button>
      )}
    </section>
  );
}

const GeneralFallback = ({ children }: { children: string }) => (
  <div class="empty">
    <p>{children}</p>
    <a class="link" href="#rocket/atacantes">
      Ver los mejores atacantes generales
    </a>
  </div>
);

function Suggestions({ rival, sources }: { rival: Species; sources: Sources }) {
  const { rocketAttackers } = sources;
  const tr = sources.translations.data;
  const [filters, setFilters] = useState(rememberedGroups);
  const [expanded, setExpanded] = useState(false);
  const data = rocketAttackers.data;
  const all = useMemo(() => (data ? suggestionsFor(rival.types, data.pokemon, tr) : []), [data, rival, tr]);
  const groups = filterSuggestions(all, filters);
  const visible = expanded ? groups : featuredSuggestions(groups);
  const hidden = countSuggestions(groups) - countSuggestions(visible);
  const filtered = GYM_GROUPS.some((group) => filters[group] !== 'with');
  const name = pvpLabel(rival, tr).name;
  if (!data) {
    return rocketAttackers.health.level === 'loading' ? (
      <Placeholder source={rocketAttackers} />
    ) : (
      <>
        <SourceStatus source={rocketAttackers} />
        <p class="empty">Sin los datos de atacantes solo se pueden mostrar las debilidades.</p>
      </>
    );
  }
  if (all.length === 0) {
    return (
      <GeneralFallback>
        {rival.types.length === 0
          ? `No se conocen con seguridad los tipos de ${name}, así que no se sugiere ningún Pokémon.`
          : `No hay suficientes opciones fiables con ventaja de tipo contra ${name}, así que no se sugiere ninguna.`}
      </GeneralFallback>
    );
  }
  return (
    <section class="group" aria-label="Opciones con ventaja de tipo">
      <h2>
        Opciones con ventaja de tipo <span class="chip chip-own">Sugerencia de GO MetaHub</span>
      </h2>
      <div class="card explain">
        <p>
          <strong>No son counters exactos ni una simulación.</strong> GO MetaHub elige Pokémon con ventaja de tipo contra{' '}
          {name} que no sean débiles a sus tipos. <strong>No se consideran</strong> los escudos, la resistencia, los ataques del
          rival ni el equipo completo.
        </p>
      </div>
      {rocketAttackers.health.level !== 'ok' && <SourceStatus source={rocketAttackers} />}
      <Attribution data={data} />
      <details class="method" open={filtered}>
        <summary>Filtrar megas, oscuros y legendarios</summary>
        <div class="filter-row filter-groups filter-three">
          <GroupSelects
            value={filters}
            onChange={(part) => {
              rememberedGroups = { ...filters, ...part };
              setFilters(rememberedGroups);
            }}
          />
        </div>
      </details>
      {groups.length === 0 && <p class="empty">Ninguna opción coincide con los filtros.</p>}
      {visible.map((group) => (
        <SuggestedType
          key={`${group.type}${expanded}${JSON.stringify(filters)}`}
          group={group}
          brief={!expanded}
          sources={sources}
        />
      ))}
      {!expanded && hidden > 0 && (
        <button class="button more" type="button" onClick={() => setExpanded(true)}>
          Ver más opciones ({hidden})
        </button>
      )}
      <MoveLegend />
      <details class="method">
        <summary>Qué viene de la fuente y qué no</summary>
        <ul>
          <li>
            <strong>De doctorpokegogo, sin cambios:</strong> los movimientos, el tier y la puntuación general. Esa puntuación
            valora al Pokémon contra el Team GO Rocket en conjunto: <strong>no mide su rendimiento contra {name}</strong>.
          </li>
          <li>
            <strong>De GO MetaHub:</strong> la selección. Solo entran Pokémon con tier general S+, S o A, ataque cargado eficaz,
            rápido no resistido y <strong>sin debilidad a los tipos de {name}</strong>. Los multiplicadores salen de la tabla de
            tipos del juego.
          </li>
          <li>
            <strong>Orden:</strong> por tipo, según la debilidad de {name} y, a igualdad, por la mejor puntuación general;
            dentro de cada tipo, por esa puntuación. No hay puestos, porque nadie ha medido estos combates. Al principio solo se
            ven unas pocas especies distintas.
          </li>
          <li>
            <strong>Ataques de {name}:</strong> no se conocen. Puede llevar uno de otro tipo al que tu Pokémon sí sea débil.
          </li>
          <li>
            <strong>Movimientos:</strong> hay una sola combinación por Pokémon y alguna puede requerir una MT élite. Puede haber
            buenas opciones con otros movimientos que aquí no aparecen.
          </li>
        </ul>
      </details>
      <GeneralLink />
    </section>
  );
}

/* Entrenador */

const rivalKey = (rival: RocketPokemon): string => `${rival.dex}:${rival.form ?? ''}`;

function RivalPanel({ rival, sources }: { rival: RocketPokemon; sources: Sources }) {
  const species = speciesOf(rival, sources);
  const label = pvpLabel(species, sources.translations.data);
  return (
    <>
      <article class={`card boss t-${species.types[0] ?? ''}`}>
        <PokemonImage
          id={spriteId(species, sources.sprites.data)}
          dex={species.dex}
          type={species.types[0]}
          shadow
          pending={sources.sprites.health.level === 'loading'}
        />
        <div class="boss-body">
          <h2 class="plain">
            <span class="sr-only">Debilidades de </span>
            <PokemonName label={label} />
          </h2>
          <div class="types">
            {species.types.map((type) => (
              <TypeTag key={type} type={type} />
            ))}
          </div>
          <Weaknesses types={species.types} />
          {species.types.length === 0 && (
            <p class="validity warn">
              {sources.pvp.data ? 'No se conocen con seguridad sus tipos.' : 'Sus tipos aún no se han podido cargar.'}
            </p>
          )}
        </div>
      </article>
      <Suggestions key={rivalKey(rival)} rival={species} sources={sources} />
    </>
  );
}

/** Hasta estas se muestran siempre: son las que identifican a un recluta. Líderes y señuelos tienen más. */
const VISIBLE_PHRASES = 3;

function Phrases({ phrases }: { phrases: string[] }) {
  if (phrases.length === 0) return null;
  const items = (list: string[]) => (
    <ul class="phrases">
      {list.map((phrase) => (
        <li key={phrase} class="phrase">
          «{phrase}»
        </li>
      ))}
    </ul>
  );
  if (phrases.length <= VISIBLE_PHRASES) return items(phrases);
  return (
    <>
      {items(phrases.slice(0, 1))}
      <details class="method">
        <summary>Otras {phrases.length - 1} frases</summary>
        {items(phrases.slice(1))}
      </details>
    </>
  );
}

function TrainerDetail({ trainer, sources, now }: { trainer: RocketTrainer; sources: Sources; now: number }) {
  const tr = sources.translations.data;
  const all = trainer.slots.flatMap((slot) => slot.options);
  const [selected, setSelected] = useState(rememberedRival.get(trainer.key) ?? rivalKey(all[0]!));
  const panel = useRef<HTMLDivElement>(null);
  const comparison = useComparison(sources);
  const differences = comparison?.differences.get(trainer.key);
  const missing = comparison?.onlyMain.includes(trainer);
  const phrases = phrasesOf(trainer, tr);
  const sharing = sharingPhrase(trainer, sources.rocket.data ?? [], tr);
  const rival = all.find((p) => rivalKey(p) === selected) ?? all[0]!;
  const select = (next: RocketPokemon) => {
    rememberedRival.set(trainer.key, rivalKey(next));
    setSelected(rivalKey(next));
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => panel.current?.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' }));
  };
  return (
    <>
      <a class="link back" href={isBoss(trainer) ? '#rocket' : '#rocket/reclutas'}>
        {isBoss(trainer) ? 'Líderes y Giovanni' : 'Todos los reclutas'}
      </a>
      <article class={`card trainer t-${trainer.type ?? ''}`}>
        <TrainerTitle trainer={trainer} sources={sources} />
        <Phrases phrases={phrases} />
        {phrases.length > 0 && (
          <p class="fine">
            Frases del juego, a través de <External href="https://github.com/WatWowMap/pogo-translations">WatWowMap</External>.
          </p>
        )}
        {sharing.length > 0 && (
          <p class="fine">
            Comparte frase con{' '}
            {sharing.map((other, i) => (
              <span key={other.key}>
                {i > 0 && ', '}
                <a class="link" href={href(other)}>
                  {fullName(other, sources)}
                </a>
              </span>
            ))}
            . Fíjate en si es hombre o mujer.
          </p>
        )}
      </article>
      {sources.rocket.health.level !== 'ok' && <SourceStatus source={sources.rocket} />}
      {differences && <TrainerMismatch differences={differences} sources={sources} />}
      {missing && (
        <p class="validity warn">LeekDuck no lista ahora mismo a este entrenador: puede no estar activo.</p>
      )}
      <section class="card rocket-slots" aria-label="Alineaciones posibles">
        {trainer.slots.map(({ options, reward }, i) => (
          <div key={i} role="group" aria-label={`${SLOT_NAMES[i]} en combatir`}>
            <p class="slot-name">
              {SLOT_NAMES[i]}
              {options.length > 1 && ` · uno de ${options.length}`}
              {reward && ' · se puede capturar'}
            </p>
            <div class="rivals">
              {options.map((option) => (
                <button
                  key={rivalKey(option)}
                  type="button"
                  class="rival"
                  aria-pressed={rivalKey(option) === rivalKey(rival)}
                  onClick={() => select(option)}
                >
                  <Rival rival={option} sources={sources} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <p class="fine">
          Todos son oscuros. Toca uno para ver sus debilidades. Las fuentes no dan la probabilidad de cada alternativa ni sus
          ataques.
        </p>
      </section>
      <div ref={panel} class="rival-panel" role="region" aria-label="Pokémon elegido">
        <RivalPanel rival={rival} sources={sources} />
      </div>
      <Agreement comparison={comparison} sources={sources} now={now} />
    </>
  );
}

/* Clasificación general */

interface TierSectionProps {
  group: RocketTierGroup;
  ties: Map<number, number>;
  sources: Sources;
}

function TierSection({ group, ties, sources }: TierSectionProps) {
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
        {group.entries.slice(0, shown).map((attacker) => (
          <AttackerCard key={attacker.name} attacker={attacker} tied={ties.get(attacker.score) ?? 1} sources={sources} />
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

function GeneralMethod({ data }: { data: RocketAttackersData }) {
  return (
    <details class="method">
      <summary>Cómo leer estos datos</summary>
      <ul>
        <li>
          <strong>Tier y puntuación:</strong> los que publica doctorpokegogo, sin cambios. Los define como rapidez para ganar a
          las alineaciones del Team GO Rocket. Más es mejor.
        </li>
        <li>
          <strong>Movimientos:</strong> una sola combinación por Pokémon, la que recomienda la fuente. Puede requerir una MT élite.
        </li>
        <li>
          <strong>Filtro por tipo:</strong> usa el tipo de ese ataque cargado. No es una lista completa de atacantes del tipo.
        </li>
        <li>
          <strong>Orden:</strong> por tier y puntuación; con la misma puntuación, por nombre. Hay muchos empates, así que no se
          numeran.
        </li>
        <li>
          <strong>Legendarios:</strong> el filtro incluye también singulares y ultraentes.
        </li>
      </ul>
      <p>
        <External href={data.source.methodologyUrl}>Metodología de doctorpokegogo</External> (en inglés). Versión de los datos:{' '}
        {data.source.version}. {data.changes} No se incluyen las formas Gigamax, que fuera de los combates Max son el mismo Pokémon.
      </p>
    </details>
  );
}

function GeneralAttackers({ sources }: { sources: Sources }) {
  const { rocketAttackers } = sources;
  const [filters, setFilters] = useState(rememberedAttackers);
  const tr = sources.translations.data;
  const data = rocketAttackers.data;
  const change = (part: Partial<AttackerFilters>) => {
    rememberedAttackers = { ...filters, ...part };
    setFilters(rememberedAttackers);
  };
  const all = useMemo(() => data?.pokemon ?? [], [data]);
  const counts = useMemo(() => [...countRocketTiers(all)], [all]);
  const ties = useMemo(() => countScores(all), [all]);
  const groups = useMemo(() => filterRocketAttackers(all, filters, tr), [all, filters, tr]);
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const key = JSON.stringify(filters);
  return (
    <>
      <a class="link back" href="#rocket">
        Team GO Rocket
      </a>
      <SourceStatus source={rocketAttackers} />
      {!data ? (
        <Placeholder source={rocketAttackers} />
      ) : (
        <>
          <section class="group" aria-label="Mejores atacantes generales">
            <h2>
              Mejores atacantes generales <span class="chip chip-source">Datos de doctorpokegogo</span>
            </h2>
            <div class="card explain">
              <p>
                <strong>Es una evaluación general, no contra un rival concreto.</strong> Contra cada Pokémon importan sus
                debilidades: elige un entrenador para verlas.
              </p>
            </div>
            <Attribution data={data} />
          </section>
          <div class="filters">
            <div class="tier-filter rocket-tiers" role="group" aria-label="Tier">
              <button type="button" aria-pressed={filters.tier === 'all'} onClick={() => change({ tier: 'all' })}>
                Todos
              </button>
              {counts.map(([tier, count]: [GymTier, number]) => (
                <button key={tier} type="button" aria-pressed={filters.tier === tier} onClick={() => change({ tier })}>
                  <span class={tierClass(tier)}>
                    <span class="sr-only">Tier </span>
                    {tier}
                  </span>
                  <small>{count}</small>
                </button>
              ))}
            </div>
            <div class="filter-row filter-search">
              <Search value={filters.search} onChange={(search) => change({ search })} />
            </div>
            <div class="filter-row filter-groups">
              <TypeSelect
                label="Tipo del ataque cargado"
                all="Todo ataque"
                prefix="Ataque "
                value={filters.type}
                onChange={(type) => change({ type })}
              />
              <GroupSelects value={filters} onChange={change} />
            </div>
            <p class="result-count" role="status">
              {total} Pokémon
              {key !== JSON.stringify(NO_FILTERS) && (
                <button class="text-button" type="button" onClick={() => change(NO_FILTERS)}>
                  Quitar filtros
                </button>
              )}
            </p>
          </div>
          <GeneralMethod data={data} />
          {groups.length === 0 ? (
            <p class="empty">Ningún Pokémon coincide con los filtros.</p>
          ) : (
            groups.map((group) => <TierSection key={`${group.tier}-${key}`} group={group} ties={ties} sources={sources} />)
          )}
          <MoveLegend />
        </>
      )}
    </>
  );
}

export function RocketView({ sources, section }: { sources: Sources; section: string | null }) {
  const now = useNow(30_000);
  const { rocket } = sources;
  if (section === null || section === 'reclutas') {
    return <TrainerList sources={sources} grunts={section === 'reclutas'} now={now} />;
  }
  if (section === 'atacantes') return <GeneralAttackers sources={sources} />;
  opened = section;
  const trainer = rocket.data?.find((candidate) => candidate.key === section);
  if (trainer) return <TrainerDetail key={section} trainer={trainer} sources={sources} now={now} />;
  if (!rocket.data) return <Placeholder source={rocket} />;
  return (
    <div class="empty">
      <p>Este entrenador ya no figura en las alineaciones actuales.</p>
      <a class="link" href="#rocket">
        Ver los entrenadores actuales
      </a>
    </div>
  );
}
