import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../../i18n'

// PHASE-28 28F — DM-facing view + correction surface for the engine quest store. Reads via
// window.api.ai.getQuestLog; objective toggles + chapter advance go through the 28B IPC. Also the
// undo surface for the 28C auto-ticks (the system chat note points here).

type ObjectiveStatus = 'pending' | 'completed' | 'failed'
type QuestStatus = 'active' | 'completed' | 'failed' | 'abandoned'
interface QuestObjective {
  id: string
  text: string
  status: ObjectiveStatus
}
interface QuestRecord {
  id: string
  name: string
  description: string
  status: QuestStatus
  chapterQuest: boolean
  objectives: QuestObjective[]
}
interface QuestLog {
  version: number
  chapter: { number: number; title?: string; goal?: string; startedAt: string }
  pendingChapterAdvance?: { proposedAt: string; reason: string }
  quests: QuestRecord[]
}

export default function QuestLogPanel({ campaignId }: { campaignId: string }): JSX.Element {
  const { t } = useT()
  const [log, setLog] = useState<QuestLog | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.api.ai.getQuestLog?.(campaignId)
      if (r?.success && r.data) setLog(r.data as QuestLog)
    } catch {
      // best-effort; a fetch failure leaves the last-known log
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Refresh when the quest-checker auto-ticks an objective / proposes a chapter advance.
  useEffect(() => {
    const off = window.api.ai.onQuestStateChanged?.((d) => {
      if (d.campaignId === campaignId) refresh()
    })
    return () => off?.()
  }, [campaignId, refresh])

  const setObjective = async (
    questName: string,
    objective: string,
    operation: 'complete' | 'fail' | 'reopen'
  ): Promise<void> => {
    await window.api.ai.updateQuestObjective?.(campaignId, { questName, operation, objective })
    await refresh()
  }

  const advance = async (): Promise<void> => {
    await window.api.ai.advanceChapter?.(campaignId, {})
    await refresh()
  }

  const chapter = log?.chapter
  // Active + failed render together (live); completed/abandoned sink to the bottom.
  const order: Record<QuestStatus, number> = { active: 0, failed: 1, completed: 2, abandoned: 3 }
  const quests = [...(log?.quests ?? [])].sort((a, b) => order[a.status] - order[b.status])

  return (
    <div className="w-full bg-surface/60 border border-border/40 rounded-lg px-3 py-2 mt-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
          {t('game.questLogPanel.heading')}
        </span>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-muted hover:bg-gray-700 hover:text-gray-300 cursor-pointer disabled:opacity-50"
        >
          {loading ? t('game.questLogPanel.loading') : t('game.questLogPanel.refresh')}
        </button>
      </div>

      {chapter && (
        <div className="text-xs text-fg mb-1">
          <span className="font-semibold">
            {t('game.questLogPanel.chapter', { number: chapter.number })}
            {chapter.title ? `: ${chapter.title}` : ''}
          </span>
          {chapter.goal && (
            <span className="text-gray-400 ml-1">— {t('game.questLogPanel.goal', { goal: chapter.goal })}</span>
          )}
        </div>
      )}

      {log?.pendingChapterAdvance && (
        <div className="flex items-center justify-between gap-2 bg-amber-900/30 border border-amber-700/50 rounded px-2 py-1 mb-2">
          <span className="text-[11px] text-amber-300">
            {t('game.questLogPanel.advanceBanner', { reason: log.pendingChapterAdvance.reason })}
          </span>
          <button
            onClick={advance}
            className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-amber-700/60 text-amber-100 hover:bg-amber-600 cursor-pointer"
          >
            {t('game.questLogPanel.advanceButton', { number: (chapter?.number ?? 1) + 1 })}
          </button>
        </div>
      )}

      {quests.length === 0 ? (
        <div className="text-xs text-gray-600 py-1">{t('game.questLogPanel.empty')}</div>
      ) : (
        <div className="space-y-1.5">
          {quests.map((q) => (
            <div key={q.id} className={q.status === 'abandoned' || q.status === 'completed' ? 'opacity-60' : ''}>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-fg">{q.name}</span>
                <span className="text-[10px] text-gray-500">[{t(`game.questLogPanel.status.${q.status}`)}]</span>
                {q.chapterQuest && (
                  <span className="text-[10px] text-amber-400/80">({t('game.questLogPanel.chapterQuestTag')})</span>
                )}
              </div>
              {q.objectives.length > 0 && (
                <div className="ml-3 space-y-0.5 mt-0.5">
                  {q.objectives.map((o) => (
                    <div key={o.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="objective-completed"
                        checked={o.status === 'completed'}
                        onChange={(e) => setObjective(q.name, o.id, e.target.checked ? 'complete' : 'reopen')}
                      />
                      <span
                        className={`text-[11px] ${o.status === 'failed' ? 'text-red-400 line-through' : o.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-300'}`}
                      >
                        {o.text}
                      </span>
                      {o.status !== 'failed' && (
                        <button
                          title={t('game.questLogPanel.markFailed')}
                          onClick={() => setObjective(q.name, o.id, 'fail')}
                          className="text-[10px] text-gray-600 hover:text-red-400 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
