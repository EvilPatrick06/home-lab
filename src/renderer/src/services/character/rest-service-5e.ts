import type { Character5e, HitDiceEntry, HitPoints } from '../../types/character-5e'
import { totalHitDiceMaximum, totalHitDiceRemaining } from '../../types/character-5e'
import type { ActiveCondition, ClassResource, SpellEntry } from '../../types/character-common'
import { abilityModifier } from '../../types/character-common'
import { cryptoRandom } from '../../utils/crypto-random'

// ─── Types ────────────────────────────────────────────────────

export interface HitDiePool {
  dieSize: number
  className: string
  remaining: number
  total: number
}

export interface RestorableResource {
  name: string
  current: number
  max: number
  restoreAmount: number | 'all'
}

export interface ShortRestPreview {
  hitDiePools: HitDiePool[]
  conMod: number
  restorableClassResources: RestorableResource[]
  restorableSpeciesResources: RestorableResource[]
  warlockPactSlots: { level: number; current: number; max: number } | null
  wildShapeRegain: boolean
  arcaneRecoveryEligible: boolean
  arcaneRecoveryMaxSlotLevel: number
  arcaneRecoverySlotsToRecover: number
  naturalRecoveryEligible: boolean
  naturalRecoverySlotsToRecover: number
  rangerTireless: boolean
}

export interface ShortRestDiceRoll {
  dieSize: number
  rawRoll: number
  conMod: number
  healing: number
}

export interface ShortRestResult {
  character: Character5e
  totalHealing: number
  hdSpent: Record<number, number>
  resourcesRestored: string[]
  arcaneRecoverySlotsUsed: number[]
}

export interface LongRestPreview {
  currentHP: number
  maxHP: number
  currentHD: number
  maxHD: number
  spellSlotsToRestore: Array<{ level: number; current: number; max: number }>
  pactSlotsToRestore: Array<{ level: number; current: number; max: number }>
  classResourcesToRestore: RestorableResource[]
  speciesResourcesToRestore: RestorableResource[]
  exhaustionReduction: boolean
  currentExhaustionLevel: number
  heroicInspirationGain: boolean
  wildShapeRestore: boolean
  deathSavesReset: boolean
  innateSpellsToRestore: string[]
}

export interface LongRestResult {
  character: Character5e
  hpRestored: number
  hdRestored: number
  spellSlotsRestored: number
  resourcesRestored: string[]
  exhaustionReduced: boolean
  heroicInspirationGranted: boolean
  highElfCantripSwap: boolean
}

// ─── Short Rest ───────────────────────────────────────────────

export function getShortRestPreview(character: Character5e): ShortRestPreview {
  const conMod = abilityModifier(character.abilityScores.constitution)

  const hitDiePools: HitDiePool[] = character.hitDice.map((hd, i) => ({
    dieSize: hd.dieType,
    className: character.classes[i]?.name ?? 'Unknown',
    remaining: hd.current,
    total: hd.maximum
  }))

  // Class resources that restore on short rest
  const restorableClassResources: RestorableResource[] = (character.classResources ?? [])
    .filter((r) => r.shortRestRestore !== 0 && r.current < r.max)
    .map((r) => ({
      name: r.name,
      current: r.current,
      max: r.max,
      restoreAmount: r.shortRestRestore
    }))

  const restorableSpeciesResources: RestorableResource[] = (character.speciesResources ?? [])
    .filter((r) => r.shortRestRestore !== 0 && r.current < r.max)
    .map((r) => ({
      name: r.name,
      current: r.current,
      max: r.max,
      restoreAmount: r.shortRestRestore
    }))

  // Warlock pact magic slots restore on short rest
  const pactEntries = Object.entries(character.pactMagicSlotLevels ?? {})
  const warlockPactSlots =
    pactEntries.length > 0
      ? {
          level: Number(pactEntries[0][0]),
          current: pactEntries[0][1].current,
          max: pactEntries[0][1].max
        }
      : null

  // Wild Shape: regain 1 use on short rest
  const wildShapeRegain = !!(character.wildShapeUses && character.wildShapeUses.current < character.wildShapeUses.max)

  // Arcane Recovery (Wizard): recover spell slots totaling up to half wizard level (rounded up)
  const wizardLevel = character.classes.find((c) => c.name.toLowerCase() === 'wizard')?.level ?? 0
  const arcaneRecoveryEligible = wizardLevel >= 1
  const arcaneRecoverySlotsToRecover = Math.ceil(wizardLevel / 2)
  // Max slot level = half wizard level rounded up, capped at 5
  const arcaneRecoveryMaxSlotLevel = Math.min(5, Math.ceil(wizardLevel / 2))

  // Natural Recovery (Druid, Land): recover spell slots totaling up to half druid level (rounded up)
  // For simplicity, check if druid
  const druidLevel = character.classes.find((c) => c.name.toLowerCase() === 'druid')?.level ?? 0
  const naturalRecoveryEligible = druidLevel >= 2
  const naturalRecoverySlotsToRecover = Math.ceil(druidLevel / 2)

  // Ranger Tireless (Level 10+)
  const rangerLevel = character.classes.find((c) => c.name.toLowerCase() === 'ranger')?.level ?? 0
  const hasExhaustion = (character.conditions ?? []).some((c) => c.name === 'Exhaustion' && (c.value ?? 0) > 0)
  const rangerTireless = rangerLevel >= 10 && hasExhaustion

  return {
    hitDiePools,
    conMod,
    restorableClassResources,
    restorableSpeciesResources,
    warlockPactSlots,
    wildShapeRegain,
    arcaneRecoveryEligible,
    arcaneRecoveryMaxSlotLevel,
    arcaneRecoverySlotsToRecover,
    naturalRecoveryEligible,
    naturalRecoverySlotsToRecover,
    rangerTireless
  }
}

