/**
 * Tiny promise-based IndexedDB wrapper for the WEB build (no external deps).
 *
 * The desktop app persists each content type as JSON files under `userData`
 * (see `src/main/storage/*`). In the browser there is no main process and no
 * filesystem, so the web `window.api` shim mirrors those per-entity stores as
 * IndexedDB object stores keyed by id — a faithful, structured-clone-friendly
 * mirror of the desktop file layout.
 */

const DB_NAME = 'dnd-vtt-web'
const DB_VERSION = 1

/** Every object store the web shim needs. */
export const STORES = [
  'characters',
  'character-versions',
  'campaigns',
  'bastions',
  'custom-creatures',
  'homebrew',
  'game-state',
  'bans',
  'settings',
  'map-library',
  'shop-templates',
  'image-library',
  'books',
  'book-data',
  'audio',
  'plugins',
  'plugin-storage',
  'kv'
] as const

export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = fn(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

export async function idbGet<T = unknown>(store: StoreName, key: string): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (s) => s.get(key))
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  await tx(store, 'readwrite', (s) => s.put(value, key))
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(key))
}

export async function idbGetAll<T = unknown>(store: StoreName): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll())
}

export async function idbKeys(store: StoreName): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys())
  return keys.map((k) => String(k))
}

export async function idbClear(store: StoreName): Promise<void> {
  await tx(store, 'readwrite', (s) => s.clear())
}

/** Wipe every store (web equivalent of `wipeAllData`). */
export async function idbWipeAll(): Promise<void> {
  await Promise.all(STORES.map((s) => idbClear(s)))
}
