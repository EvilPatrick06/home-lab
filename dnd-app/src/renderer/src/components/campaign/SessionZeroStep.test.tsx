// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionZeroData } from './SessionZeroStep'
import SessionZeroStep, { DEFAULT_SESSION_ZERO } from './SessionZeroStep'

function setup(over: Partial<SessionZeroData> = {}) {
  const onChange = vi.fn()
  render(
    <SessionZeroStep
      data={{ ...DEFAULT_SESSION_ZERO, ...over }}
      onChange={onChange}
      customRules={[]}
      onRulesChange={() => {}}
    />
  )
  return { onChange }
}

describe('SessionZeroStep (PHASE-32 32C)', () => {
  it('renders Lines, Veils and the X-Card toggle', () => {
    setup()
    expect(screen.getByText('Lines (hard boundaries)')).toBeTruthy()
    expect(screen.getByText('Veils (off-screen only)')).toBeTruthy()
    expect(screen.getByText('Enable X-Card')).toBeTruthy()
  })

  it('adding a custom line writes `lines` and empties legacy `contentLimits`', () => {
    const { onChange } = setup({ contentLimits: ['Old'] })
    const input = screen.getByPlaceholderText('Add custom limit...')
    fireEvent.change(input, { target: { value: 'Necromancy' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalled()
    const arg = onChange.mock.calls[0][0] as SessionZeroData
    expect(arg.lines).toContain('Necromancy')
    expect(arg.lines).toContain('Old') // legacy contentLimits migrated into lines
    expect(arg.contentLimits).toEqual([])
  })

  it('adding a custom veil writes `veils`', () => {
    const { onChange } = setup()
    const input = screen.getByPlaceholderText('Add custom veil...')
    fireEvent.change(input, { target: { value: 'Romance' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const arg = onChange.mock.calls[0][0] as SessionZeroData
    expect(arg.veils).toContain('Romance')
  })

  it('checking a common topic as a Line removes it from Veils (mutual exclusion, lines win)', () => {
    const { onChange } = setup({ veils: ['Torture'] })
    // The first "Torture" checkbox belongs to the Lines grid (rendered first).
    const tortureChecks = screen.getAllByLabelText('Torture')
    fireEvent.click(tortureChecks[0])
    const arg = onChange.mock.calls[0][0] as SessionZeroData
    expect(arg.lines).toContain('Torture')
    expect(arg.veils).not.toContain('Torture')
  })

  it('toggles xCardEnabled', () => {
    const { onChange } = setup()
    const row = screen.getByText('Enable X-Card').parentElement?.parentElement
    const toggle = row?.querySelector('button')
    expect(toggle).toBeTruthy()
    fireEvent.click(toggle as HTMLButtonElement)
    const arg = onChange.mock.calls[0][0] as SessionZeroData
    expect(arg.xCardEnabled).toBe(true)
  })
})
