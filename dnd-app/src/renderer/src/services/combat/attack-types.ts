import type { CoverType, MasteryEffectResult } from './combat-rules'
import type { DamageResolutionSummary } from './damage-resolver'

export interface AttackResult {
  attackerName: string
  targetName: string
  weaponName: string
  attackRoll: number
  attackTotal: number
  targetAC: number
  coverType: CoverType
  coverACBonus: number
  isHit: boolean
  isCrit: boolean
  isFumble: boolean
  rollMode: 'advantage' | 'disadvantage' | 'normal'
  advantageSources: string[]
  disadvantageSources: string[]
  damageRolls: number[]
  damageTotal: number
  damageType: string
  damageResolution: DamageResolutionSummary | null
  masteryEffect: MasteryEffectResult | null
  extraDamage: Array<{ dice: string; rolls: number[]; total: number; damageType: string }>
  rangeCategory: 'melee' | 'normal' | 'long' | 'out-of-range'
  exhaustionPenalty: number
}

export interface AttackOptions {
  forceAdvantage?: boolean
  forceDisadvantage?: boolean
}
