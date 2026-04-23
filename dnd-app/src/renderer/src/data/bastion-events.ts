// ============================================================================
// Bastion Events — D&D 5e (2024 PHB) bastion turn event tables, dice helpers,
// and resolution functions for automating bastion management between sessions.
// Data loaded from bastion-events.json via DataStore.
// ============================================================================

import { load5eBastionEvents } from '../services/data-provider'
import { logger } from '../utils/logger'

// ---- Dice Helpers ----------------------------------------------------------

/** Roll a single die with `n` sides (1..n inclusive). */
export function rollD(n: number): number {
  return Math.floor(Math.random() * n) + 1
}

/** Roll `count` dice each with `sides` sides, return the array of results. */
export function rollND(count: number, sides: number): number[] {
  const results: number[] = []
  for (let i = 0; i < count; i++) {
    results.push(rollD(sides))
  }
  return results
}

/** Roll a d100 (1..100). */
export function rollD100(): number {
  return rollD(100)
}

// ---- Types -----------------------------------------------------------------

export interface BastionEventResult {
  eventType: string
  description: string
  roll: number
  subRolls: Record<string, number>
}

export interface AttackEventResult {
  defendersLost: number
  facilityShutdown: boolean
  attackDice: number[]
  description: string
}

export interface GamblingResult {
  roll: number
  goldEarned: number
  diceRolled: number[]
  description: string
}

export interface TreasureResult {
  roll: number
  description: string
  category: string
}

export interface MenagerieCreatureEntry {
  name: string
  creatureType: string
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge'
  cost: number
  cr: string
}

export interface ExpertTrainerEntry {
  type: 'battle' | 'skills' | 'tools' | 'unarmed-combat' | 'weapon'
  name: string
  empowerEffect: string
  description: string
}

export interface PubSpecialEntry {
  name: string
  description: string
  effect: string
}

export interface GuildEntry {
  guildType: string
  description: string
}

export interface EnclaveCreatureEntry {
  creatureType: string
  examples: string
  cr: string
}

export interface ForgeConstructEntry {
  name: string
  cr: string
  timeDays: number
  costGP: number
  description: string
}

interface BastionEventEntry {
  min: number
  max: number
  eventType: string
  label: string
}

// ---- Data tables (loaded from JSON) ----------------------------------------

export let ALL_IS_WELL_FLAVORS: { roll: number; flavor: string }[] = []
export let GUEST_TABLE: { roll: number; guestType: string; description: string }[] = []
export let TREASURE_TABLE: { min: number; max: number; category: string; description: string }[] = []
export let BASTION_EVENTS_TABLE: BastionEventEntry[] = []
export let GAMING_HALL_WINNINGS: { min: number; max: number; diceCount: number; description: string }[] = []
export let MENAGERIE_CREATURES: MenagerieCreatureEntry[] = []
export let CREATURE_COSTS_BY_CR: { cr: string; cost: number }[] = []
export let EXPERT_TRAINERS: ExpertTrainerEntry[] = []
export let PUB_SPECIALS: PubSpecialEntry[] = []
export let SAMPLE_GUILDS: GuildEntry[] = []
export let EMERALD_ENCLAVE_CREATURES: EnclaveCreatureEntry[] = []
export let FORGE_CONSTRUCTS: ForgeConstructEntry[] = []

