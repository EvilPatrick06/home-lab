import type { StateCreator } from 'zustand'
import type { PartyInventory } from '../../types/game-state'
import type { GameStoreState, PartyInventorySliceState } from './types'

const emptyInventory: PartyInventory = {
  items: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  transactionLog: []
}

export const createPartyInventorySlice: StateCreator<GameStoreState, [], [], PartyInventorySliceState> = (
  set,
  get
) => ({
  partyInventory: { ...emptyInventory },

  addPartyItem: (item) => {
    set((s) => ({
      partyInventory: {
        ...s.partyInventory,
        items: [...s.partyInventory.items, item],
        transactionLog: [
          ...s.partyInventory.transactionLog,
          {
            id: crypto.randomUUID(),
            type: 'add' as const,
            description: `Added ${item.quantity}x ${item.name}`,
            timestamp: Date.now()
          }
        ]
      }
    }))
  },

  removePartyItem: (itemId) => {
    const item = get().partyInventory.items.find((i) => i.id === itemId)
    set((s) => ({
      partyInventory: {
        ...s.partyInventory,
        items: s.partyInventory.items.filter((i) => i.id !== itemId),
        transactionLog: [
          ...s.partyInventory.transactionLog,
          {
            id: crypto.randomUUID(),
            type: 'remove' as const,
            description: `Removed ${item?.name ?? 'item'}`,
            timestamp: Date.now()
          }
        ]
      }
    }))
  },

  updatePartyItemQuantity: (itemId, quantity) => {
    set((s) => ({
      partyInventory: {
        ...s.partyInventory,
        items: s.partyInventory.items.map((i) => (i.id === itemId ? { ...i, quantity } : i))
      }
    }))
  },

  addPartyCurrency: (currency) => {
    set((s) => {
      const cur = { ...s.partyInventory.currency }
      for (const [key, val] of Object.entries(currency)) {
        if (val && key in cur) {
          cur[key as keyof typeof cur] += val
        }
      }
      const parts: string[] = []
      for (const [key, val] of Object.entries(currency)) {
        if (val && val > 0) parts.push(`${val} ${key}`)
      }
      return {
        partyInventory: {
          ...s.partyInventory,
          currency: cur,
          transactionLog: [
            ...s.partyInventory.transactionLog,
            {
              id: crypto.randomUUID(),
              type: 'currency' as const,
              description: `Added ${parts.join(', ')}`,
              timestamp: Date.now()
            }
          ]
        }
      }
    })
  },

  spendPartyCurrency: (currency) => {
    const cur = { ...get().partyInventory.currency }
    for (const [key, val] of Object.entries(currency)) {
      if (val && key in cur) {
        if (cur[key as keyof typeof cur] < val) return false
      }
    }
    set((s) => {
      const newCur = { ...s.partyInventory.currency }
      const parts: string[] = []
      for (const [key, val] of Object.entries(currency)) {
        if (val && key in newCur) {
          newCur[key as keyof typeof newCur] -= val
          parts.push(`${val} ${key}`)
        }
      }
      return {
        partyInventory: {
          ...s.partyInventory,
          currency: newCur,
          transactionLog: [
            ...s.partyInventory.transactionLog,
            {
              id: crypto.randomUUID(),
              type: 'currency' as const,
              description: `Spent ${parts.join(', ')}`,
              timestamp: Date.now()
            }
          ]
        }
      }
    })
    return true
  },

  transferItemToPlayer: (itemId, playerId) => {
    set((s) => ({
      partyInventory: {
        ...s.partyInventory,
        items: s.partyInventory.items.map((i) => (i.id === itemId ? { ...i, assignedTo: playerId } : i)),
        transactionLog: [
          ...s.partyInventory.transactionLog,
          {
            id: crypto.randomUUID(),
            type: 'transfer' as const,
            description: `Transferred ${s.partyInventory.items.find((i) => i.id === itemId)?.name ?? 'item'} to player`,
            timestamp: Date.now()
          }
        ]
      }
    }))
  },

  splitGold: (playerCount) => {
    if (playerCount <= 0) return 0
    const { gp } = get().partyInventory.currency
    const perPlayer = Math.floor(gp / playerCount)
    const remainder = gp - perPlayer * playerCount
    set((s) => ({
      partyInventory: {
        ...s.partyInventory,
        currency: { ...s.partyInventory.currency, gp: remainder },
        transactionLog: [
          ...s.partyInventory.transactionLog,
          {
            id: crypto.randomUUID(),
            type: 'currency' as const,
            description: `Split ${gp} gp among ${playerCount} players (${perPlayer} each, ${remainder} remainder)`,
            timestamp: Date.now()
          }
        ]
      }
    }))
    return perPlayer
  }
})
