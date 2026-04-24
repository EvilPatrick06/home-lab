import { lazy, Suspense, useCallback, useState } from 'react'
import * as UndoManager from '../../../../services/undo-manager'
import { useGameStore } from '../../../../stores/use-game-store'
import type { Campaign } from '../../../../types/campaign'
import type { GameMap, TerrainCell } from '../../../../types/map'
import { DMToolbar, MapSelector } from '../../dm'
import type { DmToolId } from '../../dm/DMToolbar'
import MapCanvas from '../../map/MapCanvas'
import MapEditorRightPanel, { type RightPanel } from './MapEditorRightPanel'
import {
  handleFillCellClick,
  handleFogBrushClick,
  handleTerrainCellClick,
  handleWallPlace
} from './map-editor-handlers'

const CreateMapModal = lazy(() => import('./CreateMapModal'))

interface DMMapEditorProps {
  campaign: Campaign
  onClose: () => void
}

export default function DMMapEditor({ campaign, onClose }: DMMapEditorProps): JSX.Element {
  const gameStore = useGameStore()
  const activeMap = gameStore.maps.find((m) => m.id === gameStore.activeMapId) ?? null

  const [activeTool, setActiveTool] = useState<DmToolId>('select')
  const [fogBrushSize, setFogBrushSize] = useState(1)
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [rightPanel, setRightPanel] = useState<RightPanel>('tokens')
  const [terrainPaintType, setTerrainPaintType] = useState<TerrainCell['type']>('difficult')
  const [showCreateMap, setShowCreateMap] = useState(false)
  const [_undoCount, setUndoCount] = useState(0)

  const triggerRerender = useCallback(() => setUndoCount((c) => c + 1), [])

  const handleUndo = useCallback(() => {
    UndoManager.undo()
    triggerRerender()
  }, [triggerRerender])

  const handleRedo = useCallback(() => {
    UndoManager.redo()
    triggerRerender()
  }, [triggerRerender])

  const handleTokenMove = useCallback(
    (tokenId: string, gridX: number, gridY: number) => {
      if (!activeMap) return
      gameStore.moveToken(activeMap.id, tokenId, gridX, gridY)
    },
    [activeMap, gameStore]
  )

  const handleTokenSelect = useCallback((tokenId: string | null) => {
    setSelectedTokenId(tokenId)
  }, [])

  const handleCellClick = useCallback(
    (gridX: number, gridY: number) => {
      if (!activeMap) return

      if (activeTool === 'terrain') {
        handleTerrainCellClick(activeMap.id, gridX, gridY, activeMap.terrain ?? [], terrainPaintType, triggerRerender)
        return
      }

      if (activeTool === 'fill') {
        handleFillCellClick(
          activeMap.id,
          activeMap.width,
          activeMap.height,
          activeMap.grid.cellSize,
          gridX,
          gridY,
          activeMap.terrain ?? [],
          terrainPaintType,
          triggerRerender
        )
        return
      }

      if (activeTool === 'fog-reveal' || activeTool === 'fog-hide') {
        handleFogBrushClick(activeTool, activeMap.id, gridX, gridY, fogBrushSize)
      }
    },
    [activeMap, activeTool, fogBrushSize, terrainPaintType, triggerRerender]
  )

  const handleSelectMap = useCallback(
    (mapId: string) => {
      gameStore.setActiveMap(mapId)
    },
    [gameStore]
  )

  const handleAddMap = useCallback(() => {
    setShowCreateMap(true)
  }, [])

  const handleCreateMap = useCallback(
    (mapConfig: {
      name: string
      width: number
      height: number
      cellSize: number
      gridType: 'square' | 'hex'
      backgroundColor: string
      imageData?: string
    }) => {
      const newMap: GameMap = {
        id: crypto.randomUUID(),
        name: mapConfig.name || `Map ${gameStore.maps.length + 1}`,
        campaignId: campaign.id,
        imagePath: mapConfig.imageData || '',
        width: mapConfig.width * mapConfig.cellSize,
        height: mapConfig.height * mapConfig.cellSize,
        grid: {
          enabled: true,
          cellSize: mapConfig.cellSize,
          offsetX: 0,
          offsetY: 0,
          color: '#4b5563',
          opacity: 0.4,
          type: mapConfig.gridType
        },
        tokens: [],
        fogOfWar: { enabled: false, revealedCells: [] },
        terrain: [],
        createdAt: new Date().toISOString()
      }
      gameStore.addMap(newMap)
      gameStore.setActiveMap(newMap.id)
      setShowCreateMap(false)
    },
    [campaign.id, gameStore]
  )

  const onWallPlace = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      if (!activeMap) return
      handleWallPlace(activeMap.id, x1, y1, x2, y2, activeMap.wallSegments ?? [], triggerRerender)
    },
    [activeMap, triggerRerender]
  )

  const handleDoorToggle = useCallback(
    (wallId: string) => {
      if (!activeMap) return
      const wall = (activeMap.wallSegments ?? []).find((w) => w.id === wallId)
      if (wall && wall.type === 'door') {
        gameStore.updateWallSegment(activeMap.id, wallId, { isOpen: !wall.isOpen })
      }
    },
    [activeMap, gameStore]
  )

  return (
    <div className="fixed inset-0 z-30 bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="h-10 bg-gray-900 border-b border-gray-700 flex items-center px-3 gap-3 shrink-0">
        <MapSelector
          maps={gameStore.maps}
          activeMapId={gameStore.activeMapId}
          onSelectMap={handleSelectMap}
          onAddMap={handleAddMap}
        />
        {gameStore.initiative && (
          <span className="text-xs text-amber-400 font-semibold">Round {gameStore.initiative.round}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-3 py-1 text-xs font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors cursor-pointer"
        >
          Close Editor
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Tools strip */}
        <div className="w-12 bg-gray-900/80 border-r border-gray-700 flex flex-col items-center py-2 gap-1 shrink-0">
          <DMToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={UndoManager.canUndo()}
            canRedo={UndoManager.canRedo()}
          />
        </div>

        {/* Map canvas */}
        <div className="flex-1 relative min-w-0">
          <MapCanvas
            map={activeMap}
            isHost={true}
            selectedTokenId={selectedTokenId}
            activeTool={activeTool}
            fogBrushSize={fogBrushSize}
            onTokenMove={handleTokenMove}
            onTokenSelect={handleTokenSelect}
            onCellClick={handleCellClick}
            onWallPlace={onWallPlace}
            onDoorToggle={handleDoorToggle}
          />
        </div>

        {/* Right panel */}
        <MapEditorRightPanel
          rightPanel={rightPanel}
          setRightPanel={setRightPanel}
          activeMap={activeMap}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          fogBrushSize={fogBrushSize}
          setFogBrushSize={setFogBrushSize}
          terrainPaintType={terrainPaintType}
          setTerrainPaintType={setTerrainPaintType}
          selectedTokenId={selectedTokenId}
          setSelectedTokenId={setSelectedTokenId}
          campaign={campaign}
        />
      </div>

      {showCreateMap && (
        <Suspense fallback={null}>
          <CreateMapModal onCreateMap={handleCreateMap} onClose={() => setShowCreateMap(false)} />
        </Suspense>
      )}
    </div>
  )
}
