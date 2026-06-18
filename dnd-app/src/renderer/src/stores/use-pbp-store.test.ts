// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { usePbpStore } from './use-pbp-store'

beforeEach(() => {
  localStorage.clear()
  usePbpStore.setState({ autoAdvance: false, lastStatus: null })
})

describe('use-pbp-store (PHASE-36 36E)', () => {
  it('autoAdvance defaults to false', () => {
    expect(usePbpStore.getState().autoAdvance).toBe(false)
  })

  it('setAutoAdvance persists to localStorage', () => {
    usePbpStore.getState().setAutoAdvance(true)
    expect(usePbpStore.getState().autoAdvance).toBe(true)
    expect(localStorage.getItem('dnd-vtt-pbp-auto-advance')).toBe('true')
  })

  it('lastStatus is volatile (not persisted)', () => {
    usePbpStore.getState().setLastStatus({ active: true, turnIndex: 2, round: 1, scene: 'Crypt', campaignId: 'c1' })
    expect(usePbpStore.getState().lastStatus?.turnIndex).toBe(2)
    expect(localStorage.getItem('dnd-vtt-pbp-last-status')).toBeNull()
    usePbpStore.getState().setLastStatus(null)
    expect(usePbpStore.getState().lastStatus).toBeNull()
  })
})
