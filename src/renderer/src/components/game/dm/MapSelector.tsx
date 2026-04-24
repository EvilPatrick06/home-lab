import type { GameMap } from '../../../types/map'

interface MapSelectorProps {
  maps: GameMap[]
  activeMapId: string | null
  onSelectMap: (mapId: string) => void
  onAddMap: () => void
}

export default function MapSelector({ maps, activeMapId, onSelectMap, onAddMap }: MapSelectorProps): JSX.Element {
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <select
          value={activeMapId ?? ''}
          onChange={(e) => {
            if (e.target.value) onSelectMap(e.target.value)
          }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="" disabled>
            Select Map
          </option>
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <button
          onClick={onAddMap}
          title="Add Map"
          className="px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400
            hover:bg-gray-700 hover:text-gray-200 text-sm transition-colors cursor-pointer"
        >
          + Map
        </button>
      </div>

      {maps.length === 0 && <p className="text-xs text-gray-500 mt-1">No maps added yet</p>}
    </div>
  )
}
