import { useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { getTokenStats } from '../../../../services/game/token-stats'
import { useGameStore } from '../../../../stores/use-game-store'

interface AiMapAnalysisModalProps {
  onClose: () => void
}

export default function AiMapAnalysisModal({ onClose }: AiMapAnalysisModalProps): JSX.Element {
  const { t } = useT()
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const maps = useGameStore((s) => s.maps)
  const activeMapId = useGameStore((s) => s.activeMapId)
  const initiative = useGameStore((s) => s.initiative)
  const conditions = useGameStore((s) => s.conditions)

  useEscapeKey(onClose)

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
          gridWidth: m.grid?.cellSize ? Math.floor(m.width / m.grid.cellSize) : m.width,
          gridHeight: m.grid?.cellSize ? Math.floor(m.height / m.grid.cellSize) : m.height,
          tokens: m.tokens.map((t) => {
            const s = getTokenStats(t)
            return {
              entityId: t.entityId,
              label: t.label,
              entityType: t.entityType,
              gridX: t.gridX,
              gridY: t.gridY,
              currentHP: t.currentHP,
              maxHP: s.maxHP,
              ac: s.ac,
              conditions: t.conditions ?? []
            }
          })
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
        setError(result.error ?? t('game.aiMapAnalysisModal.analysisFailed'))
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
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[640px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">{t('game.aiMapAnalysisModal.title')}</h2>
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
                    {activeMap.grid?.cellSize
                      ? `${Math.floor(activeMap.width / activeMap.grid.cellSize)}x${Math.floor(activeMap.height / activeMap.grid.cellSize)}`
                      : `${activeMap.width}x${activeMap.height}`}{' '}
                    {t('game.aiMapAnalysisModal.grid')}
                  </span>
                  <span className="text-gray-500 ml-2">
                    {t('game.aiMapAnalysisModal.tokenCount', { count: tokenCount })}
                  </span>
                  {initiative && (
                    <span className="text-amber-400 ml-2">
                      {t('game.aiMapAnalysisModal.round', { round: initiative.round })}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-gray-500 italic">{t('game.aiMapAnalysisModal.noActiveMap')}</span>
              )}
            </div>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={loading || !activeMap}
            className="w-full px-4 py-2.5 text-sm font-medium bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg cursor-pointer transition-colors"
          >
            {loading ? t('game.aiMapAnalysisModal.analyzing') : t('game.aiMapAnalysisModal.analyzeMapState')}
          </button>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-sm text-red-300">{error}</div>
          )}

          {/* Analysis result */}
          {analysis && (
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-purple-300 mb-2">
                {t('game.aiMapAnalysisModal.tacticalAnalysis')}
              </h3>
              <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{analysis}</div>
            </div>
          )}

          {/* Token summary */}
          {activeMap && activeMap.tokens.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-400 mb-1.5">{t('game.aiMapAnalysisModal.currentTokens')}</h3>
              <div className="space-y-1">
                {activeMap.tokens.map((token) => {
                  const maxHP = getTokenStats(token).maxHP
                  return (
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
                        {token.currentHP !== undefined && maxHP !== undefined && (
                          <span
                            className={`ml-2 ${
                              token.currentHP <= 0
                                ? 'text-red-400'
                                : token.currentHP < maxHP / 2
                                  ? 'text-amber-400'
                                  : 'text-green-400'
                            }`}
                          >
                            {token.currentHP}/{maxHP}
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
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
            {t('common.actions.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
