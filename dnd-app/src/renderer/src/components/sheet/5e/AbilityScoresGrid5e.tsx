import { useState } from 'react'
import type { Character5e } from '../../../types/character-5e'
import { ABILITY_NAMES, abilityModifier, formatMod } from '../../../types/character-common'

const FULL_NAMES: Record<string, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma'
}

const ABILITY_DESCRIPTIONS: Record<string, string> = {
  strength:
    'Measures physical power. Affects melee attack and damage rolls, carrying capacity, and Athletics checks. Used for STR saving throws against being physically restrained or moved.',
  dexterity:
    'Measures agility and reflexes. Affects ranged attack rolls, AC, initiative, and Acrobatics/Sleight of Hand/Stealth checks. Used for DEX saving throws to dodge area effects.',
  constitution:
    'Measures endurance and vitality. Affects hit points gained per level and CON saving throws to maintain concentration on spells or resist poison and disease.',
  intelligence:
    'Measures reasoning and memory. Affects Arcana/History/Investigation/Nature/Religion checks. Primary spellcasting ability for Wizards. Used for INT saving throws against mental effects.',
  wisdom:
    'Measures perception and intuition. Affects Animal Handling/Insight/Medicine/Perception/Survival checks. Primary spellcasting ability for Clerics, Druids, and Rangers. Used for WIS saving throws against charm and fear.',
  charisma:
    'Measures force of personality. Affects Deception/Intimidation/Performance/Persuasion checks. Primary spellcasting ability for Bards, Paladins, Sorcerers, and Warlocks. Used for CHA saving throws against banishment.'
}

interface AbilityScoresGrid5eProps {
  character: Character5e
}

export default function AbilityScoresGrid5e({ character }: AbilityScoresGrid5eProps): JSX.Element {
  const [expandedAbility, setExpandedAbility] = useState<string | null>(null)

  return (
    <div className="mb-6">
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        {ABILITY_NAMES.map((ab) => {
          const score = character.abilityScores[ab] ?? 10
          const mod = abilityModifier(score)
          const isExpanded = expandedAbility === ab
          return (
            <div
              key={ab}
              className={`bg-gray-900/50 border rounded-lg p-4 text-center cursor-pointer transition-colors ${isExpanded ? 'border-amber-600 bg-gray-900/70' : 'border-gray-700 hover:border-gray-600'}`}
              onClick={() => setExpandedAbility(isExpanded ? null : ab)}
            >
              <div className="text-xs text-gray-400 uppercase">{FULL_NAMES[ab]}</div>
              <div className="text-2xl font-bold text-amber-400">{score}</div>
              <div className="text-sm text-gray-400">{formatMod(mod)}</div>
            </div>
          )
        })}
      </div>
      {expandedAbility && (
        <div className="mt-2 bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2.5 text-xs text-gray-400">
          <span className="text-amber-400 font-medium">{FULL_NAMES[expandedAbility]}: </span>
          {ABILITY_DESCRIPTIONS[expandedAbility]}
        </div>
      )}
    </div>
  )
}
