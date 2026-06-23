import { getEffectiveArmor, getEffectiveClasses, getEffectiveFeats } from '../services/character/effective-character-5e'
import type { Character } from '../types/character'
import type { ArmorEntry } from '../types/character-common'
import { abilityModifier } from '../types/character-common'

/**
 * Compute dynamic AC from equipped armor for a 5e character.
 * Mirrors the logic in CombatStatsBar5e. `acBonus` is the bonus OVER
 * base 10 (bonus-over-10 convention, e.g. Chain Mail = 6).
 */
export function computeDynamicAC(character: Character): number {
  const armor: ArmorEntry[] = getEffectiveArmor(character)
  const equippedArmor = armor.find((a) => a.equipped && a.type === 'armor')
  const equippedShield = armor.find((a) => a.equipped && a.type === 'shield')
  const dexMod = abilityModifier(character.abilityScores.dexterity)

  const feats = getEffectiveFeats(character)
  const hasDefenseFS = feats.some((f) => f.id === 'fighting-style-defense')
  const hasMediumArmorMaster = feats.some((f) => f.id === 'medium-armor-master')
  let ac: number
  if (equippedArmor) {
    let dexCap = equippedArmor.dexCap
    if (hasMediumArmorMaster && dexCap != null && dexCap > 0 && equippedArmor.category === 'medium') {
      dexCap = dexCap + 1
    }
    const cappedDex = dexCap === 0 ? 0 : dexCap != null ? Math.min(dexMod, dexCap) : dexMod
    // PHASE-47 F2 — `acBonus` is the bonus OVER the base 10 (Chain Mail = 6, not
    // 16), matching how the builder stores armor (build-from-equipment-5e:
    // `baseAC - 10`) and how the canonical `calculateArmorClass5e` reads it
    // (`10 + acBonus`). The base 10 was missing here, so an equipped Chain Mail
    // character rendered AC 6 on the sheet/list while the builder showed 16.
    ac = 10 + equippedArmor.acBonus + cappedDex
    if (hasDefenseFS) ac += 1
  } else {
    const classes = getEffectiveClasses(character)
    const classNames = classes.map((c) => c.name.toLowerCase())
    const conMod = abilityModifier(character.abilityScores.constitution)
    const wisMod = abilityModifier(character.abilityScores.wisdom)
    const chaMod = abilityModifier(character.abilityScores.charisma)
    const isDraconicSorcerer = classes.some(
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
