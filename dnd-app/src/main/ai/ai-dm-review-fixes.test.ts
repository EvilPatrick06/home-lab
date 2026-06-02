import { describe, expect, it } from 'vitest'
import { repairJson, validateDmAction } from './ai-schemas'
import { parseDmActions } from './dm-actions'
import { parseStatChanges } from './stat-mutations'

// Regression tests for the AI-DM deep-review P1 correctness fixes.
describe('AI-DM review fixes (P1)', () => {
  it('repairJson preserves // inside a JSON string value (string-aware)', () => {
    const input = '{"changes": [{"type": "loot", "item": "Scroll, // ancient"}]}'
    expect(JSON.parse(repairJson(input))).toEqual({ changes: [{ type: 'loot', item: 'Scroll, // ancient' }] })
  })

  it('repairJson still strips a genuine trailing // comment', () => {
    const input = '{"action": "next_turn"} // trailing note'
    expect(JSON.parse(repairJson(input))).toEqual({ action: 'next_turn' })
  })

  it('validateDmAction accepts light_source / extinguish_source (were silently dropped)', () => {
    expect(validateDmAction({ action: 'light_source', entityName: 'Aria', sourceName: 'torch' }).success).toBe(true)
    expect(validateDmAction({ action: 'extinguish_source', entityName: 'Aria' }).success).toBe(true)
  })

  it('parses actions from MULTIPLE [DM_ACTIONS] blocks', () => {
    const r = `Combat!
[DM_ACTIONS]
{"actions": [{"action": "next_turn"}]}
[/DM_ACTIONS]
More narration.
[DM_ACTIONS]
{"actions": [{"action": "end_initiative"}]}
[/DM_ACTIONS]`
    expect(parseDmActions(r).map((a) => a.action)).toEqual(['next_turn', 'end_initiative'])
  })

  it('parses changes from MULTIPLE [STAT_CHANGES] blocks', () => {
    const r = `[STAT_CHANGES]
{"changes": [{"type": "damage", "characterName": "Aria", "value": 5, "reason": "trap"}]}
[/STAT_CHANGES]
narration
[STAT_CHANGES]
{"changes": [{"type": "heal", "characterName": "Bron", "value": 3, "reason": "potion"}]}
[/STAT_CHANGES]`
    expect(parseStatChanges(r).map((c) => c.type)).toEqual(['damage', 'heal'])
  })
})
