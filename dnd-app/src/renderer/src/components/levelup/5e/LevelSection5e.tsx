import { useEffect, useState } from 'react'
import { getExpertiseGrants } from '../../../services/character/build-tree-5e'
import { getSlotProgression, isWarlockPactMagic } from '../../../services/character/spell-data'
import { load5eClassFeatures } from '../../../services/data-provider'
import { useLevelUpStore } from '../../../stores/use-level-up-store'
import type { Character5e } from '../../../types/character-5e'
import type { BuildSlot } from '../../../types/character-common'
import HpRollSection5e from './HpRollSection5e'
import {
  AsiOrFeatSelector5e,
  AsiSelector5e,
  DivineOrderSelector5e,
  ElementalFurySelector5e,
  EpicBoonSelector5e,
  ExpertiseSelector5e,
  FightingStyleSelector5e,
  GeneralFeatPicker,
  ordinal,
  PrimalOrderSelector5e,
  SubclassSelector5e
} from './LevelSelectors5e'

/**
 * Sub-components available for direct usage in custom level-up UIs.
 * Exported here so downstream consumers can import standalone pickers
 * without pulling in the full AsiOrFeatSelector5e parent component.
 */
export { AsiSelector5e, GeneralFeatPicker }

interface LevelSection5eProps {
  character: Character5e
  level: number
  slots: BuildSlot[]
  classIdForLevel?: string
  hitDieForLevel?: number
}

interface ClassFeature {
  level: number
  name: string
  description: string
}

