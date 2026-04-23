import type { Character } from '../types/character'
import type { ArmorEntry } from '../types/character-common'
import { abilityModifier } from '../types/character-common'

/**
 * Compute dynamic AC from equipped armor for a 5e character.
 * Mirrors the logic in CombatStatsBar.
 */
export function computeDynamicAC(character: Character): number {
  const armor: ArmorEntry[] = character.armor ?? []
  const equippedArmor = armor.find((a) => a.equipped && a.type === 'armor')
  const equippedShield = armor.find((a) => a.equipped && a.type === 'shield')
  const dexMod = abilityModifier(character.abilityScores.dexterity)

  const feats = character.feats ?? []
  const hasDefenseFS = feats.some((f) => f.id === 'fighting-style-defense')
  const hasMediumArmorMaster = feats.some((f) => f.id === 'medium-armor-master')
  let ac: number
  if (equippedArmor) {
    let dexCap = equippedArmor.dexCap
    if (hasMediumArmorMaster && dexCap != null && dexCap > 0 && equippedArmor.category === 'medium') {
      dexCap = dexCap + 1
    }
    const cappedDex = dexCap === 0 ? 0 : dexCap != null ? Math.min(dexMod, dexCap) : dexMod
    ac = equippedArmor.acBonus + cappedDex
    if (hasDefenseFS) ac += 1
  } else {
    const classNames = character.classes.map((c) => c.name.toLowerCase())
    const conMod = abilityModifier(character.abilityScores.constitution)
    const wisMod = abilityModifier(character.abilityScores.wisdom)
    const chaMod = abilityModifier(character.abilityScores.charisma)
    const isDraconicSorcerer = character.classes.some(
      (c) =>
        c.name.toLowerCase() === 'sorcerer' && c.subclass?.toLowerCase().replace(/\s+/g, '-') === 'draconic-sorcery'
    )
    const candidates: number[] = [10 + dexMod]
    if (classNames.includes('barbarian')) candidates.push(10 + dexMod + conMod)
    if (classNames.includes('monk') && !equippedShield) candidates.push(10 + dexMod + wisMod)
    if (isDraconicSorcerer) candidates.push(10 + dexMod + chaMod)
    ac = Math.max(...candidates)
  }
  if (equippedShield) ac += equippedShield.acBonus
  return ac
}
