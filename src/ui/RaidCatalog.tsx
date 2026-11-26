import { counterSpecies } from '../domain/counters';
import { pvpLabel } from '../domain/names';
import { countersLink } from '../domain/raids';
import { spriteId } from '../domain/sprites';
import { Counters } from './BossView';
import { InfoLine, Placeholder, PokemonName, sourceAlerts, SourceStatus } from './common';
import { Back, Pin } from './frame';
import type { Sources } from './hooks';
import { PokemonImage } from './PokemonImage';
import { buildBoard, tierOf } from './RaidBoard';
import { BossHero, Egg, MiniTypes } from './RaidStyles';

const POKEBATTLER = 'https://www.pokebattler.com/raids';

interface Entry {
  id: string;
  tier: string;
  shadow: boolean;
}

/** Orden de los grupos: lo más buscado primero, como en Ahora. */
const ORDER = ['s6', 's5', 'mega', 'elite', 's4', 's3', 's2', 's1', 'other'];

/** Jefes con counters en Pokébattler que no están entre los disponibles ahora. Nunca se mezclan con los actuales. */
function catalogEntries(sources: Sources, now: number): Entry[] {
  const raids = sources.pokebattler.data?.raids ?? {};
  const board = buildBoard(sources, now);
  const current = new Set(
    (board?.now ?? []).map((e) => countersLink(e.boss, raids).target?.id).filter((id): id is string => Boolean(id)),
  );
  return Object.entries(raids)
    .filter((entry): entry is [string, string] => entry[1] !== null && !current.has(entry[0]))
    .map(([id, tier]) => ({ id, tier, shadow: /_SHADOW/.test(tier) || /_SHADOW_FORM$/.test(id) }));
}

const slugOf = (id: string) => `catalogo-${id.toLowerCase()}`;

export function CatalogView({ sources, now }: { sources: Sources; now: number }) {
  const { pokebattler } = sources;
  if (!pokebattler.data) return <Placeholder source={pokebattler} />;
  const groups = new Map<string, { title: string; tier: string; shadow: boolean; entries: Entry[] }>();
  for (const entry of catalogEntries(sources, now)) {
    const info = tierOf(entry.tier);
    const key = `${entry.shadow ? 'shadow-' : ''}${info.key}`;
    const group = groups.get(key) ?? {
      title: entry.shadow ? `Oscuras · ${info.long}` : info.long,
      tier: entry.tier,
      shadow: entry.shadow,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(key, group);
  }
  const rank = (key: string) => (key.startsWith('shadow-') ? 100 : 0) + ORDER.indexOf(key.replace('shadow-', ''));
  const sorted = [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
  const tr = sources.translations.data;
  return (
    <>
      <InfoLine label="Jefes de Pokébattler" alerts={sourceAlerts([pokebattler])}>
        <p>
          Jefes que Pokébattler mantiene con counters y que no están entre los disponibles ahora según LeekDuck: pueden
          ser anteriores o volver más adelante.
        </p>
        <SourceStatus source={pokebattler} />
      </InfoLine>
      <p class="hm-lead">No disponibles ahora</p>
      {sorted.length === 0 && <p class="empty">Pokébattler no lista otros jefes ahora mismo.</p>}
      {sorted.map(([key, group]) => (
        <section key={key} class={`hm-sec rb-group${group.shadow ? ' is-shadow' : ''}`}>
          <header class="hm-head">
            <h2 class="plain">
              <Egg tier={group.tier} shadow={group.shadow} />
              <span>{group.title}</span>
              <span class="count">{group.entries.length}</span>
            </h2>
          </header>
          <ul class="hm-box">
            {group.entries.map((entry) => {
              const species = counterSpecies(entry.id, sources.pvp.data?.species, tr);
              return (
                <li key={entry.id} class={`hm-cell t-${species.types[0] ?? ''}${entry.shadow ? ' is-shadow' : ''}`}>
                  <a href={`#incursiones/${slugOf(entry.id)}`}>
                    <span class="hm-slot">
                      <PokemonImage
                        id={spriteId(species, sources.sprites.data)}
                        dex={species.dex}
                        type={species.types[0]}
                        shadow={entry.shadow}
                        pending={sources.sprites.health.level === 'loading'}
                      />
                    </span>
                    <span class="hm-name">
                      <PokemonName label={pvpLabel(species, tr)} />
                    </span>
                    <MiniTypes types={species.types} />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

export function CatalogBossView({ slug, sources, now }: { slug: string; sources: Sources; now: number }) {
  const raids = sources.pokebattler.data?.raids;
  const id = Object.keys(raids ?? {}).find((key) => slugOf(key) === slug);
  const tier = id ? raids![id] : null;
  const tr = sources.translations.data;
  const species = id ? counterSpecies(id, sources.pvp.data?.species, tr) : null;
  const label = species ? pvpLabel(species, tr) : null;
  const back = <Back href="#incursiones/catalogo" label="Catálogo" title={label?.name ?? 'Jefe'} />;
  if (!id || !tier || !species || !label) {
    return (
      <>
        <Pin>{back}</Pin>
        {!raids ? (
          <Placeholder source={sources.pokebattler} />
        ) : (
          <div class="empty">
            <p>Pokébattler ya no lista a este jefe.</p>
            <a class="link" href="#incursiones/catalogo">
              Ver el catálogo
            </a>
          </div>
        )}
      </>
    );
  }
  const shadow = /_SHADOW/.test(tier) || /_SHADOW_FORM$/.test(id);
  const subject = (
    <BossHero
      label={label}
      types={species.types}
      tier={tier}
      shadow={shadow}
      shiny={false}
      figure={
        <PokemonImage
          id={spriteId(species, sources.sprites.data)}
          dex={species.dex}
          type={species.types[0]}
          shadow={shadow}
          pending={sources.sprites.health.level === 'loading'}
        />
      }
      status={<p class="validity warn">No disponible ahora</p>}
    />
  );
  return (
    <Counters target={{ id, tier }} url={`${POKEBATTLER}/${id}`} sources={sources} now={now} back={back} subject={subject} />
  );
}
