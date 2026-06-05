import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: vi.fn() } }] }
}))
vi.mock('../log', () => ({ logToFile: vi.fn() }))

import {
  type GameStateSnapshot,
  isTriggerObserverEnabled,
  processStateUpdate,
  setTriggerObserverEnabled
} from './ai-trigger-observer'

function snap(over: Partial<GameStateSnapshot> = {}): GameStateSnapshot {
  return {
    triggers: [],
    initiative: null,
    maps: [],
    conditions: [],
    turnMode: 'free',
    round: 0,
    ambientLight: 'bright',
    inGameTime: null,
    ...over
  }
}

const hpTrigger: GameStateSnapshot['triggers'][number] = {
  id: 't1',
  name: 'Bloodied',
  event: 'hp_threshold',
  condition: { threshold: 50 },
  action: 'narrate',
  actionPayload: { text: 'The beast falters!' },
  enabled: true,
  oneShot: false
}

const tokenMap = (currentHP: number): GameStateSnapshot['maps'] => [
  { id: 'm', tokens: [{ entityId: 'e', currentHP, maxHP: 100, gridX: 0, gridY: 0 }] }
]

describe('ai-trigger-observer', () => {
  beforeEach(() => {
    // Reset module state (previousState/combatWasActive) then re-enable.
    setTriggerObserverEnabled(false)
    setTriggerObserverEnabled(true)
  })

  it('is enabled by default after reset', () => {
    expect(isTriggerObserverEnabled()).toBe(true)
  })

  it('returns [] when disabled (hard stop)', () => {
    setTriggerObserverEnabled(false)
    expect(processStateUpdate(snap({ triggers: [hpTrigger], maps: tokenMap(10) }))).toEqual([])
  })

  it('fires an hp_threshold trigger on the crossing transition, once (edge-detected)', () => {
    // First push above threshold → establishes previous state, no fire.
    expect(processStateUpdate(snap({ triggers: [hpTrigger], maps: tokenMap(80) }))).toEqual([])
    // Drop below 50% → fires.
    expect(processStateUpdate(snap({ triggers: [hpTrigger], maps: tokenMap(40) })).map((r) => r.triggerId)).toEqual([
      't1'
    ])
    // Still below → no new transition → does NOT re-fire (loop-safe).
    expect(processStateUpdate(snap({ triggers: [hpTrigger], maps: tokenMap(35) }))).toEqual([])
  })

  it('never fires a disabled trigger', () => {
    const disabled = { ...hpTrigger, enabled: false }
    processStateUpdate(snap({ triggers: [disabled], maps: tokenMap(80) }))
    expect(processStateUpdate(snap({ triggers: [disabled], maps: tokenMap(40) }))).toEqual([])
  })

  it('fires combat_start on the transition into initiative', () => {
    const t: GameStateSnapshot['triggers'][number] = {
      id: 'c1',
      name: 'Battle begins',
      event: 'combat_start',
      condition: {},
      action: 'play_sound',
      actionPayload: { soundId: 'combat_start' },
      enabled: true,
      oneShot: false
    }
    const inCombat = snap({
      triggers: [t],
      turnMode: 'initiative',
      initiative: { entries: [{ entityId: 'e', isActive: true }], currentIndex: 0, round: 1 }
    })
    processStateUpdate(snap({ triggers: [t] })) // free → establishes baseline
    expect(processStateUpdate(inCombat).map((r) => r.triggerId)).toEqual(['c1'])
  })
})
