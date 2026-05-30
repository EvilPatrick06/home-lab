import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Phase 34k — CI gate for the i18n sweep. Runs `scripts/i18n/check-keys.mjs`,
 * which flattens `en.json` and scans the renderer source for static
 * `t('…')` / `i18n.t('…')` calls, failing if any referenced key is missing.
 * Catches a typo'd key or an un-added string (which would render the raw key
 * at runtime). The script is the single source of truth; this test just gates it.
 */
describe('i18n key-check (Phase 34k)', () => {
  it('every static t() / i18n.t() key resolves in en.json', () => {
    const script = resolve(__dirname, '../../../../scripts/i18n/check-keys.mjs')
    // execFileSync throws on a non-zero exit (i.e. missing keys), failing the test.
    const out = execFileSync('node', [script], { encoding: 'utf8' })
    expect(out).toContain('every static t() / i18n.t() key resolves')
  })
})
