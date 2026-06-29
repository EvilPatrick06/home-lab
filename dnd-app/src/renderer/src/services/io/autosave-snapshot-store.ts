// ---------------------------------------------------------------------------
// Autosave snapshot store (IndexedDB)
// ---------------------------------------------------------------------------
// Snapshot *bodies* (the full serialized game state, potentially several MB ×
// many versions) live here in IndexedDB rather than localStorage. IndexedDB is
// async, has a far larger per-origin quota, and stores values without the
// synchronous main-thread `JSON.stringify` + `setItem` jank that a large
// localStorage write causes. The small per-campaign version *manifest* stays in
// localStorage (see auto-save.ts) — only the heavy bodies move here.
//
// Every function is best-effort and throws only the raw IDB error so the caller
// (auto-save.ts) can fall back to localStorage when IndexedDB is unavailable or
// fails. No third-party dependency — raw IDB wrapped in promises.
// ---------------------------------------------------------------------------

const DB_NAME = 'dnd-vtt-autosave'
const STORE = 'snapshots'
const DB_VERSION = 1

/** True when a usable IndexedDB implementation is present (browser/web target). */
export function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Store a serialized snapshot body under `key`. Throws on IDB failure. */
export async function idbPutSnapshot(key: string, value: string): Promise<void> {
  await withStore('readwrite', (store) => store.put(value, key))
}

/** Read a serialized snapshot body, or `null` if absent. Throws on IDB failure. */
export async function idbGetSnapshot(key: string): Promise<string | null> {
  const value = await withStore<string | undefined>('readonly', (store) => store.get(key))
  return value ?? null
}

/** Delete a snapshot body. Throws on IDB failure. */
export async function idbDeleteSnapshot(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key))
}
