import { describe, expect, it } from 'vitest'
import { stripHtmlToFixedPoint } from './strip-html'

describe('stripHtmlToFixedPoint (sub-phase 43F — convergent importer sanitization)', () => {
  it('leaves well-formed plain text unchanged', () => {
    const s = 'A longsword deals 1d8 slashing damage. Versatile (1d10).'
    expect(stripHtmlToFixedPoint(s)).toBe(s)
  })

  it('strips a single well-formed tag, matching the old single-pass output', () => {
    expect(stripHtmlToFixedPoint('<p>Fireball</p> burns')).toBe('Fireball burns')
    expect(stripHtmlToFixedPoint('Cast <strong>Shield</strong> as a reaction')).toBe('Cast Shield as a reaction')
  })

  it('converges on overlapping nested tags a single pass would re-expose', () => {
    // A single `.replace(/<[^>]*>/g,'')` pass leaves a residual `<b>`/`<i>` tag
    // ('<<b>>x<<i>>' -> '<b>x<i>'). The fixed-point loop guarantees no `<...>`
    // pattern survives. (Stray bare '>' chars are harmless — they are not tags.)
    const out = stripHtmlToFixedPoint('<<b>>x<<i>>')
    expect(out).not.toMatch(/<[^>]*>/)
    expect(out).not.toContain('<b>')
    expect(out).not.toContain('<i>')
    expect(out).toContain('x')
  })

  it('converges on a nested-tag XSS attempt, leaving no surviving script tag', () => {
    // One pass: '<scr<script>ipt>alert(1)</scr</script>ipt>' -> '<script>alert(1)</script>'.
    // The loop removes the re-formed tags so no executable `<script>` survives.
    const out = stripHtmlToFixedPoint('<scr<script>ipt>alert(1)</scr</script>ipt>')
    expect(out).not.toMatch(/<[^>]*>/)
    expect(out).not.toContain('<script>')
    expect(out).not.toContain('</script>')
    expect(out).toContain('alert(1)')
  })

  it('handles the empty string', () => {
    expect(stripHtmlToFixedPoint('')).toBe('')
  })
})
