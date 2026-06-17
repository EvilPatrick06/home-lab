import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n'
import { useAiDmStore } from '../../../stores/use-ai-dm-store'

interface ContextInspectorPanelProps {
  campaignId: string
  characterIds: string[]
}

interface Breakdown {
  safety?: number // PHASE-32 32B
  rulebookChunks: number
  srdData: number
  characterData: number
  campaignData: number
  campaignDocs: number
  creatures: number
  gameState: number
  memory: number
  total: number
  truncated?: boolean
}

interface Snapshot {
  breakdown: Breakdown | null
  contextTruncated: boolean
  lastTokenEstimate: number
  contextWindow: number | null
  conversationBudget: number
  chunkIds: string[]
}

const toggleBtnClass =
  'px-3 py-2 text-xs font-medium rounded-lg bg-surface-2/60 border border-border/50 text-gray-300 hover:bg-amber-600/20 hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer whitespace-nowrap'

/**
 * PHASE-14 14E — "What did the AI actually see?" Replaces DMTabPanel's inline token-budget
 * block: per-section token estimates, model context window, last-request estimate, the truthful
 * truncation flag, and the last assistant turn's chunk-id provenance. Display-only.
 */
export default function ContextInspectorPanel({ campaignId, characterIds }: ContextInspectorPanelProps): JSX.Element {
  const { t } = useT()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [previewBreakdown, setPreviewBreakdown] = useState<Breakdown | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const isTyping = useAiDmStore((s) => s.isTyping)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await window.api.ai.getContextInspector(campaignId)
      setSnapshot(snap)
      // No live build yet (e.g. game just opened) — preview so the DM still sees realistic
      // counts, exactly as DMTabPanel's old fallback did.
      if (!snap?.breakdown) {
        const preview = await window.api.ai.previewTokenBudget(campaignId, characterIds)
        setPreviewBreakdown(preview ?? null)
      } else {
        setPreviewBreakdown(null)
      }
    } catch {
      // Non-fatal — observability panel.
    } finally {
      setLoading(false)
    }
  }, [campaignId, characterIds])

  // Refresh on mount.
  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-refresh on the falling edge of isTyping — a turn just finished (ported from DMTabPanel).
  const wasTypingRef = useRef(false)
  useEffect(() => {
    if (wasTypingRef.current && !isTyping) refresh()
    wasTypingRef.current = isTyping
  }, [isTyping, refresh])

  const breakdown = snapshot?.breakdown ?? previewBreakdown
  const isPreview = !snapshot?.breakdown && previewBreakdown != null
  const total = breakdown?.total ?? 0
  const contextWindow = snapshot?.contextWindow ?? null
  const truncated = (snapshot?.contextTruncated ?? false) || (breakdown?.truncated ?? false)
  const overWindow = contextWindow != null && total > contextWindow
  const chunkIds = snapshot?.chunkIds ?? []

  return (
    <div className="w-full">
      <button
        type="button"
        className={toggleBtnClass}
        onClick={() => {
          refresh()
          setExpanded((e) => !e)
        }}
      >
        {t('game.dmTabPanel.tokenBudget')}{' '}
        {breakdown ? t('game.dmTabPanel.tokenCount', { count: total.toLocaleString() }) : loading ? '…' : ''}
      </button>

      {expanded && (
        <div className="w-full bg-surface/60 border border-border/40 rounded-lg px-3 py-2 space-y-0.5 mt-1.5">
          {isPreview && (
            <div className="text-xs text-amber-400/80 italic">{t('game.contextInspector.previewNote')}</div>
          )}

          {breakdown && (
            <>
              {(
                [
                  [t('game.contextInspector.sections.safety'), breakdown.safety ?? 0],
                  [t('game.dmTabPanel.budgetRulebook'), breakdown.rulebookChunks],
                  [t('game.dmTabPanel.budgetSrdData'), breakdown.srdData],
                  [t('game.dmTabPanel.budgetCharacters'), breakdown.characterData],
                  [t('game.dmTabPanel.budgetCampaign'), breakdown.campaignData],
                  [t('game.contextInspector.sections.campaignDocs'), breakdown.campaignDocs],
                  [t('game.dmTabPanel.budgetCreatures'), breakdown.creatures],
                  [t('game.dmTabPanel.budgetGameState'), breakdown.gameState],
                  [t('game.dmTabPanel.budgetMemory'), breakdown.memory]
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-gray-500">{label}</span>
                  <span className="text-muted">{val.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs border-t border-border pt-0.5 mt-0.5">
                <span className="text-purple-400 font-semibold">{t('game.dmTabPanel.totalContext')}</span>
                <span className="text-purple-400 font-semibold">{total.toLocaleString()}</span>
              </div>
            </>
          )}

          {/* Model context window — amber when the assembled total exceeds it. */}
          <div className={`flex justify-between text-xs ${overWindow ? 'text-amber-400' : ''}`}>
            <span className={overWindow ? '' : 'text-gray-500'}>{t('game.contextInspector.window')}</span>
            <span>
              {contextWindow != null ? contextWindow.toLocaleString() : t('game.contextInspector.windowUnknown')}
            </span>
          </div>

          {/* Last request estimate (system + history). */}
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">{t('game.contextInspector.estimate')}</span>
            <span className="text-muted">
              {snapshot && snapshot.lastTokenEstimate > 0 ? snapshot.lastTokenEstimate.toLocaleString() : '—'}
            </span>
          </div>

          {/* Truthful truncation state. */}
          {truncated ? (
            <div role="status" className="text-xs text-amber-400 pt-0.5">
              {t('game.contextInspector.truncatedWarning')}
            </div>
          ) : (
            <div className="text-xs text-gray-600 pt-0.5">{t('game.contextInspector.truncatedNo')}</div>
          )}

          {/* Last-turn retrieval provenance. */}
          <details className="text-xs pt-0.5">
            <summary className="cursor-pointer text-gray-500">
              {t('game.contextInspector.chunks', { count: chunkIds.length })}
            </summary>
            {chunkIds.length > 0 ? (
              <div className="font-mono max-h-24 overflow-y-auto text-gray-400 mt-1">
                {chunkIds.map((id) => (
                  <div key={id}>{id}</div>
                ))}
              </div>
            ) : (
              <div className="text-gray-600 mt-1">{t('game.contextInspector.chunksNone')}</div>
            )}
            <div className="text-gray-600 italic mt-1">{t('game.contextInspector.chunksNote')}</div>
          </details>

          <div className="text-gray-600 italic text-xs pt-1">{t('game.contextInspector.estimateNote')}</div>
        </div>
      )}
    </div>
  )
}
