import { describe, expect, it } from 'vitest'
import {
  MULTICLASS_PREREQUISITES,
  MULTICLASS_PROFICIENCY_GAINS,
  MULTICLASS_WARNINGS,
  type MulticlassGain,
  type MulticlassPrerequisite,
  type MulticlassWarning
} from './multiclass-prerequisites'

describe('type contracts', () => {
  it('MulticlassPrerequisite has correct shape', () => {
    const prereq: MulticlassPrerequisite = {
      className: 'Wizard',
      abilityRequirements: [{ ability: 'intelligence', minimum: 13 }],
      requireAll: true
    }
    expect(prereq.className).toBe('Wizard')
    expect(prereq.abilityRequirements).toHaveLength(1)
    expect(prereq.abilityRequirements[0].ability).toBe('intelligence')
    expect(prereq.abilityRequirements[0].minimum).toBe(13)
    expect(prereq.requireAll).toBe(true)
  })

  it('MulticlassPrerequisite requireAll=false allows OR logic', () => {
    const prereq: MulticlassPrerequisite = {
      className: 'Fighter',
      abilityRequirements: [
        { ability: 'strength', minimum: 13 },
        { ability: 'dexterity', minimum: 13 }
      ],
      requireAll: false
    }
    expect(prereq.requireAll).toBe(false)
    expect(prereq.abilityRequirements).toHaveLength(2)
  })

  it('MulticlassGain has className and proficiencies array', () => {
    const gain: MulticlassGain = {
      className: 'Rogue',
      proficiencies: ['Light armor', 'One skill', "Thieves' tools"]
    }
    expect(gain.className).toBe('Rogue')
    expect(Array.isArray(gain.proficiencies)).toBe(true)
    expect(gain.proficiencies).toContain('Light armor')
  })

  it('MulticlassGain proficiencies can be empty for classes that grant none', () => {
    const gain: MulticlassGain = { className: 'Wizard', proficiencies: [] }
    expect(gain.proficiencies).toHaveLength(0)
  })

  it('MulticlassWarning has className and warning string', () => {
    const warning: MulticlassWarning = {
      className: 'Barbarian',
      warning: 'Rage prevents spellcasting and concentration. Poor synergy with full casters.'
    }
    expect(warning.className).toBe('Barbarian')
    expect(typeof warning.warning).toBe('string')
    expect(warning.warning.length).toBeGreaterThan(0)
  })

  it('MULTICLASS_PREREQUISITES items satisfy MulticlassPrerequisite type', () => {
    for (const prereq of MULTICLASS_PREREQUISITES) {
      const typed: MulticlassPrerequisite = prereq
      expect(typeof typed.className).toBe('string')
      expect(typeof typed.requireAll).toBe('boolean')
    }
  })

  it('MULTICLASS_PROFICIENCY_GAINS items satisfy MulticlassGain type', () => {
    for (const gain of MULTICLASS_PROFICIENCY_GAINS) {
      const typed: MulticlassGain = gain
      expect(typeof typed.className).toBe('string')
      expect(Array.isArray(typed.proficiencies)).toBe(true)
    }
  })

  it('MULTICLASS_WARNINGS items satisfy MulticlassWarning type', () => {
    for (const warning of MULTICLASS_WARNINGS) {
      const typed: MulticlassWarning = warning
      expect(typeof typed.className).toBe('string')
      expect(typeof typed.warning).toBe('string')
    }
  })
})

