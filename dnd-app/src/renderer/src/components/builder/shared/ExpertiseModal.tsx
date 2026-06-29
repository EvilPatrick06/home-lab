import { useMemo } from 'react'
import { useT } from '../../../i18n'
import { type ExpertiseGrant, getExpertiseGrants } from '../../../services/character/build-tree-5e'
import { useBuilderStore } from '../../../stores/use-builder-store'

export default function ExpertiseModal(): JSX.Element {
  const { t } = useT()
  const activeExpertiseSlotId = useBuilderStore((s) => s.activeExpertiseSlotId)
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const selectedSkills = useBuilderStore((s) => s.selectedSkills)
  const builderExpertiseSelections = useBuilderStore((s) => s.builderExpertiseSelections)
  const setBuilderExpertiseSelections = useBuilderStore((s) => s.setBuilderExpertiseSelections)
  const confirmExpertise = useBuilderStore((s) => s.confirmExpertise)
  const closeCustomModal = useBuilderStore((s) => s.closeCustomModal)

  const slotId = activeExpertiseSlotId ?? ''
  const expertiseSlot = buildSlots.find((s) => s.id === slotId)
  const isConfirmed = expertiseSlot?.selectedId === 'confirmed'

  // Determine class from slot ID
  const classId = useMemo(() => {
    // Multiclass format: "level6-expertise-rogue"
    const multiMatch = slotId.match(/^level\d+-expertise-(.+)$/)
    if (multiMatch) return multiMatch[1]
    // Single-class format: "level1-expertise" → use primary class
    const classSlot = buildSlots.find((s) => s.category === 'class')
    return classSlot?.selectedId ?? ''
  }, [slotId, buildSlots])

  // Get the expertise grant for this slot's level
  const grant: ExpertiseGrant | undefined = useMemo(() => {
    const grants: ExpertiseGrant[] = getExpertiseGrants(classId)
    if (!expertiseSlot) return grants[0]
    return (
      grants.find((g) => {
        // Match by class level embedded in slot ID
        const levelMatch = slotId.match(/^level(\d+)-/)
        return levelMatch && g.classLevel === parseInt(levelMatch[1], 10)
      }) ?? grants[0]
    )
  }, [classId, expertiseSlot, slotId])

  const maxSelections = grant?.count ?? 2

  // Skills already chosen in other expertise slots (exclude current)
  const alreadyChosen = useMemo(() => {
    const skills = new Set<string>()
    for (const [sid, names] of Object.entries(builderExpertiseSelections)) {
      if (sid !== slotId) {
        for (const n of names) skills.add(n)
      }
    }
    return skills
  }, [builderExpertiseSelections, slotId])

  // Available options: proficient skills + optionally Thieves' Tools
  const options = useMemo(() => {
    let skills = [...selectedSkills]
    if (grant?.restrictedSkills) {
      skills = skills.filter((s) => grant.restrictedSkills!.includes(s))
    }
    // Remove skills already chosen in other expertise slots
    skills = skills.filter((s) => !alreadyChosen.has(s))
    const result = skills.map((s) => ({ name: s, isTools: false }))
    if (grant?.includeThievesTools && !alreadyChosen.has("Thieves' Tools")) {
      result.push({ name: "Thieves' Tools", isTools: true })
    }
    return result
  }, [selectedSkills, grant, alreadyChosen])

  const currentSelections = builderExpertiseSelections[slotId] ?? []
  const atCap = currentSelections.length >= maxSelections

  const toggleSelection = (name: string): void => {
    if (currentSelections.includes(name)) {
      setBuilderExpertiseSelections(
        slotId,
        currentSelections.filter((s) => s !== name)
      )
    } else if (!atCap) {
      setBuilderExpertiseSelections(slotId, [...currentSelections, name])
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-surface/98 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-lg font-bold text-fg">
          {grant?.restrictedSkills ? t('builder.expertiseModal.scholar') : t('builder.expertiseModal.expertise')}
          {expertiseSlot && (
            <span className="text-sm font-normal text-gray-500 ms-2">
              {t('builder.expertiseModal.levelSuffix', { lvl: expertiseSlot.level })}
            </span>
          )}
        </h2>
        <button onClick={closeCustomModal} className="text-muted hover:text-gray-200 text-xl leading-none px-2">
          &#x2715;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm text-muted mb-4">
          {t('builder.expertiseModal.instruction', { count: maxSelections })}
          {grant?.restrictedSkills && (
            <span className="text-accent ms-1">
              {t('builder.expertiseModal.restrictedTo', { skills: grant.restrictedSkills.join(', ') })}
            </span>
          )}
        </p>

        {options.length === 0 ? (
          <p className="text-sm text-gray-500">{t('builder.expertiseModal.noEligibleSkills')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {options.map((opt) => {
              const isSelected = currentSelections.includes(opt.name)
              const isDisabled = !isSelected && atCap

              return (
                <button
                  key={opt.name}
                  onClick={() => toggleSelection(opt.name)}
                  disabled={isDisabled}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-start text-sm transition-colors ${
                    isSelected
                      ? 'bg-amber-900/20 text-amber-300'
                      : isDisabled
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-gray-300 hover:bg-surface-2'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${
                      isSelected
                        ? 'border-accent bg-accent text-gray-900'
                        : isDisabled
                          ? 'border-border'
                          : 'border-gray-600'
                    }`}
                  >
                    {isSelected ? '\u25CF' : ''}
                  </span>
                  <span className="flex-1 truncate">{opt.name}</span>
                  {opt.isTools && <span className="text-xs text-gray-500">{t('builder.expertiseModal.tool')}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface">
        <span className="text-xs text-gray-500">
          {t('builder.expertiseModal.selected', { count: currentSelections.length, max: maxSelections })}
          {atCap ? t('builder.expertiseModal.atMaximum') : ''}
        </span>
        <div className="flex gap-2">
          <button
            onClick={closeCustomModal}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={() => confirmExpertise(slotId)}
            disabled={!isConfirmed && currentSelections.length < maxSelections}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              isConfirmed
                ? 'bg-green-700 text-green-200'
                : currentSelections.length < maxSelections
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-accent-strong text-white'
            }`}
          >
            {isConfirmed
              ? t('builder.expertiseModal.confirmed')
              : currentSelections.length < maxSelections
                ? t('builder.expertiseModal.selectMore', { count: maxSelections - currentSelections.length })
                : t('builder.expertiseModal.confirmExpertise')}
          </button>
        </div>
      </div>
    </div>
  )
}
