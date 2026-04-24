/**
 * Damage processing utility — handles temp HP, resistance, vulnerability,
 * immunity, and massive damage per 2024 PHB Ch.1.
 */

export interface DamageApplicationResult {
  /** Temp HP lost from this hit */
  tempHpLost: number
  /** Regular HP lost from this hit */
  hpLost: number
  /** Remaining damage after reducing HP to 0 (for massive damage check) */
  remainingDamage: number
  /** Final damage after resistance/vulnerability/immunity */
  effectiveDamage: number
  /** Description of how damage was modified */
  modifierDescription: string | null
  /** Is the target now at 0 HP? */
  reducedToZero: boolean
  /** Massive damage: remaining damage >= HP max → instant death */
  instantDeath: boolean
}

/**
 * Apply damage type modifiers (resistance halves, vulnerability doubles, immunity blocks).
 * PHB order: bonuses/penalties first, then resistance halves (round down), then vulnerability doubles.
 */
export function applyDamageTypeModifiers(
  rawDamage: number,
  damageType: string | undefined,
  resistances: string[],
  vulnerabilities: string[],
  immunities: string[]
): { effectiveDamage: number; description: string | null } {
  if (!damageType) return { effectiveDamage: rawDamage, description: null }

  const dt = damageType.toLowerCase()

  // Check immunity first
  if (immunities.some((i) => i.toLowerCase() === dt)) {
    return { effectiveDamage: 0, description: `Immune to ${damageType}` }
  }

  let result = rawDamage
  const notes: string[] = []

  // Resistance: halve (round down)
  if (resistances.some((r) => r.toLowerCase() === dt)) {
    result = Math.floor(result / 2)
    notes.push('Resistant')
  }

  // Vulnerability: double
  if (vulnerabilities.some((v) => v.toLowerCase() === dt)) {
    result = result * 2
    notes.push('Vulnerable')
  }

  const description = notes.length > 0 ? `${rawDamage} ${damageType} → ${result} (${notes.join(', ')})` : null

  return { effectiveDamage: result, description }
}

/**
 * Apply damage to a character, deducting temp HP first, then regular HP.
 * Returns detailed breakdown for UI display and massive damage check.
 */
export function applyDamageToCharacter(
  currentHP: number,
  maxHP: number,
  tempHP: number,
  damage: number,
  damageType?: string,
  resistances: string[] = [],
  vulnerabilities: string[] = [],
  immunities: string[] = []
): DamageApplicationResult {
  // Apply damage type modifiers
  const { effectiveDamage, description: modifierDescription } = applyDamageTypeModifiers(
    damage,
    damageType,
    resistances,
    vulnerabilities,
    immunities
  )

  let remaining = effectiveDamage

  // Deduct from temporary HP first
  const tempHpLost = Math.min(tempHP, remaining)
  remaining -= tempHpLost

  // Deduct from regular HP
  const hpLost = Math.min(currentHP, remaining)
  remaining -= hpLost

  const reducedToZero = currentHP - hpLost <= 0

  // Massive damage: if remaining damage after reaching 0 HP >= max HP → instant death
  const instantDeath = reducedToZero && remaining >= maxHP

  return {
    tempHpLost,
    hpLost,
    remainingDamage: remaining,
    effectiveDamage,
    modifierDescription,
    reducedToZero,
    instantDeath
  }
}
