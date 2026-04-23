import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../storage/character-storage', () => ({
  loadCharacter: vi.fn(),
  saveCharacter: vi.fn()
}))

import { loadCharacter, saveCharacter } from '../storage/character-storage'
import { applyMutations, describeChange, isNegativeChange, parseStatChanges, stripStatChanges } from './stat-mutations'
import type { StatChange } from './types'

const mockLoadCharacter = vi.mocked(loadCharacter)
const mockSaveCharacter = vi.mocked(saveCharacter)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StatChange — type contract', () => {
  it('damage variant has type, value, and reason fields', () => {
    const change: StatChange = { type: 'damage', value: 10, damageType: 'fire', reason: 'fire breath' }
    expect(change.type).toBe('damage')
    expect(change.value).toBe(10)
    expect(change.reason).toBe('fire breath')
  })

  it('heal variant has type, value, and reason fields', () => {
    const change: StatChange = { type: 'heal', value: 8, reason: 'cure wounds' }
    expect(change.type).toBe('heal')
    expect(change.value).toBe(8)
  })

  it('add_condition variant has type, name, and reason fields', () => {
    const change: StatChange = { type: 'add_condition', name: 'Poisoned', reason: 'failed save' }
    expect(change.type).toBe('add_condition')
    expect(change.name).toBe('Poisoned')
  })

  it('expend_spell_slot variant has type, level, and reason fields', () => {
    const change: StatChange = { type: 'expend_spell_slot', level: 3, reason: 'fireball' }
    expect(change.type).toBe('expend_spell_slot')
    expect(change.level).toBe(3)
  })

  it('gold variant accepts all denominations', () => {
    const denominations = ['cp', 'sp', 'gp', 'pp', 'ep'] as const
    for (const denomination of denominations) {
      const change: StatChange = { type: 'gold', value: 10, denomination, reason: 'reward' }
      expect(change.denomination).toBe(denomination)
    }
  })

  it('npc_attitude variant accepts friendly, indifferent, and hostile attitudes', () => {
    const attitudes = ['friendly', 'indifferent', 'hostile'] as const
    for (const attitude of attitudes) {
      const change: StatChange = { type: 'npc_attitude', name: 'Guard', attitude, reason: 'interaction' }
      expect(change.attitude).toBe(attitude)
    }
  })

  it('creature_damage variant has targetLabel, value, and reason', () => {
    const change: StatChange = { type: 'creature_damage', targetLabel: 'Goblin 1', value: 5, reason: 'sword' }
    expect(change.targetLabel).toBe('Goblin 1')
    expect(change.value).toBe(5)
  })

  it('parseStatChanges result items satisfy StatChange type', () => {
    const response = `[STAT_CHANGES]
{"changes": [{"type": "damage", "value": 10, "reason": "fire breath"}]}
[/STAT_CHANGES]`
    const results = parseStatChanges(response)
    expect(results).toHaveLength(1)
    const change: StatChange = results[0]
    expect(change.type).toBe('damage')
  })
})

describe('parseStatChanges', () => {
  it('returns empty array when no tag present', () => {
    expect(parseStatChanges('Just some text')).toEqual([])
  })

  it('parses valid stat changes', () => {
    const response = `Some narrative text.
[STAT_CHANGES]
{"changes": [{"type": "damage", "value": 10, "reason": "fire breath"}]}
[/STAT_CHANGES]`
    const result = parseStatChanges(response)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('damage')
  })

  it('filters out invalid change objects', () => {
    const response = `[STAT_CHANGES]
{"changes": [{"type": "damage", "value": 10, "reason": "hit"}, "invalid", null]}
[/STAT_CHANGES]`
    const result = parseStatChanges(response)
    expect(result).toHaveLength(1)
  })

  it('returns empty array for malformed JSON', () => {
    const response = '[STAT_CHANGES]\nnot valid json\n[/STAT_CHANGES]'
    expect(parseStatChanges(response)).toEqual([])
  })

  it('returns empty array when changes is not an array', () => {
    const response = '[STAT_CHANGES]\n{"changes": "not array"}\n[/STAT_CHANGES]'
    expect(parseStatChanges(response)).toEqual([])
  })
})

