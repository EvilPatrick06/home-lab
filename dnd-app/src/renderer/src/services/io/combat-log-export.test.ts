import { describe, expect, it } from 'vitest'
import type { CombatLogEntry } from '../../types/game-state'
import { exportCombatLogText } from './combat-log-export'

describe('combat-log-export', () => {
  it('returns placeholder when no entries', () => {
    expect(exportCombatLogText([])).toContain('No combat log')
  })

  it('includes description for an entry', () => {
    const e: CombatLogEntry = {
      id: '1',
      timestamp: Date.now(),
      round: 1,
      type: 'attack',
      description: 'Longsword hit',
      sourceEntityId: 'a',
      sourceEntityName: 'Hero',
      targetEntityId: 'b',
      targetEntityName: 'Goblin',
      value: 5,
      damageType: 'slashing'
    }
    const t = exportCombatLogText([e])
    expect(t).toContain('Longsword hit')
  })
})
