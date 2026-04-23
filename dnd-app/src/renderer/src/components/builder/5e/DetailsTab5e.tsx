import { useEffect, useState } from 'react'
import { load5eBackgrounds, load5eClasses, load5eFeats } from '../../../services/data-provider'
import { useBuilderStore } from '../../../stores/use-builder-store'
import type { FeatData } from '../../../types/data'
import SectionBanner from '../shared/SectionBanner'
import AppearanceEditor5e from './AppearanceEditor5e'
import BackstoryEditor5e, { VariantChoicesSection } from './BackstoryEditor5e'
import PersonalityEditor5e from './PersonalityEditor5e'

export default function DetailsTab5e(): JSX.Element {
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const backgroundEquipmentChoice = useBuilderStore((s) => s.backgroundEquipmentChoice)
  const classEquipmentChoice = useBuilderStore((s) => s.classEquipmentChoice)
  const versatileFeatId = useBuilderStore((s) => s.versatileFeatId)
  const setVersatileFeat = useBuilderStore((s) => s.setVersatileFeat)
  const classEquipment = useBuilderStore((s) => s.classEquipment)
  const bgEquipment = useBuilderStore((s) => s.bgEquipment)

  // Load origin feat from selected background
  const backgroundSlot = buildSlots.find((s) => s.category === 'background')
  const backgroundId = backgroundSlot?.selectedId ?? null
  const [originFeat, setOriginFeat] = useState<string | null>(null)
  const [originFeatDescription, setOriginFeatDescription] = useState<string | null>(null)
  const [originFeatExpanded, setOriginFeatExpanded] = useState(false)

  useEffect(() => {
    if (!backgroundId) {
      setOriginFeat(null)
      setOriginFeatDescription(null)
      return
    }
    let cancelled = false
    load5eBackgrounds().then(async (bgs) => {
      if (cancelled) return
      const bg = bgs.find((b) => b.id === backgroundId)
      const featName = bg?.feat ?? null
      setOriginFeat(featName)
      if (featName) {
        const feats = await load5eFeats('Origin')
        if (cancelled) return
        const baseName = featName.replace(/\s*\(.*\)$/, '')
        const match = feats.find((f) => f.name === baseName)
        setOriginFeatDescription(match?.benefits.map((b) => b.description).join(' ') ?? null)
      } else {
        setOriginFeatDescription(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [backgroundId])

  // Determine if species is Human (for Versatile feat)
  const speciesSlot = buildSlots.find((s) => s.category === 'ancestry')
  const isHuman = speciesSlot?.selectedId === 'human'

  // Load Origin feats for Versatile feat picker
  const [originFeats, setOriginFeats] = useState<FeatData[]>([])
  useEffect(() => {
    if (!isHuman) {
      setOriginFeats([])
      return
    }
    load5eFeats('Origin').then(setOriginFeats)
  }, [isHuman])

  const selectedVersatileFeat = originFeats.find((f) => f.id === versatileFeatId)

  // Load class equipment options for A/B/C selector
  const classSlot = buildSlots.find((s) => s.category === 'class')
  const classId = classSlot?.selectedId ?? null
  const [classEquipmentOptions, setClassEquipmentOptions] = useState<Array<{
    label: string
    items: string[]
    gp: number
  }> | null>(null)

  useEffect(() => {
    if (!classId) {
      setClassEquipmentOptions(null)
      return
    }
    load5eClasses().then((classes) => {
      const cls = classes.find((c) => c.id === classId)
      const entries = cls?.coreTraits.startingEquipment ?? []
      setClassEquipmentOptions(entries.length > 1 ? entries : null)
      // Auto-satisfy validation for classes with no equipment options (e.g. Barbarian)
      if (entries.length <= 1) {
        useBuilderStore.getState().setClassEquipmentChoice(entries[0]?.label ?? null)
      }
    })
  }, [classId])

  const asiSlots = buildSlots.filter((s) => s.category === 'ability-boost')

  return (
    <div>
      {/* CHARACTER DETAILS */}
      <AppearanceEditor5e />

      {/* ORIGIN FEAT */}
      {originFeat && (
        <>
          <SectionBanner label="ORIGIN FEAT" />
          <div className="px-4 py-3 border-b border-gray-800">
            <button
              onClick={() => setOriginFeatExpanded(!originFeatExpanded)}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/30 rounded px-1 -mx-1 py-0.5 transition-colors w-full text-left"
            >
              <span className="text-xs px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700">
                Origin
              </span>
              <span className="text-sm text-gray-200 font-medium">{originFeat}</span>
              <span className="text-xs text-gray-500">(from {backgroundSlot?.selectedName ?? 'Background'})</span>
              <span className="text-gray-600 text-[10px] ml-auto">{originFeatExpanded ? '\u25BE' : '\u25B8'}</span>
            </button>
            {originFeatExpanded && originFeatDescription && (
              <div className="mt-2 bg-gray-800/60 border border-gray-700 rounded px-3 py-2">
                <p className="text-xs text-gray-400">{originFeatDescription}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* HUMAN VERSATILE FEAT */}
      {isHuman && (
        <>
          <SectionBanner label="VERSATILE FEAT (HUMAN)" />
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs text-gray-500 mb-2">As a Human, you gain an additional Origin feat of your choice.</p>
            <select
              value={versatileFeatId ?? ''}
              onChange={(e) => setVersatileFeat(e.target.value || null)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Select an Origin Feat...</option>
              {originFeats
                .filter((f) => {
                  // Exclude the background's origin feat (by name, ignoring parenthetical)
                  const bgFeatBase = originFeat?.replace(/\s*\(.*\)$/, '')
                  const featBase = f.name.replace(/\s*\(.*\)$/, '')
                  return f.repeatable || featBase !== bgFeatBase
                })
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
            {selectedVersatileFeat && (
              <div className="mt-2 bg-gray-800/60 border border-gray-700 rounded px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700">
                    Versatile
                  </span>
                  <span className="text-sm text-gray-200 font-medium">{selectedVersatileFeat.name}</span>
                </div>
                <p className="text-xs text-gray-400">
                  {selectedVersatileFeat.benefits.map((b) => b.description).join(' ')}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* STARTING EQUIPMENT CHOICE */}
      {backgroundId && backgroundId !== 'custom' && (
        <>
          <SectionBanner label="STARTING EQUIPMENT" />
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs text-gray-500 mb-2">Choose your starting equipment from your background:</p>
            <div className="flex gap-2">
              <button
                onClick={() => useBuilderStore.getState().setBackgroundEquipmentChoice('equipment')}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium border transition-colors ${
                  backgroundEquipmentChoice === 'equipment'
                    ? 'bg-amber-900/50 text-amber-300 border-amber-700'
                    : backgroundEquipmentChoice === null
                      ? 'bg-gray-800 text-gray-400 border-amber-700/50 hover:border-amber-600'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                }`}
              >
                Background Equipment
              </button>
              <button
                onClick={() => useBuilderStore.getState().setBackgroundEquipmentChoice('gold')}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium border transition-colors ${
                  backgroundEquipmentChoice === 'gold'
                    ? 'bg-amber-900/50 text-amber-300 border-amber-700'
                    : backgroundEquipmentChoice === null
                      ? 'bg-gray-800 text-gray-400 border-amber-700/50 hover:border-amber-600'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                }`}
              >
                50 GP Instead
              </button>
            </div>
            {backgroundEquipmentChoice === null && (
              <p className="text-xs text-amber-400 mt-2">Please select an option above.</p>
            )}
            {backgroundEquipmentChoice === 'gold' && (
              <p className="text-xs text-gray-500 mt-2">
                Replaces background equipment with 50 GP. Class starting equipment is separate (shown below).
              </p>
            )}
          </div>
        </>
      )}

      {/* CLASS STARTING EQUIPMENT */}
      {classEquipmentOptions && (
        <>
          <SectionBanner label="CLASS STARTING EQUIPMENT" />
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs text-gray-500 mb-2">
              Choose your class starting equipment option:
              {backgroundEquipmentChoice === 'gold' && (
                <span className="text-gray-600 ml-1">(Always included regardless of background choice)</span>
              )}
            </p>
            <div className="flex gap-2">
              {classEquipmentOptions.map((option) => (
                <button
                  key={option.label}
                  onClick={() => useBuilderStore.getState().setClassEquipmentChoice(option.label)}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium border transition-colors ${
                    classEquipmentChoice === option.label
                      ? 'bg-amber-900/50 text-amber-300 border-amber-700'
                      : classEquipmentChoice === null
                        ? 'bg-gray-800 text-gray-400 border-amber-700/50 hover:border-amber-600'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="font-semibold">Option {option.label}</div>
                  <div className="text-xs mt-0.5 opacity-75">
                    {option.items.length > 0 ? option.items.join(', ') : `${option.gp} GP`}
                  </div>
                </button>
              ))}
            </div>
            {classEquipmentChoice === null && (
              <p className="text-xs text-amber-400 mt-2">Choose one of the options above to continue.</p>
            )}
            {(() => {
              const chosen = classEquipmentOptions.find((o) => o.label === classEquipmentChoice)
              if (!classEquipmentChoice || !chosen) return null
              return (
                <div className="mt-2 bg-gray-800/60 border border-gray-700 rounded px-3 py-2">
                  <div className="text-xs text-gray-400 space-y-0.5">
                    {chosen.items.length > 0 ? (
                      chosen.items.map((item, i) => <div key={`${i}-${item}`}>{item}</div>)
                    ) : (
                      <div className="text-amber-400">{chosen.gp} GP</div>
                    )}
                    {chosen.items.length > 0 && chosen.gp > 0 && (
                      <div className="text-amber-400 mt-1">+ {chosen.gp} GP</div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </>
      )}

      {/* VARIANT CHOICES (Gaming Set, Arcane Focus, etc.) */}
      <VariantChoicesSection classEquipment={classEquipment} bgEquipment={bgEquipment ?? []} />

      {/* ASI HISTORY */}
      {asiSlots.length > 0 && (
        <>
          <SectionBanner label="ASI HISTORY" />
          <div className="border-b border-gray-800">
            {asiSlots.map((slot) => {
              const isConfirmed = slot.selectedId === 'confirmed'
              return (
                <div
                  key={slot.id}
                  className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded font-mono">
                      Lv {slot.level}
                    </span>
                    {isConfirmed ? (
                      <span className="text-sm text-green-400">{slot.selectedName}</span>
                    ) : (
                      <span className="text-sm text-gray-500 italic">Not chosen</span>
                    )}
                  </div>
                  {isConfirmed ? (
                    <button
                      onClick={() => useBuilderStore.getState().resetAsi(slot.id)}
                      className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Edit
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        useBuilderStore.setState({
                          customModal: 'asi',
                          activeAsiSlotId: slot.id
                        })
                      }
                      className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Choose
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* PERSONALITY & BACKSTORY */}
      <PersonalityEditor5e />

      {/* TRINKET */}
      <BackstoryEditor5e />
    </div>
  )
}
