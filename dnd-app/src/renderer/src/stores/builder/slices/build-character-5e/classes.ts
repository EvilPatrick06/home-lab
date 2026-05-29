/**
 * Builder class-list resolution — D&D 5e 2024
 *
 * Pure computation extracted from build-character-5e. Produces the inline
 * classes array for the built character, handling the multiclass case
 * (per-class level counts + subclass slot matching) and the single-class
 * fallback. No store get/set closure.
 */
import type { CharacterClass5e } from '../../../../types/character-5e'
import type { BuildSlot } from '../../../../types/character-common'
import type { ClassData } from '../../../../types/data'

export interface ComputeBuilderClassesParams {
  classLevelChoices: Record<number, string>
  classId: string
  classData: ClassData | null
  classes: ClassData[]
  buildSlots: BuildSlot[]
  targetLevel: number
  subclassSlot: BuildSlot | undefined
}

export function computeBuilderClasses5e(params: ComputeBuilderClassesParams): CharacterClass5e[] {
  const { classLevelChoices, classId, classData, classes, buildSlots, targetLevel, subclassSlot } = params

  const clc = classLevelChoices
  const hasMulticlass = Object.keys(clc).length > 0 && Object.values(clc).some((cid) => cid !== classId)
  if (hasMulticlass && classData) {
    // Count levels per class (level 1 is always primary class)
    const levelCounts: Record<string, number> = { [classId]: 1 }
    for (const cid of Object.values(clc)) {
      levelCounts[cid] = (levelCounts[cid] ?? 0) + 1
    }
    return Object.entries(levelCounts).map(([cid, lvlCount]) => {
      const cd = classes.find((c) => c.id === cid)
      const subSlot = buildSlots.find(
        (s) => s.id.includes('subclass') && (s.id.includes(cid) || (cid === classId && !s.id.includes('-')))
      )
      return {
        name: cd?.name ?? cid,
        level: lvlCount,
        hitDie: parseInt(cd?.coreTraits.hitPointDie.replace(/\D/g, '') ?? '8', 10),
        subclass: subSlot?.selectedName ?? undefined
      }
    })
  }
  return classData
    ? [
        {
          name: classData.name,
          level: targetLevel,
          hitDie: parseInt(classData.coreTraits.hitPointDie.replace(/\D/g, ''), 10) || 8,
          subclass: subclassSlot?.selectedName ?? undefined
        }
      ]
    : []
}
