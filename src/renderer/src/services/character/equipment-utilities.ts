/**
 * Equipment & Utility Calculators for 5e characters.
 *
 * Includes: Encumbrance (PHB 2024 Ch.6), Lifestyle Expenses,
 * Tool-Skill Interactions (DMG 2024), Wild Shape limits.
 */

// ─── Encumbrance (PHB 2024 Chapter 6) ──────────────────────

export interface EncumbranceResult {
  /** Total weight of carried equipment in lbs */
  totalWeight: number
  /** Maximum carrying capacity: STR x 15 lbs */
  carryCapacity: number
  /** Push/drag/lift maximum: STR x 30 lbs */
  pushDragLift: number
  /** Encumbrance status */
  status: 'unencumbered' | 'encumbered' | 'heavily-encumbered' | 'over-limit'
  /** Speed penalty description (empty if unencumbered) */
  speedPenalty: string
}

/**
 * Calculate encumbrance for a character based on carried equipment.
 *
 * Standard Rule (PHB 2024):
 *   - Carrying Capacity: STR x 15 lbs
 *   - Push/Drag/Lift: STR x 30 lbs
 *
 * Variant Encumbrance (DMG 2024):
 *   - Unencumbered: weight <= STR x 5
 *   - Encumbered: weight <= STR x 10 (speed -10 ft)
 *   - Heavily Encumbered: weight <= STR x 15 (speed -20 ft, disadvantage on ability checks, attack rolls, and saves using STR, DEX, or CON)
 *   - Over Limit: weight > STR x 15 (cannot move)
 *
 * @param strengthScore - Character's STR score
 * @param totalWeight - Sum of all carried equipment weights
 * @param useVariant - Use variant encumbrance rules (DMG optional)
 * @param sizeMultiplier - 2 for Large, 4 for Huge, 8 for Gargantuan; 0.5 for Tiny
 */
export function calculateEncumbrance(
  strengthScore: number,
  totalWeight: number,
  useVariant: boolean = false,
  sizeMultiplier: number = 1
): EncumbranceResult {
  const effectiveStr = strengthScore * sizeMultiplier
  const carryCapacity = effectiveStr * 15
  const pushDragLift = effectiveStr * 30

  if (!useVariant) {
    // Standard rules: only track carry capacity and push/drag/lift
    if (totalWeight > carryCapacity) {
      return {
        totalWeight,
        carryCapacity,
        pushDragLift,
        status: 'over-limit',
        speedPenalty: 'Speed 0 (over carrying capacity)'
      }
    }
    return {
      totalWeight,
      carryCapacity,
      pushDragLift,
      status: 'unencumbered',
      speedPenalty: ''
    }
  }

  // Variant encumbrance
  const lightThreshold = effectiveStr * 5
  const mediumThreshold = effectiveStr * 10

  if (totalWeight > carryCapacity) {
    return {
      totalWeight,
      carryCapacity,
      pushDragLift,
      status: 'over-limit',
      speedPenalty: 'Speed 0 (over carrying capacity)'
    }
  }
  if (totalWeight > mediumThreshold) {
    return {
      totalWeight,
      carryCapacity,
      pushDragLift,
      status: 'heavily-encumbered',
      speedPenalty: 'Speed -20 ft, disadvantage on STR/DEX/CON checks, attacks, and saves'
    }
  }
  if (totalWeight > lightThreshold) {
    return {
      totalWeight,
      carryCapacity,
      pushDragLift,
      status: 'encumbered',
      speedPenalty: 'Speed -10 ft'
    }
  }
  return {
    totalWeight,
    carryCapacity,
    pushDragLift,
    status: 'unencumbered',
    speedPenalty: ''
  }
}

/**
 * Sum the total weight of a character's equipment, weapons, armor, and inventory.
 */
export function sumEquipmentWeight(
  weapons: Array<{ weight?: number; quantity?: number }>,
  armor: Array<{ weight?: number; equipped?: boolean }>,
  gear: Array<{ weight?: number; quantity?: number }>,
  currency?: { cp?: number; sp?: number; gp?: number; pp?: number }
): number {
  let total = 0

  for (const w of weapons) {
    total += (w.weight ?? 0) * (w.quantity ?? 1)
  }
  for (const a of armor) {
    total += a.weight ?? 0
  }
  for (const g of gear) {
    total += (g.weight ?? 0) * (g.quantity ?? 1)
  }

  // Coins: 50 coins = 1 lb (PHB 2024)
  if (currency) {
    const totalCoins = (currency.cp ?? 0) + (currency.sp ?? 0) + (currency.gp ?? 0) + (currency.pp ?? 0)
    total += totalCoins / 50
  }

  return total
}

// ─── Lifestyle Expenses (PHB 2024 Chapter 6) ────────────────

export type LifestyleLevel = 'wretched' | 'squalid' | 'poor' | 'modest' | 'comfortable' | 'wealthy' | 'aristocratic'

export const LIFESTYLE_COSTS: Record<LifestyleLevel, number> = {
  wretched: 0,
  squalid: 0.1, // 1 sp/day
  poor: 0.2, // 2 sp/day
  modest: 1, // 1 gp/day
  comfortable: 2, // 2 gp/day
  wealthy: 4, // 4 gp/day
  aristocratic: 10 // 10 gp/day minimum
}

