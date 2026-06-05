import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DM_ACTION_SCHEMAS,
  repairJson,
  StatChangeSchema,
  validateDmAction,
  validateDmActions,
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
    const { valid, issues } = validateStatChanges([{ type: 'heal', value: 10, reason: 'cure wounds' }])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('rejects damage with missing reason', () => {
    const { valid, issues } = validateStatChanges([{ type: 'damage', value: 5 }])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
    expect(issues[0].errors.some((e) => e.includes('reason'))).toBe(true)
  })

  it('rejects damage with non-numeric value', () => {
    const { valid, issues } = validateStatChanges([{ type: 'damage', value: 'five', reason: 'test' }])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('rejects unknown change type', () => {
    const { valid, issues } = validateStatChanges([{ type: 'teleport', reason: 'magic' }])
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
    const { valid } = validateStatChanges([{ type: 'gold', value: 10, denomination: 'pp', reason: 'reward' }])
    expect(valid).toHaveLength(1)

    const { issues } = validateStatChanges([{ type: 'gold', value: 10, denomination: 'diamonds', reason: 'reward' }])
    expect(issues).toHaveLength(1)
  })

  it('validates add_exhaustion stat change', () => {
    const { valid, issues } = validateStatChanges([
      { type: 'add_exhaustion', characterName: 'Aria', levels: 2, reason: 'forced march' }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('rejects add_exhaustion without levels', () => {
    const { issues } = validateStatChanges([{ type: 'add_exhaustion', characterName: 'Aria', reason: 'x' }])
    expect(issues).toHaveLength(1)
  })

  it('validates ability score enum', () => {
    const { valid } = validateStatChanges([{ type: 'set_ability_score', ability: 'cha', value: 20, reason: 'boon' }])
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
    const { valid, issues } = validateDmActions([{ action: 'place_token', label: 'Goblin 1' }])
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
    const { valid, issues } = validateDmActions([{ action: 'move_token', label: 'Goblin 1', gridX: 10, gridY: 10 }])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates start_initiative with entries', () => {
    const { valid, issues } = validateDmActions([
      {
        action: 'start_initiative',
        entries: [
          { label: 'Goblin 1', roll: 14, modifier: 2, entityType: 'enemy' },
          { label: 'Aria', roll: 18, modifier: 3, entityType: 'player' }
        ]
      }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('rejects start_initiative with malformed entries', () => {
    const { valid, issues } = validateDmActions([
      {
        action: 'start_initiative',
        entries: [{ label: 'Goblin 1' }]
      }
    ])
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
    const { issues } = validateDmActions([{ action: 'set_ambient_light', level: 'dark' }])
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
    const { valid, issues } = validateDmActions([{ type: 'damage', value: 5 }])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('rejects unknown action types', () => {
    const { valid, issues } = validateDmActions([{ action: 'teleport_party', destination: 'moon' }])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('passes through plugin-prefixed actions without schema validation', () => {
    const { valid, issues } = validateDmActions([{ action: 'plugin:custom-action', data: 'anything' }])
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
    const { valid, issues } = validateDmActions([
      {
        action: 'open_shop',
        name: 'Ye Olde Shoppe',
        items: [
          {
            name: 'Longsword',
            category: 'weapon',
            price: { gp: 15 },
            quantity: 3
          }
        ]
      }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates area effect action', () => {
    const { valid, issues } = validateDmActions([
      {
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
      }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates query_aoe preview action', () => {
    const { valid, issues } = validateDmActions([
      { action: 'query_aoe', shape: 'cone', originX: 5, originY: 5, radiusOrLength: 15, direction: 90 }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates cast_spell action with area + duration', () => {
    const { valid, issues } = validateDmActions([
      {
        action: 'cast_spell',
        spellName: 'Spirit Guardians',
        caster: 'Cleric',
        targetX: 8,
        targetY: 8,
        shape: 'emanation',
        radiusOrLength: 15,
        saveType: 'wis',
        saveDC: 14,
        damageFormula: '3d8',
        damageType: 'radiant',
        halfOnSave: true,
        duration: 'concentration'
      }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates end_spell action', () => {
    const { valid, issues } = validateDmActions([{ action: 'end_spell', spellName: 'Entangle', caster: 'Druid' }])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('validates darkness-zone actions', () => {
    const { valid, issues } = validateDmActions([
      { action: 'add_darkness_zone', x: 5, y: 6, radius: 20, magicLevel: 'deeper-darkness' },
      { action: 'update_darkness_zone', zoneId: 'z1', radius: 40 },
      { action: 'remove_darkness_zone', zoneId: 'z1' }
    ])
    expect(valid).toHaveLength(3)
    expect(issues).toHaveLength(0)
  })

  it('rejects add_darkness_zone with invalid magicLevel', () => {
    const { valid, issues } = validateDmActions([
      { action: 'add_darkness_zone', x: 0, y: 0, radius: 5, magicLevel: 'pitch' }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('validates terrain actions', () => {
    const { valid, issues } = validateDmActions([
      { action: 'place_terrain', gridX: 3, gridY: 4, type: 'hazard', hazardType: 'fire', hazardDamage: 6 },
      {
        action: 'place_terrain',
        gridX: 1,
        gridY: 1,
        type: 'portal',
        portalTarget: { mapId: 'm2', gridX: 0, gridY: 0 }
      },
      { action: 'remove_terrain', gridX: 3, gridY: 4 }
    ])
    expect(valid).toHaveLength(3)
    expect(issues).toHaveLength(0)
  })

  it('rejects place_terrain with invalid type', () => {
    const { valid, issues } = validateDmActions([{ action: 'place_terrain', gridX: 0, gridY: 0, type: 'lava' }])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('validates environmental-effect actions', () => {
    const { valid, issues } = validateDmActions([
      { action: 'add_environmental_effect', name: 'Extreme Cold', saveDC: 10, category: 'weather' },
      { action: 'remove_environmental_effect', name: 'Extreme Cold' }
    ])
    expect(valid).toHaveLength(2)
    expect(issues).toHaveLength(0)
  })

  it('validates disease + curse actions', () => {
    const { valid, issues } = validateDmActions([
      { action: 'apply_disease', targetLabel: 'Fighter', name: 'Sewer Plague' },
      { action: 'record_disease_save', targetLabel: 'Fighter', success: true },
      { action: 'remove_disease', targetLabel: 'Fighter' },
      { action: 'apply_curse', targetLabel: 'Rogue', name: 'Bestow Curse', source: 'Hag' },
      { action: 'remove_curse', targetLabel: 'Rogue' }
    ])
    expect(valid).toHaveLength(5)
    expect(issues).toHaveLength(0)
  })

  it('rejects record_disease_save without success boolean', () => {
    const { valid, issues } = validateDmActions([{ action: 'record_disease_save', targetLabel: 'Fighter' }])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('validates trap actions', () => {
    const { valid, issues } = validateDmActions([
      { action: 'place_trap', name: 'Poison Dart', gridX: 4, gridY: 5 },
      { action: 'reveal_trap', gridX: 4, gridY: 5 },
      { action: 'trigger_trap', name: 'Poison Dart' },
      { action: 'remove_trap', name: 'Poison Dart' }
    ])
    expect(valid).toHaveLength(4)
    expect(issues).toHaveLength(0)
  })

  it('validates award_treasure action', () => {
    const { valid, issues } = validateDmActions([
      { action: 'award_treasure', characterNames: ['Aria', 'Thorin'], type: 'hoard', crTier: '5-10' }
    ])
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('rejects award_treasure with an invalid crTier', () => {
    const { valid, issues } = validateDmActions([
      { action: 'award_treasure', characterNames: ['Aria'], type: 'hoard', crTier: '99+' }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('validates downtime actions', () => {
    const { valid, issues } = validateDmActions([
      {
        action: 'start_downtime',
        characterName: 'Aria',
        activityId: 'crafting',
        activityName: 'Crafting',
        daysRequired: 7,
        goldRequired: 15
      },
      { action: 'advance_downtime', characterName: 'Aria', days: 3 }
    ])
    expect(valid).toHaveLength(2)
    expect(issues).toHaveLength(0)
  })

  it('rejects start_downtime without daysRequired', () => {
    const { valid, issues } = validateDmActions([
      { action: 'start_downtime', characterName: 'Aria', activityId: 'x', activityName: 'X' }
    ])
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })

  it('validates advance_time action', () => {
    const { valid, issues } = validateDmActions([{ action: 'advance_time', hours: 8 }])
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

// ── DM action schema ↔ executor contract ──
// CI guardrail: every validated DM action MUST have an executor case and vice
// versa, so a new schema can't ship without an implementation (and an executor
// case can't exist without validation). Reads the renderer executor by path +
// regex; a sanity assertion guards against a broken read silently passing.
describe('DM action schema ↔ executor contract', () => {
  const executorCases = (() => {
    const path = resolve(__dirname, '../../renderer/src/services/game-action-executor.ts')
    const code = readFileSync(path, 'utf-8')
    return new Set([...code.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]))
  })()
  const schemaKeys = Object.keys(DM_ACTION_SCHEMAS)

  it('sanity: extracted a plausible set of executor cases (read not broken)', () => {
    expect(executorCases.size).toBeGreaterThan(40)
    expect(executorCases.has('place_creature')).toBe(true)
  })

  it('every DM_ACTION_SCHEMAS action has an executor case', () => {
    const missing = schemaKeys.filter((k) => !executorCases.has(k))
    expect(missing).toEqual([])
  })

  it('every executor case has a DM_ACTION_SCHEMAS schema', () => {
    const missing = [...executorCases].filter((c) => !schemaKeys.includes(c))
    expect(missing).toEqual([])
  })
})

describe('place_creature requires a name or id (Phase contract)', () => {
  const base = { action: 'place_creature' as const, gridX: 1, gridY: 2 }

  it('rejects when neither creatureName nor creatureId is given', () => {
    expect(validateDmAction({ ...base }).success).toBe(false)
  })

  it('accepts with creatureName alone', () => {
    expect(validateDmAction({ ...base, creatureName: 'Goblin' }).success).toBe(true)
  })

  it('accepts with creatureId alone', () => {
    expect(validateDmAction({ ...base, creatureId: 'mon-123' }).success).toBe(true)
  })
})
