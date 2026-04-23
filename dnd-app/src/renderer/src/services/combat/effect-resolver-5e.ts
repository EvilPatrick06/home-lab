import { getFeatEffects, getFightingStyleEffects, getMagicItemEffects } from '../../data/effect-definitions'
import type { Character5e } from '../../types/character-5e'
import type { CustomEffect, EffectScope, EffectSource, MechanicalEffect } from '../../types/effects'

// ─── Resolved Effects Interface ─────────────────────────────

export interface ResolvedEffects {
  sources: EffectSource[]
  acBonus: number
  attackBonus: (weaponScope?: WeaponContext) => number
  damageBonus: (weaponScope?: WeaponContext) => number
  spellDCBonus: number
  spellAttackBonus: number
  abilityScoreOverrides: Partial<Record<string, number>>
  hpBonus: number
  speedBonus: number
  initiativeBonus: number
  saveBonusAll: number
  resistances: string[]
  immunities: string[]
  vulnerabilities: string[]
  damageReduction: number
  critPrevention: boolean
  getOnHitEffects: (weaponScope?: WeaponContext) => MechanicalEffect[]
  getOnCritEffects: (weaponScope?: WeaponContext) => MechanicalEffect[]
  getExtraDamageDice: (weaponScope?: WeaponContext) => Array<{ dice: string; damageType: string }>
  hasAdvantageOn: (check: string) => boolean
  ignoreLoading: boolean
  noRangedMeleeDisadvantage: boolean
}

export interface WeaponContext {
  isMelee?: boolean
  isRanged?: boolean
  isHeavy?: boolean
  isThrown?: boolean
  isCrossbow?: boolean
  isSpell?: boolean
  damageType?: string
}

// ─── Scope Matching ─────────────────────────────────────────

function scopeMatches(effectScope: EffectScope | undefined, weapon?: WeaponContext): boolean {
  if (!effectScope || effectScope === 'all') return true
  if (!weapon) return false
  switch (effectScope) {
    case 'weapon':
      return !weapon.isSpell
    case 'melee':
      return !!weapon.isMelee
    case 'ranged':
      return !!weapon.isRanged
    case 'spell':
      return !!weapon.isSpell
    case 'melee_weapon':
      return !!weapon.isMelee && !weapon.isSpell
    case 'ranged_weapon':
      return !!weapon.isRanged && !weapon.isSpell
    case 'heavy_weapon':
      return !!weapon.isHeavy
    case 'thrown':
      return !!weapon.isThrown
    case 'crossbow':
      return !!weapon.isCrossbow
    default:
      return true
  }
}

// ─── Condition Checking ─────────────────────────────────────

function conditionMet(condition: string | undefined, character: Character5e, _sourceType: string): boolean {
  if (!condition) return true
  switch (condition) {
    case 'always':
      return true
    case 'attuned':
      return true // We only collect attuned items
    case 'equipped':
      return true // We only collect equipped items
    case 'wielding':
      return true // Checked at weapon-use time
    case 'wearing_armor': {
      const armor = character.armor ?? []
      return armor.some((a) => a.equipped && a.type === 'armor')
    }
    case 'wearing_heavy_armor': {
      const armor = character.armor ?? []
      return armor.some((a) => a.equipped && a.type === 'armor' && a.category === 'heavy')
    }
    case 'on_use':
      return false // Only applies when actively used (consumables)
    case 'in_combat':
      return true // Assume in-combat for passive resolution
    default:
      return true
  }
}

// ─── Main Resolver ──────────────────────────────────────────

