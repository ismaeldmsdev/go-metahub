import { REQUEST_TIMEOUT, type Endpoint } from './config';
import { SourceError } from './errors';

export interface Download {
  json: unknown;
  viaFallback: boolean;
}

/**
 * Sin cabeceras propias: GitHub rechaza la comprobación previa (preflight) que provocan.
 * `no-cache` obliga al navegador a revalidar, de modo que nunca sirve una copia HTTP antigua.
 */
export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      cache: 'no-cache',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    text = await response.text();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new SourceError('timeout', 'La fuente ha tardado demasiado en responder');
    throw new SourceError('network', 'No se ha podido conectar con la fuente');
  }
  if (!response.ok) {
    throw new SourceError('http', `La fuente ha respondido con el error ${response.status}`, response.status);
  }
  return text;
}

export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const text = await fetchText(url, signal);
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceError('format', 'La fuente ha devuelto un archivo que no es JSON válido');
  }
}

/** El espejo puede ir horas por detrás, así que nunca debe sustituir a datos ya guardados. */
export async function fetchEndpoint(
  endpoint: Endpoint,
  opts: { signal?: AbortSignal | undefined; allowFallback: boolean; as?: 'json' | 'text' },
): Promise<Download> {
  const load = opts.as === 'text' ? fetchText : fetchJson;
  try {
    return { json: await load(endpoint.url, opts.signal), viaFallback: false };
  } catch (error) {
    if (!opts.allowFallback || !endpoint.fallback || opts.signal?.aborted) throw error;
    try {
      return { json: await load(endpoint.fallback, opts.signal), viaFallback: true };
    } catch {
      throw error;
    }
  }
}
