/**
 * Pure per-entity reconcile decision — kept free of I/O so it can be unit-tested
 * exhaustively. Given the local entity (if any), the remote manifest entry (if
 * any), and our last-synced bookkeeping, decide the single action to take.
 *
 * Conflict policy = last-writer-wins, with the CLOUD winning a true conflict
 * (both sides changed since our last sync): we pull the remote rather than
 * clobber another device's newer state. The overwritten local edit survives in
 * the desktop's 20-version local backups. (Safe to be aggressive — app in test.)
 */

export interface RemoteMeta {
  domain: string
  id: string
  hash: string | null
  version: number
  mtime: number
  size: number
  deleted: boolean
}

export interface LocalMeta {
  hash: string
}

export interface KeyState {
  version: number
  syncedHash: string
}

export type Action =
  | { type: 'none' }
  | { type: 'push'; version: number }
  | { type: 'deleteRemote'; version: number }
  | { type: 'pull'; version: number; hash: string | null }
  | { type: 'applyDelete'; version: number }
  | { type: 'recordVersion'; version: number; hash: string | null }

export function decide(loc: LocalMeta | undefined, rem: RemoteMeta | undefined, st: KeyState | undefined): Action {
  const lastV = st?.version ?? 0

  // Present locally AND remotely.
  if (loc && rem) {
    if (rem.deleted) {
      // Remote tombstone we haven't applied yet → delete the local copy.
      if (!st || rem.version > lastV) return { type: 'applyDelete', version: rem.version }
      return { type: 'none' }
    }
    const changedLocally = !st || st.syncedHash !== loc.hash
    if (rem.version > lastV) {
      // Remote advanced since our last sync.
      if (loc.hash === rem.hash) return { type: 'recordVersion', version: rem.version, hash: loc.hash }
      return { type: 'pull', version: rem.version, hash: rem.hash } // cloud wins conflicts
    }
    if (changedLocally) return { type: 'push', version: Math.max(lastV, rem.version) + 1 }
    return { type: 'none' }
  }

  // Present only locally → new (or the remote lost it) → push.
  if (loc && !rem) {
    const changedLocally = !st || st.syncedHash !== loc.hash
    if (changedLocally || !st) return { type: 'push', version: lastV + 1 }
    return { type: 'none' }
  }

  // Present only remotely.
  if (!loc && rem) {
    if (rem.deleted) {
      if (!st || rem.version > lastV) return { type: 'recordVersion', version: rem.version, hash: null }
      return { type: 'none' }
    }
    if (!st) return { type: 'pull', version: rem.version, hash: rem.hash } // brand-new to this device
    if (rem.version > lastV) return { type: 'pull', version: rem.version, hash: rem.hash } // remote re-created/updated
    // Remote unchanged since our last sync, but the entity is gone locally → we
    // deleted it here; propagate the deletion to the cloud.
    return { type: 'deleteRemote', version: lastV + 1 }
  }

  return { type: 'none' }
}

export function parseKey(key: string): { domain: string; id: string } {
  const i = key.indexOf('/')
  if (i < 0) return { domain: key, id: '' }
  return { domain: key.slice(0, i), id: key.slice(i + 1) }
}

export function makeKey(domain: string, id: string): string {
  return `${domain}/${id}`
}
