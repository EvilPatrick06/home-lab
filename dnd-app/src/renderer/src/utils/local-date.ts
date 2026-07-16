/**
 * Local calendar date helpers.
 *
 * `new Date().toISOString().slice(0, 10)` yields the UTC date, so for a user
 * west of UTC an evening action (e.g. 8pm MDT = next-day 02:00 UTC) is stamped
 * with TOMORROW's date — user-facing export filenames, the chat-transcript
 * header, and prefilled milestone dates all disagreed with the local clock.
 * These helpers use LOCAL date parts so user-facing dates match the wall clock.
 * (ISSUES-LOG-DNDAPP 2026-07-15)
 */

/** LOCAL calendar date as `YYYY-MM-DD` (zero-padded), NOT the UTC toISOString slice. */
export function localDateStamp(d: Date = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
