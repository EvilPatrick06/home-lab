import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dice-helpers
vi.mock('./dice-helpers', () => ({
  rollDiceFormula: vi.fn(() => ({ rolls: [5, 3], total: 8 }))
}))

// Mock name-resolver
vi.mock('./name-resolver', () => ({
  resolveMapByName: vi.fn((maps: Array<{ name: string }>, name: string) =>
    maps.find((m) => m.name.toLowerCase() === name.toLowerCase())
  ),
  resolvePlayerByName: vi.fn(() => 'peer-1'),
  findBastionByOwnerName: vi.fn(() => undefined)
}))

// Mock bastion store dynamic import
const bastionStoreState = {
  bastions: [] as unknown[],
  advanceTime: vi.fn(),
  issueOrder: vi.fn(),
  depositGold: vi.fn(),
  withdrawGold: vi.fn(),
  recruitDefenders: vi.fn(),
  addCreature: vi.fn(),
  startTurn: vi.fn(),
  rollAndResolveEvent: vi.fn()
}
vi.mock('../../stores/use-bastion-store', () => ({
  useBastionStore: { getState: vi.fn(() => bastionStoreState) }
}))

// Mock window.api
vi.stubGlobal('window', {
  api: {
    ai: {
      logNpcInteraction: vi.fn(),
      setNpcRelationship: vi.fn(),
      setNpcFields: vi.fn(),
      updateQuestLog: vi.fn(),
      adjustFactionStanding: vi.fn()
    }
  }
})

// Provide crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-effect' })

import * as nameResolver from './name-resolver'
import type { DmAction, StoreAccessors } from './types'

function makeStores(): StoreAccessors {
  const sendMessage = vi.fn()
  const addChatMessage = vi.fn()
  return {
    getGameStore: vi.fn(() => ({
      getState: () => ({
        inGameTime: { totalSeconds: 43200 },
        checkExpiredSources: vi.fn(() => []),
        shopInventory: [],
        removeShopItem: vi.fn()
      })
    })) as unknown as StoreAccessors['getGameStore'],
    getLobbyStore: vi.fn(() => ({
      getState: () => ({ addChatMessage, players: [{ peerId: 'peer-1', displayName: 'Alice' }] })
    })) as unknown as StoreAccessors['getLobbyStore'],
    getNetworkStore: vi.fn(() => ({
      getState: () => ({ sendMessage })
    })) as unknown as StoreAccessors['getNetworkStore']
  }
}

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    advanceTimeSeconds: vi.fn(),
    setInGameTime: vi.fn(),
    inGameTime: { totalSeconds: 43200 },
    openShop: vi.fn(),
    closeShop: vi.fn(),
    setShopInventory: vi.fn(),
    addShopItem: vi.fn(),
    shopInventory: [],
    setActiveMap: vi.fn(),
    addSidebarEntry: vi.fn(),
    removeSidebarEntry: vi.fn(),
    startTimer: vi.fn(),
    stopTimer: vi.fn(),
    addHiddenDiceResult: vi.fn(),
    addLogEntry: vi.fn(),
    campaignId: 'camp-1',
    allies: [],
    enemies: [],
    places: [],
    maps: [],
    ...overrides
  } as unknown as ReturnType<ReturnType<StoreAccessors['getGameStore']>['getState']>
}

