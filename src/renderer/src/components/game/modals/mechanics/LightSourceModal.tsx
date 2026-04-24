import { useState } from 'react'
import { LIGHT_SOURCE_LABELS, LIGHT_SOURCES } from '../../../../data/light-sources'
import { useGameStore } from '../../../../stores/use-game-store'

interface LightSourceModalProps {
  onClose: () => void
}

export default function LightSourceModal({ onClose }: LightSourceModalProps): JSX.Element {
  const [entityName, setEntityName] = useState('')
  const [selectedSource, setSelectedSource] = useState('torch')
  const lightSource = useGameStore((s) => s.lightSource)
  const activeMap = useGameStore((s) => {
    const mapId = s.activeMapId
    return s.maps.find((m) => m.id === mapId) ?? null
  })

  const tokens = activeMap?.tokens ?? []
  const sourceKeys = Object.keys(LIGHT_SOURCES)

  const handleLight = (): void => {
    if (!entityName.trim()) return
    const source = LIGHT_SOURCES[selectedSource]
    if (!source) return

    // Try to find a token for this entity
    const token = tokens.find((t) => t.label.toLowerCase() === entityName.toLowerCase())
    const entityId = token?.entityId ?? entityName

    lightSource(entityId, entityName, selectedSource, source.durationSeconds)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-80 shadow-2xl">
        <h3 className="text-sm font-semibold text-amber-400 mb-3">Light Source</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Character / Token</label>
            <select
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200"
            >
              <option value="">Select...</option>
              {tokens.map((t) => (
                <option key={t.id} value={t.label}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Source Type</label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200"
            >
              {sourceKeys.map((key) => {
                const def = LIGHT_SOURCES[key]
                const dur = def.durationSeconds === Infinity ? 'permanent' : `${def.durationSeconds / 60} min`
                return (
                  <option key={key} value={key}>
                    {LIGHT_SOURCE_LABELS[key]} ({dur})
                  </option>
                )
              })}
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleLight}
              disabled={!entityName.trim()}
              className="flex-1 px-3 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Light It
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
