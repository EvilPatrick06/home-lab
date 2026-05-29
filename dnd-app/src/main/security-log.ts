import { logToFile } from './log'

/**
 * Phase 20g — central security audit logger.
 *
 * Routes notable security events to the main log file (`userData/logs/app.log`)
 * under the `SECURITY` level, so they're greppable (`grep '\[SECURITY\]'`) and
 * inherit the existing size-based rotation in `log.ts`. There is no separate
 * security log file or independent rotation — one destination keeps the audit
 * trail next to the surrounding context.
 *
 * Details are JSON-stringified and capped at 4KB so a hostile/oversized payload
 * can't bloat the log.
 */
const MAX_DETAILS_BYTES = 4 * 1024

export function logSecurityEvent(event: string, details: Record<string, unknown> = {}): void {
  let detailsStr: string
  try {
    detailsStr = JSON.stringify(details)
  } catch {
    detailsStr = '{"error":"unserializable details"}'
  }
  if (detailsStr.length > MAX_DETAILS_BYTES) {
    detailsStr = `${detailsStr.slice(0, MAX_DETAILS_BYTES)}…(truncated)`
  }
  logToFile('SECURITY', `${event} ${detailsStr}`)
}
