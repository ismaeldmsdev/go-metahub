import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { type FormatTarget, type League } from '../data/config';
import type { PvpFormat, SeasonWeek } from '../data/models';
import { formatDate } from '../domain/freshness';
import {
  entryLabel,
  filterFormat,
  FORMAT_VARIANTS,
  formatFor,
  groupSeason,
  LEAGUE_TITLES,
  limitText,
  officialSeasonUrl,
  parseEntry,
  restrictionsOf,
  type EntryLabel,
  type FormatVariant,
  type SeasonEntry,
} from '../domain/formats';
import { parseEventDate } from '../domain/events';
import { External, InfoLine, MoveLegend, Placeholder, sourceAlerts, SourceStatus } from './common';
import { Back, Head, Pin } from './frame';
import { Search } from './GymsView';
import { useFormat, useNow, type Sources } from './hooks';
import { LeagueButtons, PvpCard } from './PvpView';

const PAGE = 30;

const VARIANT_NAMES: Record<FormatVariant, string> = {
  all: 'Todas',
  normal: 'Normales',
  mega: 'Megas',
  shadow: 'Oscuros',
};

// Se recuerdan mientras la aplicación está abierta.
let rememberedLeague: League = 1500;

/* Ranking de una copa o liga Mega */

interface RankingProps {
  target: FormatTarget;
  sources: Sources;
  /** Volver y el nombre de la copa. Sin ello, la fila fija lleva el buscador. */
  back?: ComponentChildren;
  children: ComponentChildren;
}

