import { useCallback } from 'react'
import { load5eMonsterById } from '../../../../services/data-provider'
import { useGameStore } from '../../../../stores/use-game-store'
import type { Campaign, NPC } from '../../../../types/campaign'
import type { InitiativeEntry } from '../../../../types/game-state'
import type { GameMap, MapToken, TerrainCell } from '../../../../types/map'
import { getSizeTokenDimensions } from '../../../../types/monster'
import { DMNotepad, FogBrush, NPCManager, RegionManager, ShopPanel, TokenPlacer } from '../../dm'
import type { DmToolId } from '../../dm/DMToolbar'
import GridControlPanel from '../../dm/GridControlPanel'

export type RightPanel = 'tokens' | 'fog' | 'terrain' | 'regions' | 'npcs' | 'notes' | 'shop' | 'grid'

interface MapEditorRightPanelProps {
  rightPanel: RightPanel
  setRightPanel: (panel: RightPanel) => void
  activeMap: GameMap | null
  activeTool: DmToolId
  setActiveTool: (tool: DmToolId) => void
  setFogBrushSize: (size: number) => void
  terrainPaintType: TerrainCell['type']
  setTerrainPaintType: (type: TerrainCell['type']) => void
  portalTarget: { mapId: string; gridX: number; gridY: number } | undefined
  setPortalTarget: (target: { mapId: string; gridX: number; gridY: number } | undefined) => void
  selectedTokenId: string | null
  setSelectedTokenId: (id: string | null) => void
  campaign: Campaign
}

