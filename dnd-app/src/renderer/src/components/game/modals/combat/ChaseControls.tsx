import { useState } from 'react'

export interface Participant {
  id: string
  name: string
  position: number
  speed: number
  dashesUsed: number
  conModifier: number
  isQuarry: boolean
}

interface ChaseControlsProps {
  participants: Participant[]
  activeIndex: number
  chaseEnded: boolean
  getFreeDashes: (conMod: number) => number
  onMove: (id: string) => void
  onDash: (id: string) => void
  onUpdateSpeed: (id: string, speed: number) => void
  onUpdateConModifier: (id: string, conMod: number) => void
  onRemove: (id: string) => void
  onAddParticipant: (name: string, conMod: number, isQuarry: boolean) => void
}

export default function ChaseControls({
  participants,
  activeIndex,
  chaseEnded,
  getFreeDashes,
  onMove,
  onDash,
  onUpdateSpeed,
  onUpdateConModifier,
  onRemove,
  onAddParticipant
}: ChaseControlsProps): JSX.Element {
  const [newName, setNewName] = useState('')
  const [newIsQuarry, setNewIsQuarry] = useState(false)
  const [newConMod, setNewConMod] = useState(1)

  const handleAdd = (): void => {
    if (!newName.trim()) return
    onAddParticipant(newName.trim(), newConMod, newIsQuarry)
    setNewName('')
    setNewIsQuarry(false)
    setNewConMod(1)
  }

  return (
    <>
      {/* Participant List */}
      <div className="space-y-2">
        <label className="block text-xs text-gray-400">Participants</label>
        {participants.map((p, idx) => (
          <div
            key={p.id}
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              idx === activeIndex && !chaseEnded ? 'bg-gray-800 border-amber-600' : 'bg-gray-800/50 border-gray-700'
            }`}
          >
            {/* Active indicator */}
            <div className="w-2">
              {idx === activeIndex && !chaseEnded && <div className="w-2 h-2 rounded-full bg-amber-400" />}
            </div>

            {/* Name & role */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-white truncate">{p.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    p.isQuarry ? 'bg-red-900/50 text-red-400' : 'bg-blue-900/50 text-blue-400'
                  }`}
                >
                  {p.isQuarry ? 'Quarry' : 'Pursuer'}
                </span>
              </div>
            </div>

            {/* Zone */}
            <div className="text-xs text-gray-400">
              Zone <span className="text-white font-medium">{p.position}</span>
            </div>

            {/* Speed */}
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-gray-500">Spd:</label>
              <input
                type="number"
                value={p.speed}
                onChange={(e) => onUpdateSpeed(p.id, Number(e.target.value))}
                className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-white text-center"
                step={5}
              />
            </div>

            {/* CON Mod */}
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-gray-500">CON:</label>
              <input
                type="number"
                value={p.conModifier}
                onChange={(e) => onUpdateConModifier(p.id, Number(e.target.value))}
                className="w-10 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-white text-center"
              />
            </div>

            {/* Dashes */}
            <div className="text-[10px] text-gray-500">
              Dashes:{' '}
              <span className={p.dashesUsed > getFreeDashes(p.conModifier) ? 'text-red-400' : 'text-amber-400'}>
                {p.dashesUsed}
              </span>
              <span className="text-gray-600">/{getFreeDashes(p.conModifier)}</span>
            </div>

            {/* Actions */}
            {idx === activeIndex && !chaseEnded && (
              <div className="flex gap-1">
                <button
                  onClick={() => onMove(p.id)}
                  className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded"
                >
                  Move
                </button>
                <button
                  onClick={() => onDash(p.id)}
                  className="px-2 py-1 bg-orange-700 hover:bg-orange-600 text-white text-xs rounded"
                >
                  Dash
                </button>
              </div>
            )}

            {/* Remove */}
            <button onClick={() => onRemove(p.id)} className="text-red-500 hover:text-red-400 text-xs px-1">
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Add Participant */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Participant name..."
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
        />
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-gray-500">CON:</label>
          <input
            type="number"
            value={newConMod}
            onChange={(e) => setNewConMod(Number(e.target.value))}
            className="w-10 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-white text-center"
          />
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={newIsQuarry}
            onChange={(e) => setNewIsQuarry(e.target.checked)}
            className="rounded"
          />
          Quarry
        </label>
        <button onClick={handleAdd} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded">
          Add
        </button>
      </div>
    </>
  )
}
