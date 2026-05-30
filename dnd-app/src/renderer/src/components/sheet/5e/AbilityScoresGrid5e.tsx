import { useState } from 'react'
import { useT } from '../../../i18n'
import type { Character5e } from '../../../types/character-5e'
import { ABILITY_NAMES, abilityModifier, formatMod } from '../../../types/character-common'

interface AbilityScoresGrid5eProps {
  character: Character5e
}

export default function AbilityScoresGrid5e({ character }: AbilityScoresGrid5eProps): JSX.Element {
  const { t } = useT()
  const [expandedAbility, setExpandedAbility] = useState<string | null>(null)
  const FULL_NAMES: Record<string, string> = {
    strength: t('sheet.abilityScoresGrid.strength'),
    dexterity: t('sheet.abilityScoresGrid.dexterity'),
    constitution: t('sheet.abilityScoresGrid.constitution'),
    intelligence: t('sheet.abilityScoresGrid.intelligence'),
    wisdom: t('sheet.abilityScoresGrid.wisdom'),
    charisma: t('sheet.abilityScoresGrid.charisma')
  }

  const ABILITY_DESCRIPTIONS: Record<string, string> = {
    strength: t('sheet.abilityScoresGrid.strengthDesc'),
    dexterity: t('sheet.abilityScoresGrid.dexterityDesc'),
    constitution: t('sheet.abilityScoresGrid.constitutionDesc'),
    intelligence: t('sheet.abilityScoresGrid.intelligenceDesc'),
    wisdom: t('sheet.abilityScoresGrid.wisdomDesc'),
    charisma: t('sheet.abilityScoresGrid.charismaDesc')
  }

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
