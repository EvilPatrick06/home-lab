// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { describe, expect, it } from 'vitest'

expect.extend(toHaveNoViolations)

// Automated a11y regression guard (suggestions-log 2026-06-23). This is the
// non-blocking seed: it proves the jest-axe + vitest + happy-dom harness runs
// and asserts zero violations. Expand coverage to high-traffic components
// (modals, the game table, character sheet, settings panels) incrementally —
// gate on NEW violations once the existing baseline is triaged.
describe('a11y smoke (jest-axe harness)', () => {
  it('reports zero axe violations for an accessible fragment', async () => {
    const { container } = render(
      <main>
        <h1>Settings</h1>
        <label htmlFor="display-name">Display name</label>
        <input id="display-name" name="display-name" />
        <button type="button">Save</button>
      </main>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
