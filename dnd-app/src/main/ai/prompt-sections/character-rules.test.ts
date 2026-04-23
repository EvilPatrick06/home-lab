import { describe, expect, it } from 'vitest'
import type { CreatureMutationEvent, StatChangeEvent, StatChangeSet } from './character-rules'
import { CHARACTER_RULES_PROMPT } from './character-rules'

describe('character-rules', () => {
  // ── CHARACTER_RULES_PROMPT ──

  describe('CHARACTER_RULES_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof CHARACTER_RULES_PROMPT).toBe('string')
      expect(CHARACTER_RULES_PROMPT.length).toBeGreaterThan(100)
    })

    // ── Hit Points Section ──

    it('contains hit point tracking rules', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('Hit Points')
      expect(CHARACTER_RULES_PROMPT).toContain('Track HP changes accurately')
      expect(CHARACTER_RULES_PROMPT).toContain('temporary HP')
      expect(CHARACTER_RULES_PROMPT).toContain('Massive damage rule')
    })

    // ── Spellcasting Section ──

    it('contains spellcasting rules', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('Spellcasting')
      expect(CHARACTER_RULES_PROMPT).toContain('spell slot availability')
      expect(CHARACTER_RULES_PROMPT).toContain('concentration')
      expect(CHARACTER_RULES_PROMPT).toContain('ritual casting')
    })

    it('contains one spell per turn rule', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('One Spell with a Spell Slot per Turn')
    })

    it('contains armor casting restriction', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('Casting in Armor')
    })

    it('contains warlock pact magic rules', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('Warlock Pact Magic')
      expect(CHARACTER_RULES_PROMPT).toContain('Short Rest')
      expect(CHARACTER_RULES_PROMPT).toContain('Pact Magic slots are separate')
    })

    // ── Proficiencies Section ──

    it('contains proficiency rules', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('Proficiencies')
      expect(CHARACTER_RULES_PROMPT).toContain('ability scores and modifiers')
      expect(CHARACTER_RULES_PROMPT).toContain('proficiency bonus')
      expect(CHARACTER_RULES_PROMPT).toContain('expertise')
    })

    // ── Combat Section ──

    it('contains combat rules', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('Combat')
      expect(CHARACTER_RULES_PROMPT).toContain('attack bonus')
      expect(CHARACTER_RULES_PROMPT).toContain('AC based on equipped armor')
      expect(CHARACTER_RULES_PROMPT).toContain('conditions')
    })

    // ── Class Resources Section ──

    it('contains class resource tracking', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('Class Resources')
      expect(CHARACTER_RULES_PROMPT).toContain('rage')
      expect(CHARACTER_RULES_PROMPT).toContain('ki points')
      expect(CHARACTER_RULES_PROMPT).toContain('sorcery points')
      expect(CHARACTER_RULES_PROMPT).toContain('bardic inspiration')
    })

    // ── Stat Change Tracking Format ──

    it('contains STAT_CHANGES block format', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('[STAT_CHANGES]')
      expect(CHARACTER_RULES_PROMPT).toContain('[/STAT_CHANGES]')
    })

    it('defines all player stat change types', () => {
      const playerTypes = [
        'damage',
        'heal',
        'temp_hp',
        'add_condition',
        'remove_condition',
        'death_save',
        'reset_death_saves',
        'expend_spell_slot',
        'restore_spell_slot',
        'add_item',
        'remove_item',
        'gold',
        'xp',
        'use_class_resource',
        'restore_class_resource',
        'heroic_inspiration',
        'hit_dice'
      ]
      for (const t of playerTypes) {
        expect(CHARACTER_RULES_PROMPT).toContain(`**${t}**`)
      }
    })

    it('defines all creature mutation types', () => {
      const creatureTypes = [
        'creature_damage',
        'creature_heal',
        'creature_add_condition',
        'creature_remove_condition',
        'creature_kill'
      ]
      for (const t of creatureTypes) {
        expect(CHARACTER_RULES_PROMPT).toContain(`**${t}**`)
      }
    })

    it('contains example with mixed player and creature changes', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('"type": "damage"')
      expect(CHARACTER_RULES_PROMPT).toContain('"type": "creature_damage"')
      expect(CHARACTER_RULES_PROMPT).toContain('"type": "creature_kill"')
    })

    // ── Difficulty Classes ──

    it('contains difficulty class table', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('Difficulty Classes')
      expect(CHARACTER_RULES_PROMPT).toContain('DC 5')
      expect(CHARACTER_RULES_PROMPT).toContain('Very Easy')
      expect(CHARACTER_RULES_PROMPT).toContain('DC 30')
      expect(CHARACTER_RULES_PROMPT).toContain('Nearly Impossible')
    })

    // ── Stat Change Rules ──

    it('contains rules for when to emit stat changes', () => {
      expect(CHARACTER_RULES_PROMPT).toContain('Only emit this block when events ACTUALLY OCCUR')
      expect(CHARACTER_RULES_PROMPT).toContain('characterId')
    })
  })

  // ── Type Exports ──

  describe('StatChangeEvent type', () => {
    it('allows creating valid stat change events', () => {
      const event: StatChangeEvent = {
        type: 'damage',
        value: 10,
        damageType: 'fire',
        reason: 'fireball'
      }
      expect(event.type).toBe('damage')
      expect(event.value).toBe(10)
    })

    it('supports all stat change event types', () => {
      const types: StatChangeEvent['type'][] = [
        'damage',
        'heal',
        'temp_hp',
        'add_condition',
        'remove_condition',
        'death_save',
        'reset_death_saves',
        'expend_spell_slot',
        'restore_spell_slot',
        'add_item',
        'remove_item',
        'gold',
        'xp',
        'use_class_resource',
        'restore_class_resource',
        'heroic_inspiration',
        'hit_dice'
      ]
      expect(types).toHaveLength(17)
    })

    it('supports optional fields', () => {
      const event: StatChangeEvent = {
        type: 'add_item',
        name: 'Longsword',
        quantity: 1,
        description: 'A fine steel longsword',
        reason: 'looted from goblin'
      }
      expect(event.name).toBe('Longsword')
      expect(event.quantity).toBe(1)
    })
  })

  describe('CreatureMutationEvent type', () => {
    it('allows creating creature mutation events', () => {
      const event: CreatureMutationEvent = {
        type: 'creature_damage',
        targetLabel: 'Goblin 1',
        value: 8,
        damageType: 'slashing',
        reason: "fighter's attack"
      }
      expect(event.targetLabel).toBe('Goblin 1')
      expect(event.value).toBe(8)
    })
  })

  describe('StatChangeSet type', () => {
    it('allows creating a set of mixed changes', () => {
      const set: StatChangeSet = {
        changes: [
          { type: 'damage', value: 5, reason: 'goblin hit' },
          { type: 'creature_damage', targetLabel: 'Wolf', value: 10, reason: 'sword strike' }
        ]
      }
      expect(set.changes).toHaveLength(2)
    })
  })
})
