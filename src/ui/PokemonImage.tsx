import { useEffect, useRef, useState } from 'preact/hooks';
import { SPRITES } from '../data/config';

const SETTLE = 150;
const watched = new WeakMap<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

/** Un solo observador para todas las fichas. */
function watch(element: Element, callback: (visible: boolean) => void): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) watched.get(entry.target)?.(entry.isIntersecting);
    },
    { rootMargin: '150px' },
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
 * Muestra al instante el sprite (1 KB) y lo sustituye por la ilustración (unos 130 KB) cuando la
 * ficha lleva un momento a la vista. Al desplazarse deprisa no se descargan ilustraciones.
 */
export function PokemonImage(props: Props) {
  return <Image key={props.id ?? `dex-${props.dex}`} {...props} />;
}

function Image({ id, dex, type, shadow = false, small = false, pending = false }: Props) {
  const box = useRef<HTMLSpanElement>(null);
  const [wanted, setWanted] = useState(false);
  const [sprite, setSprite] = useState<'pending' | 'ok' | 'failed'>('pending');
  const [art, setArt] = useState<'pending' | 'ok' | 'failed'>('pending');

  useEffect(() => {
    if (id === null || small || savesData() || !box.current) return;
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
  }, [id, small]);

  const missing = !pending && (id === null || (sprite === 'failed' && art !== 'ok'));
  const classes = ['pk', type ? `pk-${type}` : '', shadow ? 'pk-shadow' : '', small ? 'pk-small' : '', missing ? 'pk-missing' : ''];
  const common = { alt: '', decoding: 'async', crossOrigin: 'anonymous', referrerPolicy: 'no-referrer' } as const;
  return (
    <span ref={box} class={classes.filter(Boolean).join(' ')}>
      {id !== null && art !== 'ok' && sprite !== 'failed' && (
        <img
          {...common}
          class="pk-sprite"
          src={SPRITES.small(id)}
          loading="lazy"
          onLoad={() => setSprite('ok')}
          onError={() => setSprite('failed')}
        />
      )}
      {id !== null && wanted && art !== 'failed' && (
        <img
          {...common}
          class={art === 'ok' ? 'pk-art pk-ready' : 'pk-art'}
          src={SPRITES.art(id)}
          onLoad={() => setArt('ok')}
          onError={() => setArt('failed')}
        />
      )}
      {missing && (
        <span class="pk-fallback" aria-hidden="true">
          #{dex}
        </span>
      )}
    </span>
  );
}
