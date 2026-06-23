/**
 * Cloud-sync engine — shared by desktop and web. Periodically (and on launch +
 * window focus) reconciles every registered domain against the per-user cloud
 * store: it serializes + hashes local entities, diffs them against the remote
 * manifest, and pushes/pulls/deletes per the pure `decide` policy (LWW, cloud
 * wins conflicts). All transport goes through `window.api.sync.*`.
 *
 * Activated only while signed in (App + useAccount call start/stop), so signed-
 * out users are completely unaffected.
 */

import { DOMAINS, domainByName } from './domains'
import { hashBytes } from './hash'
import { type Action, decide, makeKey, parseKey, type RemoteMeta } from './reconcile-plan'
import { loadSyncState, type SyncStateMap, saveSyncState } from './sync-state'

export interface ReconcileResult {
  pushed: number
  pulled: number
  deleted: number
  error?: string
}

async function applyPull(
  domain: string,
  id: string,
  key: string,
  version: number,
  hash: string | null,
  state: SyncStateMap
): Promise<boolean> {
  const d = domainByName(domain)
  if (!d) return false
  const bytes = await window.api.sync.getObject(domain, id)
  if (!bytes) return false
  const entity = d.deserialize(bytes)
  await d.putEntity(id, entity)
  state[key] = { version, syncedHash: hash ?? hashBytes(new Uint8Array(bytes)) }
  return true
}

export async function reconcile(): Promise<ReconcileResult> {
  // 1. Local manifest: serialize + hash every synced entity.
  const local = new Map<string, { domain: string; id: string; bytes: ArrayBuffer; hash: string }>()
  for (const d of DOMAINS) {
    let entities: Array<{ id: string; entity: unknown }>
    try {
      entities = await d.listEntities()
    } catch {
      continue
    }
    for (const { id, entity } of entities) {
      try {
        const bytes = d.serialize(entity)
        local.set(makeKey(d.name, id), { domain: d.name, id, bytes, hash: hashBytes(bytes) })
      } catch {
        /* skip an unserializable entity */
      }
    }
  }

  // 2. Remote manifest.
  const remoteRes = await window.api.sync.manifest()
  if (!remoteRes.ok) return { pushed: 0, pulled: 0, deleted: 0, error: remoteRes.error ?? 'manifest unavailable' }
  const remote = new Map<string, RemoteMeta>()
  for (const o of remoteRes.objects as RemoteMeta[]) remote.set(makeKey(o.domain, o.id), o)

  const state = loadSyncState()
  const keys = new Set<string>([...local.keys(), ...remote.keys(), ...Object.keys(state)])

  let pushed = 0
  let pulled = 0
  let deleted = 0

  for (const key of keys) {
    const loc = local.get(key)
    const rem = remote.get(key)
    const { domain, id } = parseKey(key)
    const action: Action = decide(loc ? { hash: loc.hash } : undefined, rem, state[key])
    try {
      switch (action.type) {
        case 'push': {
          if (!loc) break
          const res = await window.api.sync.putObject(
            loc.domain,
            loc.id,
            action.version,
            Date.now(),
            loc.hash,
            loc.bytes
          )
          if (res.accepted) {
            state[key] = { version: action.version, syncedHash: loc.hash }
            pushed++
          } else if (res.winner) {
            if (await applyPull(domain, id, key, res.winner.version, res.winner.hash, state)) pulled++
          }
          break
        }
        case 'pull':
          if (await applyPull(domain, id, key, action.version, action.hash, state)) pulled++
          break
        case 'deleteRemote': {
          const res = await window.api.sync.deleteObject(domain, id, action.version)
          if (res.accepted) {
            state[key] = { version: action.version, syncedHash: '' }
            deleted++
          }
          break
        }
        case 'applyDelete': {
          const d = domainByName(domain)
          if (d) {
            try {
              await d.removeEntity(id)
            } catch {
              /* already gone locally */
            }
          }
          state[key] = { version: action.version, syncedHash: '' }
          deleted++
          break
        }
        case 'recordVersion':
          state[key] = { version: action.version, syncedHash: action.hash ?? '' }
          break
        case 'none':
          break
      }
    } catch {
      /* transient per-key failure; the next reconcile retries this key */
    }
  }

  saveSyncState(state)
  return { pushed, pulled, deleted }
}

// ── lifecycle ─────────────────────────────────────────────────────────

let intervalId: ReturnType<typeof setInterval> | null = null
let running = false
let reconciling = false
const INTERVAL_MS = 30_000

async function safeReconcile(): Promise<void> {
  if (reconciling) return
  reconciling = true
  try {
    await reconcile()
  } catch {
    /* swallow — periodic retry */
  } finally {
    reconciling = false
  }
}

function onFocus(): void {
  void safeReconcile()
}

/** Begin syncing (idempotent). Runs an immediate launch pull-merge, then polls. */
export function startSync(): void {
  if (running) return
  running = true
  void safeReconcile()
  intervalId = setInterval(() => void safeReconcile(), INTERVAL_MS)
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)
}

export function stopSync(): void {
  running = false
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
}

export function isSyncRunning(): boolean {
  return running
}

/** Force an immediate reconcile (e.g. a "Sync now" button). */
export async function syncNow(): Promise<void> {
  await safeReconcile()
}