export function resolveEffects(character: Character5e, customEffects?: CustomEffect[]): ResolvedEffects {
  const sources: EffectSource[] = []
  const allEffects: Array<{ effect: MechanicalEffect; source: EffectSource }> = []

  // 1. Collect magic item effects (only attuned or non-attunement items)
  const magicItems = character.magicItems ?? []
  for (const item of magicItems) {
    if (item.attunement && !item.attuned) continue
    const effectSource = getMagicItemEffects(item.name)
    if (effectSource) {
      sources.push(effectSource)
      for (const e of effectSource.effects) {
        if (conditionMet(e.condition, character, 'magic-item')) {
          allEffects.push({ effect: e, source: effectSource })
        }
      }
    }
  }

  // 2. Collect feat effects
  const feats = character.feats ?? []
  for (const feat of feats) {
    const effectSource = getFeatEffects(feat.name)
    if (effectSource) {
      sources.push(effectSource)
      for (const e of effectSource.effects) {
        if (conditionMet(e.condition, character, 'feat')) {
          allEffects.push({ effect: e, source: effectSource })
        }
      }
    }
  }

  // 3. Collect fighting style effects
  const fightingStyleId = character.buildChoices.fightingStyleId
  if (fightingStyleId) {
    // Convert ID to display name: 'defense' → 'Defense', 'great-weapon-fighting' → 'Great Weapon Fighting'
    const styleName = fightingStyleId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    const effectSource = getFightingStyleEffects(styleName)
    if (effectSource) {
      sources.push(effectSource)
      for (const e of effectSource.effects) {
        if (conditionMet(e.condition, character, 'fighting-style')) {
          allEffects.push({ effect: e, source: effectSource })
        }
      }
    }
  }

  // 4. Collect custom DM effects targeting this character
  if (customEffects) {
    for (const ce of customEffects) {
      if (ce.targetEntityId !== character.id) continue
      const effectSource: EffectSource = {
        sourceId: ce.id,
        sourceName: ce.name,
        sourceType: 'custom',
        effects: ce.effects
      }
      sources.push(effectSource)
      for (const e of ce.effects) {
        allEffects.push({ effect: e, source: effectSource })
      }
    }
  }

  // ─── Resolve aggregated values ────────────────────────────

  let acBonus = 0
  let spellDCBonus = 0
  let spellAttackBonus = 0
  let hpBonus = 0
  let speedBonus = 0
  let initiativeBonus = 0
  let saveBonusAll = 0
  let damageReduction = 0
  let critPrevention = false
  const abilityScoreOverrides: Partial<Record<string, number>> = {}
  const resistances: string[] = []
  const immunities: string[] = []
  const vulnerabilities: string[] = []
  const advantageChecks: string[] = []
  let ignoreLoading = false
  let noRangedMeleeDisadvantage = false

  const profBonus = Math.ceil(character.level / 4) + 1

  for (const { effect } of allEffects) {
    switch (effect.type) {
      case 'ac_bonus':
        acBonus += effect.value ?? 0
        break
      case 'spell_dc_bonus':
        spellDCBonus += effect.value ?? 0
        break
      case 'spell_attack_bonus':
        spellAttackBonus += effect.value ?? 0
        break
      case 'hp_per_level':
        hpBonus += (effect.value ?? 0) * character.level
        break
      case 'speed_bonus':
        speedBonus += effect.value ?? 0
        break
      case 'initiative_bonus':
        // Alert feat: add proficiency bonus to initiative
        if (effect.stringValue === 'swap_lowest') {
          initiativeBonus += profBonus
        } else {
          initiativeBonus += effect.value ?? 0
        }
        break
      case 'save_bonus':
        if (effect.scope === 'all') saveBonusAll += effect.value ?? 0
        break
      case 'ability_set':
        if (effect.stringValue) {
          const current = abilityScoreOverrides[effect.stringValue]
          // Take the highest override if multiple
          if (current === undefined || (effect.value ?? 0) > current) {
            abilityScoreOverrides[effect.stringValue] = effect.value ?? 0
          }
        }
        break
      case 'ability_bonus':
        // Additive ability bonus — not an override
        break
      case 'resistance':
        if (effect.stringValue && effect.stringValue !== 'ignore_chosen') {
          resistances.push(effect.stringValue)
        }
        break
      case 'immunity':
        if (effect.stringValue) immunities.push(effect.stringValue)
        break
      case 'vulnerability':
        if (effect.stringValue) vulnerabilities.push(effect.stringValue)
        break
      case 'damage_reduction':
        damageReduction += effect.value ?? 0
        break
      case 'crit_prevention':
        critPrevention = true
        break
      case 'advantage_on':
        if (effect.stringValue) advantageChecks.push(effect.stringValue)
        break
      case 'ignore_loading':
        ignoreLoading = true
        break
      case 'no_ranged_melee_disadvantage':
        noRangedMeleeDisadvantage = true
        break
      case 'luck_points':
        // Value resolved dynamically — just mark that Lucky is active
        break
      default:
        // attack_bonus, damage_bonus, extra_damage_dice, on_hit_effect, etc.
        // are resolved per-weapon below
        break
    }
  }

  // ─── Weapon-contextual resolvers ──────────────────────────

  function attackBonus(weapon?: WeaponContext): number {
    let bonus = 0
    for (const { effect } of allEffects) {
      if (effect.type === 'attack_bonus' && scopeMatches(effect.scope, weapon)) {
        bonus += effect.value ?? 0
      }
    }
    return bonus
  }

  function damageBonus(weapon?: WeaponContext): number {
    let bonus = 0
    for (const { effect } of allEffects) {
      if (effect.type === 'damage_bonus' && scopeMatches(effect.scope, weapon)) {
        if (effect.stringValue === 'add_ability_mod_offhand') continue // TWF handled separately
        bonus += effect.value ?? 0
      }
    }
    return bonus
  }

  function getOnHitEffects(weapon?: WeaponContext): MechanicalEffect[] {
    return allEffects
      .filter(({ effect }) => effect.type === 'on_hit_effect' && scopeMatches(effect.scope, weapon))
      .map(({ effect }) => effect)
  }

  function getOnCritEffects(weapon?: WeaponContext): MechanicalEffect[] {
    return allEffects
      .filter(({ effect }) => effect.type === 'on_crit_effect' && scopeMatches(effect.scope, weapon))
      .map(({ effect }) => effect)
  }

  function getExtraDamageDice(weapon?: WeaponContext): Array<{ dice: string; damageType: string }> {
    return allEffects
      .filter(({ effect }) => effect.type === 'extra_damage_dice' && scopeMatches(effect.scope, weapon))
      .map(({ effect }) => ({ dice: effect.dice ?? '0', damageType: effect.stringValue ?? 'untyped' }))
  }

  function hasAdvantageOn(check: string): boolean {
    return advantageChecks.includes(check)
  }

  return {
    sources,
    acBonus,
    attackBonus,
    damageBonus,
    spellDCBonus,
    spellAttackBonus,
    abilityScoreOverrides,
    hpBonus,
    speedBonus,
    initiativeBonus,
    saveBonusAll,
    resistances: [...new Set(resistances)],
    immunities: [...new Set(immunities)],
    vulnerabilities: [...new Set(vulnerabilities)],
    damageReduction,
    critPrevention,
    getOnHitEffects,
    getOnCritEffects,
    getExtraDamageDice,
    hasAdvantageOn,
    ignoreLoading,
    noRangedMeleeDisadvantage
  }
}
