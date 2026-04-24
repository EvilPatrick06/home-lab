import skillsJson from '@data/5e/game/mechanics/skills.json'
import { useMemo } from 'react'
import { useBuilderStore } from '../../../stores/use-builder-store'
import type { AbilityName } from '../../../types/character-common'
import { abilityModifier, formatMod } from '../../../types/character-common'

const SKILLS_5E: Array<{ name: string; ability: AbilityName }> = (
  skillsJson as Array<{ name: string; ability: string }>
).map((s) => ({ name: s.name, ability: s.ability as AbilityName }))

export default function SkillsModal(): JSX.Element {
  const abilityScores = useBuilderStore((s) => s.abilityScores)
  const selectedSkills = useBuilderStore((s) => s.selectedSkills)
  const setSelectedSkills = useBuilderStore((s) => s.setSelectedSkills)
  const targetLevel = useBuilderStore((s) => s.targetLevel)
  const maxSkills = useBuilderStore((s) => s.maxSkills)
  const confirmSkills = useBuilderStore((s) => s.confirmSkills)
  const closeCustomModal = useBuilderStore((s) => s.closeCustomModal)
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const classSkillOptions = useBuilderStore((s) => s.classSkillOptions)

  const skillSlot = buildSlots.find((s) => s.id === 'skill-choices')
  const bgSlot = buildSlots.find((s) => s.category === 'background')
  const isCustomBackground = bgSlot?.selectedId === 'custom'
  const isConfirmed = skillSlot?.selectedId === 'confirmed'
  const atCap = selectedSkills.length >= maxSkills

  const profBonus = useMemo(() => Math.ceil(targetLevel / 4) + 1, [targetLevel])

  // Custom background: show all skills (user picks bg + class skills freely)
  const availableSkills = useMemo(
    () =>
      isCustomBackground
        ? SKILLS_5E
        : classSkillOptions.length > 0
          ? SKILLS_5E.filter((s) => classSkillOptions.includes(s.name))
          : SKILLS_5E,
    [classSkillOptions, isCustomBackground]
  )

  const toggleSkill = (skillName: string): void => {
    if (selectedSkills.includes(skillName)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skillName))
    } else if (!atCap) {
      setSelectedSkills([...selectedSkills, skillName])
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-900/98 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="text-lg font-bold text-gray-100">Skill Proficiencies</h2>
        <button onClick={closeCustomModal} className="text-gray-400 hover:text-gray-200 text-xl leading-none px-2">
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm text-gray-400 mb-4">
          {isCustomBackground
            ? `Choose ${maxSkills} skill proficiencies (${maxSkills - 2} from class + 2 from custom background)`
            : classSkillOptions.length > 0
              ? `Choose ${maxSkills} from: ${classSkillOptions.join(', ')}`
              : `Select ${maxSkills} skill proficiencies for your character`}
          . Proficiency bonus: {formatMod(profBonus)}
        </p>

        <div className="grid grid-cols-2 gap-1">
          {availableSkills.map((skill) => {
            const isProficient = selectedSkills.includes(skill.name)
            const mod = abilityModifier(abilityScores[skill.ability])
            const total = mod + (isProficient ? profBonus : 0)
            const isDisabled = !isProficient && atCap

            return (
              <button
                key={skill.name}
                onClick={() => toggleSkill(skill.name)}
                disabled={isDisabled}
                className={`flex items-center gap-2 px-3 py-2 rounded text-left text-sm transition-colors ${
                  isProficient
                    ? 'bg-amber-900/20 text-amber-300'
                    : isDisabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${
                    isProficient
                      ? 'border-amber-400 bg-amber-400 text-gray-900'
                      : isDisabled
                        ? 'border-gray-700'
                        : 'border-gray-600'
                  }`}
                >
                  {isProficient ? '●' : ''}
                </span>
                <span className="flex-1 truncate">{skill.name}</span>
                <span className="text-xs text-gray-500">{skill.ability.slice(0, 3).toUpperCase()}</span>
                <span className={`font-mono text-sm ${isProficient ? 'text-amber-400' : 'text-gray-400'}`}>
                  {formatMod(total)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 bg-gray-900">
        <span className="text-xs text-gray-500">
          Selected: {selectedSkills.length}/{maxSkills}
          {atCap ? ' (at maximum)' : ''}
        </span>
        <div className="flex gap-2">
          <button
            onClick={closeCustomModal}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmSkills}
            disabled={!isConfirmed && selectedSkills.length < maxSkills}
            title={
              !isConfirmed && selectedSkills.length < maxSkills
                ? `Select ${maxSkills - selectedSkills.length} more skill(s)`
                : undefined
            }
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              isConfirmed
                ? 'bg-green-700 text-green-200'
                : selectedSkills.length < maxSkills
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {isConfirmed
              ? 'Confirmed'
              : selectedSkills.length < maxSkills
                ? `Select ${maxSkills - selectedSkills.length} more`
                : 'Confirm Skills'}
          </button>
        </div>
      </div>
    </div>
  )
}