describe('effect-actions', () => {
  let stores: StoreAccessors

  beforeEach(() => {
    vi.clearAllMocks()
    stores = makeStores()
  })

  // ── Time Management ──

  describe('executeAdvanceTime', () => {
    it('advances time by seconds, minutes, hours, and days combined', async () => {
      const { executeAdvanceTime } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'advance_time', seconds: 30, minutes: 5, hours: 1, days: 0 }
      const result = executeAdvanceTime(action, gs, undefined, stores)
      expect(result).toBe(true)
      // 30 + 5*60 + 1*3600 = 30 + 300 + 3600 = 3930
      expect(gs.advanceTimeSeconds).toHaveBeenCalledWith(3930)
    })

    it('throws if total seconds is zero or negative', async () => {
      const { executeAdvanceTime } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'advance_time' }
      expect(() => executeAdvanceTime(action, gs, undefined, stores)).toThrow('positive time values')
    })
  })

  describe('executeSetTime', () => {
    it('sets time by totalSeconds', async () => {
      const { executeSetTime } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'set_time', totalSeconds: 86400 }
      const result = executeSetTime(action, gs, undefined, stores)
      expect(result).toBe(true)
      expect(gs.setInGameTime).toHaveBeenCalledWith({ totalSeconds: 86400 })
    })

    it('adjusts hour/minute on current day if totalSeconds not specified', async () => {
      const { executeSetTime } = await import('./effect-actions')
      const gs = makeGameStore({ inGameTime: { totalSeconds: 100000 } })
      const action: DmAction = { action: 'set_time', hour: 14, minute: 30 }
      const result = executeSetTime(action, gs, undefined, stores)
      expect(result).toBe(true)
      // Math.floor(100000 / 86400) * 86400 = 86400, + 14*3600 + 30*60 = 86400 + 50400 + 1800 = 138600
      expect(gs.setInGameTime).toHaveBeenCalledWith({ totalSeconds: 138600 })
    })
  })

  describe('executeShareTime', () => {
    it('shares time as a chat message', async () => {
      const { executeShareTime } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'share_time', message: 'It is now noon.' }
      const result = executeShareTime(action, gs, undefined, stores)
      expect(result).toBe(true)
    })

    it('throws if no in-game time set', async () => {
      const { executeShareTime } = await import('./effect-actions')
      const gs = makeGameStore({ inGameTime: null })
      const action: DmAction = { action: 'share_time' }
      expect(() => executeShareTime(action, gs, undefined, stores)).toThrow('No in-game time set')
    })
  })

  // ── Shop ──

  describe('executeOpenShop', () => {
    it('opens a shop with items', async () => {
      const { executeOpenShop } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'open_shop',
        name: 'Magic Emporium',
        items: [{ name: 'Healing Potion', category: 'Potion', price: { gp: 50 }, quantity: 5 }]
      }
      const result = executeOpenShop(action, gs, undefined, stores)
      expect(result).toBe(true)
      expect(gs.openShop).toHaveBeenCalledWith('Magic Emporium')
      expect(gs.setShopInventory).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'Healing Potion' })])
      )
    })

    it('defaults shop name to "Shop"', async () => {
      const { executeOpenShop } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'open_shop' }
      executeOpenShop(action, gs, undefined, stores)
      expect(gs.openShop).toHaveBeenCalledWith('Shop')
    })
  })

  describe('executeCloseShop', () => {
    it('closes the shop', async () => {
      const { executeCloseShop } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'close_shop' }
      expect(executeCloseShop(action, gs, undefined, stores)).toBe(true)
      expect(gs.closeShop).toHaveBeenCalled()
    })
  })

  describe('executeAddShopItem', () => {
    it('adds an item to the shop', async () => {
      const { executeAddShopItem } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'add_shop_item', name: 'Sword', price: { gp: 15 }, quantity: 1 }
      expect(executeAddShopItem(action, gs, undefined, stores)).toBe(true)
      expect(gs.addShopItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sword', category: 'General' }))
    })
  })

  describe('executeRemoveShopItem', () => {
    it('removes an item from the shop', async () => {
      const removeShopItem = vi.fn()
      const storesWithShop: StoreAccessors = {
        ...stores,
        getGameStore: vi.fn(() => ({
          getState: () => ({
            shopInventory: [{ id: 'item-1', name: 'Rope' }],
            removeShopItem
          })
        })) as unknown as StoreAccessors['getGameStore']
      }
      const { executeRemoveShopItem } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'remove_shop_item', name: 'Rope' }
      expect(executeRemoveShopItem(action, gs, undefined, storesWithShop)).toBe(true)
      expect(removeShopItem).toHaveBeenCalledWith('item-1')
    })

    it('throws if shop item not found', async () => {
      const storesNoItem: StoreAccessors = {
        ...stores,
        getGameStore: vi.fn(() => ({
          getState: () => ({
            shopInventory: [],
            removeShopItem: vi.fn()
          })
        })) as unknown as StoreAccessors['getGameStore']
      }
      const { executeRemoveShopItem } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'remove_shop_item', name: 'Nonexistent' }
      expect(() => executeRemoveShopItem(action, gs, undefined, storesNoItem)).toThrow('Shop item not found')
    })
  })

  // 08F — shop verbs broadcast the POST-mutation inventory (read fresh, not the snapshot).
  describe('shop broadcasts fresh inventory (08F)', () => {
    function makeShopFixture() {
      const state = {
        shopInventory: [] as Array<{ id: string; name: string }>,
        shopName: '',
        openShop: (name: string) => {
          state.shopName = name
        },
        setShopInventory: (items: Array<{ id: string; name: string }>) => {
          state.shopInventory = items
        },
        addShopItem: (item: { id: string; name: string }) => {
          state.shopInventory.push(item)
        },
        removeShopItem: (id: string) => {
          state.shopInventory = state.shopInventory.filter((i) => i.id !== id)
        }
      }
      const sendMessage = vi.fn()
      const s = {
        getGameStore: () => ({ getState: () => state }),
        getNetworkStore: () => ({ getState: () => ({ sendMessage }) }),
        getLobbyStore: () => ({ getState: () => ({ addChatMessage: vi.fn(), players: [] }) })
      } as unknown as StoreAccessors
      return { state, sendMessage, stores: s }
    }
    const shopUpdates = (sendMessage: ReturnType<typeof vi.fn>) =>
      sendMessage.mock.calls.filter(([ch]) => ch === 'dm:shop-update')

    it('open_shop broadcasts the JUST-SET inventory (not the stale snapshot)', async () => {
      const { executeOpenShop } = await import('./effect-actions')
      const { state, sendMessage, stores: s } = makeShopFixture()
      executeOpenShop(
        {
          action: 'open_shop',
          name: 'Emporium',
          items: [{ name: 'Potion', category: 'Potion', price: { gp: 50 }, quantity: 1 }]
        } as DmAction,
        state as never,
        undefined,
        s
      )
      const updates = shopUpdates(sendMessage)
      expect(updates).toHaveLength(1)
      expect(updates[0][1].shopInventory).toHaveLength(1)
      expect(updates[0][1].shopInventory[0].name).toBe('Potion')
    })

    it('add_shop_item broadcasts exactly one update carrying the new item', async () => {
      const { executeAddShopItem } = await import('./effect-actions')
      const { state, sendMessage, stores: s } = makeShopFixture()
      executeAddShopItem(
        { action: 'add_shop_item', name: 'Sword', price: { gp: 15 } } as DmAction,
        state as never,
        undefined,
        s
      )
      const updates = shopUpdates(sendMessage)
      expect(updates).toHaveLength(1)
      expect(updates[0][1].shopInventory.some((i: { name: string }) => i.name === 'Sword')).toBe(true)
    })

    it('remove_shop_item broadcasts exactly one update with the item gone', async () => {
      const { executeRemoveShopItem } = await import('./effect-actions')
      const { state, sendMessage, stores: s } = makeShopFixture()
      state.shopInventory = [{ id: 'rope-1', name: 'Rope' }]
      executeRemoveShopItem({ action: 'remove_shop_item', name: 'Rope' } as DmAction, state as never, undefined, s)
      const updates = shopUpdates(sendMessage)
      expect(updates).toHaveLength(1)
      expect(updates[0][1].shopInventory).toHaveLength(0)
    })
  })

  // ── Map ──

  describe('executeSwitchMap', () => {
    it('switches to a named map', async () => {
      const { executeSwitchMap } = await import('./effect-actions')
      const gs = makeGameStore({
        maps: [{ id: 'map-2', name: 'Dungeon Level 2' }]
      })
      const action: DmAction = { action: 'switch_map', mapName: 'Dungeon Level 2' }
      expect(executeSwitchMap(action, gs, undefined, stores)).toBe(true)
      expect(gs.setActiveMap).toHaveBeenCalledWith('map-2')
    })

    it('throws if map not found', async () => {
      const { executeSwitchMap } = await import('./effect-actions')
      const gs = makeGameStore({ maps: [] })
      const action: DmAction = { action: 'switch_map', mapName: 'Nowhere' }
      expect(() => executeSwitchMap(action, gs, undefined, stores)).toThrow('Map not found')
    })
  })

  // ── Sidebar ──

  describe('executeAddSidebarEntry', () => {
    it('adds a sidebar entry to a valid category', async () => {
      const { executeAddSidebarEntry } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'add_sidebar_entry',
        category: 'allies',
        name: 'Elminster',
        description: 'An archmage'
      }
      expect(executeAddSidebarEntry(action, gs)).toBe(true)
      expect(gs.addSidebarEntry).toHaveBeenCalledWith('allies', expect.objectContaining({ name: 'Elminster' }))
    })

    it('throws on invalid category', async () => {
      const { executeAddSidebarEntry } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'add_sidebar_entry', category: 'invalid', name: 'X' }
      expect(() => executeAddSidebarEntry(action, gs)).toThrow('Invalid sidebar category')
    })
  })

  describe('executeRemoveSidebarEntry', () => {
    it('removes a sidebar entry by name', async () => {
      const { executeRemoveSidebarEntry } = await import('./effect-actions')
      const gs = makeGameStore({
        enemies: [{ id: 'se1', name: 'Strahd' }]
      })
      const action: DmAction = { action: 'remove_sidebar_entry', category: 'enemies', name: 'Strahd' }
      expect(executeRemoveSidebarEntry(action, gs)).toBe(true)
      expect(gs.removeSidebarEntry).toHaveBeenCalledWith('enemies', 'se1')
    })

    it('throws if sidebar entry not found', async () => {
      const { executeRemoveSidebarEntry } = await import('./effect-actions')
      const gs = makeGameStore({ allies: [] })
      const action: DmAction = { action: 'remove_sidebar_entry', category: 'allies', name: 'Nobody' }
      expect(() => executeRemoveSidebarEntry(action, gs)).toThrow('Sidebar entry not found')
    })
  })

  // ── Timer ──

  describe('executeStartTimer', () => {
    it('starts a timer', async () => {
      const { executeStartTimer } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'start_timer', seconds: 60, targetName: 'Bomb' }
      expect(executeStartTimer(action, gs, undefined, stores)).toBe(true)
      expect(gs.startTimer).toHaveBeenCalledWith(60, 'Bomb')
    })
  })

  describe('executeStopTimer', () => {
    it('stops a timer', async () => {
      const { executeStopTimer } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'stop_timer' }
      expect(executeStopTimer(action, gs, undefined, stores)).toBe(true)
      expect(gs.stopTimer).toHaveBeenCalled()
    })
  })

  // ── Hidden Dice ──

  describe('executeHiddenDiceRoll', () => {
    it('rolls hidden dice and stores result', async () => {
      const { executeHiddenDiceRoll } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'hidden_dice_roll', formula: '2d6+3' }
      expect(executeHiddenDiceRoll(action, gs)).toBe(true)
      expect(gs.addHiddenDiceResult).toHaveBeenCalledWith(expect.objectContaining({ formula: '2d6+3' }))
    })
  })

  // ── Communication ──

  describe('executeWhisperPlayer', () => {
    it('whispers to a resolved player', async () => {
      const { executeWhisperPlayer } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'whisper_player', playerName: 'Alice', message: 'Secret info' }
      expect(executeWhisperPlayer(action, gs, undefined, stores)).toBe(true)
    })

    it('throws if player not found', async () => {
      const { resolvePlayerByName } = await import('./name-resolver')
      vi.mocked(resolvePlayerByName).mockReturnValueOnce(undefined)

      const { executeWhisperPlayer } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'whisper_player', playerName: 'Ghost', message: 'Hello' }
      expect(() => executeWhisperPlayer(action, gs, undefined, stores)).toThrow('Player not found')
    })
  })

  describe('executeSystemMessage', () => {
    it('sends a system message', async () => {
      const { executeSystemMessage } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'system_message', message: 'Session paused.' }
      expect(executeSystemMessage(action, gs, undefined, stores)).toBe(true)
    })
  })

  // ── Journal ──

  describe('executeAddJournalEntry', () => {
    it('adds a journal entry', async () => {
      const { executeAddJournalEntry } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'add_journal_entry', content: 'The party entered the cave.' }
      expect(executeAddJournalEntry(action, gs)).toBe(true)
      expect(gs.addLogEntry).toHaveBeenCalledWith('The party entered the cave.', '43200')
    })

    it('throws if content is empty', async () => {
      const { executeAddJournalEntry } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'add_journal_entry', content: '' }
      expect(() => executeAddJournalEntry(action, gs)).toThrow('No content')
    })
  })

  // ── Bastion Management ──

  describe('executeBastionAdvanceTime', () => {
    it('returns true and triggers bastion advance', async () => {
      const { executeBastionAdvanceTime } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_advance_time', days: 7, bastionOwner: 'Aria' }
      expect(executeBastionAdvanceTime(action, makeGameStore(), undefined, stores)).toBe(true)
    })

    it('throws if days is invalid', async () => {
      const { executeBastionAdvanceTime } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_advance_time', days: -1, bastionOwner: 'Aria' }
      expect(() => executeBastionAdvanceTime(action, makeGameStore(), undefined, stores)).toThrow('Invalid days')
    })

    it('throws if days is not a number', async () => {
      const { executeBastionAdvanceTime } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_advance_time', days: 'many', bastionOwner: 'Aria' }
      expect(() => executeBastionAdvanceTime(action, makeGameStore(), undefined, stores)).toThrow('Invalid days')
    })
  })

  describe('executeBastionIssueOrder', () => {
    it('returns true with valid params', async () => {
      const { executeBastionIssueOrder } = await import('./effect-actions')
      const action: DmAction = {
        action: 'bastion_issue_order',
        bastionOwner: 'Aria',
        facilityName: 'Workshop',
        orderType: 'craft'
      }
      expect(executeBastionIssueOrder(action, makeGameStore(), undefined, stores)).toBe(true)
    })

    it('throws if params missing', async () => {
      const { executeBastionIssueOrder } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_issue_order', bastionOwner: '', facilityName: '', orderType: '' }
      expect(() => executeBastionIssueOrder(action, makeGameStore(), undefined, stores)).toThrow(
        'Missing bastion order params'
      )
    })
  })

  describe('executeBastionDepositGold', () => {
    it('returns true with valid params', async () => {
      const { executeBastionDepositGold } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_deposit_gold', bastionOwner: 'Aria', amount: 100 }
      expect(executeBastionDepositGold(action, makeGameStore(), undefined, stores)).toBe(true)
    })

    it('throws if params missing', async () => {
      const { executeBastionDepositGold } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_deposit_gold', bastionOwner: '', amount: 'lots' }
      expect(() => executeBastionDepositGold(action, makeGameStore(), undefined, stores)).toThrow(
        'Missing bastion deposit params'
      )
    })
  })

  describe('executeBastionWithdrawGold', () => {
    it('returns true with valid params', async () => {
      const { executeBastionWithdrawGold } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_withdraw_gold', bastionOwner: 'Aria', amount: 50 }
      expect(executeBastionWithdrawGold(action, makeGameStore(), undefined, stores)).toBe(true)
    })

    it('throws if params missing', async () => {
      const { executeBastionWithdrawGold } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_withdraw_gold', bastionOwner: '', amount: undefined }
      expect(() => executeBastionWithdrawGold(action, makeGameStore(), undefined, stores)).toThrow(
        'Missing bastion withdraw params'
      )
    })
  })

  describe('executeBastionRecruit', () => {
    it('returns true with valid params', async () => {
      const { executeBastionRecruit } = await import('./effect-actions')
      const action: DmAction = {
        action: 'bastion_recruit',
        bastionOwner: 'Aria',
        facilityName: 'Barracks',
        names: ['Guard 1', 'Guard 2']
      }
      expect(executeBastionRecruit(action, makeGameStore(), undefined, stores)).toBe(true)
    })

    it('throws if params missing', async () => {
      const { executeBastionRecruit } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_recruit', bastionOwner: '', facilityName: '', names: 'bad' }
      expect(() => executeBastionRecruit(action, makeGameStore(), undefined, stores)).toThrow(
        'Missing bastion recruit params'
      )
    })
  })

  // 08J — implemented verbs do real store work; not-found posts a ⚠️ chat line.
  describe('bastion add_creature + resolve_event (08J)', () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    beforeEach(() => {
      bastionStoreState.addCreature.mockClear()
      bastionStoreState.startTurn.mockClear()
      bastionStoreState.rollAndResolveEvent.mockClear()
      bastionStoreState.bastions = []
      vi.mocked(nameResolver.findBastionByOwnerName).mockReturnValue(undefined as never)
    })

    it('add_creature adds a MenagerieCreature with defaults to the named facility', async () => {
      vi.mocked(nameResolver.findBastionByOwnerName).mockReturnValue({
        id: 'b1',
        basicFacilities: [{ id: 'f1', name: 'Menagerie' }],
        specialFacilities: []
      } as never)
      const { executeBastionAddCreature } = await import('./effect-actions')
      executeBastionAddCreature(
        {
          action: 'bastion_add_creature',
          bastionOwner: 'Aria',
          facilityName: 'Menagerie',
          creatureName: 'Wolf'
        } as DmAction,
        makeGameStore(),
        undefined,
        stores
      )
      await tick()
      expect(bastionStoreState.addCreature).toHaveBeenCalledWith(
        'b1',
        'f1',
        expect.objectContaining({ name: 'Wolf', creatureType: 'beast', size: 'medium', isDefender: false })
      )
    })

    it('resolve_event opens a turn when none and rolls + resolves a real event', async () => {
      vi.mocked(nameResolver.findBastionByOwnerName).mockReturnValue({
        id: 'b1',
        turns: [],
        basicFacilities: [],
        specialFacilities: []
      } as never)
      const { executeBastionResolveEvent } = await import('./effect-actions')
      executeBastionResolveEvent(
        { action: 'bastion_resolve_event', bastionOwner: 'Aria' } as DmAction,
        makeGameStore(),
        undefined,
        stores
      )
      await tick()
      expect(bastionStoreState.startTurn).toHaveBeenCalledWith('b1')
      expect(bastionStoreState.rollAndResolveEvent).toHaveBeenCalledWith('b1', 1)
    })

    it('add_creature on an unknown owner posts a ⚠️ chat line and mutates nothing', async () => {
      const { executeBastionAddCreature } = await import('./effect-actions')
      executeBastionAddCreature(
        { action: 'bastion_add_creature', bastionOwner: 'Ghost', facilityName: 'x', creatureName: 'y' } as DmAction,
        makeGameStore(),
        undefined,
        stores
      )
      await tick()
      expect(bastionStoreState.addCreature).not.toHaveBeenCalled()
      const sent = (stores.getLobbyStore().getState().addChatMessage as ReturnType<typeof vi.fn>).mock.calls
      expect(sent.some(([m]) => String(m.content).includes('not found'))).toBe(true)
    })
  })

  // ── NPC Tracking ──

  describe('executeLogNpcInteraction', () => {
    it('logs NPC interaction via IPC', async () => {
      const { executeLogNpcInteraction } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'log_npc_interaction',
        npcName: 'Volo',
        summary: 'Shared a tale',
        attitudeAfter: 'friendly'
      }
      expect(executeLogNpcInteraction(action, gs)).toBe(true)
      expect(window.api.ai.logNpcInteraction).toHaveBeenCalledWith('camp-1', 'Volo', 'Shared a tale', 'friendly')
    })

    it('throws if params missing', async () => {
      const { executeLogNpcInteraction } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'log_npc_interaction', npcName: '', summary: '', attitudeAfter: '' }
      expect(() => executeLogNpcInteraction(action, gs)).toThrow('Missing params')
    })
  })

  describe('executeSetNpcRelationship', () => {
    it('sets NPC relationship via IPC', async () => {
      const { executeSetNpcRelationship } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'set_npc_relationship',
        npcName: 'Volo',
        targetNpcName: 'Elminster',
        relationship: 'mentor',
        disposition: 'friendly'
      }
      expect(executeSetNpcRelationship(action, gs)).toBe(true)
      expect(window.api.ai.setNpcRelationship).toHaveBeenCalledWith('camp-1', 'Volo', 'Elminster', 'mentor', 'friendly')
    })

    it('throws if params missing', async () => {
      const { executeSetNpcRelationship } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'set_npc_relationship',
        npcName: '',
        targetNpcName: '',
        relationship: '',
        disposition: ''
      }
      expect(() => executeSetNpcRelationship(action, gs)).toThrow('Missing params')
    })
  })

  describe('NPC world-state writes (faction / location / secret motivation)', () => {
    it('sets NPC faction via IPC', async () => {
      const { executeSetNpcFaction } = await import('./effect-actions')
      expect(
        executeSetNpcFaction({ action: 'set_npc_faction', npcName: 'Volo', faction: 'Thieves Guild' }, makeGameStore())
      ).toBe(true)
      expect(window.api.ai.setNpcFields).toHaveBeenCalledWith('camp-1', 'Volo', { faction: 'Thieves Guild' })
    })

    it('sets NPC location via IPC', async () => {
      const { executeSetNpcLocation } = await import('./effect-actions')
      expect(
        executeSetNpcLocation({ action: 'set_npc_location', npcName: 'Volo', location: 'Waterdeep' }, makeGameStore())
      ).toBe(true)
      expect(window.api.ai.setNpcFields).toHaveBeenCalledWith('camp-1', 'Volo', { location: 'Waterdeep' })
    })

    it('sets NPC secret motivation via IPC', async () => {
      const { executeSetNpcSecretMotivation } = await import('./effect-actions')
      expect(
        executeSetNpcSecretMotivation(
          { action: 'set_npc_secret_motivation', npcName: 'Volo', secretMotivation: 'Wants the crown' },
          makeGameStore()
        )
      ).toBe(true)
      expect(window.api.ai.setNpcFields).toHaveBeenCalledWith('camp-1', 'Volo', { secretMotivation: 'Wants the crown' })
    })

    it('throws when params are missing', async () => {
      const { executeSetNpcFaction } = await import('./effect-actions')
      expect(() =>
        executeSetNpcFaction({ action: 'set_npc_faction', npcName: '', faction: '' }, makeGameStore())
      ).toThrow('Missing params')
    })
  })

  describe('quest log & faction reputation', () => {
    it('updates the quest log via IPC', async () => {
      const { executeUpdateQuestLog } = await import('./effect-actions')
      expect(
        executeUpdateQuestLog(
          { action: 'update_quest_log', operation: 'add', name: 'Find the relic', description: 'in the crypt' },
          makeGameStore()
        )
      ).toBe(true)
      expect(window.api.ai.updateQuestLog).toHaveBeenCalledWith('camp-1', 'add', 'Find the relic', 'in the crypt')
    })

    it('throws when quest params are missing', async () => {
      const { executeUpdateQuestLog } = await import('./effect-actions')
      expect(() =>
        executeUpdateQuestLog({ action: 'update_quest_log', operation: 'add', name: '' }, makeGameStore())
      ).toThrow('Missing params')
    })

    it('adjusts faction standing via IPC', async () => {
      const { executeAdjustFactionStanding } = await import('./effect-actions')
      expect(
        executeAdjustFactionStanding(
          { action: 'adjust_faction_standing', factionName: 'Harpers', delta: 10, reason: 'saved them' },
          makeGameStore()
        )
      ).toBe(true)
      expect(window.api.ai.adjustFactionStanding).toHaveBeenCalledWith('camp-1', 'Harpers', 10)
    })

    it('throws when faction params are missing', async () => {
      const { executeAdjustFactionStanding } = await import('./effect-actions')
      expect(() =>
        executeAdjustFactionStanding(
          { action: 'adjust_faction_standing', factionName: '', delta: undefined },
          makeGameStore()
        )
      ).toThrow('Missing params')
    })
  })

  describe('executeBastionAddCreature', () => {
    it('posts a chat message', async () => {
      const { executeBastionAddCreature } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'bastion_add_creature',
        creatureName: 'Guard',
        bastionOwner: 'Aria',
        facilityName: 'Barracks'
      }
      expect(executeBastionAddCreature(action, gs, undefined, stores)).toBe(true)
    })
  })

  describe('executeRollDice', () => {
    const chat = (): ReturnType<typeof vi.fn> =>
      stores.getLobbyStore().getState().addChatMessage as unknown as ReturnType<typeof vi.fn>
    const net = (): ReturnType<typeof vi.fn> =>
      stores.getNetworkStore().getState().sendMessage as unknown as ReturnType<typeof vi.fn>

    it('rolls a formula and posts the result (mocked total 8) + reason to chat', async () => {
      const { executeRollDice } = await import('./effect-actions')
      const ok = executeRollDice(
        { action: 'roll_dice', formula: '1d8', reason: 'a check' } as DmAction,
        makeGameStore(),
        undefined as never,
        stores
      )
      expect(ok).toBe(true)
      expect(chat().mock.calls[0][0].content).toContain('8') // mocked rollDiceFormula total
      expect(chat().mock.calls[0][0].content).toContain('a check')
    })

    it('returns false + posts an error when the roll yields no dice (invalid formula)', async () => {
      const { rollDiceFormula } = await import('./dice-helpers')
      vi.mocked(rollDiceFormula).mockReturnValueOnce({ rolls: [], total: 0 })
      const { executeRollDice } = await import('./effect-actions')
      const ok = executeRollDice(
        { action: 'roll_dice', formula: 'garbage' } as DmAction,
        makeGameStore(),
        undefined as never,
        stores
      )
      expect(ok).toBe(false)
      expect(chat().mock.calls[0][0].content).toContain('Invalid')
    })

    it('does NOT broadcast a hidden roll to peers (but still posts locally)', async () => {
      const { executeRollDice } = await import('./effect-actions')
      executeRollDice(
        { action: 'roll_dice', formula: '10', visibility: 'hidden' } as DmAction,
        makeGameStore(),
        undefined as never,
        stores
      )
      expect(net()).not.toHaveBeenCalled()
      expect(chat()).toHaveBeenCalledTimes(1)
    })

    it('broadcasts a public roll to peers', async () => {
      const { executeRollDice } = await import('./effect-actions')
      executeRollDice(
        { action: 'roll_dice', formula: '10', visibility: 'public' } as DmAction,
        makeGameStore(),
        undefined as never,
        stores
      )
      expect(net()).toHaveBeenCalledTimes(1)
    })
  })

  describe('executeRequestRoll', () => {
    const net = (): ReturnType<typeof vi.fn> =>
      stores.getNetworkStore().getState().sendMessage as unknown as ReturnType<typeof vi.fn>
    const chat = (): ReturnType<typeof vi.fn> =>
      stores.getLobbyStore().getState().addChatMessage as unknown as ReturnType<typeof vi.fn>

    it('sets a local pending group roll and broadcasts dm:roll-request to peers', async () => {
      const { executeRequestRoll } = await import('./effect-actions')
      const setPendingGroupRoll = vi.fn()
      const ok = executeRequestRoll(
        { action: 'request_roll', rollType: 'skill', skill: 'Perception', dc: 15 } as DmAction,
        makeGameStore({ setPendingGroupRoll }),
        undefined as never,
        stores
      )
      expect(ok).toBe(true)
      expect(setPendingGroupRoll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'skill', skill: 'Perception', dc: 15, scope: 'all', isSecret: false })
      )
      expect(net()).toHaveBeenCalledWith(
        'dm:roll-request',
        expect.objectContaining({ type: 'skill', skill: 'Perception', dc: 15 })
      )
      expect(chat().mock.calls[0][0].content).toContain('Perception')
    })

    it('keeps a secret roll DM-only (no chat broadcast) but still pends + sends the typed request', async () => {
      const { executeRequestRoll } = await import('./effect-actions')
      const setPendingGroupRoll = vi.fn()
      executeRequestRoll(
        { action: 'request_roll', rollType: 'save', ability: 'DEX', dc: 12, secret: true } as DmAction,
        makeGameStore({ setPendingGroupRoll }),
        undefined as never,
        stores
      )
      expect(setPendingGroupRoll).toHaveBeenCalledWith(expect.objectContaining({ isSecret: true }))
      // typed request still goes out, but the chat:message broadcast is suppressed
      const sentChannels = net().mock.calls.map((c) => c[0])
      expect(sentChannels).toContain('dm:roll-request')
      expect(sentChannels).not.toContain('chat:message')
    })

    it('defaults an invalid DC to 10', async () => {
      const { executeRequestRoll } = await import('./effect-actions')
      const setPendingGroupRoll = vi.fn()
      executeRequestRoll(
        { action: 'request_roll', rollType: 'ability', ability: 'STR', dc: 0 } as DmAction,
        makeGameStore({ setPendingGroupRoll }),
        undefined as never,
        stores
      )
      expect(setPendingGroupRoll).toHaveBeenCalledWith(expect.objectContaining({ dc: 10 }))
    })
  })
})
