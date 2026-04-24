import { useMemo } from 'react'
import { useBuilderStore } from '../../../stores/use-builder-store'
import MulticlassLevelBar5e from '../5e/MulticlassLevelBar5e'
import BuildLevelGroup from './BuildLevelGroup'
import IconPicker from './IconPicker'

export default function BuildSidebar(): JSX.Element {
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const targetLevel = useBuilderStore((s) => s.targetLevel)
  const characterName = useBuilderStore((s) => s.characterName)
  const setTargetLevel = useBuilderStore((s) => s.setTargetLevel)
  const setCharacterName = useBuilderStore((s) => s.setCharacterName)
  const openSelectionModal = useBuilderStore((s) => s.openSelectionModal)

  // Group slots by level
  const groupedSlots = useMemo(() => {
    const groups = new Map<number, typeof buildSlots>()
    for (const slot of buildSlots) {
      const level = slot.level
      if (!groups.has(level)) groups.set(level, [])
      groups.get(level)?.push(slot)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b)
  }, [buildSlots])

  return (
    <div className="w-64 border-r border-gray-700 bg-gray-900/50 flex flex-col shrink-0">
      {/* Character name & level */}
      <div className="p-3 border-b border-gray-700 space-y-2">
        <input
          type="text"
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          placeholder="Character Name"
          aria-label="Character name"
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
        <div className="flex items-center gap-2">
          <label htmlFor="builder-level" className="text-xs text-gray-400">
            Level
          </label>
          <input
            id="builder-level"
            type="number"
            min={1}
            max={20}
            value={targetLevel}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (val >= 1 && val <= 20) setTargetLevel(val)
            }}
            className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-center text-gray-100 focus:outline-none focus:border-amber-500"
          />
        </div>
        <IconPicker />
        <MulticlassLevelBar5e />
      </div>

      {/* Build tree */}
      <div className="flex-1 overflow-y-auto">
        {groupedSlots.map(([level, slots]) => (
          <BuildLevelGroup
            key={level}
            level={level}
            slots={slots}
            onSlotClick={(slotId) => {
              const slot = buildSlots.find((s) => s.id === slotId)
              if (!slot) return
              if (slot.category === 'ability-scores') {
                useBuilderStore.setState({ customModal: 'ability-scores', activeAsiSlotId: null })
              } else if (slot.category === 'ability-boost') {
                useBuilderStore.setState({ customModal: 'asi', activeAsiSlotId: slotId })
              } else if (slot.category === 'skill-choice') {
                useBuilderStore.setState({ customModal: 'skills', activeAsiSlotId: null })
              } else if (slot.category === 'expertise') {
                useBuilderStore.setState({ customModal: 'expertise', activeExpertiseSlotId: slotId })
              } else {
                useBuilderStore.setState({ activeAsiSlotId: null, customModal: null })
                openSelectionModal(slotId)
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}
