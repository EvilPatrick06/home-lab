/**
 * Phase 20g — forward renderer-side security events to the main-process audit
 * log.
 *
 * `logSecurityEvent` (main/security-log.ts) writes to `userData/logs/app.log`
 * under the `[SECURITY]` level, but it's main-process only. Renderer-side
 * security events — a DM kicking/banning a peer, or an inbound network message
 * failing structural validation — had no path to it (the gap LOG-11/20g
 * flagged). This helper bridges that over the `LOG_SECURITY_EVENT` IPC channel.
 *
 * It is deliberately fire-and-forget and defensive:
 *  - auditing must never block or break the network path, so the returned
 *    promise is ignored and any rejection is swallowed;
 *  - it's a no-op when the preload bridge is absent (unit tests running in the
 *    node / happy-dom env without `window.api`).
 */
export function auditSecurityEvent(event: string, details: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return
  try {
    window.api?.logSecurityEvent?.(event, details)?.catch(() => {
      /* best-effort audit — ignore transport errors */
    })
  } catch {
    /* window.api missing / not yet wired — ignore */
  }
}