describe('stripStatChanges', () => {
  it('removes stat changes block from text', () => {
    const text = 'Before. [STAT_CHANGES]\n{"changes":[]}\n[/STAT_CHANGES] After.'
    expect(stripStatChanges(text)).toBe('Before.After.')
  })

  it('returns original text when no tag present', () => {
    expect(stripStatChanges('Hello world')).toBe('Hello world')
  })

  it('handles multiple stat change blocks', () => {
    const text = 'A [STAT_CHANGES]x[/STAT_CHANGES] B [STAT_CHANGES]y[/STAT_CHANGES] C'
    const result = stripStatChanges(text)
    expect(result).not.toContain('STAT_CHANGES')
  })
})

describe('describeChange', () => {
  it('describes damage', () => {
    const result = describeChange({ type: 'damage', value: 10, damageType: 'fire', reason: 'fire breath' })
    expect(result).toContain('10')
    expect(result).toContain('fire')
    expect(result).toContain('fire breath')
  })

  it('describes heal', () => {
    const result = describeChange({ type: 'heal', value: 8, reason: 'cure wounds' })
    expect(result).toContain('Healed 8 HP')
    expect(result).toContain('cure wounds')
  })

  it('describes temp HP', () => {
    const result = describeChange({ type: 'temp_hp', value: 5, reason: 'false life' })
    expect(result).toContain('5 temporary HP')
  })

  it('describes add condition', () => {
    const result = describeChange({ type: 'add_condition', name: 'Poisoned', reason: 'failed save' })
    expect(result).toContain('Condition gained: Poisoned')
  })

  it('describes remove condition', () => {
    const result = describeChange({ type: 'remove_condition', name: 'Stunned', reason: 'saved' })
    expect(result).toContain('Condition removed: Stunned')
  })

  it('describes death save success', () => {
    const result = describeChange({ type: 'death_save', success: true, reason: 'rolled 15' })
    expect(result).toContain('success')
  })

  it('describes death save failure', () => {
    const result = describeChange({ type: 'death_save', success: false, reason: 'rolled 5' })
    expect(result).toContain('failure')
  })

  it('describes spell slot expenditure', () => {
    const result = describeChange({ type: 'expend_spell_slot', level: 3, reason: 'fireball' })
    expect(result).toContain('level 3')
    expect(result).toContain('expended')
  })

  it('describes spell slot restoration', () => {
    const result = describeChange({ type: 'restore_spell_slot', level: 1, reason: 'arcane recovery' })
    expect(result).toContain('level 1')
    expect(result).toContain('restored')
  })

  it('describes add item', () => {
    const result = describeChange({ type: 'add_item', name: 'Potion of Healing', quantity: 2, reason: 'loot' })
    expect(result).toContain('Gained: Potion of Healing')
    expect(result).toContain('x2')
  })

  it('describes remove item', () => {
    const result = describeChange({ type: 'remove_item', name: 'Arrow', quantity: 1, reason: 'used' })
    expect(result).toContain('Lost: Arrow')
  })

  it('describes gold gain', () => {
    const result = describeChange({ type: 'gold', value: 50, denomination: 'gp', reason: 'reward' })
    expect(result).toContain('+50 gp')
  })

  it('describes gold loss', () => {
    const result = describeChange({ type: 'gold', value: -25, denomination: 'gp', reason: 'purchase' })
    expect(result).toContain('-25 gp')
  })

  it('describes XP', () => {
    const result = describeChange({ type: 'xp', value: 200, reason: 'encounter' })
    expect(result).toContain('+200 XP')
  })

  it('describes class resource use', () => {
    const result = describeChange({ type: 'use_class_resource', name: 'Rage', reason: 'battle' })
    expect(result).toContain('Rage used')
  })

  it('describes class resource restore', () => {
    const result = describeChange({ type: 'restore_class_resource', name: 'Rage', reason: 'long rest' })
    expect(result).toContain('Rage restored')
  })

  it('describes heroic inspiration grant', () => {
    const result = describeChange({ type: 'heroic_inspiration', grant: true, reason: 'good roleplay' })
    expect(result).toContain('granted')
  })

  it('describes heroic inspiration used', () => {
    const result = describeChange({ type: 'heroic_inspiration', grant: false, reason: 'reroll' })
    expect(result).toContain('used')
  })

  it('describes hit dice change', () => {
    const result = describeChange({ type: 'hit_dice', value: -2, reason: 'short rest' })
    expect(result).toContain('-2')
  })

  it('describes NPC attitude', () => {
    const result = describeChange({
      type: 'npc_attitude',
      name: 'Bartender',
      attitude: 'hostile',
      reason: 'insult'
    })
    expect(result).toContain('Bartender')
    expect(result).toContain('hostile')
  })

  it('describes creature mutations', () => {
    expect(describeChange({ type: 'creature_damage', targetLabel: 'Goblin 1', value: 5, reason: 'sword' })).toContain(
      'Goblin 1'
    )
    expect(describeChange({ type: 'creature_heal', targetLabel: 'Goblin 1', value: 3, reason: 'potion' })).toContain(
      'healed'
    )
    expect(
      describeChange({
        type: 'creature_add_condition',
        targetLabel: 'Goblin 1',
        name: 'Prone',
        reason: 'tripped'
      })
    ).toContain('Prone')
    expect(
      describeChange({
        type: 'creature_remove_condition',
        targetLabel: 'Goblin 1',
        name: 'Prone',
        reason: 'stood up'
      })
    ).toContain('lost')
    expect(describeChange({ type: 'creature_kill', targetLabel: 'Goblin 1', reason: 'final blow' })).toContain('killed')
  })
})

