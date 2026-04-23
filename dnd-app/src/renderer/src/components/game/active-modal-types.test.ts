import { describe, expect, it } from 'vitest'
import type { ActiveModal } from './active-modal-types'

describe('ActiveModal type', () => {
  it('accepts null (no modal open)', () => {
    const modal: ActiveModal = null
    expect(modal).toBeNull()
  })

  it('accepts all expected string literal values', () => {
    const validModals: ActiveModal[] = [
      'action',
      'item',
      'hiddenDice',
      'whisper',
      'quickCondition',
      'timer',
      'initiative',
      'notes',
      'attack',
      'help',
      'jump',
      'falling',
      'influence',
      'aoe',
      'travelPace',
      'mount',
      'creatures',
      'familiar',
      'wildShape',
      'steed',
      'summonCreature',
      'timeEdit',
      'lightSource',
      'shortRest',
      'longRest',
      'dmRoller',
      'commandRef',
      'customEffect',
      'encounterBuilder',
      'treasureGenerator',
      'chaseTracker',
      'mobCalculator',
      'groupRoll',
      'study',
      'shortcutRef',
      'dispute',
      'downtime',
      'shop',
      'spellRef',
      'calendar',
      'gridSettings',
      'tokenEditor',
      'handout',
      'handoutViewer',
      'npcGenerator',
      'magic-item-tracker',
      'themeSelector',
      'sentientItem',
      'itemTrade',
      'sharedJournal',
      'compendium',
      'dm-screen',
      'roll-table',
      'diceRoller',
      null
    ]
    // If this compiles and runs without errors, all values are valid
    expect(validModals.length).toBeGreaterThan(0)
  })

  it('covers combat-related modals', () => {
    const combatModals: ActiveModal[] = ['action', 'attack', 'initiative', 'hiddenDice', 'groupRoll', 'mobCalculator']
    for (const m of combatModals) {
      expect(typeof m).toBe('string')
    }
  })

  it('covers DM tool modals', () => {
    const dmModals: ActiveModal[] = [
      'dmRoller',
      'encounterBuilder',
      'treasureGenerator',
      'npcGenerator',
      'gridSettings',
      'tokenEditor',
      'handout',
      'handoutViewer',
      'dm-screen',
      'roll-table'
    ]
    for (const m of dmModals) {
      expect(typeof m).toBe('string')
    }
  })

  it('covers rest and resource modals', () => {
    const restModals: ActiveModal[] = ['shortRest', 'longRest']
    for (const m of restModals) {
      expect(typeof m).toBe('string')
    }
  })

  it('covers summon/companion modals', () => {
    const summonModals: ActiveModal[] = ['familiar', 'wildShape', 'steed', 'summonCreature', 'mount', 'creatures']
    for (const m of summonModals) {
      expect(typeof m).toBe('string')
    }
  })

  it('covers utility modals', () => {
    const utilityModals: ActiveModal[] = [
      'help',
      'commandRef',
      'shortcutRef',
      'compendium',
      'spellRef',
      'calendar',
      'whisper',
      'timer',
      'sharedJournal',
      'notes',
      'dispute',
      'itemTrade'
    ]
    for (const m of utilityModals) {
      expect(typeof m).toBe('string')
    }
  })

  it('a state manager using ActiveModal can transition between values', () => {
    let current: ActiveModal = null
    expect(current).toBeNull()

    current = 'initiative'
    expect(current).toBe('initiative')

    current = 'attack'
    expect(current).toBe('attack')

    current = null
    expect(current).toBeNull()
  })
})
