import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import type { MonsterAutomationConfig } from '../../types/campaign'
import { useGameStore } from './index'

const CFG: MonsterAutomationConfig = { autoRun: true, autoRunMaxInt: 7, autoAdvance: true, flavorNarration: false }

describe('automation-slice (PHASE-30 30D)', () => {
  beforeEach(() => useGameStore.getState().setMonsterAutomation(null))

  it('defaults monsterAutomation to null (fully disabled)', () => {
    expect(useGameStore.getState().monsterAutomation).toBeNull()
  })

  it('setMonsterAutomation stores then clears the config', () => {
    useGameStore.getState().setMonsterAutomation(CFG)
    expect(useGameStore.getState().monsterAutomation).toEqual(CFG)
    useGameStore.getState().setMonsterAutomation(null)
    expect(useGameStore.getState().monsterAutomation).toBeNull()
  })

  it('round-trips through loadGameState; an absent field leaves it unchanged', () => {
    useGameStore.getState().loadGameState({ monsterAutomation: CFG } as never)
    expect(useGameStore.getState().monsterAutomation).toEqual(CFG)
    // A save with no monsterAutomation key must NOT wipe an existing config (conditional spread).
    useGameStore.getState().loadGameState({} as never)
    expect(useGameStore.getState().monsterAutomation).toEqual(CFG)
  })
})
