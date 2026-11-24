import { useEffect, useRef, useState } from 'preact/hooks';
import { SPRITES } from '../data/config';

const SETTLE = 150;
/** Ilustraciones ya mostradas: al volver a una lista salen directamente, sin repetir la espera. */
const shown = new Set<number>();
const watched = new WeakMap<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

/** Un solo observador para todas las fichas. */
function watch(element: Element, callback: (visible: boolean) => void): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) watched.get(entry.target)?.(entry.isIntersecting);
    },
    { rootMargin: '400px' },
  );
  watched.set(element, callback);
  observer.observe(element);
  return () => {
    observer?.unobserve(element);
    watched.delete(element);
  };
}

const savesData = (): boolean =>
  (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

interface Props {
  /** Identificador de PokéAPI, o null si no hay imagen exacta. */
  id: number | null;
  dex: number;
  /** Tipo principal, para el fondo. */
  type: string | undefined;
  shadow?: boolean;
  small?: boolean;
  /** Aún se está cargando la lista de imágenes. */
  pending?: boolean;
}

/**
 * Muestra solo la ilustración (unos 130 KB), que se pide cuando la ficha lleva un momento cerca de la vista: al
 * desplazarse deprisa no se descargan las que pasan de largo. Mientras llega, queda el fondo de la ficha. El sprite
 * de la misma forma (1 KB) solo se usa si la ilustración falla, o en su lugar si se pide ahorrar datos.
 */
export function PokemonImage(props: Props) {
  return <Image key={props.id ?? `dex-${props.dex}`} {...props} />;
}

function Image({ id, dex, type, shadow = false, small = false, pending = false }: Props) {
  const box = useRef<HTMLSpanElement>(null);
  const [known] = useState(() => id !== null && shown.has(id));
  const [wanted, setWanted] = useState(known);
  const [art, setArt] = useState<'pending' | 'ok' | 'failed'>(known ? 'ok' : 'pending');
  const [spriteFailed, setSpriteFailed] = useState(false);
  const spriteOnly = small || savesData();
  const useSprite = spriteOnly || art === 'failed';

  useEffect(() => {
    if (id === null || spriteOnly || wanted || !box.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = watch(box.current, (visible) => {
      clearTimeout(timer);
      if (!visible) return;
      timer = setTimeout(() => {
        setWanted(true);
        stop();
      }, SETTLE);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [id, spriteOnly, wanted]);

  const missing = !pending && (id === null || (useSprite && spriteFailed));
  const classes = ['pk', type ? `t-${type}` : '', shadow ? 'pk-shadow' : '', small ? 'pk-small' : '', missing ? 'pk-missing' : ''];
  const common = { alt: '', decoding: 'async', crossOrigin: 'anonymous', referrerPolicy: 'no-referrer' } as const;
  return (
    <span ref={box} class={classes.filter(Boolean).join(' ')}>
      {id !== null && useSprite && !spriteFailed && (
        <img
          {...common}
          class="pk-sprite"
          src={SPRITES.small(id)}
          loading="lazy"
          onError={() => setSpriteFailed(true)}
        />
      )}
      {id !== null && wanted && !useSprite && (
        <img
          {...common}
          class={art === 'ok' ? 'pk-art pk-ready' : 'pk-art'}
          src={SPRITES.art(id)}
          loading={known ? 'lazy' : 'eager'}
          onLoad={() => {
            shown.add(id);
            setArt('ok');
          }}
          onError={() => {
            shown.delete(id);
            setArt('failed');
          }}
        />
      )}
      {missing && (
        <span class="pk-fallback" aria-hidden="true">
          {dex > 0 ? `#${dex}` : '?'}
        </span>
      )}
    </span>
  );
}
