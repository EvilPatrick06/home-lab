import builtInMapsJson from '@data/5e/world/built-in-maps.json'
import { useCallback, useState } from 'react'
import { load5eBuiltInMaps } from '../../services/data-provider'
import type { GameMap } from '../../types/map'
import { Button, Input } from '../ui'

interface MapConfigStepProps {
  maps: GameMap[]
  campaignId: string
  onChange: (maps: GameMap[]) => void
  adventureMaps?: Array<{ id: string; name: string }>
}

const BUILT_IN_MAPS = builtInMapsJson

/** Load built-in map definitions from the data store (includes plugin maps). */
export async function loadBuiltInMapData(): Promise<unknown> {
  return load5eBuiltInMaps()
}

export default function MapConfigStep({ maps, campaignId, onChange, adventureMaps }: MapConfigStepProps): JSX.Element {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newMapName, setNewMapName] = useState('')
  const [newGridSize, setNewGridSize] = useState(40)
  const [dragOver, setDragOver] = useState(false)

  const createMapEntry = useCallback(
    (name: string, gridSize: number): GameMap => ({
      id: crypto.randomUUID(),
      name,
      campaignId,
      imagePath: '',
      width: 1920,
      height: 1080,
      grid: {
        enabled: true,
        cellSize: gridSize,
        offsetX: 0,
        offsetY: 0,
        color: '#ffffff',
        opacity: 0.2,
        type: 'square'
      },
      tokens: [],
      fogOfWar: { enabled: false, revealedCells: [] },
      terrain: [],
      createdAt: new Date().toISOString()
    }),
    [campaignId]
  )

  const handleAddCustomMap = (): void => {
    if (!newMapName.trim()) return

    const newMap = createMapEntry(newMapName.trim(), newGridSize)
    onChange([...maps, newMap])
    setNewMapName('')
    setNewGridSize(40)
    setShowAddForm(false)
  }

  const handleAddBuiltIn = (builtIn: (typeof BUILT_IN_MAPS)[number]): void => {
    // Don't add duplicates
    if (maps.some((m) => m.name === builtIn.name)) return

    const newMap = createMapEntry(builtIn.name, 40)
    newMap.id = builtIn.id
    newMap.imagePath = builtIn.imagePath
    onChange([...maps, newMap])
  }

  const handleRemoveMap = (id: string): void => {
    onChange(maps.filter((m) => m.id !== id))
  }

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)

      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))

      const newMaps: GameMap[] = []
      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer()
          const extension = file.name.split('.').pop() || 'png'
          const imageId = crypto.randomUUID()

          // Save the image to the image library
          await window.api.imageLibrary.save(imageId, file.name, arrayBuffer, extension)

          const map = createMapEntry(file.name.replace(/\.[^.]+$/, ''), 40)
          map.imagePath = `image-library://${imageId}`
          newMaps.push(map)
        } catch (error) {
          logger.error('Failed to save map image:', error)
          // Create map with placeholder if image save fails
          const map = createMapEntry(file.name.replace(/\.[^.]+$/, ''), 40)
          map.imagePath = file.name // fallback to filename as placeholder
          newMaps.push(map)
        }
      }

      if (newMaps.length > 0) {
        onChange([...maps, ...newMaps])
      }
    },
    [maps, onChange, createMapEntry]
  )

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (): void => {
    setDragOver(false)
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Map Configuration</h2>
      <p className="text-gray-400 text-sm mb-6">
        Add maps for your campaign. You can use built-in maps or upload your own images. The full map editor will be
        available in-game.
      </p>

      <div className="max-w-2xl space-y-6">
        {/* Adventure maps (read-only preview) */}
        {adventureMaps && adventureMaps.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              From Adventure ({adventureMaps.length})
            </h3>
            <div className="space-y-2">
              {adventureMaps.map((am) => (
                <div
                  key={am.id}
                  className="bg-amber-900/10 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{'\uD83D\uDDFA'}</span>
                    <span className="font-semibold text-sm">{am.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{am.id}</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-700/40 text-amber-300">Adventure</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Drop zone for custom maps */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${dragOver ? 'border-amber-500 bg-amber-900/10' : 'border-gray-700 hover:border-gray-600'}`}
        >
          <div className="text-3xl mb-2">{'\uD83D\uDDFA'}</div>
          <p className="text-gray-400 mb-1">Drag and drop map images here</p>
          <p className="text-gray-500 text-sm">PNG, JPG, or WebP</p>
        </div>

        {/* Built-in maps */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Built-in Maps</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {BUILT_IN_MAPS.map((bm) => {
              const isAdded = maps.some((m) => m.id === bm.id || m.name === bm.name)
              return (
                <button
                  key={bm.id}
                  onClick={() => handleAddBuiltIn(bm)}
                  disabled={isAdded}
                  className={`p-4 rounded-lg border text-left transition-all cursor-pointer
                    ${
                      isAdded
                        ? 'border-amber-500/50 bg-amber-900/10 opacity-60 cursor-not-allowed'
                        : 'border-gray-800 bg-gray-900/50 hover:border-gray-600'
                    }`}
                >
                  <div className="font-semibold text-sm mb-1">{bm.name}</div>
                  <div className="text-xs text-gray-500">{bm.preview}</div>
                  {isAdded && <div className="text-xs text-amber-400 mt-2">Added</div>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Added maps list */}
        {maps.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Campaign Maps ({maps.length})
            </h3>
            <div className="space-y-2">
              {maps.map((map) => (
                <div
                  key={map.id}
                  className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-sm">{map.name}</span>
                    <span className="text-gray-500 text-xs ml-2">
                      Grid: {map.grid.cellSize}px | {map.grid.type}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveMap(map.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer text-lg"
                    title="Remove map"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add custom map form */}
        {showAddForm ? (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 space-y-4">
            <Input
              label="Map Name"
              placeholder="e.g. Dragon's Lair"
              value={newMapName}
              onChange={(e) => setNewMapName(e.target.value)}
            />
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-400 text-sm">Grid Cell Size (px)</label>
                <button
                  onClick={() => setNewGridSize(40)}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors cursor-pointer ${
                    newGridSize === 40
                      ? 'border-amber-500/50 text-amber-300 bg-amber-900/10'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  Reset to Default (40px)
                </button>
              </div>
              <input
                type="number"
                min={20}
                max={100}
                className="w-24 p-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
                  focus:outline-none focus:border-amber-500 transition-colors"
                value={newGridSize}
                onChange={(e) => setNewGridSize(Math.max(20, Math.min(100, parseInt(e.target.value, 10) || 40)))}
              />
              <span className="text-gray-500 text-sm ml-3">20 - 100 px</span>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleAddCustomMap} disabled={!newMapName.trim()}>
                Add Map
              </Button>
              <Button variant="secondary" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setShowAddForm(true)}>
            + Add Custom Map
          </Button>
        )}

        {maps.length === 0 && (
          <p className="text-gray-500 text-sm">
            No maps added yet. You can add maps later from the campaign detail page.
          </p>
        )}
      </div>
    </div>
  )
}
