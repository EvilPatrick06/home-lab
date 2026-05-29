/**
 * Builder feat resolution — D&D 5e 2024
 *
 * Pure computation extracted from build-character-5e. Given the base effective
 * feats plus the various builder selections (origin feat, epic boon, versatile
 * feat, fighting style, general feat slots), produces the merged feat list that
 * lands on the built character. No store get/set closure — all inputs explicit.
 */
import type { getEffectiveFeats } from '../../../../services/character/effective-character-5e'
import type { Character5e } from '../../../../types/character-5e'
import type { BuildSlot } from '../../../../types/character-common'
import type { FeatData } from '../../../../types/data'

/** Feat entry shape carried on a built character (matches getEffectiveFeats element). */
export type BuilderFeatEntry = ReturnType<typeof getEffectiveFeats>[number]

export interface ComputeBuilderFeatsParams {
  /** Base feats from the existing character (already resolved via getEffectiveFeats). */
  baseFeats: BuilderFeatEntry[]
  originFeat: { id: string; name: string; description: string } | null
  featsData: FeatData[]
  buildSlots: BuildSlot[]
  existingChar5e: Character5e | undefined
  versatileFeatId: string | null
  builderFeatSelections: Record<string, { id: string; name: string; description: string }>
}

export function computeBuilderFeats5e(params: ComputeBuilderFeatsParams): BuilderFeatEntry[] {
  const { baseFeats, originFeat, featsData, buildSlots, existingChar5e, versatileFeatId, builderFeatSelections } =
    params

  let result: BuilderFeatEntry[] = baseFeats
  if (originFeat) {
    const withoutOldOrigin = result.filter((f) => {
      const baseName = f.name.replace(/\s*\(.*\)$/, '')
      return !featsData.some((fd) => fd.name === baseName && fd.category === 'Origin')
    })
    result = withoutOldOrigin.some((f) => f.name === originFeat.name)
      ? withoutOldOrigin
      : [originFeat, ...withoutOldOrigin]
  }
  const epicBoonSlot = buildSlots.find((s) => s.category === 'epic-boon' && s.selectedId)
  if (epicBoonSlot) {
    result = result.filter((f) => f.id !== existingChar5e?.buildChoices?.epicBoonId)
    const boonFeat = featsData.find((fd) => fd.id === epicBoonSlot.selectedId)
    result = boonFeat
      ? [
          ...result,
          { id: boonFeat.id, name: boonFeat.name, description: boonFeat.benefits.map((b) => b.description).join(' ') }
        ]
      : [...result, { id: epicBoonSlot.selectedId!, name: epicBoonSlot.selectedName ?? 'Epic Boon', description: '' }]
  }
  if (versatileFeatId) {
    result = result.filter((f) => f.id !== existingChar5e?.buildChoices?.versatileFeatId)
    const vFeat = featsData.find((fd) => fd.id === versatileFeatId)
    if (vFeat)
      result = [
        ...result,
        { id: vFeat.id, name: vFeat.name, description: vFeat.benefits.map((b) => b.description).join(' ') }
      ]
  } else if (existingChar5e?.buildChoices?.versatileFeatId) {
    result = result.filter((f) => f.id !== existingChar5e?.buildChoices?.versatileFeatId)
  }
  const fsSlot = buildSlots.find((s) => s.category === 'fighting-style' && s.selectedId)
  if (fsSlot) {
    result = result.filter((f) => f.id !== existingChar5e?.buildChoices?.fightingStyleId)
    const fsFeat = featsData.find((fd) => fd.id === fsSlot.selectedId)
    result = fsFeat
      ? [
          ...result,
          { id: fsFeat.id, name: fsFeat.name, description: fsFeat.benefits.map((b) => b.description).join(' ') }
        ]
      : [...result, { id: fsSlot.selectedId!, name: fsSlot.selectedName ?? 'Fighting Style', description: '' }]
  }
  // Merge builder feat selections (from ASI-or-Feat choices)
  for (const feat of Object.values(builderFeatSelections)) {
    if (!result.some((f) => f.id === feat.id)) {
      result.push(feat)
    }
  }
  return result
}
