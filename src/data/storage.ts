import type { QueryClient } from '@tanstack/preact-query';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { COUNTERS_KEEP, MINUTE, STORAGE_VERSION, type SourceId } from './config';
import type { SourceData } from './sources';
import type { Snapshot } from './models';
import { SOURCES } from './sources';

interface StoredSource {
  version: number;
  /** Momento de la última consulta correcta (ms). */
  checkedAt: number;
  snapshot: Snapshot<unknown>;
}

interface Schema extends DBSchema {
  sources: { key: string; value: StoredSource };
}

let connection: Promise<IDBPDatabase<Schema>> | undefined;

function db() {
  connection ??= openDB<Schema>('pke-meta', 1, {
    upgrade: (database) => void database.createObjectStore('sources'),
    blocking: () => {
      void connection?.then((c) => c.close());
      connection = undefined;
    },
    terminated: () => {
      connection = undefined;
    },
  });
  return connection;
}

const isSource = (id: unknown): id is SourceId => typeof id === 'string' && id in SOURCES;

/** Los counters comparten almacén con las fuentes, con una clave por jefe, nivel y clima. */
const COUNTERS = 'counters|';

const versionOf = (key: string): number => STORAGE_VERSION[key.startsWith(COUNTERS) ? 'counters' : (key as SourceId)];

function storageKey([id, detail]: readonly unknown[]): string | null {
  if (id === 'counters' && typeof detail === 'string') return COUNTERS + detail;
  return isSource(id) ? id : null;
}

/** Guarda solo si es más reciente: otra pestaña podría haber actualizado antes. */
export async function saveSource(id: string, snapshot: Snapshot<unknown>, checkedAt: number): Promise<void> {
  const tx = (await db()).transaction('sources', 'readwrite');
  const stored = await tx.store.get(id);
  if (!stored || stored.version !== versionOf(id) || stored.checkedAt < checkedAt || stored.checkedAt > Date.now()) {
    await tx.store.put({ version: versionOf(id), checkedAt, snapshot }, id);
  }
  await tx.done;
}

/** Una fecha futura (reloj cambiado) se trata como caducada. */
const credible = (checkedAt: number): number => (checkedAt > Date.now() + MINUTE ? 1 : checkedAt);

/** Recupera los últimos datos válidos. */
export async function restoreSources(client: QueryClient): Promise<void> {
  const database = await db();
  for (const id of Object.keys(SOURCES) as SourceId[]) {
    const stored = await database.get('sources', id);
    if (!stored || stored.version !== STORAGE_VERSION[id]) continue;
    const updatedAt = credible(stored.checkedAt);
    client.setQueryData([id], stored.snapshot as Snapshot<SourceData[typeof id]>, { updatedAt });
  }
  for (const key of await database.getAllKeys('sources')) {
    if (!key.startsWith(COUNTERS)) continue;
    const stored = await database.get('sources', key);
    if (!stored || stored.version !== versionOf(key) || Date.now() - stored.checkedAt > COUNTERS_KEEP) {
      await database.delete('sources', key);
      continue;
    }
    const updatedAt = credible(stored.checkedAt);
    client.setQueryData(['counters', key.slice(COUNTERS.length)], stored.snapshot, { updatedAt });
  }
}

/** Solo se persisten consultas correctas: un fallo nunca toca lo guardado. */
export function persistUpdates(client: QueryClient, onError: (error: unknown) => void): () => void {
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success' || event.action.manual) return;
    const key = storageKey(event.query.queryKey);
    const { data, dataUpdatedAt } = event.query.state;
    if (!key || !data) return;
    saveSource(key, data as Snapshot<unknown>, dataUpdatedAt).catch(onError);
  });
}

/** Para pruebas. */
export async function closeStorage(): Promise<void> {
  (await connection)?.close();
  connection = undefined;
}