describe('isNegativeChange', () => {
  it('identifies damage as negative', () => {
    expect(isNegativeChange({ type: 'damage', value: 10, reason: 'hit' })).toBe(true)
  })

  it('identifies heal as positive', () => {
    expect(isNegativeChange({ type: 'heal', value: 10, reason: 'cure' })).toBe(false)
  })

  it('identifies add condition as negative', () => {
    expect(isNegativeChange({ type: 'add_condition', name: 'Poisoned', reason: 'failed save' })).toBe(true)
  })

  it('identifies remove condition as positive', () => {
    expect(isNegativeChange({ type: 'remove_condition', name: 'Poisoned', reason: 'saved' })).toBe(false)
  })

  it('identifies death save failure as negative', () => {
    expect(isNegativeChange({ type: 'death_save', success: false, reason: 'rolled 5' })).toBe(true)
  })

  it('identifies death save success as positive', () => {
    expect(isNegativeChange({ type: 'death_save', success: true, reason: 'rolled 15' })).toBe(false)
  })

  it('identifies spell slot expenditure as negative', () => {
    expect(isNegativeChange({ type: 'expend_spell_slot', level: 3, reason: 'fireball' })).toBe(true)
  })

  it('identifies class resource use as negative', () => {
    expect(isNegativeChange({ type: 'use_class_resource', name: 'Rage', reason: 'battle' })).toBe(true)
  })

  it('identifies gold loss as negative', () => {
    expect(isNegativeChange({ type: 'gold', value: -50, reason: 'purchase' })).toBe(true)
  })

  it('identifies gold gain as positive', () => {
    expect(isNegativeChange({ type: 'gold', value: 50, reason: 'reward' })).toBe(false)
  })

  it('identifies hit dice loss as negative', () => {
    expect(isNegativeChange({ type: 'hit_dice', value: -2, reason: 'short rest' })).toBe(true)
  })

  it('identifies hostile NPC attitude as negative', () => {
    expect(isNegativeChange({ type: 'npc_attitude', name: 'Bartender', attitude: 'hostile', reason: 'insult' })).toBe(
      true
    )
  })

  it('identifies friendly NPC attitude as positive', () => {
    expect(isNegativeChange({ type: 'npc_attitude', name: 'Bartender', attitude: 'friendly', reason: 'gift' })).toBe(
      false
    )
  })

  it('identifies creature damage as negative', () => {
    expect(isNegativeChange({ type: 'creature_damage', targetLabel: 'Goblin', value: 5, reason: 'hit' })).toBe(true)
  })

  it('identifies creature kill as negative', () => {
    expect(isNegativeChange({ type: 'creature_kill', targetLabel: 'Goblin', reason: 'killed' })).toBe(true)
  })
})

