import type { AbilityName, AbilityScoreSet } from '../../types/character-common'
import { abilityModifier } from '../../types/character-common'
import type { ResolvedEffects } from '../combat/effect-resolver-5e'
import { calculateArmorClass5e } from './armor-class-calculator'
import type { EncumbranceResult, LifestyleLevel, ToolSkillInteraction } from './equipment-utilities'
import {
  calculateEncumbrance,
  calculateLifestyleCost,
  getToolSkillAdvantage,
  getWildShapeMax,
  LIFESTYLE_COSTS,
  sumEquipmentWeight,
  TOOL_SKILL_INTERACTIONS
} from './equipment-utilities'

// Re-export armor-class-calculator exports so existing consumers can import from this module
export { calculateArmorClass5e }

// Re-export equipment-utilities exports so existing consumers can import from this module
export {
  calculateEncumbrance,
  calculateLifestyleCost,
  getToolSkillAdvantage,
  getWildShapeMax,
  LIFESTYLE_COSTS,
  sumEquipmentWeight,
  TOOL_SKILL_INTERACTIONS
}
export type { EncumbranceResult, LifestyleLevel, ToolSkillInteraction }

interface SpeciesData {
  speed: number
  size: string
}

interface ClassData {
  hitDie: number
  savingThrows: string[]
}

export interface DerivedStats5e {
  abilityScores: AbilityScoreSet
  abilityModifiers: AbilityScoreSet
  maxHP: number
  armorClass: number
  initiative: number
  speed: number
  proficiencyBonus: number
  savingThrows: Record<string, number>
}

// ─── Armor Class (PHB 2024 Chapter 1) ────────────────────────

export interface ArmorForAC {
  acBonus: number
  equipped: boolean
  type: 'armor' | 'shield' | 'clothing'
  category?: string
  dexCap?: number | null
}

export interface ArmorClassOptions {
  dexMod: number
  armor: ArmorForAC[]
  classNames?: string[]
  conMod?: number
  wisMod?: number
  draconicSorcererLevel?: number
  acBonusFromEffects?: number
}

export function calculateHPBonusFromTraits(
  level: number,
  speciesId: string | null,
  feats: Array<{ id: string }> | null,
  draconicSorcererLevel?: number
): number {
  let bonus = 0
  if (speciesId === 'dwarf') bonus += level // Dwarven Toughness: +1 HP per level
  if (feats?.some((f) => f.id === 'tough')) bonus += level * 2 // Tough feat: +2 HP per level
  if (feats?.some((f) => f.id === 'boon-of-fortitude')) bonus += 40 // Boon of Fortitude: +40 HP
  // Draconic Resilience: +3 at Lv3, +1 per additional Sorcerer level (= sorcererLevel total for Lv3+)
  if (draconicSorcererLevel && draconicSorcererLevel >= 3) bonus += draconicSorcererLevel
  return bonus
}

