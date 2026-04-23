import { useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'

interface AiMapAnalysisModalProps {
  onClose: () => void
}

export default function AiMapAnalysisModal({ onClose }: AiMapAnalysisModalProps): JSX.Element {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const maps = useGameStore((s) => s.maps)
  const activeMapId = useGameStore((s) => s.activeMapId)
  const initiative = useGameStore((s) => s.initiative)
  const conditions = useGameStore((s) => s.conditions)

  const handleAnalyze = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      // Build a serializable snapshot of relevant game state
      const gameState = {
        maps: maps.map((m) => ({
          id: m.id,
          name: m.name,
          gridWidth: m.gridWidth,
          gridHeight: m.gridHeight,
          tokens: m.tokens.map((t) => ({
            entityId: t.entityId,
            label: t.label,
            entityType: t.entityType,
            gridX: t.gridX,
            gridY: t.gridY,
            currentHP: t.currentHP,
            maxHP: t.maxHP,
            ac: t.ac,
            conditions: t.conditions ?? []
          }))
        })),
        activeMapId,
        initiative: initiative
          ? {
              entries: initiative.entries.map((e) => ({
                entityId: e.entityId,
                entityName: e.entityName,
                isActive: e.isActive
              })),
              currentIndex: initiative.currentIndex,
              round: initiative.round
            }
          : null,
        conditions: conditions.map((c) => ({
          entityId: c.entityId,
          entityName: c.entityName,
          condition: c.condition
        }))
      }

      const result = await window.api.ai.analyzeMap(gameState)

      if (result.success && result.analysis) {
        setAnalysis(result.analysis)
      } else {
        setError(result.error ?? 'Analysis failed')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const activeMap = maps.find((m) => m.id === activeMapId)
  const tokenCount = activeMap?.tokens.length ?? 0

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[640px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">AI Map Analysis</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none cursor-pointer">
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Map info */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
            <div className="text-sm text-gray-300">
              {activeMap ? (
                <>
                  <span className="font-medium text-gray-200">{activeMap.name}</span>
                  <span className="text-gray-500 ml-2">
                    {activeMap.gridWidth}x{activeMap.gridHeight} grid
                  </span>
                  <span className="text-gray-500 ml-2">
                    {tokenCount} token{tokenCount !== 1 ? 's' : ''}
                  </span>
                  {initiative && <span className="text-amber-400 ml-2">Round {initiative.round}</span>}
                </>
              ) : (
                <span className="text-gray-500 italic">No active map selected</span>
              )}
            </div>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={loading || !activeMap}
            className="w-full px-4 py-2.5 text-sm font-medium bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg cursor-pointer transition-colors"
          >
            {loading ? 'Analyzing...' : 'Analyze Map State'}
          </button>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-sm text-red-300">{error}</div>
          )}

          {/* Analysis result */}
          {analysis && (
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-purple-300 mb-2">Tactical Analysis</h3>
              <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{analysis}</div>
            </div>
          )}

          {/* Token summary */}
          {activeMap && activeMap.tokens.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-400 mb-1.5">Current Tokens</h3>
              <div className="space-y-1">
                {activeMap.tokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between text-[11px] px-2 py-1 bg-gray-800/40 rounded"
                  >
                    <span className="text-gray-300">
                      {token.label}
                      <span className="text-gray-500 ml-1">({token.entityType})</span>
                    </span>
                    <span className="text-gray-500">
                      ({token.gridX}, {token.gridY})
                      {token.currentHP !== undefined && token.maxHP !== undefined && (
                        <span
                          className={`ml-2 ${
                            token.currentHP <= 0
                              ? 'text-red-400'
                              : token.currentHP < token.maxHP / 2
                                ? 'text-amber-400'
                                : 'text-green-400'
                          }`}
                        >
                          {token.currentHP}/{token.maxHP}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
