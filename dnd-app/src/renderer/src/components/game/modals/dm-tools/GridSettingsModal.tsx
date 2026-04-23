import { useGameStore } from '../../../../stores/use-game-store'
import type { GridSettings } from '../../../../types/map'
import GridControlPanel from '../../dm/GridControlPanel'

interface GridSettingsModalProps {
  onClose: () => void
}

export default function GridSettingsModal({ onClose }: GridSettingsModalProps): JSX.Element {
  const activeMapId = useGameStore((s) => s.activeMapId)
  const maps = useGameStore((s) => s.maps)

  const activeMap = maps.find((m) => m.id === activeMapId)

  if (!activeMap) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-400 text-sm">No active map</p>
          <button onClick={onClose} className="mt-3 px-4 py-1 text-sm bg-gray-700 rounded cursor-pointer">
            Close
          </button>
        </div>
      </div>
    )
  }

  const handleGridUpdate = (updates: Partial<GridSettings>): void => {
    useGameStore.setState((state) => ({
      maps: state.maps.map((m) => (m.id === activeMap.id ? { ...m, grid: { ...m.grid, ...updates } } : m))
    }))
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-[340px] max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Grid Settings — {activeMap.name}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="p-4">
          <GridControlPanel grid={activeMap.grid} onUpdate={handleGridUpdate} />
        </div>
      </div>
    </div>
  )
}
