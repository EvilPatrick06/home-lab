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

// Manifest cache: reuse a prior reconcile's serialized bytes + hash for an
// entity whose domain-supplied changeKey is unchanged, so unchanged (esp.
// large binary) entities aren't re-serialized + re-hashed every cycle.
const _manifestCache = new Map<string, { changeKey: string; bytes: ArrayBuffer; hash: string }>()

export async function reconcile(): Promise<ReconcileResult> {
  // 1. Local manifest: serialize + hash every synced entity (skipping ones
  //    whose changeKey is unchanged since last reconcile).
  const local = new Map<string, { domain: string; id: string; bytes: ArrayBuffer; hash: string }>()
  const seen = new Set<string>()
  for (const d of DOMAINS) {
    let entities: Array<{ id: string; entity: unknown; changeKey?: string }>
    try {
      entities = await d.listEntities()
    } catch {
      continue
    }
    for (const { id, entity, changeKey } of entities) {
      try {
        const key = makeKey(d.name, id)
        seen.add(key)
        let bytes: ArrayBuffer
        let hash: string
        if (changeKey !== undefined) {
          const hit = _manifestCache.get(key)
          if (hit && hit.changeKey === changeKey) {
            bytes = hit.bytes
            hash = hit.hash
          } else {
            bytes = d.serialize(entity)
            hash = hashBytes(bytes)
            _manifestCache.set(key, { changeKey, bytes, hash })
          }
        } else {
          bytes = d.serialize(entity)
          hash = hashBytes(bytes)
        }
        local.set(key, { domain: d.name, id, bytes, hash })
      } catch {
        /* skip an unserializable entity */
      }
    }
  }
  // Evict manifest-cache entries for entities that no longer exist locally.
  for (const k of _manifestCache.keys()) if (!seen.has(k)) _manifestCache.delete(k)

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

function onVisibility(): void {
  // Reconcile immediately when the tab becomes visible again (polling is paused
  // while hidden), so returning to a backgrounded tab syncs without waiting a tick.
  if (typeof document !== 'undefined' && !document.hidden) void safeReconcile()
}

/** Begin syncing (idempotent). Runs an immediate launch pull-merge, then polls. */
export function startSync(): void {
  if (running) return
  running = true
  void safeReconcile()
  intervalId = setInterval(() => {
    // Don't poll a backgrounded tab — it just fetches a manifest nobody's viewing
    // every 30s. Polling resumes on focus / visibilitychange (which reconcile now).
    if (typeof document !== 'undefined' && document.hidden) return
    void safeReconcile()
  }, INTERVAL_MS)
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
  }
}

export function stopSync(): void {
  running = false
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
