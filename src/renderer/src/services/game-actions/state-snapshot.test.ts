import { describe, expect, it, vi } from 'vitest'

import { buildGameStateSnapshot } from './state-snapshot'
import type { StoreAccessors } from './types'

function makeStores(gameStateOverrides?: Record<string, unknown>): StoreAccessors {
  const defaultGameState = {
    maps: [],
    activeMapId: null,
    initiative: null,
    conditions: [],
    ambientLight: 'bright',
    underwaterCombat: false,
    travelPace: null,
    inGameTime: null,
    activeLightSources: [],
    shopOpen: false,
    shopName: '',
    shopInventory: [],
    activeEnvironmentalEffects: [],
    activeDiseases: [],
    activeCurses: [],
    placedTraps: [],
    restTracking: null,
    ...gameStateOverrides
  }
  return {
    getGameStore: () => ({ getState: () => defaultGameState }) as any,
    getLobbyStore: () => ({ getState: vi.fn() }) as any,
    getNetworkStore: () => ({ getState: vi.fn() }) as any
  }
}

describe('buildGameStateSnapshot', () => {
  it('returns a string starting with [GAME STATE]', () => {
    const result = buildGameStateSnapshot(makeStores())
    expect(result).toContain('[GAME STATE]')
    expect(result).toContain('[/GAME STATE]')
  })

  it('shows "Active Map: none" when no active map', () => {
    const result = buildGameStateSnapshot(makeStores())
    expect(result).toContain('Active Map: none')
  })

  it('shows active map name and dimensions', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [
          {
            id: 'map-1',
            name: 'Dungeon',
            width: 800,
            height: 600,
            grid: { cellSize: 40 },
            tokens: []
          }
        ]
      })
    )
    expect(result).toContain('Active Map: "Dungeon"')
    expect(result).toContain('20x15')
  })

  it('shows tokens with HP and AC', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [
          {
            id: 'map-1',
            name: 'Arena',
            width: 400,
            height: 400,
            grid: { cellSize: 40 },
            tokens: [
              {
                id: 't1',
                entityId: 'e1',
                entityType: 'enemy',
                label: 'Goblin',
                gridX: 5,
                gridY: 3,
                sizeX: 1,
                sizeY: 1,
                currentHP: 7,
                maxHP: 7,
                ac: 15,
                conditions: []
              }
            ]
          }
        ]
      })
    )
    expect(result).toContain('Goblin (enemy) at (5, 3) 1x1')
    expect(result).toContain('HP:7/7')
    expect(result).toContain('AC:15')
  })

  it('shows [BLOODIED] when HP is at or below half', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [
          {
            id: 'map-1',
            name: 'Arena',
            width: 400,
            height: 400,
            grid: { cellSize: 40 },
            tokens: [
              {
                id: 't1',
                entityId: 'e1',
                entityType: 'enemy',
                label: 'Orc',
                gridX: 0,
                gridY: 0,
                sizeX: 1,
                sizeY: 1,
                currentHP: 5,
                maxHP: 15,
                conditions: []
              }
            ]
          }
        ]
      })
    )
    expect(result).toContain('[BLOODIED]')
  })

  it('shows "Tokens: none" when map has no tokens', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [
          {
            id: 'map-1',
            name: 'Empty',
            width: 400,
            height: 400,
            grid: { cellSize: 40 },
            tokens: []
          }
        ]
      })
    )
    expect(result).toContain('Tokens: none')
  })

  it('shows initiative order', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [{ id: 'map-1', name: 'M', width: 400, height: 400, grid: { cellSize: 40 }, tokens: [] }],
        initiative: {
          round: 2,
          currentIndex: 0,
          entries: [
            {
              id: '1',
              entityName: 'Fighter',
              total: 18,
              legendaryActions: null,
              legendaryResistances: null,
              rechargeAbilities: null
            },
            {
              id: '2',
              entityName: 'Goblin',
              total: 12,
              legendaryActions: null,
              legendaryResistances: null,
              rechargeAbilities: null
            }
          ]
        }
      })
    )
    expect(result).toContain('Initiative: Round 2')
    expect(result).toContain('Fighter (18)')
    expect(result).toContain('<- CURRENT')
    expect(result).toContain('Goblin (12)')
  })

  it('shows initiative with legendary actions and resistances', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: null,
        maps: [],
        initiative: {
          round: 1,
          currentIndex: 0,
          entries: [
            {
              id: '1',
              entityName: 'Dragon',
              total: 22,
              legendaryActions: { maximum: 3, used: 1 },
              legendaryResistances: { max: 3, remaining: 2 },
              rechargeAbilities: [{ name: 'Fire Breath', rechargeOn: 5, available: false }]
            }
          ]
        }
      })
    )
    expect(result).toContain('LA:2/3')
    expect(result).toContain('LR:2/3')
    expect(result).toContain('Fire Breath(recharge 5+)')
  })

  it('shows conditions', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        conditions: [
          { entityId: 'e1', entityName: 'Goblin', condition: 'poisoned', value: null, source: 'Poison Spray' }
        ]
      })
    )
    expect(result).toContain('Conditions:')
    expect(result).toContain('Goblin: poisoned')
  })

  it('shows environment when non-default', () => {
    const result = buildGameStateSnapshot(makeStores({ ambientLight: 'dim', underwaterCombat: true }))
    expect(result).toContain('Light: dim')
    expect(result).toContain('Underwater: yes')
  })

  it('shows in-game time and day phase', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        inGameTime: { totalSeconds: 43200 } // noon
      })
    )
    expect(result).toContain('[GAME TIME]')
    expect(result).toContain('Day 1')
    expect(result).toContain('12:00')
    expect(result).toContain('afternoon')
  })

  it('shows active light sources in game time block', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        inGameTime: { totalSeconds: 10000 },
        activeLightSources: [
          { entityName: 'Fighter', sourceName: 'Torch', durationSeconds: 3600, startedAtSeconds: 9000 }
        ]
      })
    )
    expect(result).toContain('Active light sources:')
    expect(result).toContain('Fighter: Torch')
  })

  it('shows shop info when open', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        shopOpen: true,
        shopName: 'Ye Olde Shoppe',
        shopInventory: [{ name: 'Sword' }, { name: 'Shield' }]
      })
    )
    expect(result).toContain('Shop Open: "Ye Olde Shoppe" (2 items)')
  })

  it('shows active environmental effects', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeEnvironmentalEffects: [{ name: 'Toxic Fumes' }]
      })
    )
    expect(result).toContain('[ACTIVE EFFECTS]')
    expect(result).toContain('Toxic Fumes')
  })

  it('shows active diseases', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeDiseases: [{ targetName: 'Fighter', name: 'Sewer Plague', successCount: 1, failCount: 0 }]
      })
    )
    expect(result).toContain('Active Diseases:')
    expect(result).toContain('Sewer Plague')
  })

  it('shows active curses', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeCurses: [{ targetName: 'Rogue', name: 'Bestow Curse', source: 'Lich' }]
      })
    )
    expect(result).toContain('Active Curses:')
    expect(result).toContain('Bestow Curse')
    expect(result).toContain('from Lich')
  })

  it('shows armed traps', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        placedTraps: [
          { name: 'Pit Trap', gridX: 3, gridY: 7, armed: true, revealed: false },
          { name: 'Disarmed Trap', gridX: 1, gridY: 1, armed: false, revealed: true }
        ]
      })
    )
    expect(result).toContain('[DM ONLY] Armed Traps:')
    expect(result).toContain('Pit Trap at (3, 7)')
    expect(result).toContain('[HIDDEN]')
    // Disarmed trap should not show
    expect(result).not.toContain('Disarmed Trap')
  })

  it('shows multiple available maps', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [
          { id: 'map-1', name: 'Dungeon', width: 400, height: 400, grid: { cellSize: 40 }, tokens: [] },
          { id: 'map-2', name: 'Forest', width: 400, height: 400, grid: { cellSize: 40 }, tokens: [] }
        ]
      })
    )
    expect(result).toContain('Available Maps: Dungeon, Forest')
  })

  it('shows long rest timing info', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        inGameTime: { totalSeconds: 50000 },
        restTracking: { lastLongRestSeconds: 21600 }
      })
    )
    expect(result).toContain('Time since last long rest:')
  })
})
