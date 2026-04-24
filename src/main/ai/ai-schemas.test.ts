import { describe, expect, it } from 'vitest'
import {
  StatChangeSchema,
  repairJson,
  validateDmActions,
  validateDmAction,
  validateStatChanges
} from './ai-schemas'

// ── repairJson ──

describe('repairJson', () => {
  it('strips markdown code fences with json tag', () => {
    const input = '```json\n{"changes": []}\n```'
    expect(repairJson(input)).toBe('{"changes": []}')
  })

  it('strips markdown code fences without language tag', () => {
    const input = '```\n{"actions": []}\n```'
    expect(repairJson(input)).toBe('{"actions": []}')
  })

  it('removes trailing commas before closing bracket', () => {
    const input = '{"actions": [{"action": "next_turn"},]}'
    expect(JSON.parse(repairJson(input))).toEqual({ actions: [{ action: 'next_turn' }] })
  })

  it('removes trailing commas before closing brace', () => {
    const input = '{"action": "next_turn", "label": "test",}'
    expect(JSON.parse(repairJson(input))).toEqual({ action: 'next_turn', label: 'test' })
  })

  it('removes single-line JS comments after commas', () => {
    const input = '{"actions": [\n  {"action": "next_turn"}, // advance\n  {"action": "end_initiative"}\n]}'
    const result = JSON.parse(repairJson(input))
    expect(result.actions).toHaveLength(2)
  })

  it('removes full-line comments', () => {
    const input = '// AI generated actions\n{"actions": []}'
    expect(JSON.parse(repairJson(input))).toEqual({ actions: [] })
  })

  it('handles combined issues: fences + trailing commas + comments', () => {
    const input = '```json\n{\n  // actions list\n  "actions": [\n    {"action": "next_turn"},\n  ]\n}\n```'
    const result = JSON.parse(repairJson(input))
    expect(result.actions).toHaveLength(1)
  })

  it('passes through valid JSON unchanged', () => {
    const input = '{"changes": [{"type": "damage", "value": 5}]}'
    expect(repairJson(input)).toBe(input)
  })
})

// ── StatChange schema validation ──

