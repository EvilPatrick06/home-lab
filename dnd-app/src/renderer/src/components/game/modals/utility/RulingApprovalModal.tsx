import { useState } from 'react'
import { useAiDmStore } from '../../../../stores/use-ai-dm-store'

/**
 * RulingApprovalModal — shown when DM approval is required for AI DM actions.
 * Displays the pending actions and lets the DM approve or override them.
 */
export default function RulingApprovalModal(): JSX.Element | null {
  const pendingActions = useAiDmStore((s) => s.pendingActions)
  const approvePendingActions = useAiDmStore((s) => s.approvePendingActions)
  const rejectPendingActions = useAiDmStore((s) => s.rejectPendingActions)
  const [dmNote, setDmNote] = useState('')

  if (!pendingActions) return null

  const actionSummaries = pendingActions.actions.map((a) => {
    switch (a.action) {
      case 'update_token':
        return `Update ${a.label}: ${a.hp !== undefined ? `HP -> ${a.hp}` : ''}${a.ac !== undefined ? ` AC -> ${a.ac}` : ''}${a.conditions ? ` Conditions: ${(a.conditions as string[]).join(', ')}` : ''}`
      case 'place_token':
      case 'place_creature':
        return `Place ${a.label || a.creatureName} at (${a.gridX}, ${a.gridY})`
      case 'move_token':
        return `Move ${a.label} to (${a.gridX}, ${a.gridY})`
      case 'remove_token':
        return `Remove ${a.label}`
      case 'add_entity_condition':
        return `Add ${a.condition} to ${a.entityLabel}`
      case 'remove_entity_condition':
        return `Remove ${a.condition} from ${a.entityLabel}`
      case 'start_initiative':
        return `Start initiative combat`
      case 'next_turn':
        return `Advance to next turn`
      case 'end_initiative':
        return `End initiative combat`
      case 'set_ambient_light':
        return `Set lighting to ${a.level}`
      case 'advance_time':
        return `Advance time${a.hours ? ` ${a.hours}h` : ''}${a.minutes ? ` ${a.minutes}m` : ''}`
      case 'system_message':
        return `System message: "${(a.message as string)?.slice(0, 80)}..."`
      case 'sound_effect':
        return `Play sound: ${a.sound}`
      default:
        return `${a.action}: ${JSON.stringify(a).slice(0, 100)}`
    }
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-amber-500/50 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-700 bg-amber-600/10">
          <span className="text-amber-400 font-bold text-lg">AI DM Ruling</span>
          <span className="text-xs text-gray-400 ml-auto">{pendingActions.actions.length} action(s)</span>
        </div>

        {/* Action List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-gray-400 mb-2">
            The AI DM wants to execute the following actions. Review and approve or override:
          </p>

          <div className="space-y-1.5">
            {actionSummaries.map((summary, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-400 mt-0.5 shrink-0">-</span>
                <span className="text-gray-300">{summary}</span>
              </div>
            ))}
          </div>

          {/* DM Note for override */}
          <div className="mt-4">
            <label className="block text-xs text-gray-400 mb-1">DM Note (optional, for override)</label>
            <input
              type="text"
              value={dmNote}
              onChange={(e) => setDmNote(e.target.value)}
              placeholder="Reason for override..."
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button
            onClick={() => {
              rejectPendingActions(dmNote)
              setDmNote('')
            }}
            className="px-4 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded font-medium"
          >
            Override
          </button>
          <button
            onClick={() => {
              approvePendingActions()
              setDmNote('')
            }}
            className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded font-medium"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