function Ranking({ target, sources, back, children }: RankingProps) {
  const source = useFormat(target);
  const [variant, setVariant] = useState<FormatVariant>('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const tr = sources.translations.data;
  const data = source.data;
  const list = useMemo(() => (data ? filterFormat(data.entries, { variant, search }, tr) : []), [data, variant, search, tr]);
  const rest = list.length - shown;
  const find = (
    <Search
      value={search}
      onChange={(value) => {
        setSearch(value);
        setShown(PAGE);
      }}
    />
  );
  return (
    <>
      <Pin
        search={search}
        groups={[
          {
            label: 'Variante',
            value: variant,
            onChange: (id) => {
              setVariant(id as FormatVariant);
              setShown(PAGE);
            },
            options: FORMAT_VARIANTS.map((id) => ({ value: id, name: VARIANT_NAMES[id] })),
          },
        ]}
      >
        {back ?? find}
      </Pin>
      {children}
      <div class="meta">
        <InfoLine label="Rankings de PvPoke" alerts={sourceAlerts([source])}>
          <p>
            Puesto, puntuación y movimientos de <External href="https://pvpoke.com">PvPoke</External> para este formato, sin
            recalcular. Sin tiers: no se comparan con los de otras ligas.
          </p>
          <SourceStatus source={source} />
        </InfoLine>
        {data && (
          <p class="result-count" role="status">
            {list.length} Pokémon
          </p>
        )}
      </div>
      {!data ? (
        <Placeholder source={source} />
      ) : (
        <>
          {back && <div class="filter-row">{find}</div>}
          {list.length === 0 ? (
            <p class="empty">Ningún Pokémon de este formato coincide.</p>
          ) : (
            <ol class="ranking">
              {list.slice(0, shown).map((entry) => (
                <PvpCard
                  key={entry.id}
                  entry={entry}
                  moves={data.moves}
                  tr={tr}
                  sprites={sources.sprites.data}
                  imagesPending={sources.sprites.health.level === 'loading'}
                  tiered={false}
                />
              ))}
            </ol>
          )}
          {rest > 0 && (
            <button class="button more" type="button" onClick={() => setShown(shown + PAGE * 2)}>
              Mostrar más ({rest} restantes)
            </button>
          )}
          <MoveLegend>
            <span>★ Movimiento que PvPoke marca como especial, no siempre disponible</span>
          </MoveLegend>
        </>
      )}
    </>
  );
}

function Rules({ format, sources }: { format: PvpFormat; sources: Sources }) {
  const rules = restrictionsOf(format, sources.pvp.data?.species, sources.translations.data);
  return (
    <section class="card rules" aria-label="Restricciones">
      <ul>
        {rules.map(({ text, names }) => (
          <li key={text}>
            {names.length === 0 ? (
              text
            ) : names.length <= 6 ? (
              `${text}: ${names.join(', ')}`
            ) : (
              <details class="method">
                <summary>
                  {text} ({names.length})
                </summary>
                <p>{names.join(', ')}</p>
              </details>
            )}
          </li>
        ))}
      </ul>
      <p class="fine">Según los filtros de PvPoke. Si difieren de la página oficial, manda la oficial.</p>
    </section>
  );
}

/* Ligas Mega */

export function MegaView({ sources, initial }: { sources: Sources; initial: League | null }) {
  const [league, setLeague] = useState(() => {
    if (initial) rememberedLeague = initial;
    return rememberedLeague;
  });
  const { pvp } = sources;
  if (!pvp.data) {
    return (
      <>
        <SourceStatus source={pvp} />
        <Placeholder source={pvp} />
      </>
    );
  }
  const format = formatFor({ kind: 'league', league, mega: true }, pvp.data.formats);
  return (
    <>
      <Head>
        <LeagueButtons
          league={league}
          onChange={(next) => {
            rememberedLeague = next;
            setLeague(next);
          }}
        />
      </Head>
      {format ? (
        <Ranking key={league} target={{ cup: format.cup, cp: format.cp }} sources={sources}>
          <Rules format={format} sources={sources} />
        </Ranking>
      ) : (
        <p class="empty">PvPoke no publica ahora mismo un ranking de {LEAGUE_TITLES[league]}: Edición Mega.</p>
      )}
    </>
  );
}

/* Calendario y copas */

const Name = ({ label }: { label: EntryLabel }) => <span lang={label.untranslated ? 'en' : undefined}>{label.name}</span>;

const formatHash = (format: PvpFormat): string => `#pvp/copa-${format.cup}-${format.cp}`;

/** Qué se puede abrir de cada liga o copa. */
function Entry({ text, formats }: { text: string; formats: PvpFormat[] }) {
  const entry = parseEntry(text);
  const label = entryLabel(entry);
  const format = formatFor(entry, formats);
  const limit = limitOf(entry);
  const link =
    entry.kind === 'cup'
      ? format && formatHash(format)
      : entry.mega
        ? format && `#pvp/mega-${entry.league}`
        : `#pvp/liga-${entry.league}`;
  return (
    <li class="season-entry">
      <span class="season-name">
        <Name label={label} />
        {limit && <small>{limit}</small>}
      </span>
      {link ? (
        <a class="link season-open" href={link}>
          Ver ranking<span class="sr-only"> de {label.name}</span>
        </a>
      ) : (
        <span class="fine">Ranking aún no publicado</span>
      )}
    </li>
  );
}

const limitOf = (entry: SeasonEntry): string | null => {
  const cp = entry.kind === 'league' ? entry.league : entry.cp;
  return cp === null ? null : limitText(cp);
};

const dateOf = (value: string | null): string => {
  const date = parseEventDate(value);
  return date ? formatDate(date.toMillis()) : 'sin fecha';
};

function Week({ week, formats }: { week: SeasonWeek; formats: PvpFormat[] }) {
  return (
    <li class="card season-week">
      <p class="season-dates">
        Del {dateOf(week.start)} al {dateOf(week.end)}
      </p>
      <ul>
        {week.entries.map((entry) => (
          <Entry key={entry} text={entry} formats={formats} />
        ))}
      </ul>
      {week.link && (
        <p class="fine">
          <External href={week.link}>Detalles en LeekDuck</External> (en inglés)
        </p>
      )}
    </li>
  );
}

export function CupsView({ sources }: { sources: Sources }) {
  const now = useNow(30_000);
  const { season, pvp } = sources;
  const formats = pvp.data?.formats ?? [];
  if (!season.data) {
    return (
      <>
        <SourceStatus source={season} />
        <Placeholder source={season} />
      </>
    );
  }
  const { current, upcoming, undated } = groupSeason(season.data, now);
  const name = (current[0] ?? upcoming[0] ?? undated[0])?.season;
  const section = (title: string, weeks: SeasonWeek[]) =>
    weeks.length > 0 && (
      <section class="group">
        <h2>{title}</h2>
        <ul class="grid">
          {weeks.map((week) => (
            <Week key={week.id} week={week} formats={formats} />
          ))}
        </ul>
      </section>
    );
  return (
    <>
      <InfoLine
        label="Calendario de LeekDuck · hora peninsular"
        alerts={[...sourceAlerts([season]), ...(pvp.data === undefined ? ['Los rankings de PvPoke aún no se han podido comprobar'] : [])]}
      >
        <p>
          Calendario de la Liga Combates GO según LeekDuck, en hora peninsular. Cada copa usa su propio ranking de PvPoke,
          que suele publicarse días antes de que empiece; mientras no exista, no se muestra el de otra.
        </p>
        <SourceStatus source={season} />
      </InfoLine>
      {name && (
        <p class="note">
          Reglas completas: <External href={officialSeasonUrl(name)}>página oficial de la temporada</External>
        </p>
      )}
      {current.length > 0 ? (
        section('Ahora', current)
      ) : (
        <section class="group">
          <h2>Ahora</h2>
          <p class="empty">LeekDuck no lista ahora mismo la semana en curso.</p>
        </section>
      )}
      {section('Próximas', upcoming)}
      {section('Sin fecha confirmada', undated)}
    </>
  );
}

/** «copa-retro-1500». */
export function parseFormatSlug(slug: string): FormatTarget | null {
  const match = /^copa-([a-z0-9]+)-(\d+)$/.exec(slug);
  return match ? { cup: match[1]!, cp: Number(match[2]) } : null;
}

export function CupView({ target, sources }: { target: FormatTarget; sources: Sources }) {
  const { pvp, season } = sources;
  const format = pvp.data?.formats.find((f) => f.cup === target.cup && f.cp === target.cp);
  const back = (title: string, lang?: string) => (
    <Back href="#pvp/copas" label="Calendario y copas" title={title} lang={lang} heading />
  );
  if (!pvp.data) {
    return (
      <>
        <Pin>{back('Copa')}</Pin>
        <Placeholder source={pvp} />
      </>
    );
  }
  if (!format) {
    return (
      <>
        <Pin>{back('Copa')}</Pin>
        <p class="empty">PvPoke ya no muestra esta copa.</p>
      </>
    );
  }
  const named = season.data
    ?.flatMap((week) => week.entries)
    .map(parseEntry)
    .find((entry) => formatFor(entry, [format]) !== null);
  const label = named ? entryLabel(named) : { name: format.title, untranslated: true };
  return (
    <Ranking target={target} sources={sources} back={back(label.name, label.untranslated ? 'en' : undefined)}>
      <Rules format={format} sources={sources} />
    </Ranking>
  );
}
