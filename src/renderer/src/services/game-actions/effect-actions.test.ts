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
vi.mock('../../stores/use-bastion-store', () => ({
  useBastionStore: {
    getState: vi.fn(() => ({
      bastions: [],
      advanceTime: vi.fn(),
      issueOrder: vi.fn(),
      depositGold: vi.fn(),
      withdrawGold: vi.fn(),
      recruitDefenders: vi.fn()
    }))
  }
}))

// Mock window.api
vi.stubGlobal('window', {
  api: {
    ai: {
      logNpcInteraction: vi.fn(),
      setNpcRelationship: vi.fn()
    }
  }
})

// Provide crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-effect' })

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
      expect(executeAddShopItem(action, gs)).toBe(true)
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
      expect(executeBastionAdvanceTime(action)).toBe(true)
    })

    it('throws if days is invalid', async () => {
      const { executeBastionAdvanceTime } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_advance_time', days: -1, bastionOwner: 'Aria' }
      expect(() => executeBastionAdvanceTime(action)).toThrow('Invalid days')
    })

    it('throws if days is not a number', async () => {
      const { executeBastionAdvanceTime } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_advance_time', days: 'many', bastionOwner: 'Aria' }
      expect(() => executeBastionAdvanceTime(action)).toThrow('Invalid days')
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
      expect(executeBastionIssueOrder(action)).toBe(true)
    })

    it('throws if params missing', async () => {
      const { executeBastionIssueOrder } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_issue_order', bastionOwner: '', facilityName: '', orderType: '' }
      expect(() => executeBastionIssueOrder(action)).toThrow('Missing bastion order params')
    })
  })

  describe('executeBastionDepositGold', () => {
    it('returns true with valid params', async () => {
      const { executeBastionDepositGold } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_deposit_gold', bastionOwner: 'Aria', amount: 100 }
      expect(executeBastionDepositGold(action)).toBe(true)
    })

    it('throws if params missing', async () => {
      const { executeBastionDepositGold } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_deposit_gold', bastionOwner: '', amount: 'lots' }
      expect(() => executeBastionDepositGold(action)).toThrow('Missing bastion deposit params')
    })
  })

  describe('executeBastionWithdrawGold', () => {
    it('returns true with valid params', async () => {
      const { executeBastionWithdrawGold } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_withdraw_gold', bastionOwner: 'Aria', amount: 50 }
      expect(executeBastionWithdrawGold(action)).toBe(true)
    })

    it('throws if params missing', async () => {
      const { executeBastionWithdrawGold } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_withdraw_gold', bastionOwner: '', amount: undefined }
      expect(() => executeBastionWithdrawGold(action)).toThrow('Missing bastion withdraw params')
    })
  })

  describe('executeBastionResolveEvent', () => {
    it('posts a chat message about the event', async () => {
      const { executeBastionResolveEvent } = await import('./effect-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'bastion_resolve_event', eventType: 'attack', bastionOwner: 'Aria' }
      expect(executeBastionResolveEvent(action, gs, undefined, stores)).toBe(true)
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
      expect(executeBastionRecruit(action)).toBe(true)
    })

    it('throws if params missing', async () => {
      const { executeBastionRecruit } = await import('./effect-actions')
      const action: DmAction = { action: 'bastion_recruit', bastionOwner: '', facilityName: '', names: 'bad' }
      expect(() => executeBastionRecruit(action)).toThrow('Missing bastion recruit params')
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
})
