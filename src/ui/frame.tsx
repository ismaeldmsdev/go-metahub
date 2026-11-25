import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

/** Trazos simples de 24×24, como los de la navegación. */
const PATHS = {
  filters: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.500v5M9 14.500v5',
  back: 'm15 5-7 7 7 7',
  close: 'm6 6 12 12M18 6 6 18',
} as const;

const Icon = ({ name }: { name: keyof typeof PATHS }) => (
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

export interface FilterGroup {
  label: string;
  /** La primera es la de partida: no cuenta como filtro activo. */
  options: { value: string; name: string; count?: number | null | undefined; badge?: ComponentChildren }[];
  value: string;
  onChange: (value: string) => void;
  /** Se antepone al nombre en la etiqueta de filtro activo: «Tier S». */
  prefix?: string;
}

/** A partir de aquí, las opciones van en cuadrícula. */
const MANY = 8;

const selectedOf = (group: FilterGroup) => group.options.find(({ value }) => value === group.value);
const activeOf = (groups: FilterGroup[]) => groups.filter((group) => group.value !== group.options[0]!.value);
const reset = (groups: FilterGroup[]) => activeOf(groups).forEach((group) => group.onChange(group.options[0]!.value));

/** Parte de la cabecera que se va al desplazarse. */
export const Head = ({ children }: { children: ComponentChildren }) => <div class="head">{children}</div>;

function Sheet({ title, groups, onClose }: { title: string; groups: FilterGroup[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => dialog.current!.showModal(), []);
  const close = () => dialog.current!.close();
  return (
    <dialog
      ref={dialog}
      class="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      <div class="sheet-head">
        <h2 class="plain">{title}</h2>
        <button type="button" class="sheet-close" aria-label="Cerrar" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      <div class="sheet-body">
        {groups.map((group) => (
          <div key={group.label} class="sheet-group" role="group" aria-label={group.label}>
            <p class="sheet-label">{group.label}</p>
            <div class={group.options.length > MANY ? 'options options-many' : 'options'}>
              {group.options.map(({ value, name, count, badge }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={group.value === value}
                  aria-label={name}
                  onClick={() => group.onChange(value)}
                >
                  {badge ?? name}
                  {count !== undefined && count !== null && <small>{count}</small>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div class="sheet-foot">
        <button type="button" class="sheet-clear" disabled={activeOf(groups).length === 0} onClick={() => reset(groups)}>
          Restablecer
        </button>
        <button type="button" class="button" onClick={close}>
          Ver resultados
        </button>
      </div>
    </dialog>
  );
}

function FilterButton({ title, groups }: { title: string; groups: FilterGroup[] }) {
  const [open, setOpen] = useState(false);
  const count = activeOf(groups).length;
  return (
    <>
      <button
        type="button"
        class={count > 0 ? 'filter-button filter-on' : 'filter-button'}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="filters" />
        {title}
        {count > 0 && (
          <span class="filter-count">
            {count}
            <span class="sr-only"> {count === 1 ? 'activo' : 'activos'}</span>
          </span>
        )}
      </button>
      {open && <Sheet title={title} groups={groups} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Los filtros activos, siempre a la vista y cada uno con su botón para quitarlo. */
function ActiveFilters({ groups }: { groups: FilterGroup[] }) {
  const active = activeOf(groups);
  if (active.length === 0) return null;
  return (
    <div class="chips" role="group" aria-label="Filtros activos">
      {active.map((group) => {
        const name = `${group.prefix ?? ''}${selectedOf(group)?.name ?? group.value}`;
        return (
          <button
            key={group.label}
            type="button"
            aria-label={`Quitar ${name}`}
            onClick={() => group.onChange(group.options[0]!.value)}
          >
            <span>
              {name}
              <Icon name="close" />
            </span>
          </button>
        );
      })}
      {active.length > 1 && (
        <button type="button" class="chips-clear" onClick={() => reset(groups)}>
          <span>Quitar todos</span>
        </button>
      )}
    </div>
  );
}

/** Con la fila fija arriba, al cambiar los filtros la lista empieza justo debajo, sin dejar la vista a media lista. */
function useResultsTop(stamp: string) {
  const pin = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const results = document.querySelector('.main > .tier-group, .main > .ranking, .main > .grid, .main > .empty, .suggested-type');
    if (!pin.current || !results) return;
    const hidden = results.getBoundingClientRect().top - pin.current.getBoundingClientRect().bottom - 10;
    if (hidden < 0) window.scrollBy(0, hidden);
  }, [stamp]);
  return pin;
}

interface PinProps {
  children: ComponentChildren;
  groups?: FilterGroup[];
  title?: string;
  /** Lo escrito en el buscador, si lo hay. */
  search?: string;
}

/**
 * La única fila que queda fija al desplazarse. No cambia de altura ni se anima: todo lo anterior se va con la página,
 * así que no hay saltos ni depende de eventos de desplazamiento.
 */
export function Pin({ children, groups, title = 'Filtros', search = '' }: PinProps) {
  const pin = useResultsTop(`${search}|${groups?.map(({ value }) => value).join('|') ?? ''}`);
  return (
    <div ref={pin} class="pin">
      <div class="pin-row">
        {children}
        {groups && <FilterButton title={title} groups={groups} />}
      </div>
      {groups && <ActiveFilters groups={groups} />}
    </div>
  );
}

interface BackProps {
  href: string;
  label: string;
  title: string;
  lang?: string | undefined;
  /** El título no se repite más abajo. */
  heading?: boolean;
}

/** Volver y dónde se está, en la fila fija. */
export function Back({ href, label, title, lang, heading = false }: BackProps) {
  return (
    <>
      <a class="back" href={href}>
        <Icon name="back" />
        <span class="sr-only">{label}</span>
      </a>
      <div class="pin-title">
        <p aria-hidden="true">{label}</p>
        {heading ? (
          <h2 class="plain" lang={lang}>
            {title}
          </h2>
        ) : (
          <p class="pin-name" lang={lang} aria-hidden="true">
            {title}
          </p>
        )}
      </div>
    </>
  );
}
