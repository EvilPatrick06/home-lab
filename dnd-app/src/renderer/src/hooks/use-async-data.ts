import { type DependencyList, useEffect, useState } from 'react'

export interface AsyncDataState<T> {
  /** The resolved value, or `undefined` before the first successful load. */
  data: T | undefined
  /** True while a load is in flight (including a dep-triggered reload). */
  loading: boolean
  /** The rejection from the most recent load, if it failed. */
  error: Error | undefined
}

/**
 * Run an async `loader` on mount and whenever `deps` change, with automatic
 * cancellation. A stale in-flight result is dropped (its state write is guarded
 * by an `active` flag), and the loader is handed an `AbortSignal` it MAY honor
 * (e.g. pass to `fetch`); loaders that ignore the signal are still protected by
 * the guard. Prior `data` is kept during a reload (stale-while-revalidate) so
 * the UI doesn't flash empty.
 *
 * Replaces the repeated ad-hoc `useEffect(() => { let cancelled = false; ... })`
 * loader pattern. `deps` follows the exact same contract as `useEffect`'s deps.
 */
export function useAsyncData<T>(loader: (signal: AbortSignal) => Promise<T>, deps: DependencyList): AsyncDataState<T> {
  const [state, setState] = useState<AsyncDataState<T>>({
    data: undefined,
    loading: true,
    error: undefined
  })

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState((prev) => ({ data: prev.data, loading: true, error: undefined }))
    loader(controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: undefined })
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return
        setState({ data: undefined, loading: false, error: err instanceof Error ? err : new Error(String(err)) })
      })
    return () => {
      active = false
      controller.abort()
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs only on the caller-supplied deps (same contract as useEffect); the loader is read fresh each run by design.
  }, deps)

  return state
}
