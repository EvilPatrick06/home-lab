import type { StateCreator } from 'zustand'
import { publishSystemChat } from '../../events/system-chat-bridge'
import { createAttackTracker } from '../../services/combat/multi-attack-tracker'
import { pluginEventBus } from '../../services/plugin-system/event-bus'
import type { EntityCondition, InitiativeEntry } from '../../types/game-state'
import { createTurnState, type GameStoreState, type InitiativeSliceState } from './types'

export const createInitiativeSlice: StateCreator<GameStoreState, [], [], InitiativeSliceState> = (set, get) => ({
  // --- Initiative ---

  pendingLairAction: null,
  setPendingLairAction: (action) => set({ pendingLairAction: action }),

  startInitiative: (entries: InitiativeEntry[]) => {
    const sorted = [...entries].sort((a, b) => b.total - a.total)
    sorted.forEach((e, i) => {
      e.isActive = i === 0
    })

    set({
      initiative: {
        entries: sorted,
        currentIndex: 0,
        round: 1
      },
      round: 1,
      turnMode: 'initiative'
    })

    if (pluginEventBus.hasSubscribers('game:initiative-start')) {
      pluginEventBus.emit('game:initiative-start', { entries: sorted, round: 1 })
    }
  },

  addToInitiative: (entry: InitiativeEntry) => {
    // Auto-populate lair actions from sidebar stat blocks when inLair is true
    let enrichedEntry = entry
    if (entry.inLair && !entry.lairActions) {
      const allSidebar = [...get().allies, ...get().enemies]
      const sidebarMatch = allSidebar.find((s) => s.sourceId === entry.id || s.name === entry.entityName)
      if (sidebarMatch?.statBlock?.lairActions?.length) {
        enrichedEntry = { ...entry, lairActions: sidebarMatch.statBlock.lairActions }
      }
    }

    const { initiative } = get()
    if (!initiative) {
      get().startInitiative([enrichedEntry])
      return
    }

    const newEntries = [...initiative.entries, enrichedEntry].sort((a, b) => b.total - a.total)
    const newCurrentIndex = newEntries.findIndex((e) => e.id === initiative.entries[initiative.currentIndex]?.id)

    const updated = newEntries.map((e, i) => ({
      ...e,
      isActive: i === (newCurrentIndex >= 0 ? newCurrentIndex : 0)
    }))

    set({
      initiative: {
        ...initiative,
        entries: updated,
        currentIndex: newCurrentIndex >= 0 ? newCurrentIndex : 0
      }
    })
  },

  nextTurn: () => {
    const { initiative, turnStates, inGameTime } = get()
    if (!initiative || initiative.entries.length === 0) return

    const { entries, currentIndex } = initiative

    // Find next non-delaying entity
    let nextIndex = (currentIndex + 1) % entries.length
    let loopCount = 0
    while (entries[nextIndex]?.isDelaying && loopCount < entries.length) {
      nextIndex = (nextIndex + 1) % entries.length
      loopCount++
    }
    // All entities are delaying — just advance normally
    if (loopCount >= entries.length) {
      nextIndex = (currentIndex + 1) % entries.length
    }

    const newRound = nextIndex <= currentIndex ? initiative.round + 1 : initiative.round

    // Emit turn-end for current entity
    if (pluginEventBus.hasSubscribers('game:turn-end')) {
      const currentEntry = entries[currentIndex]
      if (currentEntry) {
        pluginEventBus.emit('game:turn-end', {
          entityId: currentEntry.entityId,
          entityName: currentEntry.entityName,
          round: initiative.round
        })
      }
    }

    const updatedEntries = entries.map((e, i) => ({
      ...e,
      isActive: i === nextIndex
    }))

    // Reset the next entity's turn state
    const nextEntity = entries[nextIndex]
    if (!nextEntity) return
    const existingTs = turnStates[nextEntity.entityId]
    const speed = existingTs?.movementMax ?? 30

    // Auto-advance 6 seconds when a new round begins (5e: 1 round = 6 seconds)
    const isNewRound = newRound > initiative.round
    const newInGameTime = isNewRound && inGameTime ? { totalSeconds: inGameTime.totalSeconds + 6 } : inGameTime

    // Initialize attack tracker for the next entity's turn
    // Default to 1 (single attack) — actual extra attacks are resolved by combat-resolver
    const maxAttacks = 1
    const tracker = createAttackTracker(nextEntity.entityId, maxAttacks)

    set({
      initiative: {
        ...initiative,
        entries: updatedEntries,
        currentIndex: nextIndex,
        round: newRound
      },
      round: newRound,
      turnStates: {
        ...turnStates,
        [nextEntity.entityId]: {
          ...createTurnState(nextEntity.entityId, speed),
          concentratingSpell: existingTs?.concentratingSpell,
          attackTracker: {
            attacksUsed: tracker.attacksUsed,
            maxAttacks: tracker.maxAttacks,
            bonusAttacksUsed: tracker.bonusAttacksUsed,
            maxBonusAttacks: tracker.bonusAttacks
          }
        }
      },
      inGameTime: newInGameTime
    })

    // Check for expired custom effects after round/time update
    get().checkExpiredEffects()

    // Check if the new active entity is a player at 0 HP — emit death save needed event
    const allMaps = get().maps
    for (const map of allMaps) {
      const activeToken = map.tokens.find((t) => t.entityId === nextEntity.entityId)
      if (activeToken?.entityType === 'player' && activeToken.currentHP === 0) {
        pluginEventBus.emit('game:death-save-needed', {
          entityId: nextEntity.entityId,
          entityName: nextEntity.entityName,
          round: newRound
        })
        break
      }
    }

    // Emit plugin hooks for turn start and round end
    if (pluginEventBus.hasSubscribers('game:turn-start')) {
      const nextEntry = entries[nextIndex]
      if (nextEntry) {
        pluginEventBus.emit('game:turn-start', {
          entityId: nextEntry.entityId,
          entityName: nextEntry.entityName,
          round: newRound
        })
      }
    }
    if (isNewRound && pluginEventBus.hasSubscribers('game:round-end')) {
      pluginEventBus.emit('game:round-end', { round: newRound - 1 })
    }

    // Trigger lair action prompt at the start of a new round
    if (isNewRound) {
      const lairEntry = entries.find((e) => e.inLair && e.lairActions && e.lairActions.length > 0)
      if (lairEntry) {
        set({
          pendingLairAction: {
            creatureName: lairEntry.entityName,
            lairActions: lairEntry.lairActions!
          }
        })
      }
    }

    // Auto-countdown round-based conditions
    if (isNewRound) {
      const currentConditions = get().conditions
      const expired: EntityCondition[] = []
      const remaining: EntityCondition[] = []
      for (const c of currentConditions) {
        if (typeof c.duration === 'number' && c.duration > 0 && newRound - c.appliedRound >= c.duration) {
          expired.push(c)
        } else {
          remaining.push(c)
        }
      }
      if (expired.length > 0) {
        set({ conditions: remaining })
        // Post system messages for expired conditions
        for (const c of expired) {
          publishSystemChat({
            senderId: 'system',
            senderName: 'System',
            content: `${c.entityName}'s ${c.condition} condition has expired (after ${c.duration} round${c.duration !== 1 ? 's' : ''}).`,
            timestamp: Date.now(),
            isSystem: true
          })
        }
      }
    }

    // Clear all isDelaying flags at the start of a new round
    // (entities that never un-delayed lose their turn)
    if (isNewRound) {
      const currentInit = get().initiative
      if (currentInit) {
        const clearedEntries = currentInit.entries.map((e) => (e.isDelaying ? { ...e, isDelaying: false } : e))
        set({
          initiative: { ...currentInit, entries: clearedEntries }
        })
      }
    }
  },

  prevTurn: () => {
    const { initiative } = get()
    if (!initiative || initiative.entries.length === 0) return

    const { entries, currentIndex } = initiative
    const prevIndex = currentIndex === 0 ? entries.length - 1 : currentIndex - 1
    const newRound = prevIndex === entries.length - 1 && initiative.round > 1 ? initiative.round - 1 : initiative.round

    const updatedEntries = entries.map((e, i) => ({
      ...e,
      isActive: i === prevIndex
    }))

    set({
      initiative: {
        ...initiative,
        entries: updatedEntries,
        currentIndex: prevIndex,
        round: newRound
      },
      round: newRound
    })
  },

  endInitiative: () => {
    set({
      initiative: null,
      turnMode: 'free',
      round: 0
    })

    if (pluginEventBus.hasSubscribers('game:initiative-end')) {
      pluginEventBus.emit('game:initiative-end', {})
    }
  },

  updateInitiativeEntry: (entryId: string, updates: Partial<InitiativeEntry>) => {
    const { initiative } = get()
    if (!initiative) return

    set({
      initiative: {
        ...initiative,
        entries: initiative.entries.map((e) => (e.id === entryId ? { ...e, ...updates } : e))
      }
    })
  },

  removeFromInitiative: (entryId: string) => {
    const { initiative } = get()
    if (!initiative) return

    const newEntries = initiative.entries.filter((e) => e.id !== entryId)
    if (newEntries.length === 0) {
      get().endInitiative()
      return
    }

    const newIndex = Math.min(initiative.currentIndex, newEntries.length - 1)
    const updated = newEntries.map((e, i) => ({
      ...e,
      isActive: i === newIndex
    }))

    set({
      initiative: {
        ...initiative,
        entries: updated,
        currentIndex: newIndex
      }
    })
  },

  reorderInitiative: (fromIndex: number, toIndex: number) => {
    const { initiative } = get()
    if (!initiative) return

    const entries = [...initiative.entries]
    const [moved] = entries.splice(fromIndex, 1)
    if (!moved) return
    entries.splice(toIndex, 0, moved)

    // Track the currently active entry by ID so it stays active after reorder
    const activeEntry = initiative.entries[initiative.currentIndex]
    const activeId = activeEntry?.id
    const newCurrentIndex = entries.findIndex((e) => e.id === activeId)

    set({
      initiative: {
        ...initiative,
        entries,
        currentIndex: newCurrentIndex >= 0 ? newCurrentIndex : 0
      }
    })
  },

  delayTurn: (entityId: string) => {
    const { initiative } = get()
    if (!initiative) return

    const entryIndex = initiative.entries.findIndex((e) => e.entityId === entityId)
    if (entryIndex < 0) return

    // Mark as delaying
    const updatedEntries = initiative.entries.map((e) =>
      e.entityId === entityId ? { ...e, isDelaying: true, isActive: false } : e
    )
    set({
      initiative: { ...initiative, entries: updatedEntries }
    })

    // Advance to next turn
    get().nextTurn()
  },

  undelay: (entityId: string) => {
    const { initiative } = get()
    if (!initiative) return

    const entryIndex = initiative.entries.findIndex((e) => e.entityId === entityId)
    if (entryIndex < 0) return

    // Insert the entity back at the current position by clearing delay flag
    const updatedEntries = initiative.entries.map((e) => (e.entityId === entityId ? { ...e, isDelaying: false } : e))

    // Reorder: move the un-delayed entity to just after the current active entry
    const currentIdx = initiative.currentIndex
    const fromIdx = updatedEntries.findIndex((e) => e.entityId === entityId)
    if (fromIdx >= 0 && fromIdx !== currentIdx + 1) {
      const [moved] = updatedEntries.splice(fromIdx, 1)
      if (moved) {
        // After splice, if fromIdx < currentIdx the active entry shifted left by 1
        const insertAt = fromIdx < currentIdx ? currentIdx : currentIdx + 1
        updatedEntries.splice(insertAt, 0, moved)
      }
    }

    // Recalculate currentIndex since entries shifted
    const activeEntry = initiative.entries[initiative.currentIndex]
    const newCurrentIndex = updatedEntries.findIndex((e) => e.id === activeEntry?.id)

    set({
      initiative: {
        ...initiative,
        entries: updatedEntries,
        currentIndex: newCurrentIndex >= 0 ? newCurrentIndex : initiative.currentIndex
      }
    })
  },

  readyAction: (entityId: string, trigger: string, action: string) => {
    const { initiative } = get()
    if (!initiative) return

    // Set the ready action on the entry
    const updatedEntries = initiative.entries.map((e) =>
      e.entityId === entityId ? { ...e, readyAction: { trigger, action } } : e
    )
    set({
      initiative: { ...initiative, entries: updatedEntries }
    })

    // Readying an action uses the action and ends the turn
    get().useAction(entityId)
    get().nextTurn()
  },

  triggerReadyAction: (entityId: string) => {
    const { initiative } = get()
    if (!initiative) return

    const entry = initiative.entries.find((e) => e.entityId === entityId)
    if (!entry?.readyAction) return

    // Clear the readied action after triggering
    const updatedEntries = initiative.entries.map((e) =>
      e.entityId === entityId ? { ...e, readyAction: undefined } : e
    )
    set({
      initiative: { ...initiative, entries: updatedEntries }
    })
  },

  clearReady: (entityId: string) => {
    const { initiative } = get()
    if (!initiative) return

    const updatedEntries = initiative.entries.map((e) =>
      e.entityId === entityId ? { ...e, readyAction: undefined } : e
    )
    set({
      initiative: { ...initiative, entries: updatedEntries }
    })
  },

  // --- Turn state (combat) ---

  initTurnState: (entityId: string, speed: number) => {
    set((state) => ({
      turnStates: { ...state.turnStates, [entityId]: createTurnState(entityId, speed) }
    }))
  },

  useAction: (entityId: string) => {
    set((state) => ({
      turnStates: {
        ...state.turnStates,
        [entityId]: state.turnStates[entityId]
          ? { ...state.turnStates[entityId], actionUsed: true }
          : createTurnState(entityId, 30)
      }
    }))
  },

  useBonusAction: (entityId: string) => {
    set((state) => ({
      turnStates: {
        ...state.turnStates,
        [entityId]: state.turnStates[entityId]
          ? { ...state.turnStates[entityId], bonusActionUsed: true }
          : createTurnState(entityId, 30)
      }
    }))
  },

  useReaction: (entityId: string) => {
    set((state) => ({
      turnStates: {
        ...state.turnStates,
        [entityId]: state.turnStates[entityId]
          ? { ...state.turnStates[entityId], reactionUsed: true }
          : createTurnState(entityId, 30)
      }
    }))
  },

  useFreeInteraction: (entityId: string) => {
    set((state) => ({
      turnStates: {
        ...state.turnStates,
        [entityId]: state.turnStates[entityId]
          ? { ...state.turnStates[entityId], freeInteractionUsed: true }
          : createTurnState(entityId, 30)
      }
    }))
  },

  useMovement: (entityId: string, feet: number) => {
    set((state) => {
      const ts = state.turnStates[entityId]
      if (!ts) return state
      return {
        turnStates: {
          ...state.turnStates,
          [entityId]: { ...ts, movementRemaining: Math.max(0, ts.movementRemaining - feet) }
        }
      }
    })
  },

  setDashing: (entityId: string) => {
    set((state) => {
      const ts = state.turnStates[entityId]
      if (!ts) return state
      return {
        turnStates: {
          ...state.turnStates,
          [entityId]: {
            ...ts,
            isDashing: true,
            actionUsed: true,
            movementRemaining: ts.movementRemaining + ts.movementMax
          }
        }
      }
    })
  },

  setDisengaging: (entityId: string) => {
    set((state) => {
      const ts = state.turnStates[entityId]
      if (!ts) return state
      return {
        turnStates: {
          ...state.turnStates,
          [entityId]: { ...ts, isDisengaging: true, actionUsed: true }
        }
      }
    })
  },

  setDodging: (entityId: string) => {
    set((state) => {
      const ts = state.turnStates[entityId]
      if (!ts) return state
      return {
        turnStates: {
          ...state.turnStates,
          [entityId]: { ...ts, isDodging: true, actionUsed: true }
        }
      }
    })
  },

  setHidden: (entityId: string, hidden: boolean) => {
    set((state) => {
      const ts = state.turnStates[entityId]
      if (!ts) return state
      return {
        turnStates: {
          ...state.turnStates,
          [entityId]: { ...ts, isHidden: hidden }
        }
      }
    })
  },

  setConcentrating: (entityId: string, spell: string | undefined) => {
    set((state) => {
      const ts = state.turnStates[entityId]
      if (!ts) return state
      return {
        turnStates: {
          ...state.turnStates,
          [entityId]: { ...ts, concentratingSpell: spell }
        }
      }
    })
  },

  resetTurnState: (entityId: string, speed: number) => {
    set((state) => ({
      turnStates: {
        ...state.turnStates,
        [entityId]: {
          ...createTurnState(entityId, speed),
          // Reaction resets at start of own turn
          reactionUsed: false,
          // Concentration persists across turns
          concentratingSpell: state.turnStates[entityId]?.concentratingSpell
        }
      }
    }))
  },

  getTurnState: (entityId: string) => {
    return get().turnStates[entityId]
  }
})
