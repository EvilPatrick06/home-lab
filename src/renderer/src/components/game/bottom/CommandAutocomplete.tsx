import { useEffect, useState } from 'react'
import { type ChatCommand, type CommandResult, getFilteredCommands } from '../../../services/chat-commands'

// Ensure imported types are used for type-safety
type _ChatCommand = ChatCommand
type _CommandResult = CommandResult

interface CommandAutocompleteProps {
  input: string
  isDM: boolean
  onSelect: (command: string) => void
  visible: boolean
}

export default function CommandAutocomplete({
  input,
  isDM,
  onSelect,
  visible
}: CommandAutocompleteProps): JSX.Element | null {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const search = input.startsWith('/') ? input.slice(1) : ''
  const filtered = visible && search.length >= 0 ? getFilteredCommands(search, isDM) : []

  useEffect(() => {
    setSelectedIndex(0)
  }, [])

  useEffect(() => {
    if (!visible || filtered.length === 0) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Tab' || (e.key === 'Enter' && filtered.length > 0 && !input.includes(' '))) {
        e.preventDefault()
        const cmd = filtered[selectedIndex]
        if (cmd) onSelect(`/${cmd.name} `)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, filtered, selectedIndex, onSelect, input])

  if (!visible || filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-lg shadow-xl max-h-48 overflow-y-auto z-20">
      {filtered.slice(0, 10).map((cmd, i) => (
        <button
          key={cmd.name}
          onClick={() => onSelect(`/${cmd.name} `)}
          className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs cursor-pointer transition-colors ${
            i === selectedIndex ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:bg-gray-800/50'
          }`}
        >
          <span className="font-mono text-amber-400 font-semibold">/{cmd.name}</span>
          {cmd.aliases.length > 0 && (
            <span className="text-gray-600 text-[10px]">({cmd.aliases.map((a) => `/${a}`).join(', ')})</span>
          )}
          <span className="text-gray-500 flex-1 truncate">{cmd.description}</span>
          {cmd.dmOnly && <span className="text-[9px] bg-red-600/30 text-red-400 px-1 py-0.5 rounded shrink-0">DM</span>}
        </button>
      ))}
    </div>
  )
}
