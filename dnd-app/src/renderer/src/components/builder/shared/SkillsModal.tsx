import skillsJson from '@data/5e/game/mechanics/skills.json'
import { useMemo } from 'react'
import { useT } from '../../../i18n'
import { useBuilderStore } from '../../../stores/use-builder-store'
import type { AbilityName } from '../../../types/character-common'
import { abilityModifier, formatMod } from '../../../types/character-common'

const SKILLS_5E: Array<{ name: string; ability: AbilityName }> = (
  skillsJson as Array<{ name: string; ability: string }>
).map((s) => ({ name: s.name, ability: s.ability as AbilityName }))

export default function SkillsModal(): JSX.Element {
  const { t } = useT()
  const abilityScores = useBuilderStore((s) => s.abilityScores)
  const selectedSkills = useBuilderStore((s) => s.selectedSkills)
  const setSelectedSkills = useBuilderStore((s) => s.setSelectedSkills)
  const targetLevel = useBuilderStore((s) => s.targetLevel)
  const maxSkills = useBuilderStore((s) => s.maxSkills)
  const confirmSkills = useBuilderStore((s) => s.confirmSkills)
  const closeCustomModal = useBuilderStore((s) => s.closeCustomModal)
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const classSkillOptions = useBuilderStore((s) => s.classSkillOptions)
  // Defensive: `classSkillOptions` is typed `string[]`, but a Bard (class data
  // `skillProficiencies.from: 'any'`), older persisted state, or homebrew could
  // leave a non-array here. A bare string passes `.length > 0` then throws on
  // `.join(', ')` (`"any".join is not a function`). Coerce to [] = "any skill"
  // → the full SKILLS_5E list is offered. The class store now normalizes 'any'
  // at the source (selection-slice); this is belt-and-suspenders.
  const classSkillList: string[] = Array.isArray(classSkillOptions) ? classSkillOptions : []

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
        : classSkillList.length > 0
          ? SKILLS_5E.filter((s) => classSkillList.includes(s.name))
          : SKILLS_5E,
    [classSkillList, isCustomBackground]
  )

  const toggleSkill = (skillName: string): void => {
    if (selectedSkills.includes(skillName)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skillName))
    } else if (!atCap) {
      setSelectedSkills([...selectedSkills, skillName])
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-surface/98 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-lg font-bold text-fg">{t('builder.skillsModal.title')}</h2>
        <button onClick={closeCustomModal} className="text-muted hover:text-gray-200 text-xl leading-none px-2">
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm text-muted mb-4">
          {isCustomBackground
            ? t('builder.skillsModal.instructionCustom', { maxSkills, fromClass: maxSkills - 2 })
            : classSkillList.length > 0
              ? t('builder.skillsModal.instructionClassOptions', {
                  maxSkills,
                  options: classSkillList.join(', ')
                })
              : t('builder.skillsModal.instructionDefault', { maxSkills })}
          {t('builder.skillsModal.profBonus', { bonus: formatMod(profBonus) })}
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
                className={`flex items-center gap-2 px-3 py-2 rounded text-start text-sm transition-colors ${
                  isProficient
                    ? 'bg-amber-900/20 text-amber-300'
                    : isDisabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-300 hover:bg-surface-2'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${
                    isProficient
                      ? 'border-accent bg-accent text-gray-900'
                      : isDisabled
                        ? 'border-border'
                        : 'border-gray-600'
                  }`}
                >
                  {isProficient ? '●' : ''}
                </span>
                <span className="flex-1 truncate">{skill.name}</span>
                <span className="text-xs text-gray-500">{skill.ability.slice(0, 3).toUpperCase()}</span>
                <span className={`font-mono text-sm ${isProficient ? 'text-accent' : 'text-muted'}`}>
                  {formatMod(total)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface">
        <span className="text-xs text-gray-500">
          {t('builder.skillsModal.selected', { count: selectedSkills.length, max: maxSkills })}
          {atCap ? t('builder.skillsModal.atMaximum') : ''}
        </span>
        <div className="flex gap-2">
          <button
            onClick={closeCustomModal}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={confirmSkills}
            disabled={!isConfirmed && selectedSkills.length < maxSkills}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              isConfirmed
                ? 'bg-green-700 text-green-200'
                : selectedSkills.length < maxSkills
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-accent-strong text-white'
            }`}
          >
            {isConfirmed
              ? t('builder.skillsModal.confirmed')
              : selectedSkills.length < maxSkills
                ? t('builder.skillsModal.selectMore', { count: maxSkills - selectedSkills.length })
                : t('builder.skillsModal.confirmSkills')}
          </button>
        </div>
      </div>
    </div>
  )
}
