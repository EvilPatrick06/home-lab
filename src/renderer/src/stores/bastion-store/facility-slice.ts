import type { StateCreator } from 'zustand'
import type { BasicFacility, Bastion, BastionDefender, ConstructionProject, SpecialFacility } from '../../types/bastion'
import { SPECIAL_FACILITY_COSTS } from '../../types/bastion'
import { logger } from '../../utils/logger'
import type { BastionState, FacilitySliceState } from './types'
import { getBastion, updateBastion } from './types'

export const createFacilitySlice: StateCreator<BastionState, [], [], FacilitySliceState> = (_set, get) => ({
  // ---- Basic Facilities ----

  addBasicFacility: (bastionId, type, name, space) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const facility: BasicFacility = {
      id: crypto.randomUUID(),
      type,
      name,
      space,
      order: bastion.basicFacilities.length
    }
    const updated: Bastion = {
      ...bastion,
      basicFacilities: [...bastion.basicFacilities, facility],
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  removeBasicFacility: (bastionId, facilityId) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const updated: Bastion = {
      ...bastion,
      basicFacilities: bastion.basicFacilities.filter((f) => f.id !== facilityId),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  // ---- Special Facilities ----

  addSpecialFacility: (bastionId, type, name, space) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return

    // Look up facility def to get level for cost calculation
    const def = get().facilityDefs.find((d) => d.type === type)
    const facilityLevel = def?.level ?? 5
    const costs = SPECIAL_FACILITY_COSTS[facilityLevel] ?? SPECIAL_FACILITY_COSTS[5]

    // Check treasury
    if (bastion.treasury < costs.gp) {
      logger.warn(`[Bastion] Not enough gold to build ${name}. Need ${costs.gp} gp, have ${bastion.treasury} gp`)
      return
    }

    // Create construction project instead of instant build
    const project: ConstructionProject = {
      id: crypto.randomUUID(),
      projectType: 'add-special',
      specialFacilityType: type,
      specialFacilityName: name,
      specialFacilitySpace: space,
      cost: costs.gp,
      daysRequired: costs.days,
      daysCompleted: 0,
      startedAt: new Date().toISOString()
    }

    const updated: Bastion = {
      ...bastion,
      construction: [...bastion.construction, project],
      treasury: bastion.treasury - costs.gp,
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  removeSpecialFacility: (bastionId, facilityId) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const updated: Bastion = {
      ...bastion,
      specialFacilities: bastion.specialFacilities.filter((f) => f.id !== facilityId),
      defenders: bastion.defenders.filter((d) => d.barrackId !== facilityId),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  swapSpecialFacility: (bastionId, oldId, newType, newName, newSpace) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const oldFacility = bastion.specialFacilities.find((f) => f.id === oldId)
    if (!oldFacility) return
    const newFacility: SpecialFacility = {
      id: crypto.randomUUID(),
      type: newType,
      name: newName,
      space: newSpace,
      enlarged: false,
      currentOrder: null,
      orderStartedAt: null,
      hirelingNames: [],
      order: oldFacility.order
    }
    const updated: Bastion = {
      ...bastion,
      specialFacilities: bastion.specialFacilities.map((f) => (f.id === oldId ? newFacility : f)),
      defenders: bastion.defenders.filter((d) => d.barrackId !== oldId),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  enlargeSpecialFacility: (bastionId, facilityId) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const updated: Bastion = {
      ...bastion,
      specialFacilities: bastion.specialFacilities.map((f) => (f.id === facilityId ? { ...f, enlarged: true } : f)),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  configureFacility: (bastionId, facilityId, config) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const updated: Bastion = {
      ...bastion,
      specialFacilities: bastion.specialFacilities.map((f) => (f.id === facilityId ? { ...f, ...config } : f)),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  // ---- Defenders ----

  recruitDefenders: (bastionId, barrackId, names) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const newDefenders: BastionDefender[] = names.map((name) => ({
      id: crypto.randomUUID(),
      name,
      barrackId
    }))
    const updated: Bastion = {
      ...bastion,
      defenders: [...bastion.defenders, ...newDefenders],
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  removeDefenders: (bastionId, defenderIds) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const idSet = new Set(defenderIds)
    const updated: Bastion = {
      ...bastion,
      defenders: bastion.defenders.filter((d) => !idSet.has(d.id)),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  // ---- Construction ----

  startConstruction: (bastionId, project) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    if (bastion.treasury < project.cost) {
      logger.warn(
        `[Bastion] Not enough gold to start construction. Need ${project.cost} gp, have ${bastion.treasury} gp`
      )
      return
    }
    const fullProject: ConstructionProject = {
      ...project,
      id: crypto.randomUUID(),
      daysCompleted: 0,
      startedAt: new Date().toISOString()
    }
    const updated: Bastion = {
      ...bastion,
      construction: [...bastion.construction, fullProject],
      treasury: bastion.treasury - project.cost,
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  completeConstruction: (bastionId, projectId) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const project = bastion.construction.find((p) => p.id === projectId)
    if (!project) return

    const basicFacilities = [...bastion.basicFacilities]
    const specialFacilities = [...bastion.specialFacilities]

    let defensiveWalls = bastion.defensiveWalls

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

    const updated: Bastion = {
      ...bastion,
      construction: bastion.construction.filter((p) => p.id !== projectId),
      basicFacilities,
      specialFacilities,
      defensiveWalls,
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  // ---- Defensive Walls ----

  buildDefensiveWalls: (bastionId, squares) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const cost = squares * 250
    const days = squares * 10
    if (bastion.treasury < cost) {
      logger.warn(`[Bastion] Not enough gold to build defensive walls. Need ${cost} gp, have ${bastion.treasury} gp`)
      return
    }
    const currentWalls = bastion.defensiveWalls || { squaresBuilt: 0, fullyEnclosed: false }
    // Add as construction project; squaresBuilt increments only on completion
    const project: ConstructionProject = {
      id: crypto.randomUUID(),
      projectType: 'defensive-wall',
      cost,
      daysRequired: days,
      daysCompleted: 0,
      startedAt: new Date().toISOString()
    }
    const updated: Bastion = {
      ...bastion,
      construction: [...bastion.construction, project],
      defensiveWalls: currentWalls,
      treasury: bastion.treasury - cost,
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  // ---- Treasury ----

  depositGold: (bastionId, amount) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion || amount <= 0) return
    const bastions = updateBastion(get().bastions, bastionId, {
      treasury: bastion.treasury + amount
    })
    const updated = bastions.find((b) => b.id === bastionId)
    if (updated) get().saveBastion(updated)
  },

  withdrawGold: (bastionId, amount) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion || amount <= 0) return
    const bastions = updateBastion(get().bastions, bastionId, {
      treasury: Math.max(0, bastion.treasury - amount)
    })
    const updated = bastions.find((b) => b.id === bastionId)
    if (updated) get().saveBastion(updated)
  },

  // ---- Menagerie/Creatures ----

  addCreature: (bastionId, facilityId, creature) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const updated: Bastion = {
      ...bastion,
      specialFacilities: bastion.specialFacilities.map((f) =>
        f.id === facilityId ? { ...f, creatures: [...(f.creatures || []), creature] } : f
      ),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  removeCreature: (bastionId, facilityId, creatureName) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const updated: Bastion = {
      ...bastion,
      specialFacilities: bastion.specialFacilities.map((f) => {
        if (f.id !== facilityId) return f
        const creatures = [...(f.creatures || [])]
        const idx = creatures.findIndex((c) => c.name === creatureName)
        if (idx >= 0) creatures.splice(idx, 1)
        return { ...f, creatures }
      }),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  // ---- Notes ----

  updateNotes: (bastionId, notes) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const updated: Bastion = {
      ...bastion,
      notes,
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  // ---- Metadata Operations ----

  updateBastionMetadata: (bastionId, updates) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return
    const updated: Bastion = {
      ...bastion,
      ...updates,
      id: bastion.id, // Prevent ID override
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  rollBackTurn: (bastionId, turnNumber) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return

    // Find the turn to roll back to
    const turnIndex = bastion.turns.findIndex((t) => t.turnNumber === turnNumber)
    if (turnIndex < 0) return

    // Remove the specified turn and all subsequent turns
    const keptTurns = bastion.turns.slice(0, turnIndex)

    // Restore last bastion turn day from the most recent kept turn
    const lastTurnDay =
      keptTurns.length > 0
        ? bastion.inGameTime.lastBastionTurnDay // Keep current if there are still turns
        : 0

    // Clear current orders on facilities since we're rolling back
    const clearedFacilities = bastion.specialFacilities.map((f) => ({
      ...f,
      currentOrder: null,
      orderStartedAt: null
    }))

    const updated: Bastion = {
      ...bastion,
      turns: keptTurns,
      specialFacilities: clearedFacilities,
      inGameTime: { ...bastion.inGameTime, lastBastionTurnDay: lastTurnDay },
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  clearConstruction: (bastionId, projectId) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return

    const project = bastion.construction.find((p) => p.id === projectId)
    if (!project) return

    // Refund the gold cost
    const updated: Bastion = {
      ...bastion,
      construction: bastion.construction.filter((p) => p.id !== projectId),
      treasury: bastion.treasury + project.cost,
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  },

  reassignDefenders: (bastionId, defenderId, newFacilityId) => {
    const bastion = getBastion(get().bastions, bastionId)
    if (!bastion) return

    // Verify the defender exists
    const defender = bastion.defenders.find((d) => d.id === defenderId)
    if (!defender) return

    // Verify the target facility exists and is a barrack
    const targetFacility = bastion.specialFacilities.find((f) => f.id === newFacilityId)
    if (!targetFacility) return

    const updated: Bastion = {
      ...bastion,
      defenders: bastion.defenders.map((d) => (d.id === defenderId ? { ...d, barrackId: newFacilityId } : d)),
      updatedAt: new Date().toISOString()
    }
    get().saveBastion(updated)
  }
})
