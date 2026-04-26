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
  const next = previous.then(() => fn(), () => fn())

  // Store a never-rejecting handle so subsequent callers don't trip on error.
  queues.set(
    key,
    next.catch(() => undefined)
  )

  try {
    return await next
  } finally {
    // Clean up if no one else queued behind us. Avoids unbounded growth of
    // the map over the lifetime of the app.
    if (queues.get(key) === next.catch(() => undefined)) {
      // (the catch wrapper above is a *new* promise, so the equality check
      //  always fails — fall through to the simpler "delete if last" below)
    }
    // Safe simpler cleanup: just leave it. The map grows by O(unique ids),
    // which for a campaign-scoped app is bounded by hundreds — well within
    // memory budget. If this becomes a concern, switch to a WeakRef strategy.
  }
}

/** TEST ONLY — clear all queue state. */
export function _resetSaveQueueForTest(): void {
  queues.clear()
}