/**
 * Calculate lifestyle expenses for a given number of downtime days.
 * Returns cost in gold pieces.
 */
export function calculateLifestyleCost(lifestyle: LifestyleLevel, days: number): number {
  return LIFESTYLE_COSTS[lifestyle] * days
}

// ─── Tool-Skill Interactions (DMG 2024) ─────────────────────

export interface ToolSkillInteraction {
  tool: string
  skills: string[]
  benefit: string
}

/**
 * Tool proficiencies that grant advantage on specific skill checks (DMG 2024).
 * When proficient with a tool AND the relevant skill, the character gains advantage.
 */
export const TOOL_SKILL_INTERACTIONS: ToolSkillInteraction[] = [
  {
    tool: "Alchemist's Supplies",
    skills: ['Arcana', 'Investigation'],
    benefit: 'Advantage on Arcana/Investigation checks involving potions or alchemical substances'
  },
  {
    tool: "Brewer's Supplies",
    skills: ['Medicine', 'Persuasion'],
    benefit: 'Advantage on checks to detect poisons in drinks or to ply someone with alcohol'
  },
  {
    tool: "Calligrapher's Supplies",
    skills: ['History', 'Deception'],
    benefit: 'Advantage on History checks involving written works or Deception checks involving forgeries'
  },
  {
    tool: "Carpenter's Tools",
    skills: ['Investigation', 'Perception'],
    benefit: 'Advantage on checks to identify structural weaknesses or hidden compartments'
  },
  {
    tool: "Cartographer's Tools",
    skills: ['Nature', 'Survival'],
    benefit: 'Advantage on navigation and mapping-related checks'
  },
  {
    tool: "Cobbler's Tools",
    skills: ['Investigation', 'Perception'],
    benefit: 'Advantage on tracking-related checks involving footprints'
  },
  {
    tool: "Cook's Utensils",
    skills: ['Medicine', 'Survival'],
    benefit: 'Advantage on checks to identify food safety or forage edible plants'
  },
  {
    tool: "Glassblower's Tools",
    skills: ['Arcana', 'Investigation'],
    benefit: 'Advantage on checks involving glass objects or crystal components'
  },
  {
    tool: 'Herbalism Kit',
    skills: ['Medicine', 'Nature'],
    benefit: 'Advantage on checks to identify plants or create herbal remedies'
  },
  {
    tool: "Jeweler's Tools",
    skills: ['Arcana', 'Investigation'],
    benefit: 'Advantage on checks to appraise gems or identify magical gemstones'
  },
  {
    tool: "Leatherworker's Tools",
    skills: ['Investigation', 'Survival'],
    benefit: 'Advantage on checks to identify leather types or repair leather goods'
  },
  {
    tool: "Mason's Tools",
    skills: ['Investigation', 'Perception'],
    benefit: 'Advantage on checks to find secret doors or weak points in stone structures'
  },
  {
    tool: "Navigator's Tools",
    skills: ['Survival'],
    benefit: 'Advantage on checks to navigate or determine position'
  },
  {
    tool: "Painter's Supplies",
    skills: ['Investigation', 'Perception'],
    benefit: 'Advantage on checks to discern forgeries or notice visual details'
  },
  {
    tool: "Poisoner's Kit",
    skills: ['Medicine', 'Nature'],
    benefit: 'Advantage on checks to identify or treat poisons'
  },
  {
    tool: "Potter's Tools",
    skills: ['History', 'Investigation'],
    benefit: 'Advantage on checks to date ceramic artifacts or identify cultural origins'
  },
  {
    tool: "Smith's Tools",
    skills: ['Arcana', 'Investigation'],
    benefit: 'Advantage on checks to identify metal weapons/armor or assess metalwork quality'
  },
  {
    tool: "Thieves' Tools",
    skills: ['Investigation', 'Perception'],
    benefit: 'Advantage on checks to find or disable traps'
  },
  {
    tool: "Tinker's Tools",
    skills: ['Investigation'],
    benefit: 'Advantage on checks to repair or understand mechanical devices'
  },
  {
    tool: "Weaver's Tools",
    skills: ['Investigation', 'Perception'],
    benefit: 'Advantage on checks to identify fabric types or find hidden objects in cloth'
  },
  {
    tool: "Woodcarver's Tools",
    skills: ['Nature', 'Survival'],
    benefit: 'Advantage on checks involving wood identification or crafting wooden items'
  }
]

/**
 * Check if a tool proficiency grants advantage on a specific skill check.
 */
export function getToolSkillAdvantage(toolProficiencies: string[], skillName: string): ToolSkillInteraction | null {
  for (const interaction of TOOL_SKILL_INTERACTIONS) {
    if (
      toolProficiencies.some((t) => t.toLowerCase() === interaction.tool.toLowerCase()) &&
      interaction.skills.some((s) => s.toLowerCase() === skillName.toLowerCase())
    ) {
      return interaction
    }
  }
  return null
}

export function getWildShapeMax(druidLevel: number): number {
  if (druidLevel < 2) return 0
  if (druidLevel <= 5) return 2
  if (druidLevel <= 16) return 3
  return 4 // levels 17-20
}
