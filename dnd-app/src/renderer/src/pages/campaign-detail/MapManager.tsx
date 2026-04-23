import { useState } from 'react'
import { Button, Card, Modal } from '../../components/ui'
import { addToast } from '../../hooks/use-toast'
import { exportEntities, importEntities, reIdItems } from '../../services/io/entity-io'
import type { Campaign } from '../../types/campaign'
import type { GameMap } from '../../types/map'

interface MapManagerProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function MapManager({ campaign, saveCampaign }: MapManagerProps): JSX.Element {
  const [showMapModal, setShowMapModal] = useState(false)
  const [mapForm, setMapForm] = useState({ name: '', gridType: 'square' as 'square' | 'hex', cellSize: 40 })

  const [editingMapId, setEditingMapId] = useState<string | null>(null)
  const [mapEditForm, setMapEditForm] = useState({
    name: '',
    gridType: 'square' as 'square' | 'hex',
    cellSize: 40,
    gridColor: '#4b5563',
    gridOpacity: 0.4
  })

  const handleExportMaps = async (mapsToExport: GameMap[]): Promise<void> => {
    if (!mapsToExport.length) return
    try {
      const ok = await exportEntities('map', mapsToExport)
      if (ok) addToast(`Exported ${mapsToExport.length} map(s)`, 'success')
    } catch {
      addToast('Map export failed', 'error')
    }
  }

