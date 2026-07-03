// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { describe, expect, it } from 'vitest'
import ShortcutReferenceModal from '../components/game/modals/utility/ShortcutReferenceModal'
import CombatLogPanel from '../components/game/sidebar/CombatLogPanel'

expect.extend(toHaveNoViolations)

// Real-component a11y coverage (suggestions-log 2026-06-29). The seed harness
// (a11y-smoke.test.tsx) only exercised a synthetic fragment; this renders
// genuine high-traffic components and asserts against a TRIAGED baseline so the
// guard catches NEW regressions without being blocked by pre-existing issues.
//
// Baseline policy: each component asserts an EXACT set of pre-existing violation
// rule ids (empty when clean). A newly-introduced violation whose rule id is not
// in the baseline fails the test; fixing a baselined violation (shrinking the
// set) also fails, prompting the baseline to be tightened. Pre-existing
// violations found here should be filed in ISSUES-LOG-DNDAPP.md as follow-ups.

/** Assert axe violations for `container` match exactly the triaged `baseline`. */
async function expectAxeBaseline(container: HTMLElement, baseline: string[]): Promise<void> {
  const results = await axe(container)
  const found = results.violations.map((v) => v.id).sort()
  expect(found).toEqual([...baseline].sort())
}

describe('a11y — real high-traffic components (triaged baseline)', () => {
  it('ShortcutReferenceModal has no NEW axe violations', async () => {
    const { container } = render(<ShortcutReferenceModal onClose={() => {}} />)
    // Triaged baseline for the shortcut reference modal. Currently clean.
    await expectAxeBaseline(container, [])
  })

  it('CombatLogPanel has no NEW axe violations', async () => {
    const { container } = render(<CombatLogPanel onClose={() => {}} />)
    // Triaged baseline for the combat-log sidebar panel. Currently clean.
    await expectAxeBaseline(container, [])
  })
})
