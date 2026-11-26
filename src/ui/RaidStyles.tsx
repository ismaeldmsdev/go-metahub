/**
 * Incursiones con el lenguaje visual de la aplicación (Pokémon HOME, con la plataforma y los retratos de Pokémon GO):
 * cajas por nivel, ficha estilo Pokédex y lo técnico tras un único ⓘ. La lógica de disponibilidad vive en
 * domain/availability; aquí solo se presenta.
 */
import type { ComponentChildren } from 'preact';
import type { RaidBoss } from '../data/models';
import type { BossStatus, RaidBoard, Upcoming } from '../domain/availability';
import { formatDay, formatShort } from '../domain/freshness';
import { bossLabel, eventTypeName, typeName, type PokemonLabel } from '../domain/names';
import { bossSlug, groupRaids } from '../domain/raids';
import { weaknesses } from '../domain/types';
import { External, InfoLine, multiplier, Picture, PokemonName, sourceAlerts, SourceStatus } from './common';
import type { Sources } from './hooks';
import {
  commonEnd,
  dayTitle,
  days,
  doubtful,
  ExplanationBody,
  isStale,
  rosterNames,
  SOON,
  tierHint,
  tierOf,
  TileStatus,
  when,
} from './RaidBoard';

/** Huevo de incursión dibujado con CSS, del color de su nivel. */
export function Egg({ tier, shadow = false }: { tier: string; shadow?: boolean }) {
  return <span class={`egg egg-${tierOf(tier).key}${shadow ? ' egg-shadow' : ''}`} aria-hidden="true" />;
}

/* ---------- ⓘ: lo técnico en una línea ---------- */

function RaidInfo({ sources, now }: { sources: Sources; now: number }) {
  const { raids, raidSchedule, events } = sources;
  const alerts = [
    ...(raids.data && isStale(sources, now) ? ['Lista antigua: puede haber cambiado'] : []),
    ...sourceAlerts([raids, raidSchedule, events]),
  ];
  return (
    <InfoLine label="Datos de LeekDuck" alerts={alerts}>
      <SourceStatus source={raids} />
      <SourceStatus source={raidSchedule} />
      <ExplanationBody sources={sources} now={now} />
      <p class="fine">
        Más detalles en <a href="#fuentes">Fuentes</a>.
      </p>
    </InfoLine>
  );
}

/* ---------- Ahora ---------- */

function Summary({ board }: { board: RaidBoard }) {
  const announced = board.upcoming.filter((item) => item.kind === 'announced').length;
  if (board.nextChange === null && announced === 0) return null;
  return (
    <div class="hm-summary">
      {board.nextChange !== null && (
        <p class="hm-timer">
          <span>Próximo cambio</span> {formatShort(board.nextChange)}
        </p>
      )}
      {announced > 0 && (
        <a class="hm-doubt-link" href="#incursiones/proximamente">
          {announced === 1 ? '1 anuncio sin confirmar' : `${announced} anuncios sin confirmar`}
        </a>
      )}
    </div>
  );
}

/** Tipos y hasta tres debilidades, en etiquetas pequeñas de color: lo necesario para elegir equipo de un vistazo. */
export function MiniTypes({ types }: { types: string[] }) {
  const weak = weaknesses(types);
  return (
    <span class="hm-mini">
      <span class="hm-mini-row">
        {types.map((type) => (
          <span key={type} class={`hm-chip t-${type}`}>
            {typeName(type)}
          </span>
        ))}
      </span>
      {weak.length > 0 && (
        <span class="hm-mini-row hm-mini-weak">
          <span class="hm-mini-label">Débil a</span>
          {weak.slice(0, 3).map(({ type, multiplier: m }) => (
            <span
              key={type}
              class={`hm-chip hm-chip-weak t-${type}${m > 2 ? ' is-double' : ''}`}
              title={m > 2 ? 'Doble debilidad' : undefined}
            >
              {typeName(type)}
              {m > 2 && <span class="sr-only"> (doble)</span>}
            </span>
          ))}
          {weak.length > 3 && <span class="hm-mini-more">+{weak.length - 3}</span>}
        </span>
      )}
    </span>
  );
}

function BossCell({ boss, status, sources, showUntil }: { boss: RaidBoss; status: BossStatus; sources: Sources; showUntil: boolean }) {
  const slug = bossSlug(boss);
  const classes = ['hm-cell', 'rb-boss', `t-${boss.types[0] ?? ''}`, boss.shadow ? 'is-shadow' : '', doubtful(status) ? 'is-doubt' : ''];
  return (
    <li id={`jefe-${slug}`} class={classes.filter(Boolean).join(' ')}>
      <a href={`#incursiones/${slug}`}>
        <span class="hm-slot">
          <Picture src={boss.image} className="hm-img" />
        </span>
        <span class="hm-name">
          <PokemonName label={bossLabel(boss, sources.translations.data)} />
        </span>
        <MiniTypes types={boss.types} />
        <TileStatus status={status} showUntil={showUntil} />
      </a>
    </li>
  );
}