export function rollShortRestDice(count: number, dieSize: number, conMod: number): ShortRestDiceRoll[] {
  const rolls: ShortRestDiceRoll[] = []
  for (let i = 0; i < count; i++) {
    const rawRoll = Math.floor(cryptoRandom() * dieSize) + 1
    const healing = Math.max(1, rawRoll + conMod)
    rolls.push({ dieSize, rawRoll, conMod, healing })
  }
  return rolls
}

export function applyShortRest(
  character: Character5e,
  diceRolls: ShortRestDiceRoll[],
  arcaneRecoverySlots?: number[]
): ShortRestResult {
  const totalHealing = diceRolls.reduce((sum, r) => sum + r.healing, 0)
  const hdSpent: Record<number, number> = {}
  for (const roll of diceRolls) {
    hdSpent[roll.dieSize] = (hdSpent[roll.dieSize] ?? 0) + 1
  }
  const totalHDSpent = diceRolls.length

  // HP restoration
  const newHP: HitPoints = {
    ...character.hitPoints,
    current: Math.min(character.hitPoints.maximum, character.hitPoints.current + totalHealing)
  }

  // HD decrement — distribute spent dice across per-class pools
  const newHitDice: HitDiceEntry[] = character.hitDice.map((hd) => ({ ...hd }))
  let remaining = totalHDSpent
  for (const roll of diceRolls) {
    const pool = newHitDice.find((hd) => hd.dieType === roll.dieSize && hd.current > 0)
    if (pool) {
      pool.current--
      remaining--
    }
  }
  if (remaining > 0) {
    for (const hd of newHitDice) {
      const take = Math.min(remaining, hd.current)
      hd.current -= take
      remaining -= take
      if (remaining <= 0) break
    }
  }

  // Class resources with short rest restore
  const resourcesRestored: string[] = []
  const newClassResources: ClassResource[] = (character.classResources ?? []).map((r) => {
    if (r.shortRestRestore === 0 || r.current >= r.max) return r
    const restored = r.shortRestRestore === 'all' ? r.max : Math.min(r.max, r.current + (r.shortRestRestore as number))
    if (restored > r.current) resourcesRestored.push(r.name)
    return { ...r, current: restored }
  })

  const newSpeciesResources: ClassResource[] = (character.speciesResources ?? []).map((r) => {
    if (r.shortRestRestore === 0 || r.current >= r.max) return r
    const restored = r.shortRestRestore === 'all' ? r.max : Math.min(r.max, r.current + (r.shortRestRestore as number))
    if (restored > r.current) resourcesRestored.push(r.name)
    return { ...r, current: restored }
  })

  // Warlock pact magic restoration
  const newPactSlots: Record<number, { current: number; max: number }> = {}
  for (const [level, slots] of Object.entries(character.pactMagicSlotLevels ?? {})) {
    newPactSlots[Number(level)] = { current: slots.max, max: slots.max }
    if (slots.current < slots.max) resourcesRestored.push('Pact Magic Slots')
  }

  // Wild Shape: regain 1 use
  const newWildShape = character.wildShapeUses
    ? {
        ...character.wildShapeUses,
        current: Math.min(character.wildShapeUses.max, character.wildShapeUses.current + 1)
      }
    : undefined
  if (newWildShape && newWildShape.current > (character.wildShapeUses?.current ?? 0)) {
    resourcesRestored.push('Wild Shape (+1)')
  }

  // Ranger Tireless: reduce Exhaustion by 1
  const rangerLevel = character.classes.find((c) => c.name.toLowerCase() === 'ranger')?.level ?? 0
  let newConditions = [...(character.conditions ?? [])]
  if (rangerLevel >= 10) {
    newConditions = newConditions
      .map((c) => (c.name === 'Exhaustion' && (c.value ?? 0) > 0 ? { ...c, value: (c.value ?? 0) - 1 } : c))
      .filter((c) => !(c.name === 'Exhaustion' && (c.value ?? 0) <= 0))
    if (character.conditions?.some((c) => c.name === 'Exhaustion' && (c.value ?? 0) > 0)) {
      resourcesRestored.push('Exhaustion -1 (Tireless)')
    }
  }

  // Arcane Recovery: restore selected spell slot levels
  let newSpellSlots = { ...character.spellSlotLevels }
  const arcaneRecoverySlotsUsed: number[] = []
  if (arcaneRecoverySlots && arcaneRecoverySlots.length > 0) {
    for (const level of arcaneRecoverySlots) {
      const slot = newSpellSlots[level]
      if (slot && slot.current < slot.max) {
        newSpellSlots = {
          ...newSpellSlots,
          [level]: { ...slot, current: Math.min(slot.max, slot.current + 1) }
        }
        arcaneRecoverySlotsUsed.push(level)
      }
    }
    if (arcaneRecoverySlotsUsed.length > 0) {
      resourcesRestored.push(`Arcane Recovery (L${arcaneRecoverySlotsUsed.join(', L')})`)
    }
  }

  const updated: Character5e = {
    ...character,
    hitPoints: newHP,
    hitDice: newHitDice,
    classResources: newClassResources,
    speciesResources: newSpeciesResources,
    ...(Object.keys(newPactSlots).length > 0 ? { pactMagicSlotLevels: newPactSlots } : {}),
    wildShapeUses: newWildShape,
    conditions: newConditions,
    spellSlotLevels: newSpellSlots,
    updatedAt: new Date().toISOString()
  }

  return {
    character: updated,
    totalHealing,
    hdSpent,
    resourcesRestored,
    arcaneRecoverySlotsUsed
  }
}

