import { useEffect, useMemo, useState } from 'react'
import { getEligibleClasses, getMulticlassWarnings } from '../../../services/character/multiclass-advisor'
import { load5eClasses } from '../../../services/data-provider'
import { useBuilderStore } from '../../../stores/use-builder-store'

interface ClassOption {
  id: string
  name: string
  eligible: boolean
  requirements: string
}

export default function MulticlassLevelBar5e(): JSX.Element {
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const targetLevel = useBuilderStore((s) => s.targetLevel)
  const classLevelChoices = useBuilderStore((s) => s.classLevelChoices)
  const setClassLevelChoice = useBuilderStore((s) => s.setClassLevelChoice)
  const abilityScores = useBuilderStore((s) => s.abilityScores)

  const classSlot = buildSlots.find((s) => s.category === 'class')
  const primaryClassId = classSlot?.selectedId ?? ''
  const primaryClassName = classSlot?.selectedName ?? ''

  const [allClasses, setAllClasses] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    load5eClasses()
      .then((classes) => setAllClasses(classes.map((c) => ({ id: c.id ?? c.name.toLowerCase(), name: c.name }))))
      .catch(() => setAllClasses([]))
  }, [])

  // Get eligibility for multiclassing
  const classOptions = useMemo((): ClassOption[] => {
    const currentClasses = [primaryClassName]
    const eligibility = getEligibleClasses(abilityScores as unknown as Record<string, number>, currentClasses)

    return allClasses.map((cls) => {
      if (cls.id === primaryClassId) {
        return { id: cls.id, name: cls.name, eligible: true, requirements: '' }
      }
      const elig = eligibility.find((e) => e.className === cls.name)
      if (!elig) return { id: cls.id, name: cls.name, eligible: true, requirements: '' }
      const reqText = elig.requirements
        .filter((r) => !r.met)
        .map((r) => `${r.ability.slice(0, 3).toUpperCase()} ${r.minimum}+`)
        .join(', ')
      return { id: cls.id, name: cls.name, eligible: elig.eligible, requirements: reqText }
    })
  }, [allClasses, primaryClassId, primaryClassName, abilityScores])

  // Get warnings for current multiclass combination
  const chosenClassNames = useMemo(() => {
    const names = new Set([primaryClassName])
    for (const cid of Object.values(classLevelChoices)) {
      const cls = allClasses.find((c) => c.id === cid)
      if (cls) names.add(cls.name)
    }
    return [...names]
  }, [classLevelChoices, allClasses, primaryClassName])

  const warnings = useMemo(() => getMulticlassWarnings(chosenClassNames), [chosenClassNames])

  if (targetLevel <= 1 || !primaryClassId) return <></>

  return (
    <div className="mt-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Class per Level</div>
      <div className="flex flex-wrap gap-1">
        {/* Level 1 is always the primary class */}
        <div className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1">
          <span className="text-[10px] text-gray-500 font-mono w-4">1</span>
          <span className="text-xs text-amber-300">{primaryClassName}</span>
        </div>

        {/* Levels 2+ are configurable */}
        {Array.from({ length: targetLevel - 1 }, (_, i) => i + 2).map((lvl) => {
          const selectedClassId = classLevelChoices[lvl] ?? primaryClassId

          return (
            <div key={lvl} className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1">
              <span className="text-[10px] text-gray-500 font-mono w-4">{lvl}</span>
              <select
                value={selectedClassId}
                onChange={(e) => setClassLevelChoice(lvl, e.target.value)}
                className="bg-transparent text-xs text-gray-200 focus:outline-none cursor-pointer"
              >
                {classOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} disabled={!opt.eligible && opt.id !== primaryClassId}>
                    {opt.name}
                    {!opt.eligible && opt.id !== primaryClassId ? ` (Need ${opt.requirements})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      {/* Multiclass warnings */}
      {warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="text-[10px] text-yellow-400 bg-yellow-900/20 rounded px-2 py-1">
              {w.className}: {w.warning}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
