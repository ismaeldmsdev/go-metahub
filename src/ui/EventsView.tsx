import type { DateTime } from 'luxon';
import type { GameEvent } from '../data/models';
import { countdown, groupEvents, isGlobalTime, schedule } from '../domain/events';
import { eventTypeName } from '../domain/names';
import { External, Picture, Placeholder, SourceStatus } from './common';
import { useNow, type Sources } from './hooks';

const format = (date: DateTime<true>): string => date.setLocale('es').toFormat("ccc d LLL yyyy, HH:mm");

function Countdown({ target, prefix }: { target: number; prefix: string }) {
  const now = useNow(1000);
  return (
    <p class="countdown">
      {prefix} <strong>{countdown(target, now)}</strong>
    </p>
  );
}

function Details({ event }: { event: GameEvent }) {
  const extras = [
    event.hasSpawns && 'apariciones especiales',
    event.hasResearch && 'tareas de investigación',
  ].filter(Boolean);
  if (event.bonuses.length === 0 && event.featured.length === 0 && extras.length === 0) return null;
  return (
    <details class="event-details">
      <summary>{event.bonuses.length > 0 ? `Bonificaciones (${event.bonuses.length})` : 'Detalles'}</summary>
      {event.bonuses.length > 0 && (
        <>
          <p class="original">Texto original en inglés</p>
          <ul lang="en">
            {event.bonuses.map((bonus) => (
              <li key={bonus}>{bonus}</li>
            ))}
          </ul>
          {event.notes.map((note) => (
            <p key={note} class="fine" lang="en">
              {note}
            </p>
          ))}
        </>
      )}
      {event.featured.length > 0 && (
        <ul class="featured">
          {event.featured.map((pokemon) => (
            <li key={pokemon.name}>
              <Picture src={pokemon.image} className="featured-image" />
              <span lang="en">{pokemon.name}</span>
            </li>
          ))}
        </ul>
      )}
      {extras.length > 0 && <p class="fine">La fuente indica {extras.join(' y ')}.</p>}
    </details>
  );
}

function EventCard({ event, kind }: { event: GameEvent; kind: 'active' | 'upcoming' | 'unconfirmed' }) {
  const { start, end } = schedule(event);
  return (
    <li class="card event">
      <Picture src={event.image} className="event-image" />
      <div class="event-body">
        <p class="event-type">{eventTypeName(event)}</p>
        <h3 lang="en">{event.name}</h3>
        {kind === 'active' && <Countdown target={end!.toMillis()} prefix="Termina en" />}
        {kind === 'upcoming' && <Countdown target={start!.toMillis()} prefix="Empieza en" />}
        {kind === 'unconfirmed' && (
          <p class="validity warn">La fuente no da fechas completas. No se puede confirmar si está activo.</p>
        )}
        <dl class="dates">
          <div>
            <dt>Inicio</dt>
            <dd>{start ? format(start) : 'no disponible'}</dd>
          </div>
          <div>
            <dt>Fin</dt>
            <dd>{end ? format(end) : 'no disponible'}</dd>
          </div>
        </dl>
        {kind !== 'unconfirmed' && (
          <p class="fine">
            {isGlobalTime(event.start) ? 'Simultáneo en todo el mundo, en hora peninsular.' : 'Hora local de España peninsular.'}
          </p>
        )}
        <Details event={event} />
        {event.link && <External href={event.link}>Ver en LeekDuck</External>}
      </div>
    </li>
  );
}

function Section({ title, events, kind }: { title: string; events: GameEvent[]; kind: 'active' | 'upcoming' | 'unconfirmed' }) {
  if (events.length === 0) return null;
  return (
    <section class="group">
      <h2>
        {title} <span class="count">{events.length}</span>
      </h2>
      <ul class="grid">
        {events.map((event) => (
          <EventCard key={event.id} event={event} kind={kind} />
        ))}
      </ul>
    </section>
  );
}

export function EventsView({ sources }: { sources: Sources }) {
  const now = useNow(1000);
  const { events } = sources;
  if (!events.data) {
    return (
      <>
        <SourceStatus source={events} />
        <Placeholder source={events} />
      </>
    );
  }
  const groups = groupEvents(events.data, now);
  return (
    <>
      <SourceStatus source={events} />
      {groups.active.length === 0 && <p class="empty">Ahora mismo no hay eventos activos confirmados.</p>}
      <Section title="Activos" events={groups.active} kind="active" />
      <Section title="Próximos" events={groups.upcoming} kind="upcoming" />
      <Section title="Sin fecha confirmada" events={groups.unconfirmed} kind="unconfirmed" />
    </>
  );
}
