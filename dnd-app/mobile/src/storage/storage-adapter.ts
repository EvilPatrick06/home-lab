/**
 * On-device durable storage for the native shell.
 *
 * Mirrors the per-entity model the web shim implements with IndexedDB and the
 * desktop app implements with per-file JSON under userData: every domain
 * (characters, campaigns, bastions, …) is a set of id-keyed JSON blobs. Backed
 * by a single SQLite table here (`expo-sqlite`), which gives us transactional
 * writes and cheap list/get/delete without a row-per-column schema.
 *
 * `settings` is a singleton domain stored under a fixed id.
 */
import * as SQLite from 'expo-sqlite'

export type StorageDomain =
  | 'characters'
  | 'campaigns'
  | 'bastions'
  | 'homebrew'
  | 'customCreatures'
  | 'gameState'
  | 'bans'
  | 'mapLibrary'
  | 'shopTemplates'
  | 'imageLibrary'
  | 'books'
  | 'characterVersions'
  | 'settings'

type Json = Record<string, unknown>

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const handle = await SQLite.openDatabaseAsync('dnd-vtt.db')
      await handle.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS entities (
          domain TEXT NOT NULL,
          id TEXT NOT NULL,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (domain, id)
        );
      `)
      return handle
    })()
  }
  return dbPromise
}

/** Call once at app start (App.tsx) so the schema exists before first access. */
export async function initStorage(): Promise<void> {
  await db()
}

export async function put(domain: StorageDomain, id: string, value: Json): Promise<void> {
  const handle = await db()
  await handle.runAsync(
    'INSERT OR REPLACE INTO entities (domain, id, json, updated_at) VALUES (?, ?, ?, ?)',
    domain,
    id,
    JSON.stringify(value),
    Date.now()
  )
}

export async function get(domain: StorageDomain, id: string): Promise<Json | null> {
  const handle = await db()
  const row = await handle.getFirstAsync<{ json: string }>(
    'SELECT json FROM entities WHERE domain = ? AND id = ?',
    domain,
    id
  )
  return row ? (JSON.parse(row.json) as Json) : null
}

export async function list(domain: StorageDomain): Promise<Json[]> {
  const handle = await db()
  const rows = await handle.getAllAsync<{ json: string }>(
    'SELECT json FROM entities WHERE domain = ? ORDER BY updated_at DESC',
    domain
  )
  return rows.map((r) => JSON.parse(r.json) as Json)
}

export async function remove(domain: StorageDomain, id: string): Promise<boolean> {
  const handle = await db()
  const res = await handle.runAsync('DELETE FROM entities WHERE domain = ? AND id = ?', domain, id)
  return res.changes > 0
}

export async function wipeAll(): Promise<string[]> {
  const handle = await db()
  const domains = await handle.getAllAsync<{ domain: string }>('SELECT DISTINCT domain FROM entities')
  await handle.runAsync('DELETE FROM entities')
  return domains.map((d) => d.domain)
}

const SETTINGS_ID = '__app_settings__'

export async function loadSettings(): Promise<Json> {
  return (await get('settings', SETTINGS_ID)) ?? {}
}

export async function saveSettings(settings: Json): Promise<void> {
  await put('settings', SETTINGS_ID, settings)
}