export default function LevelSection5e({
  character,
  level,
  slots,
  classIdForLevel,
  hitDieForLevel
}: LevelSection5eProps): JSX.Element {
  const asiSelections = useLevelUpStore((s) => s.asiSelections)
  const setAsiSelection = useLevelUpStore((s) => s.setAsiSelection)
  const generalFeatSelections = useLevelUpStore((s) => s.generalFeatSelections)
  const setGeneralFeatSelection = useLevelUpStore((s) => s.setGeneralFeatSelection)
  const fightingStyleSelection = useLevelUpStore((s) => s.fightingStyleSelection)
  const setFightingStyleSelection = useLevelUpStore((s) => s.setFightingStyleSelection)
  const _setSlotSelection = useLevelUpStore((s) => s.setSlotSelection)
  const [features, setFeatures] = useState<ClassFeature[]>([])

  const epicBoonSelection = useLevelUpStore((s) => s.epicBoonSelection)
  const setEpicBoonSelection = useLevelUpStore((s) => s.setEpicBoonSelection)

  const primalOrderSelection = useLevelUpStore((s) => s.primalOrderSelection)
  const setPrimalOrderSelection = useLevelUpStore((s) => s.setPrimalOrderSelection)
  const divineOrderSelection = useLevelUpStore((s) => s.divineOrderSelection)
  const setDivineOrderSelection = useLevelUpStore((s) => s.setDivineOrderSelection)
  const elementalFurySelection = useLevelUpStore((s) => s.elementalFurySelection)
  const setElementalFurySelection = useLevelUpStore((s) => s.setElementalFurySelection)
  const expertiseSelections = useLevelUpStore((s) => s.expertiseSelections)
  const setExpertiseSelections = useLevelUpStore((s) => s.setExpertiseSelections)

  const asiSlots = slots.filter((s) => s.category === 'ability-boost')
  const epicBoonSlots = slots.filter((s) => s.category === 'epic-boon')
  const fightingStyleSlots = slots.filter((s) => s.category === 'fighting-style')
  const primalOrderSlots = slots.filter((s) => s.category === 'primal-order')
  const divineOrderSlots = slots.filter((s) => s.category === 'divine-order')
  const expertiseSlots = slots.filter((s) => s.category === 'expertise')
  const subclassSlots = slots.filter((s) => s.category === 'class-feat' && s.label === 'Subclass')
  const otherFeatSlots = slots.filter(
    (s) =>
      s.category !== 'ability-boost' &&
      s.category !== 'epic-boon' &&
      s.category !== 'fighting-style' &&
      s.category !== 'primal-order' &&
      s.category !== 'divine-order' &&
      s.category !== 'expertise' &&
      !(s.category === 'class-feat' && s.label === 'Subclass')
  )

  // Load class features for this level
  useEffect(() => {
    const effectiveClassId = classIdForLevel ?? character.buildChoices.classId

    let classLevel = level
    if (classIdForLevel && classIdForLevel !== character.buildChoices.classId) {
      const existingLevel = character.classes.find((c) => c.name.toLowerCase() === classIdForLevel)?.level ?? 0
      classLevel = existingLevel + 1
    }

    load5eClassFeatures()
      .then((data) => {
        const cf = data[effectiveClassId]
        if (cf) {
          setFeatures(cf.features.filter((f) => f.level === classLevel))
        }
      })
      .catch(() => setFeatures([]))
  }, [character, level, classIdForLevel])

  // Check if new spell slot levels are gained at this level
  const newSlotInfo = (() => {
    const className = classIdForLevel ?? character.classes[0]?.name?.toLowerCase() ?? ''
    const currentSlots = getSlotProgression(className, level - 1)
    const newSlots = getSlotProgression(className, level)

    const gained: Array<{ level: number; count: number }> = []
    for (const [lvl, count] of Object.entries(newSlots)) {
      const prev = currentSlots[Number(lvl)] ?? 0
      if (count > prev) {
        gained.push({ level: Number(lvl), count: count - prev })
      }
    }
    return gained.length > 0 ? gained : null
  })()

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-bold text-amber-400 mb-3">Level {level}</h3>

      <div className="space-y-3">
        {/* HP */}
        <HpRollSection5e character={character} level={level} hitDieOverride={hitDieForLevel} />

        {/* ASI slots with ASI/Feat toggle */}
        {asiSlots.map((slot) => (
          <AsiOrFeatSelector5e
            key={slot.id}
            slot={slot}
            character={character}
            asiSelection={asiSelections[slot.id] ?? []}
            featSelection={generalFeatSelections[slot.id] ?? null}
            onAsiSelect={(abilities) => setAsiSelection(slot.id, abilities)}
            onFeatSelect={(feat) => setGeneralFeatSelection(slot.id, feat)}
          />
        ))}

        {/* Epic Boon slots */}
        {epicBoonSlots.map((slot) => (
          <EpicBoonSelector5e
            key={slot.id}
            slot={slot}
            selection={epicBoonSelection}
            onSelect={setEpicBoonSelection}
            character={character}
          />
        ))}

        {/* Fighting Style slots */}
        {fightingStyleSlots.map((slot) => (
          <FightingStyleSelector5e
            key={slot.id}
            slot={slot}
            character={character}
            selection={fightingStyleSelection}
            onSelect={setFightingStyleSelection}
          />
        ))}

        {/* Primal Order slots (Druid level 1) */}
        {primalOrderSlots.map((slot) => (
          <PrimalOrderSelector5e
            key={slot.id}
            slot={slot}
            selection={primalOrderSelection}
            onSelect={setPrimalOrderSelection}
          />
        ))}

        {/* Divine Order slots (Cleric level 1) */}
        {divineOrderSlots.map((slot) => (
          <DivineOrderSelector5e
            key={slot.id}
            slot={slot}
            selection={divineOrderSelection}
            onSelect={setDivineOrderSelection}
          />
        ))}

        {/* Expertise slots (Rogue/Bard/Wizard) */}
        {expertiseSlots.map((slot) => {
          const effectiveClassId = classIdForLevel ?? character.buildChoices.classId
          const grants = getExpertiseGrants(effectiveClassId)
          // Find the matching grant for this slot's class level
          const existingDruidLevel =
            character.classes.find((c) => c.name.toLowerCase() === effectiveClassId)?.level ?? 0
          const classLevelForSlot =
            classIdForLevel && classIdForLevel !== character.buildChoices.classId ? existingDruidLevel + 1 : slot.level
          const grant = grants.find((g) => g.classLevel === classLevelForSlot) ?? grants[0]
          return (
            <ExpertiseSelector5e
              key={slot.id}
              slot={slot}
              character={character}
              grant={grant}
              selection={expertiseSelections[slot.id] ?? []}
              allExpertiseSelections={expertiseSelections}
              onSelect={(skills) => setExpertiseSelections(slot.id, skills)}
            />
          )
        })}

        {/* Elemental Fury choice (Druid level 7) */}
        {(() => {
          const effectiveClassId = classIdForLevel ?? character.buildChoices.classId
          if (effectiveClassId !== 'druid') return null
          // Check if this level gains Elemental Fury (class level 7)
          const existingDruidLevel = character.classes.find((c) => c.name.toLowerCase() === 'druid')?.level ?? 0
          const newDruidClassLevel =
            classIdForLevel && classIdForLevel !== character.buildChoices.classId
              ? existingDruidLevel + 1
              : existingDruidLevel + (level - character.level)
          if (newDruidClassLevel !== 7) return null
          return <ElementalFurySelector5e selection={elementalFurySelection} onSelect={setElementalFurySelection} />
        })()}

        {/* Subclass slots */}
        {subclassSlots.map((slot) => (
          <SubclassSelector5e key={slot.id} slot={slot} classId={classIdForLevel ?? character.buildChoices.classId} />
        ))}

        {/* Other feat slots */}
        {otherFeatSlots.map((slot) => (
          <div key={slot.id} className="text-sm">
            <span className="text-gray-400">{slot.label}: </span>
            {slot.selectedId ? (
              <span className="text-amber-400">{slot.selectedName}</span>
            ) : (
              <span className="text-gray-500 italic">Not selected</span>
            )}
          </div>
        ))}

        {/* New class features */}
        {features.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">New Features</div>
            {features.map((f, i) => (
              <div key={i} className="text-sm">
                <span className="text-amber-400 font-semibold">{f.name}</span>
                <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{f.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* New spell slots */}
        {newSlotInfo && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {isWarlockPactMagic(classIdForLevel ?? character.classes[0]?.name?.toLowerCase() ?? '')
                ? 'Pact Slot Changes'
                : 'Spell Slot Changes'}
            </div>
            {newSlotInfo.map((info) => (
              <div key={info.level} className="text-sm text-purple-400">
                +{info.count} {info.level}
                {ordinal(info.level)} level slot{info.count > 1 ? 's' : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
