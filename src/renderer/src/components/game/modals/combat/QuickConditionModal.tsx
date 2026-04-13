import { useState } from 'react'
import { CONDITIONS_5E } from '../../../../data/conditions'
import { useGameStore } from '../../../../stores/use-game-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'

interface QuickConditionModalProps {
  onClose: () => void
  preselectedEntities?: string[]
}

export default function QuickConditionModal({
  onClose,
  preselectedEntities = []
}: QuickConditionModalProps): JSX.Element {
  const conditions = useGameStore((s) => s.conditions)
  const initiative = useGameStore((s) => s.initiative)
  const maps = useGameStore((s) => s.maps)
  const activeMapId = useGameStore((s) => s.activeMapId)
  const round = useGameStore((s) => s.round)
  const addCondition = useGameStore((s) => s.addCondition)
  const removeCondition = useGameStore((s) => s.removeCondition)

  const [selectedEntities, setSelectedEntities] = useState<string[]>(preselectedEntities)
  const [selectedCondition, setSelectedCondition] = useState('')
  const [duration, setDuration] = useState('1')
  const [exhaustionLevel, setExhaustionLevel] = useState(1)
  const [sourceEntityId, setSourceEntityId] = useState('')

  const SOURCE_CONDITIONS = ['Charmed', 'Frightened', 'Grappled']
  const needsSource = SOURCE_CONDITIONS.includes(selectedCondition)
  const needsValue = selectedCondition === 'Exhaustion'

  // Get entities from initiative or tokens
  const entities: { id: string; name: string }[] = []
  if (initiative) {
    initiative.entries.forEach((e) => {
      entities.push({ id: e.entityId, name: e.entityName })
    })
  }
  const activeMap = maps.find((m) => m.id === activeMapId)
  if (activeMap) {
    activeMap.tokens.forEach((t) => {
      if (!entities.some((e) => e.id === t.entityId)) {
        entities.push({ id: t.entityId, name: t.label })
      }
    })
  }

  const handleApply = (): void => {
    if (selectedEntities.length === 0 || !selectedCondition) return

    selectedEntities.forEach((entityId) => {
      const entity = entities.find((e) => e.id === entityId)
      if (!entity) return

      addCondition({
        id: crypto.randomUUID(),
        entityId: entity.id,
        entityName: entity.name,
        condition: selectedCondition,
        ...(needsValue ? { value: exhaustionLevel } : {}),
        duration: duration === 'permanent' ? 'permanent' : parseInt(duration, 10),
        source: 'DM',
        appliedRound: round,
        ...(needsSource && sourceEntityId ? { sourceEntityId } : {})
      })

      // Flying fall warning: if Incapacitated or Prone applied to a token with flySpeed
      const condLower = selectedCondition.toLowerCase()
      if (condLower === 'incapacitated' || condLower === 'prone') {
        const token = activeMap?.tokens.find((t) => t.entityId === entity.id)
        if (token?.flySpeed && token.flySpeed > 0) {
          useLobbyStore.getState().addChatMessage({
            id: crypto.randomUUID(),
            senderId: 'system',
            senderName: 'System',
            content: `${entity.name} is flying and gained ${selectedCondition} — they fall!`,
            timestamp: Date.now(),
            isSystem: true
          })
        }
      }
    })

    onClose()
  }

  const handleRemove = (conditionId: string): void => {
    removeCondition(conditionId)
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">Quick Conditions</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Apply new condition */}
        <div className="space-y-2 mb-4">
          <div className="max-h-32 overflow-y-auto space-y-1">
            {entities.map((entity) => (
              <label
                key={entity.id}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 px-2 py-1 rounded"
              >
                <input
                  type="checkbox"
                  checked={selectedEntities.includes(entity.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedEntities([...selectedEntities, entity.id])
                    } else {
                      setSelectedEntities(selectedEntities.filter((id) => id !== entity.id))
                    }
                  }}
                  className="w-3 h-3 text-amber-500 bg-gray-800 border-gray-600 rounded focus:ring-amber-500 focus:ring-2"
                />
                <span className="text-xs text-gray-200">{entity.name}</span>
              </label>
            ))}
          </div>
          <select
            value={selectedCondition}
            onChange={(e) => setSelectedCondition(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
          >
            <option value="">Condition...</option>
            {CONDITIONS_5E.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {needsValue && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 whitespace-nowrap">Exhaustion Level:</label>
              <input
                type="number"
                min={1}
                max={6}
                value={exhaustionLevel}
                onChange={(e) => setExhaustionLevel(Math.min(6, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="w-16 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
              />
              {exhaustionLevel >= 6 && <span className="text-[10px] text-red-400 font-semibold">Fatal!</span>}
            </div>
          )}
          {needsSource && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 whitespace-nowrap">Source:</label>
              <select
                value={sourceEntityId}
                onChange={(e) => setSourceEntityId(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="">No source...</option>
                {entities
                  .filter((e) => !selectedEntities.includes(e.id))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="1">1 round</option>
              <option value="2">2 rounds</option>
              <option value="3">3 rounds</option>
              <option value="5">5 rounds</option>
              <option value="10">10 rounds</option>
              <option value="permanent">Permanent</option>
            </select>
            <button
              onClick={handleApply}
              disabled={selectedEntities.length === 0 || !selectedCondition}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white
                transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply to {selectedEntities.length} {selectedEntities.length === 1 ? 'Entity' : 'Entities'}
            </button>
          </div>
        </div>

        {/* Active conditions */}
        <div className="border-t border-gray-800 pt-3">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Active Conditions</span>
          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {conditions.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">None</p>
            ) : (
              conditions.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-2 py-1.5 bg-gray-800/50 rounded">
                  <div>
                    <span className="text-xs text-gray-200">{c.entityName}</span>
                    <span className="text-[10px] text-purple-400 ml-1.5">
                      {c.condition}
                      {c.condition === 'Exhaustion' && c.value ? ` (${c.value})` : ''}
                    </span>
                    {c.sourceEntityId && (
                      <span className="text-[9px] text-amber-400 ml-1">
                        from {entities.find((e) => e.id === c.sourceEntityId)?.name ?? 'unknown'}
                      </span>
                    )}
                    <span className="text-[9px] text-gray-500 ml-1">
                      ({c.duration === 'permanent' ? 'Perm' : `${c.duration}r`})
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemove(c.id)}
                    className="text-xs text-gray-500 hover:text-red-400 cursor-pointer"
                  >
                    &#10005;
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