load5eBastionEvents()
  .then((raw) => {
    const data = raw as Record<string, unknown>
    if (data.allIsWellFlavors) ALL_IS_WELL_FLAVORS = data.allIsWellFlavors as typeof ALL_IS_WELL_FLAVORS
    if (data.guestTable) GUEST_TABLE = data.guestTable as typeof GUEST_TABLE
    if (data.treasureTable) TREASURE_TABLE = data.treasureTable as typeof TREASURE_TABLE
    if (data.eventsTable) BASTION_EVENTS_TABLE = data.eventsTable as typeof BASTION_EVENTS_TABLE
    if (data.gamingHallWinnings) GAMING_HALL_WINNINGS = data.gamingHallWinnings as typeof GAMING_HALL_WINNINGS
    if (data.menagerieCreatures) MENAGERIE_CREATURES = data.menagerieCreatures as typeof MENAGERIE_CREATURES
    if (data.creatureCostsByCr) CREATURE_COSTS_BY_CR = data.creatureCostsByCr as typeof CREATURE_COSTS_BY_CR
    if (data.expertTrainers) EXPERT_TRAINERS = data.expertTrainers as typeof EXPERT_TRAINERS
    if (data.pubSpecials) PUB_SPECIALS = data.pubSpecials as typeof PUB_SPECIALS
    if (data.sampleGuilds) SAMPLE_GUILDS = data.sampleGuilds as typeof SAMPLE_GUILDS
    if (data.emeraldEnclaveCreatures)
      EMERALD_ENCLAVE_CREATURES = data.emeraldEnclaveCreatures as typeof EMERALD_ENCLAVE_CREATURES
    if (data.forgeConstructs) FORGE_CONSTRUCTS = data.forgeConstructs as typeof FORGE_CONSTRUCTS
  })
  .catch((err) => {
    logger.error('[BastionEvents] Failed to load bastion event tables:', err)
  })

// ---- Resolution Functions --------------------------------------------------

function findEventEntry(roll: number): BastionEventEntry {
  const entry = BASTION_EVENTS_TABLE.find((e) => roll >= e.min && roll <= e.max)
  return entry ?? BASTION_EVENTS_TABLE[0] ?? { min: 1, max: 100, eventType: 'all-is-well', label: 'All Is Well' }
}

function findTreasureEntry(roll: number): { description: string; category: string } {
  const entry = TREASURE_TABLE.find((e) => roll >= e.min && roll <= e.max)
  return entry ?? { description: 'A curious trinket of unknown value', category: 'art-25gp' }
}

/**
 * Roll on the gaming hall winnings table (used for Harvest order result).
 */
export function rollGamingHallWinnings(): { diceCount: number; description: string; roll: number } {
  const roll = rollD100()
  const entry = GAMING_HALL_WINNINGS.find((e) => roll >= e.min && roll <= e.max)
  return { ...(entry ?? { diceCount: 1, description: 'The house takes in 1d6 × 10 GP.' }), roll }
}

/**
 * Roll a bastion event on the d100 table.
 */
