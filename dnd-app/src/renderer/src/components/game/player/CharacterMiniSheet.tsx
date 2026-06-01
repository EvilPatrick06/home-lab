import { useState } from 'react'
import { useT } from '../../../i18n'
import { getEffectiveClasses } from '../../../services/character/effective-character-5e'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import { ABILITY_NAMES, abilityModifier, formatMod } from '../../../types/character-common'

interface CharacterMiniSheetProps {
  character: Character | null
}

export default function CharacterMiniSheet({ character }: CharacterMiniSheetProps): JSX.Element {
  const { t } = useT()
  const [featuresExpanded, setFeaturesExpanded] = useState(false)

  if (!character) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">{t('game.characterMiniSheet.noCharacterSelected')}</div>
    )
  }

  const abilityLabels: Record<string, string> = {
    strength: t('game.characterMiniSheet.abilityStr'),
    dexterity: t('game.characterMiniSheet.abilityDex'),
    constitution: t('game.characterMiniSheet.abilityCon'),
    intelligence: t('game.characterMiniSheet.abilityInt'),
    wisdom: t('game.characterMiniSheet.abilityWis'),
    charisma: t('game.characterMiniSheet.abilityCha')
  }

  return (
    <div className="space-y-4 overflow-y-auto max-h-full p-1">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-fg">{character.name}</h3>
        <p className="text-xs text-muted">
          {is5eCharacter(character) && (
            <>
              {character.species}{' '}
              {getEffectiveClasses(character)
                .map((c) => `${c.name} ${c.level}`)
                .join(' / ')}
            </>
          )}
        </p>
      </div>

      {/* Ability scores */}
      <div>
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">
          {t('game.characterMiniSheet.abilityScores')}
        </h4>
        <div className="grid grid-cols-3 gap-1">
          {ABILITY_NAMES.map((ability) => {
            const score = character.abilityScores[ability]
            const mod = abilityModifier(score)
            return (
              <div key={ability} className="bg-surface-2/50 rounded p-1.5 text-center">
                <div className="text-[9px] text-gray-500 uppercase">{abilityLabels[ability]}</div>
                <div className="text-sm font-semibold text-fg">{formatMod(mod)}</div>
                <div className="text-xs text-muted">{score}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Saving throws */}
      <div>
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">
          {t('game.characterMiniSheet.savingThrows')}
        </h4>
        {is5eCharacter(character) && (
          <div className="space-y-0.5">
            {ABILITY_NAMES.map((ability) => {
              const proficient = character.proficiencies.savingThrows.includes(ability)
              const mod = abilityModifier(character.abilityScores[ability])
              const profBonus = proficient ? Math.ceil(character.level / 4) + 1 : 0
              const total = mod + profBonus
              return (
                <div key={ability} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${proficient ? 'bg-accent-strong' : 'bg-gray-700'}`} />
                  <span className="flex-1 text-muted capitalize text-[11px]">{ability}</span>
                  <span className="text-gray-200 font-mono text-[11px]">{formatMod(total)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Skills */}
      <div>
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">{t('game.characterMiniSheet.skills')}</h4>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {is5eCharacter(character) &&
            character.skills.map((skill) => {
              const mod = abilityModifier(character.abilityScores[skill.ability])
              const profBonus = skill.proficient ? Math.ceil(character.level / 4) + 1 : 0
              const expertBonus = skill.expertise ? profBonus : 0
              const total = mod + profBonus + expertBonus
              return (
                <div
                  key={skill.name}
                  className={`flex items-center gap-2 text-xs ${skill.proficient ? '' : 'opacity-50'}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      skill.expertise ? 'bg-accent' : skill.proficient ? 'bg-amber-600' : 'bg-gray-700'
                    }`}
                  />
                  <span className="flex-1 text-muted text-[11px] truncate">{skill.name}</span>
                  <span className="text-gray-200 font-mono text-[11px]">{formatMod(total)}</span>
                </div>
              )
            })}
        </div>
      </div>

      {/* Features */}
      <div>
        <button
          onClick={() => setFeaturesExpanded(!featuresExpanded)}
          className="flex items-center gap-2 w-full cursor-pointer"
        >
          <span className={`text-xs text-gray-500 transition-transform ${featuresExpanded ? 'rotate-90' : ''}`}>
            &#9654;
          </span>
          <h4 className="text-xs text-gray-500 uppercase tracking-wider">{t('game.characterMiniSheet.features')}</h4>
        </button>
        {featuresExpanded && (
          <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
            {is5eCharacter(character) &&
              character.features.map((feat, i) => (
                <div key={i} className="bg-surface-2/50 rounded p-1.5">
                  <p className="text-[11px] text-gray-200 font-medium">{feat.name}</p>
                  <p className="text-xs text-gray-500">{feat.source}</p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