export default function MapEditorRightPanel({
  rightPanel,
  setRightPanel,
  activeMap,
  activeTool,
  setActiveTool,
  fogBrushSize,
  setFogBrushSize,
  terrainPaintType,
  setTerrainPaintType,
  portalTarget,
  setPortalTarget,
  selectedTokenId,
  setSelectedTokenId,
  campaign
}: MapEditorRightPanelProps): JSX.Element {
  const gameStore = useGameStore()

  const handlePlaceToken = useCallback(
    (tokenData: Omit<MapToken, 'id' | 'gridX' | 'gridY'>) => {
      gameStore.setPendingPlacement(tokenData)
      setActiveTool('select')
    },
    [gameStore, setActiveTool]
  )

  const handleRemoveToken = useCallback(
    (tokenId: string) => {
      if (!activeMap) return
      gameStore.removeToken(activeMap.id, tokenId)
      if (selectedTokenId === tokenId) setSelectedTokenId(null)
    },
    [activeMap, gameStore, selectedTokenId, setSelectedTokenId]
  )

  const handleRevealAll = useCallback(() => {
    if (!activeMap) return
    const cols = Math.ceil(activeMap.width / activeMap.grid.cellSize)
    const rows = Math.ceil(activeMap.height / activeMap.grid.cellSize)
    const cells: Array<{ x: number; y: number }> = []
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        cells.push({ x, y })
      }
    }
    gameStore.revealFog(activeMap.id, cells)
  }, [activeMap, gameStore])

  const handleHideAll = useCallback(() => {
    if (!activeMap) return
    gameStore.hideFog(activeMap.id, activeMap.fogOfWar.revealedCells)
  }, [activeMap, gameStore])

  const handleNpcToInitiative = useCallback(
    (npc: NPC) => {
      const roll = Math.floor(Math.random() * 20) + 1
      const dexScore = npc.customStats?.abilityScores?.dex
      const modifier = dexScore != null ? Math.floor((dexScore - 10) / 2) : 0
      const entry: InitiativeEntry = {
        id: crypto.randomUUID(),
        entityId: npc.id,
        entityName: npc.name,
        entityType: 'npc',
        roll,
        modifier,
        total: roll + modifier,
        isActive: false
      }
      gameStore.addToInitiative(entry)
    },
    [gameStore]
  )

  return (
    <div className="w-72 bg-gray-900/80 border-l border-gray-700 flex flex-col shrink-0">
      <div className="flex gap-0.5 p-1.5 border-b border-gray-800">
        {(['tokens', 'fog', 'terrain', 'regions', 'grid', 'npcs', 'notes', 'shop'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setRightPanel(tab)}
            className={`px-2 py-0.5 text-[10px] rounded capitalize transition-colors cursor-pointer ${
              rightPanel === tab ? 'bg-amber-600 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {rightPanel === 'tokens' && (
          <TokenPlacer
            tokens={activeMap?.tokens ?? []}
            onPlaceToken={handlePlaceToken}
            onRemoveToken={handleRemoveToken}
            placingActive={gameStore.pendingPlacement !== null}
          />
        )}
        {rightPanel === 'fog' && (
          <FogBrush
            activeTool={activeTool}
            brushSize={fogBrushSize}
            onToolChange={setActiveTool}
            onBrushSizeChange={setFogBrushSize}
            onRevealAll={handleRevealAll}
            onHideAll={handleHideAll}
            dynamicFogEnabled={activeMap?.fogOfWar.dynamicFogEnabled}
            onDynamicFogToggle={
              activeMap ? (enabled) => gameStore.setDynamicFogEnabled(activeMap.id, enabled) : undefined
            }
          />
        )}
        {rightPanel === 'terrain' && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-200">Terrain Painter</h4>
            <p className="text-xs text-gray-500">
              Select a terrain type, then click cells on the map to toggle terrain.
            </p>
            <div className="space-y-1.5">
              {[
                {
                  type: 'difficult' as const,
                  label: 'Difficult Terrain',
                  desc: '2x movement cost',
                  color: 'bg-amber-900/50'
                },
                { type: 'hazard' as const, label: 'Hazard', desc: 'Dangerous area', color: 'bg-red-900/50' },
                {
                  type: 'water' as const,
                  label: 'Water',
                  desc: '2x cost (free with Swim Speed)',
                  color: 'bg-blue-900/50'
                },
                {
                  type: 'climbing' as const,
                  label: 'Climbing',
                  desc: '2x cost (free with Climb Speed)',
                  color: 'bg-purple-900/50'
                },
                {
                  type: 'portal' as const,
                  label: 'Portal',
                  desc: 'Teleports tokens',
                  color: 'bg-fuchsia-900/50'
                }
              ].map(({ type, label, desc, color }) => (
                <div key={type} className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setTerrainPaintType(type)
                      setActiveTool('terrain')
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                      activeTool === 'terrain' && terrainPaintType === type
                        ? `border-amber-500 ${color}`
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="font-semibold text-gray-200">{label}</div>
                    <div className="text-gray-500">{desc}</div>
                  </button>

                  {type === 'portal' && activeTool === 'terrain' && terrainPaintType === 'portal' && (
                    <div className="mt-1 p-2 rounded bg-gray-800/50 border border-fuchsia-900/30 flex flex-col gap-2">
                      <div className="text-[10px] text-fuchsia-300 font-semibold mb-1">Portal Configuration</div>
                      <select
                        className="w-full bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 px-2 py-1"
                        value={portalTarget?.mapId ?? ''}
                        onChange={(e) =>
                          setPortalTarget({
                            mapId: e.target.value,
                            gridX: portalTarget?.gridX ?? 0,
                            gridY: portalTarget?.gridY ?? 0
                          })
                        }
                      >
                        <option value="">Select target map...</option>
                        {gameStore.maps.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-400 block mb-0.5">Target X</label>
                          <input
                            type="number"
                            className="w-full bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 px-2 py-1"
                            value={portalTarget?.gridX ?? 0}
                            onChange={(e) =>
                              setPortalTarget({
                                mapId: portalTarget?.mapId ?? '',
                                gridX: parseInt(e.target.value, 10) || 0,
                                gridY: portalTarget?.gridY ?? 0
                              })
                            }
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-400 block mb-0.5">Target Y</label>
                          <input
                            type="number"
                            className="w-full bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 px-2 py-1"
                            value={portalTarget?.gridY ?? 0}
                            onChange={(e) =>
                              setPortalTarget({
                                mapId: portalTarget?.mapId ?? '',
                                gridX: portalTarget?.gridX ?? 0,
                                gridY: parseInt(e.target.value, 10) || 0
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {activeMap && (activeMap.terrain ?? []).length > 0 && (
              <button
                onClick={() => {
                  if (!activeMap) return
                  const maps = gameStore.maps.map((m) => (m.id === activeMap.id ? { ...m, terrain: [] } : m))
                  gameStore.loadGameState({ maps })
                }}
                className="w-full px-3 py-1.5 text-xs bg-red-900/30 border border-red-800 rounded-lg text-red-300 hover:bg-red-900/50 cursor-pointer"
              >
                Clear All Terrain ({(activeMap.terrain ?? []).length} cells)
              </button>
            )}
          </div>
        )}
        {rightPanel === 'regions' && <RegionManager activeMap={activeMap} />}
        {rightPanel === 'npcs' && (
          <NPCManager
            npcs={campaign.npcs}
            onAddToInitiative={handleNpcToInitiative}
            onPlaceOnMap={async (npc: NPC) => {
              if (!activeMap) return
              let statBlock = null
              if (npc.statBlockId) {
                statBlock = await load5eMonsterById(npc.statBlockId)
              }
              const merged = npc.customStats
                ? statBlock
                  ? { ...statBlock, ...npc.customStats }
                  : npc.customStats
                : statBlock
              const hp = merged?.hp ?? 10
              const ac = merged?.ac ?? 10
              const size = merged?.size ?? 'Medium'
              const tokenDims = getSizeTokenDimensions(size)
              const walkSpeed = merged?.speed?.walk ?? 30
              const dexMod = merged?.abilityScores ? Math.floor((merged.abilityScores.dex - 10) / 2) : 0
              gameStore.setPendingPlacement({
                entityId: npc.id,
                entityType: npc.role === 'enemy' ? 'enemy' : 'npc',
                label: npc.name,
                sizeX: tokenDims.x,
                sizeY: tokenDims.y,
                visibleToPlayers: npc.isVisible,
                conditions: [],
                currentHP: hp,
                maxHP: hp,
                ac,
                monsterStatBlockId: npc.statBlockId,
                walkSpeed,
                initiativeModifier: dexMod
              })
            }}
          />
        )}
        {rightPanel === 'grid' && activeMap && (
          <GridControlPanel
            grid={activeMap.grid}
            onUpdate={(updates) => {
              const newGrid = { ...activeMap.grid, ...updates }
              const maps = gameStore.maps.map((m) => (m.id === activeMap.id ? { ...m, grid: newGrid } : m))
              gameStore.loadGameState({ maps })
            }}
          />
        )}
        {rightPanel === 'notes' && <DMNotepad />}
        {rightPanel === 'shop' && <ShopPanel />}
      </div>
    </div>
  )
}
