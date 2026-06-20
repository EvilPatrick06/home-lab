/**
 * Builder proficiency resolution — D&D 5e 2024
 *
 * Pure computation extracted from build-character-5e. Derives weapon, armor,
 * tool, and language proficiency lists from the selected class/background plus
 * order choices and chosen languages. No store get/set closure.
 */
import type { BackgroundData, ClassData } from '../../../../types/data'

export interface ComputeBuilderProficienciesParams {
  classData: ClassData | null
  bgData: BackgroundData | null
  /** Background-granted equipment options selected in the store (bgEquipment). */
  storeBgEquipment: Array<{ option: string; items: string[]; source: string }>
  chosenLangs: string[]
  classId: string
  isWarden: boolean
  isProtector: boolean
}

export interface BuilderProficiencies {
  weaponProfs: string[]
  armorProfs: string[]
  toolProfs: string[]
  langProfs: string[]
}

export function computeBuilderProficiencies5e(params: ComputeBuilderProficienciesParams): BuilderProficiencies {
  const { classData, bgData, storeBgEquipment, chosenLangs, classId, isWarden, isProtector } = params

  const weaponProfs = (() => {
    const r = (classData?.coreTraits.weaponProficiencies ?? []).map((w) => w.category ?? '').filter(Boolean)
    if ((isWarden || isProtector) && !r.includes('Martial')) r.push('Martial')
    return r
  })()
  const armorProfs = (() => {
    const r = [...(classData?.coreTraits.armorTraining ?? [])]
    if (isWarden && !r.includes('Medium')) r.push('Medium')
    if (isProtector && !r.includes('Heavy')) r.push('Heavy')
    return r
  })()
  const toolProfs = (() => {
    const bgToolsRaw = bgData?.toolProficiency ? [bgData.toolProficiency] : []
    const bgItems = storeBgEquipment.flatMap((e) => e.items)
    const bgToolsMapped = bgToolsRaw.map((tool) => {
      const toolLC = tool.toLowerCase()
      const matchedItem = bgItems.find((item) => item.toLowerCase() !== toolLC && item.toLowerCase().includes(toolLC))
      return matchedItem ?? tool
    })
    const all = [...bgToolsMapped]
    const seen = new Set<string>()
    return all.filter((t) => {
      const key = t.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()
  // 2024 PHB: every character knows Common automatically (granted by their
  // Origin, not chosen) plus their 2 chosen languages. Seed Common first and
  // dedup so it always appears on the saved sheet without consuming a slot.
  const langProfs = [
    ...new Set([
      'Common',
      ...chosenLangs,
      ...(classId === 'druid' && !chosenLangs.includes('Druidic') ? ['Druidic'] : []),
      ...(classId === 'rogue' && !chosenLangs.includes("Thieves' Cant") ? ["Thieves' Cant"] : [])
    ])
  ]

  return { weaponProfs, armorProfs, toolProfs, langProfs }
}
