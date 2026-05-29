import { useState } from 'react'
import type { MapPin, MapPinIcon } from '../../../../types/map'

/**
 * Phase 16b Step 4 — rich map-pin creation form (replaces the old label-only window.prompt).
 * Collects label, icon, color, and player-visibility; optional journal/NPC/location link IDs.
 */

interface PinCreateModalProps {
  gridX: number
  gridY: number
  onCreate: (pin: MapPin) => void
  onClose: () => void
}

const ICONS: Array<{ id: MapPinIcon; glyph: string; label: string }> = [
  { id: 'note', glyph: '📝', label: 'Note' },
  { id: 'quest', glyph: '!', label: 'Quest' },
  { id: 'shop', glyph: '$', label: 'Shop' },
  { id: 'danger', glyph: '⚠', label: 'Danger' },
  { id: 'npc', glyph: '☻', label: 'NPC' },
  { id: 'custom', glyph: '★', label: 'Custom' }
]

const COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#eab308', '#6b7280']

export default function PinCreateModal({ gridX, gridY, onCreate, onClose }: PinCreateModalProps): JSX.Element {
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState<MapPinIcon>('note')
  const [color, setColor] = useState(COLORS[0])
  const [visibleToPlayers, setVisibleToPlayers] = useState(true)
  const [linkedJournalId, setLinkedJournalId] = useState('')

  const submit = (): void => {
    if (!label.trim()) return
    onCreate({
      id: `pin-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      gridX,
      gridY,
      label: label.trim().slice(0, 64),
      icon,
      color,
      visibleToPlayers,
      ...(linkedJournalId.trim() ? { linkedJournalId: linkedJournalId.trim() } : {})
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 w-[360px] shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">
            Add Pin{' '}
            <span className="text-gray-500 font-normal">
              ({gridX}, {gridY})
            </span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Pin label…"
          autoFocus
          className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500/60"
        />

        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Icon</div>
          <div className="flex gap-1.5 flex-wrap">
            {ICONS.map((i) => (
              <button
                key={i.id}
                onClick={() => setIcon(i.id)}
                title={i.label}
                className={`w-8 h-8 rounded flex items-center justify-center text-sm cursor-pointer transition-colors ${
                  icon === i.id ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {i.glyph}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Color</div>
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                style={{ backgroundColor: c }}
                className={`w-7 h-7 rounded-full cursor-pointer ${color === c ? 'ring-2 ring-white' : ''}`}
              />
            ))}
          </div>
        </div>

        <input
          type="text"
          value={linkedJournalId}
          onChange={(e) => setLinkedJournalId(e.target.value)}
          placeholder="Linked journal entry ID (optional)"
          className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/60"
        />

        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={visibleToPlayers}
            onChange={(e) => setVisibleToPlayers(e.target.checked)}
            className="cursor-pointer"
          />
          Visible to players
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!label.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white cursor-pointer"
          >
            Add Pin
          </button>
        </div>
      </div>
    </div>
  )
}