  const handleImportMaps = async (): Promise<void> => {
    try {
      const result = await importEntities<GameMap>('map')
      if (!result) return
      const items = reIdItems(result.items).map((m) => ({ ...m, campaignId: campaign.id }))
      const maps = [...campaign.maps, ...items]
      await saveCampaign({ ...campaign, maps, updatedAt: new Date().toISOString() })
      addToast(`Imported ${items.length} map(s)`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Map import failed', 'error')
    }
  }

  const handleDeleteMap = async (mapId: string): Promise<void> => {
    const maps = campaign.maps.filter((m) => m.id !== mapId)
    const activeMapId =
      campaign.activeMapId === mapId ? (maps.length > 0 ? maps[0].id : undefined) : campaign.activeMapId
    await saveCampaign({ ...campaign, maps, activeMapId, updatedAt: new Date().toISOString() })
  }

  const handleAddMap = async (): Promise<void> => {
    if (!mapForm.name.trim()) return
    const newMap: GameMap = {
      id: crypto.randomUUID(),
      name: mapForm.name.trim(),
      campaignId: campaign.id,
      imagePath: '',
      width: 1600,
      height: 1200,
      grid: {
        enabled: true,
        cellSize: mapForm.cellSize,
        offsetX: 0,
        offsetY: 0,
        color: '#4b5563',
        opacity: 0.4,
        type: mapForm.gridType
      },
      tokens: [],
      fogOfWar: { enabled: false, revealedCells: [] },
      terrain: [],
      createdAt: new Date().toISOString()
    }
    const maps = [...campaign.maps, newMap]
    await saveCampaign({
      ...campaign,
      maps,
      activeMapId: campaign.activeMapId ?? newMap.id,
      updatedAt: new Date().toISOString()
    })
    setShowMapModal(false)
    setMapForm({ name: '', gridType: 'square', cellSize: 40 })
  }

  const openEditMap = (map: GameMap): void => {
    setEditingMapId(map.id)
    setMapEditForm({
      name: map.name,
      gridType: map.grid.type,
      cellSize: map.grid.cellSize,
      gridColor: map.grid.color,
      gridOpacity: map.grid.opacity
    })
  }

  const handleSaveMapEdit = async (): Promise<void> => {
    if (!editingMapId) return
    const maps = campaign.maps.map((m) =>
      m.id === editingMapId
        ? {
            ...m,
            name: mapEditForm.name.trim() || m.name,
            grid: {
              ...m.grid,
              type: mapEditForm.gridType,
              cellSize: mapEditForm.cellSize,
              color: mapEditForm.gridColor,
              opacity: mapEditForm.gridOpacity
            }
          }
        : m
    )
    await saveCampaign({ ...campaign, maps, updatedAt: new Date().toISOString() })
    setEditingMapId(null)
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Maps ({campaign.maps.length})</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportMaps}
              className="text-[10px] text-gray-400 hover:text-amber-400 cursor-pointer"
            >
              Import
            </button>
            {campaign.maps.length > 0 && (
              <button
                onClick={() => handleExportMaps(campaign.maps)}
                className="text-[10px] text-gray-400 hover:text-amber-400 cursor-pointer"
              >
                Export All
              </button>
            )}
          </div>
        </div>
        {campaign.maps.length === 0 ? (
          <p className="text-gray-500 text-sm">No maps configured yet.</p>
        ) : (
          <div className="space-y-2">
            {(() => {
              const nameCounts: Record<string, number> = {}
              const nameIndex: Record<string, number> = {}
              for (const m of campaign.maps) {
                nameCounts[m.name] = (nameCounts[m.name] || 0) + 1
              }
              return campaign.maps.map((map) => {
                let displayName = map.name
                if (nameCounts[map.name] > 1) {
                  nameIndex[map.name] = (nameIndex[map.name] || 0) + 1
                  displayName = `${map.name} (${nameIndex[map.name]})`
                }
                return (
                  <div key={map.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                    <div>
                      <span className="font-semibold text-sm">{displayName}</span>
                      <span className="text-gray-500 text-xs ml-2">
                        {map.grid.type} grid, {map.grid.cellSize}px
                      </span>
                      <span className="text-gray-600 text-xs ml-1">
                        {map.width}x{map.height}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {campaign.activeMapId === map.id && (
                        <span className="text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full">Active</span>
                      )}
                      <button
                        onClick={() => openEditMap(map)}
                        className="text-xs text-gray-400 hover:text-amber-400 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteMap(map.id)}
                        className="text-xs text-gray-400 hover:text-red-400 cursor-pointer"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}
        <button
          onClick={() => setShowMapModal(true)}
          className="mt-3 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
        >
          + Add Map
        </button>
      </Card>

      {/* Add Map Modal */}
      <Modal open={showMapModal} onClose={() => setShowMapModal(false)} title="Add Map">
        <div className="space-y-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Map Name *</label>
            <input
              type="text"
              value={mapForm.name}
              onChange={(e) => setMapForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              placeholder="Map name"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Grid Type</label>
            <select
              value={mapForm.gridType}
              onChange={(e) => setMapForm((f) => ({ ...f, gridType: e.target.value as 'square' | 'hex' }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="square">Square</option>
              <option value="hex">Hex</option>
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-gray-400 text-xs">Cell Size (px)</label>
              <button
                onClick={() => setMapForm((f) => ({ ...f, cellSize: 40 }))}
                className={`px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer ${
                  mapForm.cellSize === 40
                    ? 'border-amber-500/50 text-amber-300 bg-amber-900/10'
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                Reset to Default (40px)
              </button>
            </div>
            <input
              type="number"
              value={mapForm.cellSize}
              onChange={(e) => setMapForm((f) => ({ ...f, cellSize: parseInt(e.target.value, 10) || 40 }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              min={10}
              max={200}
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowMapModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddMap} disabled={!mapForm.name.trim()}>
            Add Map
          </Button>
        </div>
      </Modal>

      {/* Map Edit Modal */}
      <Modal open={editingMapId !== null} onClose={() => setEditingMapId(null)} title="Edit Map">
        <div className="space-y-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Map Name *</label>
            <input
              type="text"
              value={mapEditForm.name}
              onChange={(e) => setMapEditForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Grid Type</label>
            <select
              value={mapEditForm.gridType}
              onChange={(e) => setMapEditForm((f) => ({ ...f, gridType: e.target.value as 'square' | 'hex' }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="square">Square</option>
              <option value="hex">Hex</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Cell Size (px)</label>
            <input
              type="number"
              value={mapEditForm.cellSize}
              onChange={(e) => setMapEditForm((f) => ({ ...f, cellSize: parseInt(e.target.value, 10) || 40 }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              min={10}
              max={200}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Grid Color</label>
            <input
              type="color"
              value={mapEditForm.gridColor}
              onChange={(e) => setMapEditForm((f) => ({ ...f, gridColor: e.target.value }))}
              className="w-12 h-8 bg-gray-800 border border-gray-700 rounded cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Grid Opacity</label>
            <input
              type="range"
              value={mapEditForm.gridOpacity}
              onChange={(e) => setMapEditForm((f) => ({ ...f, gridOpacity: parseFloat(e.target.value) }))}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <span className="text-xs text-gray-500">{Math.round(mapEditForm.gridOpacity * 100)}%</span>
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setEditingMapId(null)}>
            Cancel
          </Button>
          <Button onClick={handleSaveMapEdit} disabled={!mapEditForm.name.trim()}>
            Save
          </Button>
        </div>
      </Modal>
    </>
  )
}
