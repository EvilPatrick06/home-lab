import { describe, expect, it, vi, beforeEach } from 'vitest'
import { create } from 'zustand'
import { createPartyInventorySlice } from './party-inventory-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

type SliceStore = ReturnType<typeof createPartyInventorySlice>

function makeStore() {
  return create<SliceStore>()((set, get, api) => ({
    ...createPartyInventorySlice(set as any, get as any, api as any)
  }))
}

function makeItem(overrides: Partial<any> = {}) {
  return { id: 'item-1', name: 'Sword', quantity: 1, ...overrides }
}

describe('createPartyInventorySlice', () => {
  let store: ReturnType<typeof makeStore>

  beforeEach(() => {
    store = makeStore()
  })

  // --- Initial state ---

  describe('initial state', () => {
    it('starts with empty items, zero currency, empty transaction log', () => {
      const { partyInventory } = store.getState()
      expect(partyInventory.items).toEqual([])
      expect(partyInventory.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })
      expect(partyInventory.transactionLog).toEqual([])
    })
  })

  // --- addPartyItem ---

  describe('addPartyItem', () => {
    it('appends item to items array', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', name: 'Shield' }))
      expect(store.getState().partyInventory.items).toHaveLength(1)
      expect(store.getState().partyInventory.items[0].id).toBe('i1')
    })

    it('logs an add transaction', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', name: 'Shield', quantity: 2 }))
      const log = store.getState().partyInventory.transactionLog
      expect(log).toHaveLength(1)
      expect(log[0].type).toBe('add')
      expect(log[0].description).toContain('Shield')
      expect(log[0].description).toContain('2')
    })

    it('transaction log entry has id and timestamp', () => {
      store.getState().addPartyItem(makeItem())
      const entry = store.getState().partyInventory.transactionLog[0]
      expect(typeof entry.id).toBe('string')
      expect(entry.id.length).toBeGreaterThan(0)
      expect(typeof entry.timestamp).toBe('number')
    })

    it('appending multiple items preserves order', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', name: 'A' }))
      store.getState().addPartyItem(makeItem({ id: 'i2', name: 'B' }))
      const ids = store.getState().partyInventory.items.map((i: any) => i.id)
      expect(ids).toEqual(['i1', 'i2'])
    })
  })

  // --- removePartyItem ---

  describe('removePartyItem', () => {
    it('removes item by id', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1' }))
      store.getState().addPartyItem(makeItem({ id: 'i2' }))
      store.getState().removePartyItem('i1')
      expect(store.getState().partyInventory.items.map((i: any) => i.id)).toEqual(['i2'])
    })

    it('logs a remove transaction', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', name: 'Axe' }))
      store.getState().removePartyItem('i1')
      const log = store.getState().partyInventory.transactionLog
      const removeEntry = log.find((e: any) => e.type === 'remove')
      expect(removeEntry).toBeDefined()
      expect(removeEntry.description).toContain('Axe')
    })

    it('remove transaction uses "item" when id not found', () => {
      store.getState().removePartyItem('ghost-id')
      const log = store.getState().partyInventory.transactionLog
      expect(log[0].description).toContain('item')
    })

    it('removing last item yields empty items array', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1' }))
      store.getState().removePartyItem('i1')
      expect(store.getState().partyInventory.items).toHaveLength(0)
    })
  })

  // --- updatePartyItemQuantity ---

  describe('updatePartyItemQuantity', () => {
    it('updates the quantity on the matching item', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', quantity: 1 }))
      store.getState().updatePartyItemQuantity('i1', 5)
      expect(store.getState().partyInventory.items[0].quantity).toBe(5)
    })

    it('does not affect other items', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', quantity: 1 }))
      store.getState().addPartyItem(makeItem({ id: 'i2', quantity: 3 }))
      store.getState().updatePartyItemQuantity('i1', 99)
      expect(store.getState().partyInventory.items[1].quantity).toBe(3)
    })

    it('does not add a transaction log entry', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1' }))
      const logLengthBefore = store.getState().partyInventory.transactionLog.length
      store.getState().updatePartyItemQuantity('i1', 10)
      expect(store.getState().partyInventory.transactionLog).toHaveLength(logLengthBefore)
    })

    it('handles quantity of 0', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', quantity: 5 }))
      store.getState().updatePartyItemQuantity('i1', 0)
      expect(store.getState().partyInventory.items[0].quantity).toBe(0)
    })
  })

  // --- addPartyCurrency ---

  describe('addPartyCurrency', () => {
    it('adds gold to the currency', () => {
      store.getState().addPartyCurrency({ gp: 50 })
      expect(store.getState().partyInventory.currency.gp).toBe(50)
    })

    it('adds multiple denominations', () => {
      store.getState().addPartyCurrency({ gp: 10, sp: 5, cp: 100 })
      const c = store.getState().partyInventory.currency
      expect(c.gp).toBe(10)
      expect(c.sp).toBe(5)
      expect(c.cp).toBe(100)
    })

    it('accumulates across multiple calls', () => {
      store.getState().addPartyCurrency({ gp: 10 })
      store.getState().addPartyCurrency({ gp: 15 })
      expect(store.getState().partyInventory.currency.gp).toBe(25)
    })

    it('logs a currency transaction with description', () => {
      store.getState().addPartyCurrency({ gp: 20 })
      const log = store.getState().partyInventory.transactionLog
      expect(log[0].type).toBe('currency')
      expect(log[0].description).toContain('20')
      expect(log[0].description).toContain('gp')
    })

    it('does not log currencies with value 0 or undefined', () => {
      store.getState().addPartyCurrency({ gp: 5, sp: 0 })
      const log = store.getState().partyInventory.transactionLog
      expect(log[0].description).not.toContain('sp')
    })

    it('does not modify other denominations', () => {
      store.getState().addPartyCurrency({ gp: 10 })
      const c = store.getState().partyInventory.currency
      expect(c.cp).toBe(0)
      expect(c.sp).toBe(0)
      expect(c.pp).toBe(0)
    })
  })

  // --- spendPartyCurrency ---

  describe('spendPartyCurrency', () => {
    it('returns true and deducts when funds are sufficient', () => {
      store.getState().addPartyCurrency({ gp: 100 })
      const result = store.getState().spendPartyCurrency({ gp: 30 })
      expect(result).toBe(true)
      expect(store.getState().partyInventory.currency.gp).toBe(70)
    })

    it('returns false and makes no change when insufficient', () => {
      store.getState().addPartyCurrency({ gp: 10 })
      const result = store.getState().spendPartyCurrency({ gp: 20 })
      expect(result).toBe(false)
      expect(store.getState().partyInventory.currency.gp).toBe(10)
    })

    it('logs a spent transaction on success', () => {
      store.getState().addPartyCurrency({ gp: 50 })
      store.getState().spendPartyCurrency({ gp: 10 })
      const log = store.getState().partyInventory.transactionLog
      const spendEntry = log.find((e: any) => e.description.startsWith('Spent'))
      expect(spendEntry).toBeDefined()
      expect(spendEntry.description).toContain('10')
      expect(spendEntry.description).toContain('gp')
    })

    it('does not log on failure', () => {
      const logLenBefore = store.getState().partyInventory.transactionLog.length
      store.getState().spendPartyCurrency({ gp: 999 })
      expect(store.getState().partyInventory.transactionLog).toHaveLength(logLenBefore)
    })

    it('spends exact amount (edge: gp === cost)', () => {
      store.getState().addPartyCurrency({ gp: 5 })
      const result = store.getState().spendPartyCurrency({ gp: 5 })
      expect(result).toBe(true)
      expect(store.getState().partyInventory.currency.gp).toBe(0)
    })

    it('off-by-one: 1 gp insufficient for 2 gp cost', () => {
      store.getState().addPartyCurrency({ gp: 1 })
      const result = store.getState().spendPartyCurrency({ gp: 2 })
      expect(result).toBe(false)
    })

    it('spends multiple denominations', () => {
      store.getState().addPartyCurrency({ gp: 10, sp: 10 })
      store.getState().spendPartyCurrency({ gp: 3, sp: 4 })
      const c = store.getState().partyInventory.currency
      expect(c.gp).toBe(7)
      expect(c.sp).toBe(6)
    })
  })

  // --- transferItemToPlayer ---

  describe('transferItemToPlayer', () => {
    it('assigns the item to the player', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', name: 'Ring' }))
      store.getState().transferItemToPlayer('i1', 'player-42')
      expect(store.getState().partyInventory.items[0].assignedTo).toBe('player-42')
    })

    it('logs a transfer transaction', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', name: 'Ring' }))
      store.getState().transferItemToPlayer('i1', 'player-42')
      const log = store.getState().partyInventory.transactionLog
      const transferEntry = log.find((e: any) => e.type === 'transfer')
      expect(transferEntry).toBeDefined()
      expect(transferEntry.description).toContain('Ring')
    })

    it('does not affect other items', () => {
      store.getState().addPartyItem(makeItem({ id: 'i1', name: 'Ring' }))
      store.getState().addPartyItem(makeItem({ id: 'i2', name: 'Helm' }))
      store.getState().transferItemToPlayer('i1', 'player-1')
      expect(store.getState().partyInventory.items[1].assignedTo).toBeUndefined()
    })
  })

  // --- splitGold ---

  describe('splitGold', () => {
    it('returns gp per player and leaves remainder in treasury', () => {
      store.getState().addPartyCurrency({ gp: 100 })
      const perPlayer = store.getState().splitGold(3)
      expect(perPlayer).toBe(33)
      expect(store.getState().partyInventory.currency.gp).toBe(1) // 100 - 33*3 = 1
    })

    it('returns 0 and logs nothing when playerCount is 0', () => {
      store.getState().addPartyCurrency({ gp: 100 })
      const logLenBefore = store.getState().partyInventory.transactionLog.length
      const result = store.getState().splitGold(0)
      expect(result).toBe(0)
      expect(store.getState().partyInventory.transactionLog).toHaveLength(logLenBefore)
    })

    it('returns 0 and leaves gp unchanged when playerCount is negative', () => {
      store.getState().addPartyCurrency({ gp: 50 })
      const result = store.getState().splitGold(-1)
      expect(result).toBe(0)
      expect(store.getState().partyInventory.currency.gp).toBe(50)
    })

    it('even split with no remainder', () => {
      store.getState().addPartyCurrency({ gp: 60 })
      const perPlayer = store.getState().splitGold(4)
      expect(perPlayer).toBe(15)
      expect(store.getState().partyInventory.currency.gp).toBe(0)
    })

    it('logs a currency transaction describing the split', () => {
      store.getState().addPartyCurrency({ gp: 10 })
      store.getState().splitGold(3)
      const log = store.getState().partyInventory.transactionLog
      const splitEntry = log.find((e: any) => e.description.includes('Split'))
      expect(splitEntry).toBeDefined()
      expect(splitEntry.description).toContain('3 players')
    })

    it('off-by-one: 1 gp split among 2 players yields 0 each and 1 remainder', () => {
      store.getState().addPartyCurrency({ gp: 1 })
      const perPlayer = store.getState().splitGold(2)
      expect(perPlayer).toBe(0)
      expect(store.getState().partyInventory.currency.gp).toBe(1)
    })

    it('split 1 gp among 1 player yields 1 each, 0 remainder', () => {
      store.getState().addPartyCurrency({ gp: 1 })
      const perPlayer = store.getState().splitGold(1)
      expect(perPlayer).toBe(1)
      expect(store.getState().partyInventory.currency.gp).toBe(0)
    })
  })
})
