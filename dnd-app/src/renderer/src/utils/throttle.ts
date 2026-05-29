/**
 * Phase 22k — leading-edge + trailing-call throttle.
 *
 * The returned function invokes `fn` immediately on the first call, then at most
 * once per `ms` window. A call made during the cooldown schedules a single
 * trailing invocation with the latest args when the window elapses.
 *
 * `cancel()` drops any pending trailing call (use on unmount/teardown).
 * `ms <= 0` short-circuits to a plain pass-through.
 *
 * Distinct from debounce (which delays until calls stop) — do not swap them.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic callback signature needs any[] args
export type ThrottledFn<T extends (...args: any[]) => void> = T & { cancel: () => void }

// biome-ignore lint/suspicious/noExplicitAny: generic callback signature needs any[] args
export function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): ThrottledFn<T> {
  if (ms <= 0) {
    const passthrough = ((...args: Parameters<T>) => fn(...args)) as ThrottledFn<T>
    passthrough.cancel = () => {}
    return passthrough
  }

  let lastRun = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingArgs: Parameters<T> | null = null

  const throttled = ((...args: Parameters<T>) => {
    const now = Date.now()
    const remaining = ms - (now - lastRun)
    if (remaining <= 0) {
      lastRun = now
      fn(...args)
    } else {
      // Within the cooldown — remember the latest args for one trailing call.
      pendingArgs = args
      if (!timer) {
        timer = setTimeout(() => {
          lastRun = Date.now()
          timer = null
          if (pendingArgs) {
            const a = pendingArgs
            pendingArgs = null
            fn(...a)
          }
        }, remaining)
      }
    }
  }) as ThrottledFn<T>

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pendingArgs = null
  }

  return throttled
}
