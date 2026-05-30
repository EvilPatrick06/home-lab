/**
 * Per-id save serializer.
 *
 * `saveCharacter`, `saveCampaign`, etc. are not atomic as a sequence:
 * `read existing → copy to .versions/ → atomicWriteFile` involves three awaits.
 * Two concurrent calls with the same id (e.g., auto-save tick racing a manual
 * save) can interleave, producing duplicate version backups and a last-writer-
 * wins overwrite that silently drops one set of edits.
 *
 * `withSaveLock(scope, id, fn)` ensures `fn` runs to completion before any
 * subsequent call with the same `(scope, id)` pair starts. Calls with different
 * `(scope, id)` keys still run concurrently.
 *
 * Errors thrown by `fn` propagate, but they don't poison the lock — the next
 * caller for that key starts fresh.
 */

const queues = new Map<string, Promise<unknown>>()

export async function withSaveLock<T>(scope: string, id: string, fn: () => Promise<T>): Promise<T> {
  const key = `${scope}:${id}`
  const previous = queues.get(key) ?? Promise.resolve()

  // The new promise resolves when `fn` settles (success or error). We chain
  // off `previous` so the next caller waits for the *previous* fn — but we
  // don't propagate the previous error to the new caller.
  const next = previous.then(
    () => fn(),
    () => fn()
  )

  // Store a never-rejecting handle so subsequent callers don't trip on error.
  // Keep the SAME reference we store so the finally below can identity-compare
  // against it (the old code re-created `next.catch(...)`, a fresh promise, so
  // the equality check always failed and the map was never pruned).
  const handle = next.catch(() => undefined)
  queues.set(key, handle)

  try {
    return await next
  } finally {
    // Delete the entry only if no later caller has queued behind us (which
    // would have replaced the stored handle). This bounds the map to the set
    // of ids with an in-flight save, instead of growing by O(unique ids) for
    // the lifetime of the app.
    if (queues.get(key) === handle) {
      queues.delete(key)
    }
  }
}

/** TEST ONLY — clear all queue state. */
export function _resetSaveQueueForTest(): void {
  queues.clear()
}

/** TEST ONLY — number of live queue entries (asserts cleanup bounds the map). */
export function _saveQueueSizeForTest(): number {
  return queues.size
}
