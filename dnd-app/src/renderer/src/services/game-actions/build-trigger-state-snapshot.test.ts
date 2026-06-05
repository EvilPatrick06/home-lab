import { describe, expect, it } from 'vitest'
import type { GameStoreState } from '../../stores/game/types'
import { buildTriggerStateSnapshot } from './build-trigger-state-snapshot'

const state = {
  triggers: [
    {
      id: 't',
      name: 'x',
      event: 'combat_start',
      condition: {},
      action: 'narrate',
      actionPayload: {},
      enabled: true,
      oneShot: false
    }
  ],
  initiative: { entries: [{ entityId: 'e1', isActive: true }], currentIndex: 0, round: 2 },
  maps: [
    {
      id: 'm',
      tokens: [{ entityId: 'e1', currentHP: 10, maxHP: 20, gridX: 1, gridY: 2, conditions: ['poisoned', 'prone'] }]
    }
  ],
  turnMode: 'initiative',
  round: 2,
  ambientLight: 'dim',
  inGameTime: { totalSeconds: 3600 }
} as unknown as GameStoreState

describe('buildTriggerStateSnapshot', () => {
  it('maps initiative entries down to {entityId,isActive}', () => {
    expect(buildTriggerStateSnapshot(state).initiative).toEqual({
      entries: [{ entityId: 'e1', isActive: true }],
      currentIndex: 0,
      round: 2
    })
  })

  it('flattens token conditions into {entityId,condition}[]', () => {
    expect(buildTriggerStateSnapshot(state).conditions).toEqual([
      { entityId: 'e1', condition: 'poisoned' },
      { entityId: 'e1', condition: 'prone' }
    ])
  })

  it('projects tokens to the HP/grid subset + passes through environment', () => {
    const s = buildTriggerStateSnapshot(state)
    expect(s.maps[0].tokens[0]).toEqual({ entityId: 'e1', currentHP: 10, maxHP: 20, gridX: 1, gridY: 2 })
    expect(s.turnMode).toBe('initiative')
    expect(s.ambientLight).toBe('dim')
    expect(s.inGameTime).toEqual({ totalSeconds: 3600 })
  })

  it('keeps null initiative null', () => {
    expect(buildTriggerStateSnapshot({ ...state, initiative: null } as unknown as GameStoreState).initiative).toBeNull()
  })
})