describe('applyMutations', () => {
  function makeCharacter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'char1',
      hitPoints: { current: 30, maximum: 50, temporary: 5 },
      conditions: [],
      deathSaves: { successes: 0, failures: 0 },
      spellSlotLevels: { 1: { current: 3, max: 4 }, 2: { current: 2, max: 3 } },
      equipment: [{ name: 'Potion of Healing', quantity: 2 }],
      treasure: { gp: 100, sp: 50, cp: 10, pp: 0, ep: 0 },
      classResources: [{ name: 'Rage', current: 3, max: 3 }],
      heroicInspiration: false,
      hitDice: [{ current: 5, maximum: 5, dieType: 12 }],
      xp: 0,
      level: 5,
      ...overrides
    }
  }

  it('applies damage (absorbed by temp HP first)', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    const result = await applyMutations('char1', [{ type: 'damage', value: 8, reason: 'hit' }])
    expect(result.applied).toHaveLength(1)
    expect(result.rejected).toHaveLength(0)
    expect((char.hitPoints as { temporary: number }).temporary).toBe(0)
    expect((char.hitPoints as { current: number }).current).toBe(27)
  })

  it('rejects damage with non-positive value', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })

    const result = await applyMutations('char1', [{ type: 'damage', value: 0, reason: 'miss' }])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('Damage must be positive')
  })

  it('applies healing (caps at max HP)', async () => {
    const char = makeCharacter({ hitPoints: { current: 45, maximum: 50, temporary: 0 } })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    const result = await applyMutations('char1', [{ type: 'heal', value: 10, reason: 'cure wounds' }])
    expect(result.applied).toHaveLength(1)
    expect((char.hitPoints as { current: number }).current).toBe(50)
  })

  it('resets death saves when healed from 0 HP', async () => {
    const char = makeCharacter({
      hitPoints: { current: 0, maximum: 50, temporary: 0 },
      deathSaves: { successes: 2, failures: 1 }
    })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'heal', value: 5, reason: 'spare the dying' }])
    expect((char.deathSaves as { successes: number }).successes).toBe(0)
    expect((char.deathSaves as { failures: number }).failures).toBe(0)
  })

  it('applies temp HP (takes highest)', async () => {
    const char = makeCharacter({ hitPoints: { current: 30, maximum: 50, temporary: 5 } })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'temp_hp', value: 10, reason: 'false life' }])
    expect((char.hitPoints as { temporary: number }).temporary).toBe(10)
  })

  it('does not downgrade temp HP', async () => {
    const char = makeCharacter({ hitPoints: { current: 30, maximum: 50, temporary: 15 } })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'temp_hp', value: 5, reason: 'heroism' }])
    expect((char.hitPoints as { temporary: number }).temporary).toBe(15)
  })

  it('adds and removes conditions', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'add_condition', name: 'Poisoned', reason: 'failed save' }])
    expect((char.conditions as Array<{ name: string }>).some((c) => c.name === 'Poisoned')).toBe(true)

    await applyMutations('char1', [{ type: 'remove_condition', name: 'Poisoned', reason: 'saved' }])
    expect((char.conditions as Array<{ name: string }>).some((c) => c.name === 'Poisoned')).toBe(false)
  })

  it('rejects duplicate condition', async () => {
    const char = makeCharacter({ conditions: [{ name: 'Poisoned', type: 'condition', isCustom: false }] })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })

    const result = await applyMutations('char1', [{ type: 'add_condition', name: 'Poisoned', reason: 'again' }])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('Already has condition')
  })

  it('rejects removing a condition not present', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })

    const result = await applyMutations('char1', [{ type: 'remove_condition', name: 'Stunned', reason: 'save' }])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('Does not have condition')
  })

  it('expends and restores spell slots', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'expend_spell_slot', level: 1, reason: 'magic missile' }])
    const slots = char.spellSlotLevels as Record<number, { current: number; max: number }>
    expect(slots[1].current).toBe(2)

    await applyMutations('char1', [{ type: 'restore_spell_slot', level: 1, reason: 'arcane recovery' }])
    expect(slots[1].current).toBe(3)
  })

  it('rejects expending empty spell slot', async () => {
    const char = makeCharacter({
      spellSlotLevels: { 1: { current: 0, max: 4 } }
    })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })

    const result = await applyMutations('char1', [{ type: 'expend_spell_slot', level: 1, reason: 'magic missile' }])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('No remaining spell slots')
  })

  it('adds and removes items', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'add_item', name: 'Rope', quantity: 1, reason: 'found' }])
    const equipment = char.equipment as Array<{ name: string; quantity: number }>
    expect(equipment.find((e) => e.name === 'Rope')).toBeTruthy()

    await applyMutations('char1', [{ type: 'remove_item', name: 'Rope', quantity: 1, reason: 'used' }])
    // After remove_item, char.equipment is reassigned to a new filtered array
    const updatedEquipment = char.equipment as Array<{ name: string; quantity: number }>
    expect(updatedEquipment.find((e) => e.name === 'Rope')).toBeFalsy()
  })

  it('stacks existing item quantity', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'add_item', name: 'Potion of Healing', quantity: 3, reason: 'bought' }])
    const equipment = char.equipment as Array<{ name: string; quantity: number }>
    const potion = equipment.find((e) => e.name === 'Potion of Healing')
    expect(potion?.quantity).toBe(5)
  })

  it('applies gold changes', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'gold', value: 50, denomination: 'gp', reason: 'reward' }])
    expect((char.treasure as Record<string, number>).gp).toBe(150)
  })

  it('rejects gold loss exceeding current balance', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })

    const result = await applyMutations('char1', [
      { type: 'gold', value: -200, denomination: 'gp', reason: 'too expensive' }
    ])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('Not enough gp')
  })

  it('applies heroic inspiration', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'heroic_inspiration', grant: true, reason: 'roleplay' }])
    expect(char.heroicInspiration).toBe(true)
  })

  it('rejects all changes when character not found', async () => {
    mockLoadCharacter.mockResolvedValue({ success: false })

    const result = await applyMutations('missing', [{ type: 'damage', value: 10, reason: 'hit' }])
    expect(result.applied).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('Character not found')
  })

  it('does not save when no changes are applied', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockClear()

    await applyMutations('char1', [{ type: 'damage', value: 0, reason: 'miss' }])
    expect(mockSaveCharacter).not.toHaveBeenCalled()
  })

  it('sets updatedAt when changes are applied', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'damage', value: 5, reason: 'hit' }])
    expect(char.updatedAt).toBeTruthy()
  })

  it('applies death save success and failure', async () => {
    const char = makeCharacter({
      hitPoints: { current: 0, maximum: 50, temporary: 0 }
    })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'death_save', success: true, reason: 'rolled 12' }])
    expect((char.deathSaves as { successes: number }).successes).toBe(1)

    await applyMutations('char1', [{ type: 'death_save', success: false, reason: 'rolled 5' }])
    expect((char.deathSaves as { failures: number }).failures).toBe(1)
  })

  it('caps death saves at 3', async () => {
    const char = makeCharacter({
      hitPoints: { current: 0, maximum: 50, temporary: 0 },
      deathSaves: { successes: 3, failures: 3 }
    })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'death_save', success: true, reason: 'rolled 12' }])
    expect((char.deathSaves as { successes: number }).successes).toBe(3)
  })

  it('rejects XP with non-positive value', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })

    const result = await applyMutations('char1', [{ type: 'xp', value: 0, reason: 'nothing' }])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('XP must be positive')
  })

  it('applies XP gain', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'xp', value: 500, reason: 'encounter' }])
    expect(char.xp).toBe(500)
  })

  it('uses and restores class resources', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'use_class_resource', name: 'Rage', reason: 'battle' }])
    const resources = char.classResources as Array<{ name: string; current: number }>
    expect(resources.find((r) => r.name === 'Rage')?.current).toBe(2)

    await applyMutations('char1', [{ type: 'restore_class_resource', name: 'Rage', reason: 'long rest' }])
    expect(resources.find((r) => r.name === 'Rage')?.current).toBe(3)
  })

  it('rejects using class resource with insufficient amount', async () => {
    const char = makeCharacter({
      classResources: [{ name: 'Rage', current: 0, max: 3 }]
    })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })

    const result = await applyMutations('char1', [{ type: 'use_class_resource', name: 'Rage', reason: 'battle' }])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('Not enough Rage')
  })

  it('rejects unknown class resource', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })

    const result = await applyMutations('char1', [{ type: 'use_class_resource', name: 'Nonexistent', reason: 'test' }])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('Class resource not found')
  })

  it('handles hit dice spend and restore', async () => {
    const char = makeCharacter()
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    mockSaveCharacter.mockResolvedValue({ success: true })

    await applyMutations('char1', [{ type: 'hit_dice', value: -2, reason: 'short rest' }])
    const hitDice = char.hitDice as Array<{ current: number }>
    expect(hitDice[0].current).toBe(3)

    await applyMutations('char1', [{ type: 'hit_dice', value: 1, reason: 'long rest' }])
    expect(hitDice[0].current).toBe(4)
  })

  it('rejects hit dice spend exceeding remaining', async () => {
    const char = makeCharacter({
      hitDice: [{ current: 1, maximum: 5, dieType: 12 }]
    })
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })

    const result = await applyMutations('char1', [{ type: 'hit_dice', value: -3, reason: 'short rest' }])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('Not enough hit dice')
  })
})
