import { describe, expect, it } from 'vitest'
import { DM_SYSTEM_PROMPT, DM_TOOLBOX_CONTEXT, PLANAR_RULES_CONTEXT } from './dm-system-prompt'

describe('dm-system-prompt', () => {
  // ── DM_SYSTEM_PROMPT ──

  describe('DM_SYSTEM_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof DM_SYSTEM_PROMPT).toBe('string')
      expect(DM_SYSTEM_PROMPT.length).toBeGreaterThan(100)
    })

    it('contains narrative voice rules', () => {
      expect(DM_SYSTEM_PROMPT).toContain('NARRATIVE VOICE')
      expect(DM_SYSTEM_PROMPT).toContain('second person present tense')
    })

    it('contains rules reference instructions', () => {
      expect(DM_SYSTEM_PROMPT).toContain('Rules Reference')
      expect(DM_SYSTEM_PROMPT).toContain('2024 PHB rules')
    })

    it('contains character sheet enforcement', () => {
      expect(DM_SYSTEM_PROMPT).toContain('Character Sheet Enforcement')
      expect(DM_SYSTEM_PROMPT).toContain('Hit Points')
      expect(DM_SYSTEM_PROMPT).toContain('Spellcasting')
      expect(DM_SYSTEM_PROMPT).toContain('Proficiencies')
    })

    it('contains stat change tracking format', () => {
      expect(DM_SYSTEM_PROMPT).toContain('[STAT_CHANGES]')
      expect(DM_SYSTEM_PROMPT).toContain('[/STAT_CHANGES]')
      expect(DM_SYSTEM_PROMPT).toContain('"type": "damage"')
    })

    it('defines all stat change types', () => {
      const expectedTypes = [
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
      for (const type of expectedTypes) {
        expect(DM_SYSTEM_PROMPT).toContain(`**${type}**`)
      }
    })

    it('contains creature mutation types', () => {
      expect(DM_SYSTEM_PROMPT).toContain('creature_damage')
      expect(DM_SYSTEM_PROMPT).toContain('creature_heal')
      expect(DM_SYSTEM_PROMPT).toContain('creature_add_condition')
      expect(DM_SYSTEM_PROMPT).toContain('creature_remove_condition')
      expect(DM_SYSTEM_PROMPT).toContain('creature_kill')
    })

    it('contains DM actions format', () => {
      expect(DM_SYSTEM_PROMPT).toContain('[DM_ACTIONS]')
      expect(DM_SYSTEM_PROMPT).toContain('[/DM_ACTIONS]')
      expect(DM_SYSTEM_PROMPT).toContain('place_token')
      expect(DM_SYSTEM_PROMPT).toContain('start_initiative')
    })

    it('contains combat reference rules', () => {
      expect(DM_SYSTEM_PROMPT).toContain('Unarmed Strike')
      expect(DM_SYSTEM_PROMPT).toContain('Death Saving Throws')
      expect(DM_SYSTEM_PROMPT).toContain('Concentration')
      expect(DM_SYSTEM_PROMPT).toContain('Exhaustion')
    })

    it('contains difficulty class table', () => {
      expect(DM_SYSTEM_PROMPT).toContain('DC 5')
      expect(DM_SYSTEM_PROMPT).toContain('DC 10')
      expect(DM_SYSTEM_PROMPT).toContain('DC 15')
      expect(DM_SYSTEM_PROMPT).toContain('DC 20')
      expect(DM_SYSTEM_PROMPT).toContain('DC 25')
      expect(DM_SYSTEM_PROMPT).toContain('DC 30')
    })

    it('contains NPC attitude tracking', () => {
      expect(DM_SYSTEM_PROMPT).toContain('NPC Attitude Tracking')
      expect(DM_SYSTEM_PROMPT).toContain('Friendly')
      expect(DM_SYSTEM_PROMPT).toContain('Indifferent')
      expect(DM_SYSTEM_PROMPT).toContain('Hostile')
    })

    it('contains file reading instructions', () => {
      expect(DM_SYSTEM_PROMPT).toContain('[FILE_READ]')
      expect(DM_SYSTEM_PROMPT).toContain('[/FILE_READ]')
    })

    it('contains web search instructions', () => {
      expect(DM_SYSTEM_PROMPT).toContain('[WEB_SEARCH]')
      expect(DM_SYSTEM_PROMPT).toContain('[/WEB_SEARCH]')
    })

    it('contains sound and ambient instructions', () => {
      expect(DM_SYSTEM_PROMPT).toContain('sound_effect')
      expect(DM_SYSTEM_PROMPT).toContain('play_ambient')
      expect(DM_SYSTEM_PROMPT).toContain('stop_ambient')
      expect(DM_SYSTEM_PROMPT).toContain('ambient-tavern')
      expect(DM_SYSTEM_PROMPT).toContain('ambient-dungeon')
    })

    it('contains time management actions', () => {
      expect(DM_SYSTEM_PROMPT).toContain('advance_time')
      expect(DM_SYSTEM_PROMPT).toContain('set_time')
      expect(DM_SYSTEM_PROMPT).toContain('share_time')
    })

    it('contains rest actions', () => {
      expect(DM_SYSTEM_PROMPT).toContain('short_rest')
      expect(DM_SYSTEM_PROMPT).toContain('long_rest')
    })

    it('contains bastion management actions', () => {
      expect(DM_SYSTEM_PROMPT).toContain('bastion_advance_time')
      expect(DM_SYSTEM_PROMPT).toContain('bastion_issue_order')
      expect(DM_SYSTEM_PROMPT).toContain('bastion_deposit_gold')
    })

    it('contains rule citation format', () => {
      expect(DM_SYSTEM_PROMPT).toContain('[RULE_CITATION')
      expect(DM_SYSTEM_PROMPT).toContain('[/RULE_CITATION]')
    })

    it('contains NPC relationship tracking', () => {
      expect(DM_SYSTEM_PROMPT).toContain('log_npc_interaction')
      expect(DM_SYSTEM_PROMPT).toContain('set_npc_relationship')
    })

    it('contains exploration and travel rules', () => {
      expect(DM_SYSTEM_PROMPT).toContain('Travel Pace')
      expect(DM_SYSTEM_PROMPT).toContain('Navigation')
      expect(DM_SYSTEM_PROMPT).toContain('Foraging')
    })

    it('contains mob attack rules', () => {
      expect(DM_SYSTEM_PROMPT).toContain('Mob Attacks')
      expect(DM_SYSTEM_PROMPT).toContain('Attackers per Hit')
    })

    it('contains warlock pact magic rules', () => {
      expect(DM_SYSTEM_PROMPT).toContain('Warlock Pact Magic')
      expect(DM_SYSTEM_PROMPT).toContain('Short Rest')
    })

    it('contains bloodied rule', () => {
      expect(DM_SYSTEM_PROMPT).toContain('Bloodied')
      expect(DM_SYSTEM_PROMPT).toContain('half its Hit Point maximum')
    })
  })

  // ── DM_TOOLBOX_CONTEXT ──

  describe('DM_TOOLBOX_CONTEXT', () => {
    it('is a non-empty string', () => {
      expect(typeof DM_TOOLBOX_CONTEXT).toBe('string')
      expect(DM_TOOLBOX_CONTEXT.length).toBeGreaterThan(50)
    })

    it('contains environmental effects', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Environmental Effects')
      expect(DM_TOOLBOX_CONTEXT).toContain('Extreme Cold')
      expect(DM_TOOLBOX_CONTEXT).toContain('Extreme Heat')
    })

    it('contains trap rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Traps')
      expect(DM_TOOLBOX_CONTEXT).toContain('detection')
    })

    it('contains poison rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Poisons')
      expect(DM_TOOLBOX_CONTEXT).toContain('Poisoned condition')
    })

    it('contains disease rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Diseases')
      expect(DM_TOOLBOX_CONTEXT).toContain('Cackle Fever')
      expect(DM_TOOLBOX_CONTEXT).toContain('Sewer Plague')
    })

    it('contains curse rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Curses')
      expect(DM_TOOLBOX_CONTEXT).toContain('Demonic Possession')
    })

    it('contains chase rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Chase')
      expect(DM_TOOLBOX_CONTEXT).toContain('exhaustion')
    })
  })

  // ── PLANAR_RULES_CONTEXT ──

  describe('PLANAR_RULES_CONTEXT', () => {
    it('is a non-empty string', () => {
      expect(typeof PLANAR_RULES_CONTEXT).toBe('string')
      expect(PLANAR_RULES_CONTEXT.length).toBeGreaterThan(50)
    })

    it('contains Astral Plane rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Astral Plane')
      expect(PLANAR_RULES_CONTEXT).toContain('Silver cords')
      expect(PLANAR_RULES_CONTEXT).toContain('Intelligence score')
    })

    it('contains Ethereal Plane rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Ethereal Plane')
      expect(PLANAR_RULES_CONTEXT).toContain('Border Ethereal')
    })

    it('contains Feywild rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Feywild')
      expect(PLANAR_RULES_CONTEXT).toContain('Time distortion')
      expect(PLANAR_RULES_CONTEXT).toContain('Wild Magic')
    })

    it('contains Shadowfell rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Shadowfell')
      expect(PLANAR_RULES_CONTEXT).toContain('Despair')
    })

    it('contains Elemental Plane rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Elemental Planes')
      expect(PLANAR_RULES_CONTEXT).toContain('Fire')
      expect(PLANAR_RULES_CONTEXT).toContain('Water')
      expect(PLANAR_RULES_CONTEXT).toContain('Air')
      expect(PLANAR_RULES_CONTEXT).toContain('Earth')
    })

    it('contains Outer Planes reference', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Outer Planes')
      expect(PLANAR_RULES_CONTEXT).toContain('Nine Hells')
      expect(PLANAR_RULES_CONTEXT).toContain('Abyss')
    })

    it('contains planar travel methods', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Plane Shift')
      expect(PLANAR_RULES_CONTEXT).toContain('Gate')
      expect(PLANAR_RULES_CONTEXT).toContain('Astral Projection')
      expect(PLANAR_RULES_CONTEXT).toContain('Sigil')
    })
  })
})
