import { useEffect, useState } from 'react'
import { Z } from '../../../../constants'
import { useT } from '../../../../i18n'
import { useAiDmStore } from '../../../../stores/use-ai-dm-store'

/**
 * RulingApprovalModal — shown when DM approval is required for AI DM actions.
 * Displays the pending actions and lets the DM approve or override them.
 */
export default function RulingApprovalModal(): JSX.Element | null {
  const { t } = useT()
  const pendingActions = useAiDmStore((s) => s.pendingActions)
  const approvePendingActions = useAiDmStore((s) => s.approvePendingActions)
  const rejectPendingActions = useAiDmStore((s) => s.rejectPendingActions)
  const [dmNote, setDmNote] = useState('')

  // Phase 17e (GUI-7) — dismiss (clear pending actions WITHOUT applying them). Escape + backdrop
  // click both dismiss; previously the modal had only Approve/Override and no escape hatch.
  const dismiss = (): void => rejectPendingActions('')
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-bind the Escape handler only when pendingActions toggles; rejectPendingActions is a stable store action
  useEffect(() => {
    if (!pendingActions) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        dismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingActions])

  if (!pendingActions) return null

  const actionSummaries = pendingActions.actions.map((a) => {
    switch (a.action) {
      case 'update_token':
        return t('game.rulingApprovalModal.updateToken', {
          label: a.label,
          hp: a.hp !== undefined ? t('game.rulingApprovalModal.hpPart', { hp: a.hp }) : '',
          ac: a.ac !== undefined ? t('game.rulingApprovalModal.acPart', { ac: a.ac }) : '',
          conditions: a.conditions
            ? t('game.rulingApprovalModal.conditionsPart', { conditions: (a.conditions as string[]).join(', ') })
            : ''
        })
      case 'place_token':
      case 'place_creature':
        return t('game.rulingApprovalModal.placeToken', {
          label: a.label || a.creatureName,
          x: a.gridX,
          y: a.gridY
        })
      case 'move_token':
        return t('game.rulingApprovalModal.moveToken', { label: a.label, x: a.gridX, y: a.gridY })
      case 'remove_token':
        return t('game.rulingApprovalModal.removeToken', { label: a.label })
      case 'add_entity_condition':
        return t('game.rulingApprovalModal.addCondition', { condition: a.condition, entity: a.entityLabel })
      case 'remove_entity_condition':
        return t('game.rulingApprovalModal.removeCondition', { condition: a.condition, entity: a.entityLabel })
      case 'start_initiative':
        return t('game.rulingApprovalModal.startInitiative')
      case 'next_turn':
        return t('game.rulingApprovalModal.nextTurn')
      case 'end_initiative':
        return t('game.rulingApprovalModal.endInitiative')
      case 'set_ambient_light':
        return t('game.rulingApprovalModal.setLighting', { level: a.level })
      case 'advance_time':
        return t('game.rulingApprovalModal.advanceTime', {
          hours: a.hours ? t('game.rulingApprovalModal.hoursPart', { hours: a.hours }) : '',
          minutes: a.minutes ? t('game.rulingApprovalModal.minutesPart', { minutes: a.minutes }) : ''
        })
      case 'system_message':
        return t('game.rulingApprovalModal.systemMessage', { message: (a.message as string)?.slice(0, 80) })
      case 'sound_effect':
        return t('game.rulingApprovalModal.soundEffect', { sound: a.sound })
      default:
        return t('game.rulingApprovalModal.defaultAction', {
          action: a.action,
          json: JSON.stringify(a).slice(0, 100)
        })
    }
  })

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/70"
      style={{ zIndex: Z.MODAL }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
      role="presentation"
    >
      <div className="bg-surface border border-amber-500/50 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-amber-600/10">
          <span className="text-accent font-bold text-lg">{t('game.rulingApprovalModal.title')}</span>
          <span className="text-xs text-muted ml-auto">
            {t('game.rulingApprovalModal.actionCount', { count: pendingActions.actions.length })}
          </span>
        </div>

        {/* Action List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-muted mb-2">{t('game.rulingApprovalModal.intro')}</p>

          <div className="space-y-1.5">
            {actionSummaries.map((summary, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-accent mt-0.5 shrink-0">-</span>
                <span className="text-gray-300">{summary}</span>
              </div>
            ))}
          </div>

          {/* DM Note for override */}
          <div className="mt-4">
            <label className="block text-xs text-muted mb-1">{t('game.rulingApprovalModal.dmNoteLabel')}</label>
            <input
              type="text"
              value={dmNote}
              onChange={(e) => setDmNote(e.target.value)}
              placeholder={t('game.rulingApprovalModal.dmNotePlaceholder')}
              className="w-full px-3 py-1.5 bg-surface-2 border border-border rounded text-sm text-gray-300 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={() => {
              dismiss()
              setDmNote('')
            }}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded font-medium"
            title={t('game.rulingApprovalModal.dismissTitle')}
          >
            {t('game.rulingApprovalModal.dismiss')}
          </button>
          <button
            onClick={() => {
              rejectPendingActions(dmNote)
              setDmNote('')
            }}
            className="px-4 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded font-medium"
          >
            {t('game.rulingApprovalModal.override')}
          </button>
          <button
            onClick={() => {
              approvePendingActions()
              setDmNote('')
            }}
            className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded font-medium"
          >
            {t('game.rulingApprovalModal.approve')}
          </button>
        </div>
      </div>
    </div>
  )
}
