/**
 * Convergent HTML-tag stripping for importer description text.
 *
 * Imported description strings come from remote, untrusted sources (D&D Beyond /
 * Foundry VTT actor JSON). A single-pass `.replace(/<[^>]*>/g, '')` is incomplete
 * multi-character sanitization (CodeQL js/incomplete-multi-character-sanitization):
 * one pass can re-expose a tag from overlapping/nested input, e.g.
 *   `<<b>>`              → `<b>`            (one pass)
 *   `<scr<script>ipt>`   → `<script>`       (one pass)
 *
 * Running the strip to a fixed point closes that gap: we keep replacing until the
 * string stops changing, so no nested or overlapping `<...>` can survive. For
 * well-formed input (no nesting) the result is identical to the single pass.
 */

const HTML_TAG_RE = /<[^>]*>/g

export function stripHtmlToFixedPoint(input: string): string {
  let s = input
  let prev: string
  do {
    prev = s
    s = s.replace(HTML_TAG_RE, '')
  } while (s !== prev)
  return s
}
