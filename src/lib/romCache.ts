/** Caches the last-loaded vanilla ROM in IndexedDB so reloading the page
 *  doesn't require re-picking the file from disk. */

const DB_NAME = 'crystalis-tools';
const STORE_NAME = 'rom';
const KEY = 'last';

interface CachedRom {
  bytes: Uint8Array;
  fileName: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
    mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const req = fn(tx.objectStore(STORE_NAME));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveCachedRom(bytes: Uint8Array, fileName: string): Promise<void> {
  try {
    await withStore('readwrite', store => store.put({bytes, fileName} satisfies CachedRom, KEY));
  } catch {
    // Best-effort cache; ignore quota/availability errors.
  }
}

export async function loadCachedRom(): Promise<CachedRom | null> {
  try {
    const result = await withStore<CachedRom | undefined>('readonly', store => store.get(KEY));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function clearCachedRom(): Promise<void> {
  try {
    await withStore('readwrite', store => store.delete(KEY));
  } catch {
    // Ignore.
  }
}
