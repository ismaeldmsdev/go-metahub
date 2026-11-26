import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { formatAge, formatDate, hasKnownCheck } from '../domain/freshness';
import { typeName, type PokemonLabel } from '../domain/names';
import { weaknesses } from '../domain/types';
import { useNow, type Source } from './hooks';

export const TypeTag = ({ type }: { type: string }) => <span class={`type t-${type}`}>{typeName(type)}</span>;

export const multiplier = (value: number): string => `×${value.toLocaleString('es', { maximumFractionDigits: 2 })}`;

export function Weaknesses({ types }: { types: string[] }) {
  const list = weaknesses(types);
  if (list.length === 0) return null;
  return (
    <section class="weaknesses" aria-label="Debilidades">
      <h3 class="weak-title">Débil a</h3>
      <ul class="types">
        {list.map((weakness) => (
          <li key={weakness.type} class="weakness">
            <TypeTag type={weakness.type} /> {multiplier(weakness.multiplier)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Rayo para el ataque rápido y diana para el cargado, iguales en toda la aplicación. */
export function MoveIcon({ fast }: { fast: boolean }) {
  return (
    <svg class={fast ? 'move-icon move-icon-fast' : 'move-icon'} viewBox="0 0 24 24" aria-hidden="true">
      {fast ? (
        <path fill="currentColor" d="M13.500 1.500 4 14h6.500L9 22.500 20 9.500h-7z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" />
          <circle cx="12" cy="12" r="3.600" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function Move({ name, fast, elite = false }: { name: string; fast: boolean; elite?: boolean }) {
  return (
    <li class={fast ? 'move move-fast' : 'move'}>
      <MoveIcon fast={fast} />
      <span class="sr-only">{fast ? 'Ataque rápido: ' : 'Ataque cargado: '}</span>
      <span class="move-name">
        {name}
        {elite && <abbr title="Movimiento especial: puede requerir una MT élite o un evento"> ★</abbr>}
      </span>
    </li>
  );
}

export function Rank({ value }: { value: number }) {
  return (
    <span class={`rank rank-${value}`}>
      <span class="sr-only">Puesto </span>
      {value}
    </span>
  );
}

export const MoveLegend = ({ children }: { children?: ComponentChildren }) => (
  <p class="legend">
    <span>
      <MoveIcon fast /> Ataque rápido
    </span>
    <span>
      <MoveIcon fast={false} /> Ataque cargado
    </span>
    {children}
  </p>
);

export function PokemonName({ label }: { label: PokemonLabel }) {
  return (
    <span class="pokemon-name">
      <span lang={label.untranslated ? 'en' : undefined}>{label.name}</span>
      {label.form && <small>{label.form}</small>}
      {label.shadow && <span class="chip chip-shadow">Oscuro</span>}
    </span>
  );
}

/** Imagen externa: si falla o no hay conexión, desaparece sin dejar hueco roto. */
export function Picture({ src, className }: { src: string | null; className: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <div class={`${className} picture-empty`} aria-hidden="true" />;
  return (
    <img
      class={className}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
    />
  );
}

export function External({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a class="link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** Las tres fechas que no deben confundirse: consulta, publicación y cambio real. */
export function SourceDates({ source }: { source: Source<unknown> }) {
  const now = useNow(30_000);
  const { snapshot, checkedAt } = source;
  if (!snapshot) return null;
  const ago = (ms: number) => `${formatDate(ms)} (hace ${formatAge(now - ms)})`;
  return (
    <dl class="dates">
      <div>
        <dt>Última consulta</dt>
        <dd>{hasKnownCheck(checkedAt) ? ago(checkedAt) : 'desconocida'}</dd>
      </div>
      <div>
        <dt>Publicado por la fuente</dt>
        <dd>{snapshot.sourceUpdatedAt === null ? 'no disponible' : ago(snapshot.sourceUpdatedAt)}</dd>
      </div>
      <div>
        <dt>Último cambio detectado</dt>
        <dd>
          {snapshot.changedAt === null ? `ninguno desde ${formatDate(snapshot.firstSeenAt)}` : ago(snapshot.changedAt)}
        </dd>
      </div>
    </dl>
  );
}

export function RefreshButton({ source }: { source: Source<unknown> }) {
  return (
    <button class="button" type="button" onClick={source.refresh} disabled={!source.canRefresh}>
      {source.fetching ? 'Consultando…' : source.canRefresh ? 'Actualizar' : 'Recién consultado'}
    </button>
  );
}

/** Cabecera de cada sección: estado resumido, avisos y fechas desplegables. */
export function SourceStatus({ source }: { source: Source<unknown> }) {
  const now = useNow(30_000);
  const { health, snapshot, checkedAt } = source;
  const summary = !snapshot
    ? health.level === 'error'
      ? 'Sin datos'
      : 'Cargando…'
    : hasKnownCheck(checkedAt)
      ? `Consultado hace ${formatAge(now - checkedAt)}`
      : 'Fecha de consulta desconocida';
  return (
    <section class={`status status-${health.level}`} aria-label="Estado de los datos">
      {health.messages.length > 0 && (
        <ul class="status-messages" role="status">
          {health.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <details>
        <summary>
          <span class="dot" aria-hidden="true" />
          {summary}
          {source.fetching && snapshot ? ' · actualizando…' : ''}
        </summary>
        <SourceDates source={source} />
        <RefreshButton source={source} />
      </details>
    </section>
  );
}

export function Loading() {
  return (
    <div class="skeletons" role="status">
      <span class="sr-only">Cargando datos…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} class="skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}

export function Placeholder({ source }: { source: Source<unknown> }) {
  if (source.health.level === 'loading') return <Loading />;
  return (
    <div class="empty">
      <p>Aún no hay datos guardados en este dispositivo.</p>
      <RefreshButton source={source} />
    </div>
  );
}

const SOURCE_NAMES: Partial<Record<string, string>> = {
  raids: 'Lista de jefes',
  raidSchedule: 'Calendario',
  events: 'Eventos',
  pokebattler: 'Pokébattler',
  counters: 'Counters',
  pvp: 'PvPoke',
  gyms: 'Gimnasios',
  rocket: 'Rocket',
  rocketAttackers: 'Atacantes',
  rocketContrast: 'LeekDuck',
  season: 'Temporada',
};

/** Avisos que afectan a la fiabilidad, con el nombre de su fuente delante. */
export function sourceAlerts(sources: Source<unknown>[]): string[] {
  const alerts: string[] = [];
  for (const source of sources) {
    if (source.health.level !== 'warning' && source.health.level !== 'error') continue;
    for (const message of source.health.messages) alerts.push(`${SOURCE_NAMES[source.id] ?? source.id}: ${message}`);
  }
  return alerts;
}

/**
 * Un solo acceso a lo técnico: fuentes, fechas, método y botón de actualizar. El rótulo nombra la fuente (atribución
 * siempre visible). Si algo afecta a la fiabilidad, su aviso breve sustituye al rótulo, se ve siempre y los avisos
 * relacionados se agrupan en esa línea.
 */
export function InfoLine({ label, alerts = [], children }: { label: ComponentChildren; alerts?: string[]; children: ComponentChildren }) {
  return (
    <details class={alerts.length > 0 ? 'hm-info is-alert' : 'hm-info'}>
      <summary>
        <span class="hm-info-i" aria-hidden="true">
          {alerts.length > 0 ? '!' : 'i'}
        </span>
        <span class="hm-info-text">
          {alerts.length > 0 ? alerts[0] : label}
          {alerts.length > 1 && <small> y {alerts.length - 1} aviso{alerts.length > 2 ? 's' : ''} más</small>}
        </span>
        <span class="sr-only">: más información</span>
      </summary>
      <div class="hm-info-body">
        {alerts.length > 1 && (
          <ul class="hm-info-alerts">
            {alerts.map((alert) => (
              <li key={alert}>{alert}</li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </details>
  );
}

/** Una limitación importante en una línea; el porqué, al desplegarla. */
export function Caveat({ summary, children }: { summary: ComponentChildren; children: ComponentChildren }) {
  return (
    <details class="caveat">
      <summary>
        <span class="caveat-i" aria-hidden="true">
          !
        </span>
        <span>{summary}</span>
      </summary>
      <div class="caveat-body">{children}</div>
    </details>
  );
}