export function calculate5eStats(
  baseScores: AbilityScoreSet,
  species: SpeciesData | null,
  cls: ClassData | null,
  level: number,
  backgroundAbilityBonuses?: Partial<Record<AbilityName, number>>,
  speciesId?: string | null,
  feats?: Array<{ id: string }> | null,
  draconicSorcererLevel?: number,
  resolvedEffects?: ResolvedEffects,
  armorForAC?: ArmorForAC[],
  classNamesForAC?: string[],
  classFeatures?: Array<{ name: string }> | null
): DerivedStats5e {
  // Apply background ability bonuses (2024 PHB - ability scores come from background)
  const scores: AbilityScoreSet = { ...baseScores }
  if (backgroundAbilityBonuses) {
    for (const [ability, bonus] of Object.entries(backgroundAbilityBonuses)) {
      scores[ability as AbilityName] += bonus as number
    }
  }

  // Apply ability score overrides from magic items (e.g., Amulet of Health sets CON to 19)
  if (resolvedEffects?.abilityScoreOverrides) {
    for (const [ability, minValue] of Object.entries(resolvedEffects.abilityScoreOverrides)) {
      const key = ability as AbilityName
      if (key in scores && minValue !== undefined && minValue > scores[key]) {
        scores[key] = minValue
      }
    }
  }

  // Compute modifiers
  const modifiers: AbilityScoreSet = {
    strength: abilityModifier(scores.strength),
    dexterity: abilityModifier(scores.dexterity),
    constitution: abilityModifier(scores.constitution),
    intelligence: abilityModifier(scores.intelligence),
    wisdom: abilityModifier(scores.wisdom),
    charisma: abilityModifier(scores.charisma)
  }

  const proficiencyBonus = level >= 21 ? 7 : Math.ceil(level / 4) + 1
  const hitDie = cls?.hitDie || 8
  const conMod = modifiers.constitution

  // HP: full hit die at level 1, average + CON for subsequent levels (min 1 per level)
  let maxHP = Math.max(1, hitDie + conMod)
  for (let i = 2; i <= level; i++) {
    maxHP += Math.max(1, Math.floor(hitDie / 2) + 1 + conMod)
  }
  // Add HP bonuses from species traits (Dwarven Toughness) and feats (Tough)
  maxHP += calculateHPBonusFromTraits(level, speciesId ?? null, feats ?? null, draconicSorcererLevel)
  // Add HP bonuses from resolved effects (e.g., Tough feat via effect system)
  if (resolvedEffects) maxHP += resolvedEffects.hpBonus
  maxHP = Math.max(maxHP, 1)

  const armorClass = calculateArmorClass5e({
    dexMod: modifiers.dexterity,
    armor: armorForAC ?? [],
    classNames: classNamesForAC ?? [],
    conMod: modifiers.constitution,
    wisMod: modifiers.wisdom,
    draconicSorcererLevel: draconicSorcererLevel ?? 0,
    acBonusFromEffects: resolvedEffects?.acBonus ?? 0
  })

  // Initiative: DEX mod + proficiency bonus if Alert feat
  let initiative = modifiers.dexterity
  if (feats?.some((f) => f.id === 'alert')) initiative += proficiencyBonus
  // Jack of All Trades: initiative is a DEX check, add half proficiency if not already proficient via Alert
  else if (classFeatures?.some((f) => f.name.toLowerCase() === 'jack of all trades')) {
    initiative += Math.floor(proficiencyBonus / 2)
  }
  // Add initiative bonuses from resolved effects (supplements feat check above)
  if (resolvedEffects) initiative += resolvedEffects.initiativeBonus

  // Speed: base + feat bonuses
  let speed = species?.speed ?? 30
  if (feats?.some((f) => f.id === 'speedy')) speed += 10
  if (feats?.some((f) => f.id === 'boon-of-speed')) speed += 30
  // Add speed bonuses from resolved effects
  if (resolvedEffects) speed += resolvedEffects.speedBonus

  // Saving throws
  const savingThrows: Record<string, number> = {}
  const proficientSaves = (cls?.savingThrows ?? []).map((s) => s.toLowerCase())
  // Resilient feat grants save proficiency for chosen ability
  const resilientAbility = feats?.find((f) => f.id === 'resilient') as
    | { id: string; choices?: Record<string, string | string[]> }
    | undefined
  const resilientSave = (
    resilientAbility as { choices?: { ability?: string } } | undefined
  )?.choices?.ability?.toLowerCase()
  for (const ability of Object.keys(scores) as AbilityName[]) {
    const isProficient = proficientSaves.includes(ability) || resilientSave === ability
    savingThrows[ability] = modifiers[ability] + (isProficient ? proficiencyBonus : 0)
  }

  return {
    abilityScores: scores,
    abilityModifiers: modifiers,
    maxHP,
    armorClass,
    initiative,
    speed,
    proficiencyBonus,
    savingThrows
  }
}