describe('multiclass-prerequisites', () => {
  describe('MULTICLASS_PREREQUISITES', () => {
    it('exports an array', () => {
      expect(Array.isArray(MULTICLASS_PREREQUISITES)).toBe(true)
    })

    it('covers all 12 PHB classes', () => {
      const expected = [
        'Barbarian',
        'Bard',
        'Cleric',
        'Druid',
        'Fighter',
        'Monk',
        'Paladin',
        'Ranger',
        'Rogue',
        'Sorcerer',
        'Warlock',
        'Wizard'
      ]
      const classNames = MULTICLASS_PREREQUISITES.map((p) => p.className)
      for (const name of expected) {
        expect(classNames, `Missing prerequisite for: ${name}`).toContain(name)
      }
      expect(MULTICLASS_PREREQUISITES.length).toBe(12)
    })

    it('each entry has className, abilityRequirements, and requireAll', () => {
      for (const prereq of MULTICLASS_PREREQUISITES) {
        expect(typeof prereq.className).toBe('string')
        expect(Array.isArray(prereq.abilityRequirements)).toBe(true)
        expect(prereq.abilityRequirements.length).toBeGreaterThan(0)
        expect(typeof prereq.requireAll).toBe('boolean')
      }
    })

    it('all ability minimums are 13 (PHB 2024 standard)', () => {
      for (const prereq of MULTICLASS_PREREQUISITES) {
        for (const req of prereq.abilityRequirements) {
          expect(req.minimum, `${prereq.className} ${req.ability} should require 13`).toBe(13)
        }
      }
    })

    it('ability names are valid 5e ability scores', () => {
      const validAbilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
      for (const prereq of MULTICLASS_PREREQUISITES) {
        for (const req of prereq.abilityRequirements) {
          expect(validAbilities, `Invalid ability: ${req.ability}`).toContain(req.ability)
        }
      }
    })

    // PHB 2024 accuracy checks
    it('Barbarian requires STR 13', () => {
      const barb = MULTICLASS_PREREQUISITES.find((p) => p.className === 'Barbarian')!
      expect(barb.abilityRequirements).toEqual([{ ability: 'strength', minimum: 13 }])
      expect(barb.requireAll).toBe(true)
    })

    it('Fighter requires STR 13 OR DEX 13 (requireAll=false)', () => {
      const fighter = MULTICLASS_PREREQUISITES.find((p) => p.className === 'Fighter')!
      expect(fighter.abilityRequirements).toHaveLength(2)
      expect(fighter.requireAll).toBe(false)
      const abilities = fighter.abilityRequirements.map((r) => r.ability)
      expect(abilities).toContain('strength')
      expect(abilities).toContain('dexterity')
    })

    it('Monk requires DEX 13 AND WIS 13', () => {
      const monk = MULTICLASS_PREREQUISITES.find((p) => p.className === 'Monk')!
      expect(monk.requireAll).toBe(true)
      expect(monk.abilityRequirements).toHaveLength(2)
      const abilities = monk.abilityRequirements.map((r) => r.ability)
      expect(abilities).toContain('dexterity')
      expect(abilities).toContain('wisdom')
    })

    it('Paladin requires STR 13 AND CHA 13', () => {
      const paladin = MULTICLASS_PREREQUISITES.find((p) => p.className === 'Paladin')!
      expect(paladin.requireAll).toBe(true)
      expect(paladin.abilityRequirements).toHaveLength(2)
      const abilities = paladin.abilityRequirements.map((r) => r.ability)
      expect(abilities).toContain('strength')
      expect(abilities).toContain('charisma')
    })

    it('Wizard requires INT 13', () => {
      const wizard = MULTICLASS_PREREQUISITES.find((p) => p.className === 'Wizard')!
      expect(wizard.abilityRequirements).toEqual([{ ability: 'intelligence', minimum: 13 }])
    })

    it('CHA-based casters (Bard, Sorcerer, Warlock) require CHA 13', () => {
      for (const className of ['Bard', 'Sorcerer', 'Warlock']) {
        const prereq = MULTICLASS_PREREQUISITES.find((p) => p.className === className)!
        expect(prereq.abilityRequirements).toEqual([{ ability: 'charisma', minimum: 13 }])
      }
    })

    it('WIS-based casters (Cleric, Druid) require WIS 13', () => {
      for (const className of ['Cleric', 'Druid']) {
        const prereq = MULTICLASS_PREREQUISITES.find((p) => p.className === className)!
        expect(prereq.abilityRequirements).toEqual([{ ability: 'wisdom', minimum: 13 }])
      }
    })
  })

  describe('MULTICLASS_PROFICIENCY_GAINS', () => {
    it('exports an array', () => {
      expect(Array.isArray(MULTICLASS_PROFICIENCY_GAINS)).toBe(true)
    })

    it('covers all 12 PHB classes', () => {
      expect(MULTICLASS_PROFICIENCY_GAINS.length).toBe(12)
      const classNames = MULTICLASS_PROFICIENCY_GAINS.map((g) => g.className)
      const expected = [
        'Barbarian',
        'Bard',
        'Cleric',
        'Druid',
        'Fighter',
        'Monk',
        'Paladin',
        'Ranger',
        'Rogue',
        'Sorcerer',
        'Warlock',
        'Wizard'
      ]
      for (const name of expected) {
        expect(classNames).toContain(name)
      }
    })

    it('each entry has className and proficiencies array', () => {
      for (const gain of MULTICLASS_PROFICIENCY_GAINS) {
        expect(typeof gain.className).toBe('string')
        expect(Array.isArray(gain.proficiencies)).toBe(true)
      }
    })

    it('Sorcerer and Wizard gain no proficiencies on multiclass', () => {
      const sorcerer = MULTICLASS_PROFICIENCY_GAINS.find((g) => g.className === 'Sorcerer')!
      const wizard = MULTICLASS_PROFICIENCY_GAINS.find((g) => g.className === 'Wizard')!
      expect(sorcerer.proficiencies).toEqual([])
      expect(wizard.proficiencies).toEqual([])
    })

    it('Fighter gains all armor and weapon proficiencies', () => {
      const fighter = MULTICLASS_PROFICIENCY_GAINS.find((g) => g.className === 'Fighter')!
      expect(fighter.proficiencies).toContain('Light armor')
      expect(fighter.proficiencies).toContain('Medium armor')
      expect(fighter.proficiencies).toContain('Shields')
      expect(fighter.proficiencies).toContain('Simple weapons')
      expect(fighter.proficiencies).toContain('Martial weapons')
    })

    it("Rogue gains Thieves' tools", () => {
      const rogue = MULTICLASS_PROFICIENCY_GAINS.find((g) => g.className === 'Rogue')!
      expect(rogue.proficiencies).toContain("Thieves' tools")
    })

    it('all proficiency strings are non-empty', () => {
      for (const gain of MULTICLASS_PROFICIENCY_GAINS) {
        for (const prof of gain.proficiencies) {
          expect(typeof prof).toBe('string')
          expect(prof.length).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('MULTICLASS_WARNINGS', () => {
    it('exports an array', () => {
      expect(Array.isArray(MULTICLASS_WARNINGS)).toBe(true)
    })

    it('each entry has className and warning', () => {
      for (const w of MULTICLASS_WARNINGS) {
        expect(typeof w.className).toBe('string')
        expect(typeof w.warning).toBe('string')
        expect(w.warning.length).toBeGreaterThan(0)
      }
    })

    it('Barbarian warning mentions Rage and spellcasting incompatibility', () => {
      const barbWarn = MULTICLASS_WARNINGS.find((w) => w.className === 'Barbarian')
      expect(barbWarn).toBeDefined()
      expect(barbWarn!.warning).toContain('Rage')
      expect(barbWarn!.warning).toContain('spellcasting')
    })

    it('Monk warning mentions Unarmored Defense stacking', () => {
      const monkWarn = MULTICLASS_WARNINGS.find((w) => w.className === 'Monk')
      expect(monkWarn).toBeDefined()
      expect(monkWarn!.warning).toContain('Unarmored Defense')
    })

    it('Paladin warning mentions Extra Attack stacking', () => {
      const palWarn = MULTICLASS_WARNINGS.find((w) => w.className === 'Paladin')
      expect(palWarn).toBeDefined()
      expect(palWarn!.warning).toContain('Extra Attack')
    })
  })
})