describe('validateStatChanges', () => {
  it('validates a correct damage change', () => {
    const { valid, issues } = validateStatChanges([
      { type: 'damage', characterName: 'Aria', value: 7, damageType: 'slashing', reason: 'goblin hit' }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
    expect(valid[0].type).toBe('damage')
  })

  it('validates a correct heal change', () => {
    const { valid, issues } = validateStatChanges([
      { type: 'heal', value: 10, reason: 'cure wounds' }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('rejects damage with missing reason', () => {
    const { valid, issues } = validateStatChanges([
      { type: 'damage', value: 5 }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
    expect(issues[0].errors.some((e) => e.includes('reason'))).toBe(true)
  })

  it('rejects damage with non-numeric value', () => {
    const { valid, issues } = validateStatChanges([
      { type: 'damage', value: 'five', reason: 'test' }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('rejects unknown change type', () => {
    const { valid, issues } = validateStatChanges([
      { type: 'teleport', reason: 'magic' }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('validates mixed valid and invalid changes', () => {
    const { valid, issues } = validateStatChanges([
      { type: 'damage', value: 7, reason: 'hit' },
      { type: 'invalid_type', value: 1 },
      { type: 'heal', value: 5, reason: 'potion' },
      { type: 'gold', value: -10, reason: 'purchase' }
    ])
    expect(valid).toHaveLength(3)
    expect(issues).toHaveLength(1)
    expect(issues[0].index).toBe(1)
  })

  it('validates all stat change types', () => {
    const validChanges = [
      { type: 'damage', value: 5, reason: 'test' },
      { type: 'heal', value: 5, reason: 'test' },
      { type: 'temp_hp', value: 5, reason: 'test' },
      { type: 'add_condition', name: 'poisoned', reason: 'test' },
      { type: 'remove_condition', name: 'poisoned', reason: 'test' },
      { type: 'death_save', success: true, reason: 'test' },
      { type: 'reset_death_saves', reason: 'test' },
      { type: 'expend_spell_slot', level: 3, reason: 'test' },
      { type: 'restore_spell_slot', level: 2, reason: 'test' },
      { type: 'add_item', name: 'Sword', reason: 'test' },
      { type: 'remove_item', name: 'Sword', reason: 'test' },
      { type: 'gold', value: 50, reason: 'test' },
      { type: 'xp', value: 100, reason: 'test' },
      { type: 'use_class_resource', name: 'Ki', reason: 'test' },
      { type: 'restore_class_resource', name: 'Ki', reason: 'test' },
      { type: 'heroic_inspiration', grant: true, reason: 'test' },
      { type: 'hit_dice', value: -1, reason: 'test' },
      { type: 'npc_attitude', name: 'Guard', attitude: 'friendly', reason: 'test' },
      { type: 'set_ability_score', ability: 'str', value: 18, reason: 'test' },
      { type: 'grant_feature', name: 'Darkvision', reason: 'test' },
      { type: 'revoke_feature', name: 'Darkvision', reason: 'test' },
      { type: 'creature_damage', targetLabel: 'Goblin 1', value: 5, reason: 'test' },
      { type: 'creature_heal', targetLabel: 'Goblin 1', value: 5, reason: 'test' },
      { type: 'creature_add_condition', targetLabel: 'Goblin 1', name: 'prone', reason: 'test' },
      { type: 'creature_remove_condition', targetLabel: 'Goblin 1', name: 'prone', reason: 'test' },
      { type: 'creature_kill', targetLabel: 'Goblin 1', reason: 'test' }
    ]
    const { valid, issues } = validateStatChanges(validChanges)
    expect(issues).toHaveLength(0)
    expect(valid).toHaveLength(validChanges.length)
  })

  it('validates gold denomination enum', () => {
    const { valid } = validateStatChanges([
      { type: 'gold', value: 10, denomination: 'pp', reason: 'reward' }
    ])
    expect(valid).toHaveLength(1)

    const { issues } = validateStatChanges([
      { type: 'gold', value: 10, denomination: 'diamonds', reason: 'reward' }
    ])
    expect(issues).toHaveLength(1)
  })

  it('validates ability score enum', () => {
    const { valid } = validateStatChanges([
      { type: 'set_ability_score', ability: 'cha', value: 20, reason: 'boon' }
    ])
    expect(valid).toHaveLength(1)

    const { issues } = validateStatChanges([
      { type: 'set_ability_score', ability: 'charisma', value: 20, reason: 'boon' }
    ])
    expect(issues).toHaveLength(1)
  })
})

// ── DM Action schema validation ──

describe('validateDmActions', () => {
  it('validates a correct place_token action', () => {
    const { valid, issues } = validateDmActions([
      { action: 'place_token', label: 'Goblin 1', entityType: 'enemy', gridX: 5, gridY: 3, hp: 7, ac: 15 }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('rejects place_token with missing required fields', () => {
    const { valid, issues } = validateDmActions([
      { action: 'place_token', label: 'Goblin 1' }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('rejects place_token with invalid entityType', () => {
    const { valid, issues } = validateDmActions([
      { action: 'place_token', label: 'Goblin', entityType: 'monster', gridX: 5, gridY: 3 }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('validates move_token action', () => {
    const { valid, issues } = validateDmActions([
      { action: 'move_token', label: 'Goblin 1', gridX: 10, gridY: 10 }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates start_initiative with entries', () => {
    const { valid, issues } = validateDmActions([{
      action: 'start_initiative',
      entries: [
        { label: 'Goblin 1', roll: 14, modifier: 2, entityType: 'enemy' },
        { label: 'Aria', roll: 18, modifier: 3, entityType: 'player' }
      ]
    }])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('rejects start_initiative with malformed entries', () => {
    const { valid, issues } = validateDmActions([{
      action: 'start_initiative',
      entries: [{ label: 'Goblin 1' }]
    }])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('validates environment actions', () => {
    const { valid, issues } = validateDmActions([
      { action: 'set_ambient_light', level: 'dim' },
      { action: 'set_underwater_combat', enabled: true },
      { action: 'set_travel_pace', pace: 'slow' }
    ])
    expect(valid).toHaveLength(3)
    expect(issues).toHaveLength(0)
  })

  it('rejects set_ambient_light with invalid level', () => {
    const { issues } = validateDmActions([
      { action: 'set_ambient_light', level: 'dark' }
    ])
    expect(issues).toHaveLength(1)
  })

  it('validates parameterless actions', () => {
    const { valid, issues } = validateDmActions([
      { action: 'next_turn' },
      { action: 'end_initiative' },
      { action: 'close_shop' },
      { action: 'stop_timer' },
      { action: 'stop_ambient' },
      { action: 'clear_weather' }
    ])
    expect(valid).toHaveLength(6)
    expect(issues).toHaveLength(0)
  })

  it('rejects objects without action field', () => {
    const { valid, issues } = validateDmActions([
      { type: 'damage', value: 5 }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('rejects unknown action types', () => {
    const { valid, issues } = validateDmActions([
      { action: 'teleport_party', destination: 'moon' }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('passes through plugin-prefixed actions without schema validation', () => {
    const { valid, issues } = validateDmActions([
      { action: 'plugin:custom-action', data: 'anything' }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates mixed valid and invalid actions', () => {
    const { valid, issues } = validateDmActions([
      { action: 'next_turn' },
      { action: 'place_token' },
      { action: 'set_ambient_light', level: 'bright' },
      { action: 'unknown_action' }
    ])
    expect(valid).toHaveLength(2)
    expect(issues).toHaveLength(2)
  })

  it('validates shop actions', () => {
    const { valid, issues } = validateDmActions([{
      action: 'open_shop',
      name: 'Ye Olde Shoppe',
      items: [{
        name: 'Longsword',
        category: 'weapon',
        price: { gp: 15 },
        quantity: 3
      }]
    }])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates area effect action', () => {
    const { valid, issues } = validateDmActions([{
      action: 'apply_area_effect',
      shape: 'sphere',
      originX: 10,
      originY: 10,
      radiusOrLength: 4,
      damageFormula: '8d6',
      damageType: 'fire',
      saveType: 'dex',
      saveDC: 15,
      halfOnSave: true
    }])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates advance_time action', () => {
    const { valid, issues } = validateDmActions([
      { action: 'advance_time', hours: 8 }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates whisper_player action', () => {
    const { valid, issues } = validateDmActions([
      { action: 'whisper_player', playerName: 'Aria', message: 'You notice a hidden door.' }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })
})

// ── validateDmAction (single item) ──

describe('validateDmAction', () => {
  it('returns success for valid action', () => {
    const result = validateDmAction({ action: 'next_turn' })
    expect(result.success).toBe(true)
  })

  it('returns failure for null', () => {
    const result = validateDmAction(null)
    expect(result.success).toBe(false)
  })

  it('returns failure for non-object', () => {
    const result = validateDmAction('next_turn')
    expect(result.success).toBe(false)
  })

  it('returns failure for numeric action', () => {
    const result = validateDmAction({ action: 42 })
    expect(result.success).toBe(false)
  })
})

// ── StatChangeSchema direct ──

describe('StatChangeSchema', () => {
  it('parses a valid creature_kill', () => {
    const result = StatChangeSchema.safeParse({
      type: 'creature_kill',
      targetLabel: 'Wolf 1',
      reason: 'arrows'
    })
    expect(result.success).toBe(true)
  })

  it('fails for missing targetLabel on creature_damage', () => {
    const result = StatChangeSchema.safeParse({
      type: 'creature_damage',
      value: 10,
      reason: 'sword'
    })
    expect(result.success).toBe(false)
  })
})
