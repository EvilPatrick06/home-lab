import type { StateCreator } from 'zustand'
import {
  type AttackEventResult,
  type BastionEventResult,
  type EnclaveCreatureEntry,
  type ExpertTrainerEntry,
  type ForgeConstructEntry,
  type GamblingResult,
  type GuildEntry,
  type MenagerieCreatureEntry,
  type PubSpecialEntry,
  resolveAttackEvent,
  rollBastionEvent,
  rollD,
  rollGamingHallWinnings,
  type TreasureResult
} from '../../data/bastion-events'
import type { Bastion, BastionTurn, TurnOrder } from '../../types/bastion'
import type { BastionState, EventSliceState } from './types'
import { getBastion } from './types'

type _AttackEventResult = AttackEventResult
type _BastionEventResult = BastionEventResult
type _EnclaveCreatureEntry = EnclaveCreatureEntry
type _ExpertTrainerEntry = ExpertTrainerEntry
type _ForgeConstructEntry = ForgeConstructEntry
type _GamblingResult = GamblingResult
type _GuildEntry = GuildEntry
type _MenagerieCreatureEntry = MenagerieCreatureEntry
type _PubSpecialEntry = PubSpecialEntry
type _TreasureResult = TreasureResult

export const createEventSlice: StateCreator<BastionState, [], [], EventSliceState> = (_set, get) => ({
  // ---- Bastion Turns ----

  advanceTime: (bastionId, days) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return

    const newDay = bastion.inGameTime.currentDay + days

    // Advance construction projects
    const updatedConstruction = bastion.construction.map((p) => ({
      ...p,
      daysCompleted: Math.min(p.daysCompleted + days, p.daysRequired)
    }))

    // Complete finished projects
    const completed = updatedConstruction.filter((p) => p.daysCompleted >= p.daysRequired)
    const remaining = updatedConstruction.filter((p) => p.daysCompleted < p.daysRequired)

    const basicFacilities = [...bastion.basicFacilities]
    const specialFacilities = [...bastion.specialFacilities]
    let defensiveWalls = bastion.defensiveWalls

    for (const project of completed) {
      if (project.projectType === 'add-basic' && project.facilityType) {
        basicFacilities.push({
          id: crypto.randomUUID(),
          type: project.facilityType,
          name: project.facilityType
            .split('-')
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(' '),
          space: project.targetSpace || 'roomy',
          order: basicFacilities.length
        })
      } else if (project.projectType === 'add-special' && project.specialFacilityType) {
        specialFacilities.push({
          id: crypto.randomUUID(),
          type: project.specialFacilityType,
          name:
            project.specialFacilityName ||
            project.specialFacilityType
              .split('-')
              .map((w) => w[0].toUpperCase() + w.slice(1))
              .join(' '),
          space: project.specialFacilitySpace || 'roomy',
          enlarged: false,
          currentOrder: null,
          orderStartedAt: null,
          hirelingNames: [],
          order: specialFacilities.length
        })
      } else if (project.projectType === 'defensive-wall') {
        const squaresAdded = project.cost / 250
        defensiveWalls = {
          squaresBuilt: (defensiveWalls?.squaresBuilt ?? 0) + squaresAdded,
          fullyEnclosed: true
        }
      }
    }

    const updated: Bastion = {
      ...bastion,
      inGameTime: { ...bastion.inGameTime, currentDay: newDay },
      construction: remaining,
      basicFacilities,
      specialFacilities,
      defensiveWalls,
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)

    // Check if turn is due
    if (newDay - bastion.inGameTime.lastBastionTurnDay >= bastion.inGameTime.turnFrequencyDays) {
      get().checkAndTriggerTurn(bastionId)
    }
  },

  checkAndTriggerTurn: (bastionId) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return false
    const daysSinceLast = bastion.inGameTime.currentDay - bastion.inGameTime.lastBastionTurnDay
    return daysSinceLast >= bastion.inGameTime.turnFrequencyDays
  },

  startTurn: (bastionId) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return null
    const nextTurnNumber = bastion.turns.length > 0 ? Math.max(...bastion.turns.map((t) => t.turnNumber)) + 1 : 1

    const turn: BastionTurn = {
      turnNumber: nextTurnNumber,
      inGameDate: `Day ${bastion.inGameTime.currentDay}`,
      orders: [],
      maintainIssued: false,
      eventRoll: null,
      eventType: null,
      eventOutcome: null,
      resolvedAt: null
    }

    const updated: Bastion = {
      ...bastion,
      turns: [...bastion.turns, turn],
      inGameTime: {
        ...bastion.inGameTime,
        lastBastionTurnDay: bastion.inGameTime.currentDay
      },
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
    return turn
  },

  issueOrder: (bastionId, turnNumber, facilityId, orderType, details, goldCost) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return

    const facility = bastion.specialFacilities.find((f) => f.id === facilityId)
    if (!facility) return

    const order: TurnOrder = {
      facilityId,
      facilityName: facility.name,
      orderType,
      details,
      goldCost: goldCost || 0
    }

    let treasury = bastion.treasury
    if (goldCost && goldCost > 0) {
      treasury = Math.max(0, treasury - goldCost)
    }

    const updated: Bastion = {
      ...bastion,
      turns: bastion.turns.map((t) => (t.turnNumber === turnNumber ? { ...t, orders: [...t.orders, order] } : t)),
      specialFacilities: bastion.specialFacilities.map((f) =>
        f.id === facilityId ? { ...f, currentOrder: orderType, orderStartedAt: new Date().toISOString() } : f
      ),
      treasury,
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  issueMaintainOrder: (bastionId, turnNumber) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return

    const updated: Bastion = {
      ...bastion,
      turns: bastion.turns.map((t) => (t.turnNumber === turnNumber ? { ...t, maintainIssued: true } : t)),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  rollAndResolveEvent: (bastionId, turnNumber) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return

    const turn = bastion.turns.find((t) => t.turnNumber === turnNumber)
    if (!turn) return

    const eventResult = rollBastionEvent()
    let treasury = bastion.treasury
    let defenders = [...bastion.defenders]
    const eventDetails: Record<string, unknown> = { ...eventResult.subRolls }
    let eventOutcome = eventResult.description

    // Auto-resolve certain events
    if (eventResult.eventType === 'attack') {
      const hasArmory = bastion.specialFacilities.some((f) => f.type === 'armory')
      const hasWalls = bastion.defensiveWalls?.fullyEnclosed || false
      const attackResult = resolveAttackEvent(defenders.length, hasArmory, hasWalls)
      eventDetails.attackResult = attackResult
      // Use the resolved description (includes armory/walls modifiers) over the preliminary one
      eventOutcome = attackResult.description

      // Remove killed defenders (from the end of the list)
      if (attackResult.defendersLost > 0) {
        defenders = defenders.slice(0, defenders.length - attackResult.defendersLost)
      }
    } else if (eventResult.eventType === 'friendly-visitors') {
      const income = (eventResult.subRolls['d6-income'] || 1) * 100
      treasury += income
      eventDetails.goldGained = income
    } else if (eventResult.eventType === 'refugees') {
      const income = (eventResult.subRolls['d6-refugee-income'] || 1) * 100
      treasury += income
      eventDetails.goldGained = income
    }

    // Harvest order: gaming hall earns winnings this bastion turn.
    const gamingHallHarvest = bastion.specialFacilities.find(
      (f) => f.type === 'gaming-hall' && f.currentOrder === 'harvest'
    )
    if (gamingHallHarvest) {
      const winnings = rollGamingHallWinnings()
      const diceRolls = Array.from({ length: winnings.diceCount }, () => rollD(6))
      const goldEarned = diceRolls.reduce((sum, d) => sum + d, 0) * 10
      treasury += goldEarned
      eventDetails.gamingHallWinnings = { ...winnings, goldEarned, diceRolls }
    }

    const updated: Bastion = {
      ...bastion,
      turns: bastion.turns.map((t) =>
        t.turnNumber === turnNumber
          ? {
              ...t,
              eventRoll: eventResult.roll,
              eventType: eventResult.eventType,
              eventOutcome: eventOutcome,
              eventDetails
            }
          : t
      ),
      treasury,
      defenders,
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  completeTurn: (bastionId, turnNumber) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return

    const updated: Bastion = {
      ...bastion,
      turns: bastion.turns.map((t) =>
        t.turnNumber === turnNumber ? { ...t, resolvedAt: new Date().toISOString() } : t
      ),
      specialFacilities: bastion.specialFacilities.map((f) => ({
        ...f,
        currentOrder: null,
        orderStartedAt: null
      })),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  }
})
