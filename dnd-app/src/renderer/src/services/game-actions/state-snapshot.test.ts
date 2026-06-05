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
    activeSpellEffects: [],
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

  it('shows terrain cells with movement cost + hazard', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [
          {
            id: 'map-1',
            name: 'Cavern',
            width: 400,
            height: 400,
            grid: { cellSize: 40 },
            tokens: [],
            terrain: [
              { x: 2, y: 3, type: 'difficult', movementCost: 2 },
              { x: 4, y: 4, type: 'hazard', movementCost: 1, hazardType: 'fire', hazardDamage: 6 }
            ]
          }
        ]
      })
    )
    expect(result).toContain('Terrain:')
    expect(result).toContain('(2, 3): difficult (move x2)')
    expect(result).toContain('fire hazard 6 dmg on entry')
  })

  it('shows walls with type, endpoints, and door open/closed state (G40)', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [
          {
            id: 'map-1',
            name: 'Keep',
            width: 400,
            height: 400,
            grid: { cellSize: 40 },
            tokens: [],
            wallSegments: [
              { id: 'w1', x1: 0, y1: 0, x2: 5, y2: 0, type: 'solid' },
              { id: 'w2', x1: 5, y1: 0, x2: 5, y2: 5, type: 'door', isOpen: false }
            ]
          }
        ]
      })
    )
    expect(result).toContain('Walls:')
    expect(result).toContain('w1: solid (0,0)→(5,0)')
    expect(result).toContain('w2: door (5,0)→(5,5) [CLOSED]')
  })

  it('shows scene regions + drawings count (G42/G43)', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [
          {
            id: 'map-1',
            name: 'Hall',
            width: 400,
            height: 400,
            grid: { cellSize: 40 },
            tokens: [],
            regions: [
              {
                id: 'r1',
                name: 'Pit Trap',
                shape: { type: 'rectangle', x: 0, y: 0, width: 50, height: 50 },
                trigger: 'enter',
                action: { type: 'alert-dm', message: 'x' },
                enabled: true,
                oneShot: true
              }
            ],
            drawings: [
              { id: 'd1', type: 'draw-rect', points: [], color: '#f00', strokeWidth: 2, visibleToPlayers: false }
            ]
          }
        ]
      })
    )
    expect(result).toContain('Regions:')
    expect(result).toContain('r1: "Pit Trap" rectangle on enter → alert-dm [one-shot]')
    expect(result).toContain('Drawings: 1 on map (1 DM-only)')
  })

  it('shows darkness zones with magic level + radius', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'map-1',
        maps: [
          {
            id: 'map-1',
            name: 'Crypt',
            width: 400,
            height: 400,
            grid: { cellSize: 40 },
            tokens: [],
            darknessZones: [{ id: 'dz1', x: 5, y: 5, radius: 30, magicLevel: 'deeper-darkness' }]
          }
        ]
      })
    )
    expect(result).toContain('Darkness Zones:')
    expect(result).toContain('deeper-darkness radius 30ft at (5, 5)')
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

  it('shows condition duration (permanent + timed) (G38)', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        conditions: [
          { entityId: 'e1', entityName: 'Orc', condition: 'restrained', duration: 3, source: 'Entangle' },
          { entityId: 'e2', entityName: 'Wolf', condition: 'cursed', duration: 'permanent', source: 'Hag' }
        ]
      })
    )
    expect(result).toContain('Orc: restrained, 3 rounds left')
    expect(result).toContain('Wolf: cursed, permanent')
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

  it('shows long rest as available when the 24h cooldown has cleared', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        inGameTime: { totalSeconds: 200000 },
        restTracking: { lastLongRestSeconds: 100000 } // 100000s ago = ~27.7h
      })
    )
    expect(result).toContain('Long rest: available now')
  })

  it('shows hours remaining when the long-rest cooldown has not cleared', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        inGameTime: { totalSeconds: 110000 },
        restTracking: { lastLongRestSeconds: 100000 } // 10000s ago = ~2.7h
      })
    )
    expect(result).toContain('Long rest: NOT yet available')
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

  it('shows environmental effect mechanical detail + save DC', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeEnvironmentalEffects: [
          { name: 'Extreme Cold', mechanicalEffect: 'DC 10 CON / hour or 1 exhaustion', saveDC: 10 }
        ]
      })
    )
    expect(result).toContain('Extreme Cold: DC 10 CON / hour or 1 exhaustion (DC 10)')
  })

  it('shows active spell effects with caster, duration, area + save', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        round: 3,
        activeSpellEffects: [
          {
            id: 's1',
            name: 'Spirit Guardians',
            caster: 'Cleric',
            duration: 'concentration',
            startedRound: 2,
            shape: 'emanation',
            originX: 8,
            originY: 8,
            radiusFt: 15,
            saveDC: 14,
            saveType: 'wis',
            conditionIfFail: 'Restrained'
          },
          {
            id: 's2',
            name: 'Conjure Animals',
            caster: 'Druid',
            duration: 10,
            startedRound: 1,
            summonedLabels: ['Wolf']
          }
        ]
      })
    )
    expect(result).toContain('[SPELL EFFECTS]')
    expect(result).toContain('Spirit Guardians by Cleric (concentration)')
    expect(result).toContain('DC 14 WIS')
    expect(result).toContain('Restrained on fail')
    // round 1 + 10 duration, now round 3 → 8 rounds left
    expect(result).toContain('Conjure Animals by Druid (8 rounds left)')
    expect(result).toContain('summons: Wolf')
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

  it('lists who is concentrating (by token label) from turn states', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'm',
        maps: [
          {
            id: 'm',
            name: 'M',
            width: 100,
            height: 100,
            grid: { cellSize: 10 },
            tokens: [{ entityId: 'e1', label: 'Aria', gridX: 0, gridY: 0, conditions: [] }]
          }
        ],
        turnStates: {
          e1: { entityId: 'e1', concentratingSpell: 'Bless' },
          e2: { entityId: 'e2' } // not concentrating — excluded
        }
      })
    )
    expect(result).toContain('Concentration:')
    expect(result).toContain('Aria is concentrating on Bless')
  })

  it('shows action economy with reaction availability and stances', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'm',
        maps: [
          {
            id: 'm',
            name: 'M',
            width: 100,
            height: 100,
            grid: { cellSize: 10 },
            tokens: [
              { id: 't1', entityId: 'e1', label: 'Aria', gridX: 0, gridY: 0, conditions: [] },
              { id: 't2', entityId: 'e2', label: 'Goblin', gridX: 3, gridY: 4, conditions: [] }
            ]
          }
        ],
        initiative: {
          round: 1,
          currentIndex: 0,
          entries: [
            { entityId: 'e1', entityName: 'Aria', total: 15 },
            { entityId: 'e2', entityName: 'Goblin', total: 10 }
          ]
        },
        turnStates: {
          e1: { entityId: 'e1', reactionUsed: false, movementRemaining: 30, movementMax: 30, isDodging: true },
          e2: { entityId: 'e2', reactionUsed: true, actionUsed: true, movementRemaining: 0, movementMax: 30 }
        }
      })
    )
    expect(result).toContain('[ACTION ECONOMY]')
    expect(result).toContain('Aria: reaction available')
    expect(result).toContain('Dodging')
    expect(result).toContain('move 30/30ft')
    expect(result).toContain('Goblin: reaction USED')
    expect(result).toContain('action used')
  })

  it('shows distances from the active combatant (5ft Chebyshev)', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'm',
        maps: [
          {
            id: 'm',
            name: 'M',
            width: 100,
            height: 100,
            grid: { cellSize: 10 },
            tokens: [
              { id: 't1', entityId: 'e1', label: 'Aria', gridX: 0, gridY: 0, conditions: [] },
              { id: 't2', entityId: 'e2', label: 'Goblin', gridX: 3, gridY: 4, conditions: [] }
            ]
          }
        ],
        initiative: {
          round: 1,
          currentIndex: 0,
          entries: [
            { entityId: 'e1', entityName: 'Aria', total: 15 },
            { entityId: 'e2', entityName: 'Goblin', total: 10 }
          ]
        }
      })
    )
    expect(result).toContain('Distances from Aria (current turn)')
    expect(result).toContain('Goblin: 20 ft') // Chebyshev(3,4)=4 → 4*5=20
  })

  it('reports cover from the attacker vantage (creature grants half cover)', () => {
    const result = buildGameStateSnapshot(
      makeStores({
        activeMapId: 'm',
        maps: [
          {
            id: 'm',
            name: 'M',
            width: 100,
            height: 100,
            grid: { cellSize: 10 },
            tokens: [
              {
                id: 't1',
                entityId: 'e1',
                entityType: 'player',
                label: 'Aria',
                gridX: 0,
                gridY: 0,
                sizeX: 1,
                sizeY: 1,
                conditions: []
              },
              {
                id: 't3',
                entityId: 'e3',
                entityType: 'enemy',
                label: 'Ogre',
                gridX: 3,
                gridY: 0,
                sizeX: 1,
                sizeY: 1,
                currentHP: 30,
                conditions: []
              },
              {
                id: 't2',
                entityId: 'e2',
                entityType: 'enemy',
                label: 'Goblin',
                gridX: 5,
                gridY: 0,
                sizeX: 1,
                sizeY: 1,
                conditions: []
              }
            ]
          }
        ],
        initiative: {
          round: 1,
          currentIndex: 0,
          entries: [{ entityId: 'e1', entityName: 'Aria', total: 15 }]
        }
      })
    )
    // Ogre sits between Aria and the Goblin → Goblin has half cover (+2 AC) from Aria's vantage.
    expect(result).toMatch(/Goblin:.*half cover \(\+2 AC & DEX saves vs Aria\)/)
  })
})
