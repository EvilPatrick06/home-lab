import { useState } from 'react'
import { getCommands } from '../../../../services/chat-commands'

interface CommandReferenceModalProps {
  isDM: boolean
  onClose: () => void
}

export default function CommandReferenceModal({ isDM, onClose }: CommandReferenceModalProps): JSX.Element {
  const [search, setSearch] = useState('')
  const allCommands = getCommands(isDM)

  const filtered = search
    ? allCommands.filter(
        (c) =>
          c.name.includes(search.toLowerCase()) ||
          c.description.toLowerCase().includes(search.toLowerCase()) ||
          c.aliases.some((a) => a.includes(search.toLowerCase()))
      )
    : allCommands

  const playerCommands = filtered.filter((c) => c.category === 'player')
  const dmCommands = filtered.filter((c) => c.category === 'dm')
  const aiCommands = filtered.filter((c) => c.category === 'ai')

  const renderSection = (
    title: string,
    cmds: typeof allCommands,
    color: string,
    badgeColor: string
  ): JSX.Element | null => {
    if (cmds.length === 0) return null
    return (
      <div className="mb-4">
        <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${color}`}>{title}</h4>
        <div className="space-y-2">
          {cmds.map((cmd) => (
            <div key={cmd.name} className="bg-gray-800/50 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-semibold text-amber-400">/{cmd.name}</span>
                {cmd.aliases.length > 0 && (
                  <span className="text-[10px] text-gray-500">{cmd.aliases.map((a) => `/${a}`).join(', ')}</span>
                )}
                {cmd.dmOnly && <span className={`text-[9px] px-1 py-0.5 rounded ${badgeColor}`}>DM</span>}
              </div>
              <p className="text-xs text-gray-400 mb-1">{cmd.description}</p>
              <div className="text-[10px] text-gray-500 font-mono">{cmd.usage}</div>
              {(cmd.examples?.length ?? 0) > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {cmd.examples?.map((ex, i) => (
                    <code key={i} className="text-[10px] bg-gray-900/80 px-1.5 py-0.5 rounded text-gray-400">
                      {ex}
                    </code>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-5 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-amber-400">Chat Commands</h3>
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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search commands..."
          className="w-full px-3 py-1.5 mb-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
        />

        <div className="flex-1 overflow-y-auto">
          {renderSection('Player Commands', playerCommands, 'text-green-400', 'bg-green-600/30 text-green-400')}
          {renderSection('DM Commands', dmCommands, 'text-amber-400', 'bg-red-600/30 text-red-400')}
          {renderSection('AI DM Commands', aiCommands, 'text-purple-400', 'bg-purple-600/30 text-purple-400')}
          {filtered.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">No commands found for "{search}"</p>
          )}
        </div>
      </div>
    </div>
  )
}
