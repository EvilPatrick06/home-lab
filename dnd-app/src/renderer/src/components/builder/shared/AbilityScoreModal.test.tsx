// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBuilderStore } from '../../../stores/use-builder-store'
import AbilityScoreModal from './AbilityScoreModal'

beforeEach(() => {
  vi.stubGlobal('window', { ...globalThis.window, api: { storage: {}, game: {} } })
  useBuilderStore.getState().resetBuilder()
  useBuilderStore.getState().setAbilityScoreMethod('custom')
})

describe('AbilityScoreModal', () => {
  it('can be imported', async () => {
    const mod = await import('./AbilityScoreModal')
    expect(mod).toBeDefined()
  })

  it('clamps an over-max custom value (999) to 20', () => {
    render(<AbilityScoreModal />)
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    fireEvent.change(inputs[0], { target: { value: '999' } })
    expect(useBuilderStore.getState().abilityScores.strength).toBe(20)
  })

  it('never snaps a negative custom value to an arbitrary default — stays within [1,20]', () => {
    render(<AbilityScoreModal />)
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    fireEvent.change(inputs[0], { target: { value: '-5' } })
    const v = useBuilderStore.getState().abilityScores.strength
    expect(v).toBeGreaterThanOrEqual(1)
    expect(v).toBeLessThanOrEqual(20)
  })
})
