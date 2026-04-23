import { meetsPrerequisites } from '../../components/levelup/5e/LevelUpConfirm5e'
import {
  MULTICLASS_PREREQUISITES,
  MULTICLASS_PROFICIENCY_GAINS,
  MULTICLASS_WARNINGS,
  type MulticlassGain,
  type MulticlassWarning
} from '../../data/multiclass-prerequisites'
import type { AbilityScoreSet } from '../../types/character-common'

export interface MulticlassEligibility {
  className: string
  eligible: boolean
  requirements: Array<{ ability: string; minimum: number; current: number; met: boolean }>
}

export interface MulticlassAdvice {
  eligible: MulticlassEligibility[]
  gains: MulticlassGain[]
  warnings: MulticlassWarning[]
}

/**
 * Check which classes a character is eligible to multiclass into.
 */
export function getEligibleClasses(
  abilityScores: AbilityScoreSet | Record<string, number>,
  currentClasses: string[]
): MulticlassEligibility[] {
  return MULTICLASS_PREREQUISITES.filter((p) => !currentClasses.includes(p.className)).map((prereq) => {
    const requirements = prereq.abilityRequirements.map((req) => {
      const current = (abilityScores as Record<string, number>)[req.ability] ?? 10
      return { ability: req.ability, minimum: req.minimum, current, met: current >= req.minimum }
    })

    const eligible = prereq.requireAll ? requirements.every((r) => r.met) : requirements.some((r) => r.met)

    return { className: prereq.className, eligible, requirements }
  })
}

/**
 * Get proficiency gains for multiclassing into a specific class.
 */
export function getMulticlassGains(className: string): MulticlassGain | null {
  return MULTICLASS_PROFICIENCY_GAINS.find((g) => g.className === className) ?? null
}

/**
 * Get warnings about multiclassing into specific classes.
 */
export function getMulticlassWarnings(classNames: string[]): MulticlassWarning[] {
  return MULTICLASS_WARNINGS.filter((w) => classNames.includes(w.className))
}

/**
 * Full multiclass advisory analysis.
 */
export function getMulticlassAdvice(
  abilityScores: AbilityScoreSet | Record<string, number>,
  currentClasses: string[]
): MulticlassAdvice {
  const eligible = getEligibleClasses(abilityScores, currentClasses)
  const eligibleNames = eligible.filter((e) => e.eligible).map((e) => e.className)
  const gains = eligibleNames.map((name) => getMulticlassGains(name)).filter((g): g is MulticlassGain => g !== null)
  const warnings = getMulticlassWarnings(eligibleNames)

  return { eligible, gains, warnings }
}

// Re-export meetsPrerequisites for consumers who need character-level prerequisite checking
export { meetsPrerequisites }