// ─── Long Rest ────────────────────────────────────────────────

export function getLongRestPreview(character: Character5e): LongRestPreview {
  const spellSlotsToRestore = Object.entries(character.spellSlotLevels ?? {})
    .filter(([, slots]) => slots.current < slots.max)
    .map(([level, slots]) => ({ level: Number(level), current: slots.current, max: slots.max }))

  const pactSlotsToRestore = Object.entries(character.pactMagicSlotLevels ?? {})
    .filter(([, slots]) => slots.current < slots.max)
    .map(([level, slots]) => ({ level: Number(level), current: slots.current, max: slots.max }))

  const classResourcesToRestore: RestorableResource[] = (character.classResources ?? [])
    .filter((r) => r.current < r.max)
    .map((r) => ({ name: r.name, current: r.current, max: r.max, restoreAmount: 'all' as const }))

  const speciesResourcesToRestore: RestorableResource[] = (character.speciesResources ?? [])
    .filter((r) => r.current < r.max)
    .map((r) => ({ name: r.name, current: r.current, max: r.max, restoreAmount: 'all' as const }))

  const exhaustionCondition = (character.conditions ?? []).find((c) => c.name === 'Exhaustion')
  const currentExhaustionLevel = exhaustionCondition?.value ?? 0

  const isHuman = character.species?.toLowerCase() === 'human'

  const innateSpellsToRestore = (character.knownSpells ?? [])
    .filter((s) => s.innateUses && s.innateUses.remaining < s.innateUses.max)
    .map((s) => s.name)

  return {
    currentHP: character.hitPoints.current,
    maxHP: character.hitPoints.maximum,
    currentHD: totalHitDiceRemaining(character.hitDice),
    maxHD: totalHitDiceMaximum(character.hitDice),
    spellSlotsToRestore,
    pactSlotsToRestore,
    classResourcesToRestore,
    speciesResourcesToRestore,
    exhaustionReduction: currentExhaustionLevel > 0,
    currentExhaustionLevel,
    heroicInspirationGain: isHuman,
    wildShapeRestore: !!(character.wildShapeUses && character.wildShapeUses.current < character.wildShapeUses.max),
    deathSavesReset: character.deathSaves.successes > 0 || character.deathSaves.failures > 0,
    innateSpellsToRestore
  }
}

