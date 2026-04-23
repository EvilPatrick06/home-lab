import type { StateCreator } from 'zustand'
import type { ShopItem } from '../../network'
import type { GameStoreState, ShopSliceState } from './types'

export const createShopSlice: StateCreator<GameStoreState, [], [], ShopSliceState> = (set) => ({
  shopOpen: false,
  shopName: 'General Store',
  shopInventory: [],
  shopMarkup: 1.0,

  openShop: (name?: string) => set({ shopOpen: true, shopName: name ?? 'General Store' }),
  closeShop: () => set({ shopOpen: false }),
  setShopInventory: (items: ShopItem[]) => set({ shopInventory: items }),
  addShopItem: (item: ShopItem) => set((s) => ({ shopInventory: [...s.shopInventory, item] })),
  removeShopItem: (itemId: string) => set((s) => ({ shopInventory: s.shopInventory.filter((i) => i.id !== itemId) })),
  setShopMarkup: (markup: number) => set({ shopMarkup: markup }),
  updateShopItem: (itemId: string, updates: Partial<ShopItem>) =>
    set((s) => ({
      shopInventory: s.shopInventory.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
    })),
  purchaseItem: (itemId: string) =>
    set((s) => ({
      shopInventory: s.shopInventory.map((i) => {
        if (i.id !== itemId) return i
        if (i.stockLimit != null && i.stockRemaining != null && i.stockRemaining > 0) {
          return { ...i, stockRemaining: i.stockRemaining - 1 }
        }
        if (i.stockLimit == null && i.quantity > 0) {
          return { ...i, quantity: i.quantity - 1 }
        }
        return i
      })
    }))
})
