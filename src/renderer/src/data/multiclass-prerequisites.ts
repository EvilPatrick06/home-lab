export interface MulticlassPrerequisite {
  className: string
  abilityRequirements: Array<{ ability: string; minimum: number }>
  /** All listed abilities must meet the minimum (AND logic) */
  requireAll: boolean
}

export const MULTICLASS_PREREQUISITES: MulticlassPrerequisite[] = [
  {
    className: 'Barbarian',
    abilityRequirements: [{ ability: 'strength', minimum: 13 }],
    requireAll: true
  },
  {
    className: 'Bard',
    abilityRequirements: [{ ability: 'charisma', minimum: 13 }],
    requireAll: true
  },
  {
    className: 'Cleric',
    abilityRequirements: [{ ability: 'wisdom', minimum: 13 }],
    requireAll: true
  },
  {
    className: 'Druid',
    abilityRequirements: [{ ability: 'wisdom', minimum: 13 }],
    requireAll: true
  },
  {
    className: 'Fighter',
    abilityRequirements: [
      { ability: 'strength', minimum: 13 },
      { ability: 'dexterity', minimum: 13 }
    ],
    requireAll: false
  },
  {
    className: 'Monk',
    abilityRequirements: [
      { ability: 'dexterity', minimum: 13 },
      { ability: 'wisdom', minimum: 13 }
    ],
    requireAll: true
  },
  {
    className: 'Paladin',
    abilityRequirements: [
      { ability: 'strength', minimum: 13 },
      { ability: 'charisma', minimum: 13 }
    ],
    requireAll: true
  },
  {
    className: 'Ranger',
    abilityRequirements: [
      { ability: 'dexterity', minimum: 13 },
      { ability: 'wisdom', minimum: 13 }
    ],
    requireAll: true
  },
  {
    className: 'Rogue',
    abilityRequirements: [{ ability: 'dexterity', minimum: 13 }],
    requireAll: true
  },
  {
    className: 'Sorcerer',
    abilityRequirements: [{ ability: 'charisma', minimum: 13 }],
    requireAll: true
  },
  {
    className: 'Warlock',
    abilityRequirements: [{ ability: 'charisma', minimum: 13 }],
    requireAll: true
  },
  {
    className: 'Wizard',
    abilityRequirements: [{ ability: 'intelligence', minimum: 13 }],
    requireAll: true
  }
]

export interface MulticlassGain {
  className: string
  proficiencies: string[]
}

export const MULTICLASS_PROFICIENCY_GAINS: MulticlassGain[] = [
  { className: 'Barbarian', proficiencies: ['Shields', 'Simple weapons', 'Martial weapons'] },
  { className: 'Bard', proficiencies: ['Light armor', 'One skill', 'One musical instrument'] },
  { className: 'Cleric', proficiencies: ['Light armor', 'Medium armor', 'Shields'] },
  { className: 'Druid', proficiencies: ['Light armor', 'Medium armor', 'Shields'] },
  {
    className: 'Fighter',
    proficiencies: ['Light armor', 'Medium armor', 'Shields', 'Simple weapons', 'Martial weapons']
  },
  { className: 'Monk', proficiencies: ['Simple weapons', 'Shortswords'] },
  {
    className: 'Paladin',
    proficiencies: ['Light armor', 'Medium armor', 'Shields', 'Simple weapons', 'Martial weapons']
  },
  {
    className: 'Ranger',
    proficiencies: ['Light armor', 'Medium armor', 'Shields', 'Simple weapons', 'Martial weapons', 'One skill']
  },
  { className: 'Rogue', proficiencies: ['Light armor', 'One skill', "Thieves' tools"] },
  { className: 'Sorcerer', proficiencies: [] },
  { className: 'Warlock', proficiencies: ['Light armor', 'Simple weapons'] },
  { className: 'Wizard', proficiencies: [] }
]

export interface MulticlassWarning {
  className: string
  warning: string
}

export const MULTICLASS_WARNINGS: MulticlassWarning[] = [
  {
    className: 'Barbarian',
    warning: 'Rage prevents spellcasting and concentration. Poor synergy with full casters.'
  },
  {
    className: 'Monk',
    warning: 'Unarmored Defense does not stack with other Unarmored Defense features (e.g., Barbarian).'
  },
  {
    className: 'Paladin',
    warning: 'Requires both STR 13 and CHA 13. Extra Attack does not stack with Fighter Extra Attack.'
  },
  {
    className: 'Ranger',
    warning: 'Requires both DEX 13 and WIS 13. Extra Attack does not stack with other Extra Attack features.'
  }
]