export function applyLongRest(character: Character5e): LongRestResult {
  const hpRestored = character.hitPoints.maximum - character.hitPoints.current

  // Full HP — PHB 2024: THP expire after a Long Rest
  const newHP: HitPoints = {
    current: character.hitPoints.maximum,
    maximum: character.hitPoints.maximum,
    temporary: 0
  }

  // PHB 2024: restore up to half your total Hit Dice (minimum of one die)
  const totalMax = totalHitDiceMaximum(character.hitDice)
  const hdToRestore = Math.max(1, Math.floor(totalMax / 2))
  let hdBudget = hdToRestore
  const newHitDice: HitDiceEntry[] = character.hitDice.map((hd) => {
    const spent = hd.maximum - hd.current
    const restore = Math.min(spent, hdBudget)
    hdBudget -= restore
    return { ...hd, current: hd.current + restore }
  })
  const hdRestored = hdToRestore - hdBudget

  // All spell slots
  const restoredSpellSlots: Record<number, { current: number; max: number }> = {}
  let spellSlotsRestored = 0
  for (const [level, slots] of Object.entries(character.spellSlotLevels ?? {})) {
    restoredSpellSlots[Number(level)] = { current: slots.max, max: slots.max }
    spellSlotsRestored += slots.max - slots.current
  }

  // Pact magic
  const restoredPactSlots: Record<number, { current: number; max: number }> = {}
  for (const [level, slots] of Object.entries(character.pactMagicSlotLevels ?? {})) {
    restoredPactSlots[Number(level)] = { current: slots.max, max: slots.max }
  }

  // All class/species resources
  const resourcesRestored: string[] = []
  const newClassResources: ClassResource[] = (character.classResources ?? []).map((r) => {
    if (r.current < r.max) resourcesRestored.push(r.name)
    return { ...r, current: r.max }
  })
  const newSpeciesResources: ClassResource[] = (character.speciesResources ?? []).map((r) => {
    if (r.current < r.max) resourcesRestored.push(r.name)
    return { ...r, current: r.max }
  })

  // Wild Shape: restore all uses
  const newWildShape = character.wildShapeUses
    ? { ...character.wildShapeUses, current: character.wildShapeUses.max }
    : undefined

  // Exhaustion -1
  let exhaustionReduced = false
  const newConditions: ActiveCondition[] = (character.conditions ?? [])
    .map((c) => {
      if (c.name === 'Exhaustion' && (c.value ?? 0) > 0) {
        exhaustionReduced = true
        return { ...c, value: (c.value ?? 0) - 1 }
      }
      return c
    })
    .filter((c) => !(c.name === 'Exhaustion' && (c.value ?? 0) <= 0))

  // Death saves reset
  const newDeathSaves = { successes: 0, failures: 0 }

  // Innate spell uses restore
  const restoredSpells: SpellEntry[] = (character.knownSpells ?? []).map((s) => {
    if (!s.innateUses) return s
    return { ...s, innateUses: { max: s.innateUses.max, remaining: s.innateUses.max } }
  })

  // Human: Heroic Inspiration
  const isHuman = character.species?.toLowerCase() === 'human'
  const heroicInspirationGranted = isHuman

  // High Elf cantrip swap eligibility
  const highElfCantripSwap = character.buildChoices?.subspeciesId === 'high-elf'

  // Magic item charge restoration (long-rest rechargeType)
  const magicItemsRestored: string[] = []
  const newMagicItems = (character.magicItems ?? []).map((mi) => {
    if (!mi.charges || mi.charges.rechargeType !== 'long-rest' || mi.charges.current >= mi.charges.max) return mi
    let restored = mi.charges.max
    if (mi.charges.rechargeDice) {
      const match = mi.charges.rechargeDice.match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/)
      if (match) {
        const count = match[1] ? parseInt(match[1], 10) : 1
        const sides = parseInt(match[2], 10)
        const mod = match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0
        let roll = mod
        for (let r = 0; r < count; r++) roll += Math.floor(Math.random() * sides) + 1
        restored = Math.min(mi.charges.max, mi.charges.current + Math.max(0, roll))
      }
    }
    magicItemsRestored.push(mi.name)
    return { ...mi, charges: { ...mi.charges, current: restored } }
  })

  const updated: Character5e = {
    ...character,
    hitPoints: newHP,
    hitDice: newHitDice,
    spellSlotLevels: restoredSpellSlots,
    ...(Object.keys(restoredPactSlots).length > 0 ? { pactMagicSlotLevels: restoredPactSlots } : {}),
    deathSaves: newDeathSaves,
    conditions: newConditions,
    knownSpells: restoredSpells,
    classResources: newClassResources,
    speciesResources: newSpeciesResources,
    wildShapeUses: newWildShape,
    magicItems: newMagicItems,
    ...(heroicInspirationGranted ? { heroicInspiration: true } : {}),
    updatedAt: new Date().toISOString()
  }

  return {
    character: updated,
    hpRestored,
    hdRestored,
    spellSlotsRestored,
    resourcesRestored,
    exhaustionReduced,
    heroicInspirationGranted,
    highElfCantripSwap
  }
}
