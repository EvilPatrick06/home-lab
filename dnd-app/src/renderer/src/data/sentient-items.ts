// DMG 2024 Ch7 — Sentient Magic Items tables and generation logic

import { addToast } from '../hooks/use-toast'
import { load5eSentientItems } from '../services/data-provider'
import type { SentientCommunication } from '../types/character-5e'
import { logger } from '../utils/logger'

// Module-level caches
let ALIGNMENT_TABLE: { min: number; max: number; alignment: string }[] = []
let COMMUNICATION_TABLE: { min: number; max: number; method: SentientCommunication; description: string }[] = []
let SENSES_TABLE: { roll: number; senses: string }[] = []

export let SPECIAL_PURPOSES: { roll: number; name: string; description: string }[] = []
export let CONFLICT_DEMANDS: { name: string; description: string }[] = []

load5eSentientItems()
  .then((data) => {
    const d = data as {
      alignmentTable: typeof ALIGNMENT_TABLE
      communicationTable: typeof COMMUNICATION_TABLE
      sensesTable: typeof SENSES_TABLE
      specialPurposes: typeof SPECIAL_PURPOSES
      conflictDemands: typeof CONFLICT_DEMANDS
    }
    ALIGNMENT_TABLE = d.alignmentTable ?? []
    COMMUNICATION_TABLE = d.communicationTable ?? []
    SENSES_TABLE = d.sensesTable ?? []
    SPECIAL_PURPOSES = d.specialPurposes ?? []
    CONFLICT_DEMANDS = d.conflictDemands ?? []
  })
  .catch((err) => {
    logger.error('Failed to load sentient items data', err)
    addToast('Failed to load sentient items data', 'error')
  })

// ---- Types ----------------------------------------------------------------

export interface SentientItemProperties {
  alignment: string
  communication: { method: SentientCommunication; description: string }
  senses: string
  mentalScores: { intelligence: number; wisdom: number; charisma: number }
  specialPurpose: { name: string; description: string }
}

// ---- Dice Helpers ----------------------------------------------------------

function roll(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

function rollAbility(): number {
  const dice = [roll(6), roll(6), roll(6), roll(6)]
  dice.sort((a, b) => a - b)
  return dice[1] + dice[2] + dice[3]
}

// ---- Generation Functions --------------------------------------------------

function rollAlignment(): string {
  const r = roll(100)
  const entry = ALIGNMENT_TABLE.find((e) => r >= e.min && r <= e.max)
  return entry?.alignment ?? 'Neutral'
}

function rollCommunication(): { method: SentientCommunication; description: string } {
  const r = roll(10)
  const entry = COMMUNICATION_TABLE.find((e) => r >= e.min && r <= e.max)
  return entry ?? { method: 'empathy', description: '' }
}

function rollSenses(): string {
  const r = roll(4)
  return SENSES_TABLE.find((e) => e.roll === r)?.senses ?? SENSES_TABLE[0]?.senses ?? ''
}

function rollSpecialPurpose(): { name: string; description: string } {
  const r = roll(10)
  const entry = SPECIAL_PURPOSES.find((e) => e.roll === r)
  return entry ?? SPECIAL_PURPOSES[0] ?? { name: '', description: '' }
}

export function generateSentientItem(): SentientItemProperties {
  return {
    alignment: rollAlignment(),
    communication: rollCommunication(),
    senses: rollSenses(),
    mentalScores: {
      intelligence: rollAbility(),
      wisdom: rollAbility(),
      charisma: rollAbility()
    },
    specialPurpose: rollSpecialPurpose()
  }
}