export function rollBastionEvent(): BastionEventResult {
  const roll = rollD100()
  const entry = findEventEntry(roll)
  const subRolls: Record<string, number> = {}

  let description = ''

  switch (entry.eventType) {
    case 'all-is-well': {
      const flavorRoll = rollD(8)
      subRolls['d8-flavor'] = flavorRoll
      const flavor = ALL_IS_WELL_FLAVORS.find((f) => f.roll === flavorRoll)
      description = `All Is Well. ${flavor?.flavor ?? 'Nothing eventful happens this bastion turn.'}`
      break
    }

    case 'attack': {
      const attackDice = rollND(6, 6)
      const onesCount = attackDice.filter((d) => d === 1).length
      subRolls['6d6-attack'] = attackDice.reduce((a, b) => a + b, 0)
      subRolls['defenders-killed'] = onesCount
      description = `Attack! Enemies assault the bastion. Roll 6d6 [${attackDice.join(', ')}] — each 1 means a defender is killed. ${onesCount} defender(s) lost. If you have no defenders, a random facility is shut down for 1d6 days.`
      break
    }

    case 'criminal-hireling': {
      const bribeRoll = rollD(6)
      subRolls['d6-bribe'] = bribeRoll
      const bribeCost = bribeRoll * 100
      description = `Criminal Hireling! One of your hirelings has been caught engaging in criminal activity. You can pay a bribe of ${bribeCost} GP (${bribeRoll} × 100) to make the problem go away, or dismiss the hireling and lose use of their facility for 1 bastion turn.`
      break
    }

    case 'extraordinary-opportunity': {
      description =
        'Extraordinary Opportunity! Your Bastion is given the opportunity to host an important festival or celebration, fund the research of a powerful spellcaster, or appease a domineering noble. If you invest 500 GP, the DM rolls again on the Bastion Events table (rerolling this result if it comes up again). If you decline, nothing happens.'
      break
    }

    case 'friendly-visitors': {
      const incomeRoll = rollD(6)
      subRolls['d6-income'] = incomeRoll
      const income = incomeRoll * 100
      description = `Friendly Visitors! A group of friendly visitors arrives at the bastion. They spend freely, generating ${income} GP (${incomeRoll} x 100) in income. You may also let them use one facility of your choice for free.`
      break
    }

    case 'guest': {
      const guestRoll = rollD(4)
      subRolls['d4-guest'] = guestRoll
      const guest = GUEST_TABLE.find((g) => g.roll === guestRoll)
      description = `Guest! ${guest?.guestType ?? 'A mysterious visitor'} arrives at the bastion. ${guest?.description ?? 'They request lodging for a few days.'}`
      break
    }

    case 'lost-hirelings': {
      description =
        'Lost Hirelings! Some of your hirelings have gone missing — lost in nearby wilderness, lured away by rival employers, or simply wandered off. A random facility loses its hirelings and is offline for 1 bastion turn until replacements are found.'
      break
    }

    case 'magical-discovery': {
      description =
        'Magical Discovery! Your hirelings discover or accidentally create an Uncommon magic item of your choice at no cost to you. The magic item must be a Potion or Scroll.'
      break
    }

    case 'refugees': {
      const refugeeRoll = rollND(2, 4)
      const refugeeCount = refugeeRoll.reduce((a, b) => a + b, 0)
      const refugeeIncomeRoll = rollD(6)
      subRolls['2d4-refugees'] = refugeeCount
      subRolls['d6-refugee-income'] = refugeeIncomeRoll
      const refugeeIncome = refugeeIncomeRoll * 100
      description = `Refugees! ${refugeeCount} refugees (2d4 [${refugeeRoll.join(', ')}]) arrive at the bastion seeking shelter. If you take them in, they contribute ${refugeeIncome} GP (${refugeeIncomeRoll} x 100) in labor and services over the next bastion turn. Some may be willing to stay on as hirelings.`
      break
    }

    case 'request-for-aid': {
      description =
        'Request for Aid! Your Bastion is called on to help a local leader. You may send one or more Bastion Defenders. Roll 1d6 for each defender sent. If the total is 10 or higher, the problem is solved and you earn 1d6 × 100 GP. If the total is less than 10, the problem is still solved, but the reward is halved and one defender is killed.'
      break
    }

    case 'treasure': {
      const treasureRoll = rollD100()
      subRolls['d100-treasure'] = treasureRoll
      const treasure = findTreasureEntry(treasureRoll)
      description = `Treasure! Your hirelings discover a hidden cache or unexpected windfall. ${treasure.description}.`
      break
    }

    default:
      description = 'An uneventful bastion turn.'
  }

  return {
    eventType: entry.eventType,
    description,
    roll,
    subRolls
  }
}

/**
 * Resolve an Attack bastion event.
 */
export function resolveAttackEvent(defenderCount: number, hasArmory: boolean, hasWalls: boolean): AttackEventResult {
  const diceCount = hasWalls ? 4 : 6
  const diceSides = hasArmory ? 8 : 6
  const attackDice = rollND(diceCount, diceSides)
  const onesCount = attackDice.filter((d) => d === 1).length

  const defendersLost = Math.min(onesCount, defenderCount)
  const facilityShutdown = defenderCount === 0

  let description: string
  if (facilityShutdown) {
    description = `Attack on the bastion! With no defenders present, a random facility is shut down until after the next Bastion turn. Dice: [${attackDice.join(', ')}].`
  } else if (defendersLost === 0) {
    description = `Attack on the bastion! Your defenders repel the assault with no losses. Dice: [${attackDice.join(', ')}].`
  } else {
    description = `Attack on the bastion! ${defendersLost} defender(s) killed in the fighting. Dice: [${attackDice.join(', ')}].`
    if (hasArmory) description += ' (Armory: rolled d8s instead of d6s.)'
    if (hasWalls) description += ' (Defensive Walls: reduced dice count by 2.)'
  }

  return { defendersLost, facilityShutdown, attackDice, description }
}