export function NowView({ sources, now, board }: { sources: Sources; now: number; board: RaidBoard }) {
  const statusOfBoss = new Map<RaidBoss, BossStatus>(board.now.map((e) => [e.boss, e.availability]));
  const groups = groupRaids(board.now.map((e) => e.boss));
  return (
    <>
      <RaidInfo sources={sources} now={now} />
      <Summary board={board} />
      {board.now.length === 0 && board.alsoNow.length === 0 && <p class="empty">Ningún jefe se puede confirmar ahora mismo.</p>}
      {groups.map((group) => {
        const statuses = group.bosses.map((boss) => statusOfBoss.get(boss)!);
        const end = commonEnd(statuses);
        const tier = group.bosses[0]!.tier;
        return (
          <section key={group.key} id={`grupo-${group.key}`} class={`hm-sec rb-group${group.shadow ? ' is-shadow' : ''}`}>
            <header class="hm-head">
              <h2 class="plain">
                <Egg tier={tier} shadow={group.shadow} />
                <span>{group.title}</span>
                <span class="count">{group.bosses.length}</span>
              </h2>
              {end !== null && <p class="hm-until">Hasta el {formatShort(end)}</p>}
            </header>
            <ul class="hm-box">
              {group.bosses.map((boss, i) => (
                <BossCell key={boss.name} boss={boss} status={statuses[i]!} sources={sources} showUntil={end === null} />
              ))}
            </ul>
          </section>
        );
      })}
      {board.alsoNow.length > 0 && (
        <section class="hm-sec rb-group">
          <header class="hm-head">
            <h2 class="plain">También ahora, según el calendario</h2>
          </header>
          <ul class="hm-box">
            {board.alsoNow.map(({ boss, period, until }) => (
              <li key={`${period.slug}-${boss.name}`} class="hm-cell">
                <div>
                  <span class="hm-slot">
                    <Picture src={boss.image} className="hm-img" />
                  </span>
                  <span class="hm-name">{rosterNames([{ name: boss.name, image: boss.image }], false, sources)}</span>
                  <p class="rb-when">Hasta el {formatShort(until)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {board.gone.length > 0 && (
        <details class="hm-sec rb-group gone">
          <summary>
            Puede que ya no estén <span class="count">{board.gone.length}</span>
          </summary>
          <ul class="hm-box">
            {board.gone.map(({ boss, since, reason }) => (
              <BossCell key={boss.name} boss={boss} status={{ kind: 'gone', since, reason }} sources={sources} showUntil />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/* ---------- Próximamente ---------- */

function UpcomingItem({ item, sources }: { item: Upcoming; sources: Sources }) {
  if (item.kind === 'weekend') {
    return (
      <li class="hm-card" id={`jefe-${bossSlug(item.boss)}`}>
        <span class={`hm-avatar${item.boss.shadow ? ' is-shadow' : ''}`}>
          <Picture src={item.boss.image} className="hm-avatar-img" />
        </span>
        <div class="hm-card-body">
          <a class="hm-card-title" href={`#incursiones/${bossSlug(item.boss)}`}>
            <PokemonName label={bossLabel(item.boss, sources.translations.data)} />
          </a>
          <p class="hm-card-meta">
            <Egg tier={item.boss.tier} shadow={item.boss.shadow} /> Solo fines de semana: {days(item.days)}
          </p>
        </div>
      </li>
    );
  }
  const picture = item.roster.find((r) => r.image)?.image ?? null;
  const names = item.roster.length > 0 ? rosterNames(item.roster, item.shadow, sources) : <span lang="en">{item.title}</span>;
  if (item.kind === 'announced') {
    return (
      <li class="hm-card is-doubt">
        <span class={`hm-avatar${item.shadow ? ' is-shadow' : ''}`}>
          <Picture src={picture} className="hm-avatar-img" />
          <span class="hm-question" aria-hidden="true">
            ?
          </span>
        </span>
        <div class="hm-card-body">
          <p class="hm-card-title">{names}</p>
          <details class="doubt">
            <summary>
              Sin confirmar <span aria-hidden="true">ⓘ</span>
            </summary>
            <p class="fine">
              LeekDuck lo programa del {formatShort(item.start)} al {formatShort(item.end)}, pero no figura en su lista de
              jefes actual.
              {item.overlap &&
                ` Durante «${item.overlap.title}», hasta el ${formatShort(item.overlap.end)}, su calendario muestra otros jefes. Puede aparecer al terminar.`}
            </p>
            {item.link && <External href={item.link}>Ver el anuncio en LeekDuck</External>}
          </details>
        </div>
      </li>
    );
  }
  return (
    <li class="hm-card">
      <span class={`hm-avatar${item.shadow ? ' is-shadow' : ''}`}>
        <Picture src={picture} className="hm-avatar-img" />
      </span>
      <div class="hm-card-body">
        <p class="hm-card-title">{names}</p>
        <p class="hm-card-meta">
          {item.type === 'raid-battles' ? tierHint(item.title, item.shadow) : eventTypeName({ type: item.type, heading: '' })}
          {item.weekends && ' · solo fines de semana'}
        </p>
        <p class="fine">{when(item.start, item.end)}</p>
      </div>
    </li>
  );
}

function Section({ title, count, doubt = false, children }: { title: string; count?: number; doubt?: boolean; children: ComponentChildren }) {
  return (
    <section class="hm-sec rb-group">
      <header class={doubt ? 'hm-head hm-date hm-head-doubt' : 'hm-head hm-date'}>
        <h2 class="plain">
          <span>{title}</span>
          {count !== undefined && <span class="count">{count}</span>}
        </h2>
      </header>
      <ul class="hm-cards">{children}</ul>
    </section>
  );
}

export function UpcomingView({ sources, now, board }: { sources: Sources; now: number; board: RaidBoard }) {
  const starts = (item: Upcoming) => (item.kind === 'announced' ? now : item.kind === 'weekend' ? item.days[0]! : item.start);
  const announced = board.upcoming.filter((item) => item.kind === 'announced');
  const dated = board.upcoming.filter((item) => item.kind !== 'announced');
  const soon = dated.filter((item) => starts(item) < now + SOON);
  const later = dated.filter((item) => starts(item) >= now + SOON);
  const byDay = new Map<string, { title: string; items: Upcoming[] }>();
  for (const item of soon) {
    const start = Math.max(starts(item), now);
    const key = formatDay(start);
    const group = byDay.get(key) ?? { title: dayTitle(start, now), items: [] };
    group.items.push(item);
    byDay.set(key, group);
  }
  return (
    <>
      <RaidInfo sources={sources} now={now} />
      {board.upcoming.length === 0 && <p class="empty">LeekDuck no ha anunciado más rotaciones con fecha.</p>}
      {announced.length > 0 && (
        <Section title="Sin confirmar" count={announced.length} doubt>
          {announced.map((item) => (
            <UpcomingItem key={item.key} item={item} sources={sources} />
          ))}
        </Section>
      )}
      {[...byDay.entries()].map(([key, group]) => (
        <Section key={key} title={group.title}>
          {group.items.map((item) => (
            <UpcomingItem key={item.key} item={item} sources={sources} />
          ))}
        </Section>
      ))}
      {later.length > 0 && (
        <details class="hm-sec rb-group gone">
          <summary>
            Más adelante <span class="count">{later.length}</span>
          </summary>
          <ul class="hm-cards">
            {later.map((item) => (
              <UpcomingItem key={item.key} item={item} sources={sources} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/* ---------- Ficha del jefe ---------- */

export interface HeroData {
  label: PokemonLabel;
  types: string[];
  tier: string;
  shadow: boolean;
  shiny: boolean;
  figure: ComponentChildren;
  status: ComponentChildren;
  cp?: { normal: string; boosted: string | null; weather: string } | undefined;
}

/** Ficha estilo Pokédex, con el jefe sobre una plataforma circular. */
export function BossHero({ label, types, tier, shadow, shiny, figure, status, cp }: HeroData) {
  const info = tierOf(tier);
  return (
    <article class={`hm-dex t-${types[0] ?? ''}${shadow ? ' is-shadow' : ''}`}>
      <header class="hm-dex-head">
        <span class="hm-dex-no">
          <Egg tier={tier} shadow={shadow} /> {shadow ? `Oscura ${info.short}` : info.short}
          <span class="sr-only"> ({shadow ? `incursión oscura de ${info.long}` : info.long})</span>
        </span>
        <h2 class="plain">
          <PokemonName label={label} />
        </h2>
      </header>
      <div class="hm-dex-stage">
        {figure}
        <ul class="hm-dex-types" aria-label="Tipos">
          {types.map((type) => (
            <li key={type} class={`hm-type t-${type}`}>
              {typeName(type)}
            </li>
          ))}
        </ul>
        {shiny && <span class="hm-dex-shiny">✦ Variocolor</span>}
      </div>
      <dl class="hm-dex-data">
        <div class="hm-dex-when">
          <dt>Disponible</dt>
          <dd>{status}</dd>
        </div>
        {cp && (
          <div>
            <dt>PC</dt>
            <dd>{cp.normal}</dd>
          </div>
        )}
        {cp?.boosted && (
          <div>
            <dt>{cp.weather}</dt>
            <dd>{cp.boosted}</dd>
          </div>
        )}
      </dl>
      <Weak types={types} />
    </article>
  );
}

/** Debilidades, grandes y a la vista al abrir el jefe. */
function Weak({ types }: { types: string[] }) {
  const list = weaknesses(types);
  if (list.length === 0) return null;
  return (
    <section class="hm-weak weaknesses" aria-label="Debilidades">
      <h3 class="weak-title">Débil a</h3>
      <ul>
        {list.map(({ type, multiplier: m }) => (
          <li key={type} class={`weakness t-${type}${m > 2 ? ' is-double' : ''}`}>
            <span class="type">{typeName(type)}</span> {multiplier(m)}
          </li>
        ))}
      </ul>
    </section>
  );
}
