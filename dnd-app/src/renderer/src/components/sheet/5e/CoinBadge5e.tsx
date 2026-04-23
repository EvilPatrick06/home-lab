import { useEffect, useRef, useState } from 'react'

const COIN_STYLES: Record<string, string> = {
  PP: 'border-gray-400 bg-gray-500 text-white',
  GP: 'border-yellow-500 bg-yellow-600 text-white',
  EP: 'border-blue-400 bg-blue-500 text-white',
  SP: 'border-gray-300 bg-gray-300 text-gray-800',
  CP: 'border-amber-700 bg-amber-700 text-white'
}

export default function CoinBadge({
  label,
  value,
  readonly,
  onSave
}: {
  label: string
  value: number
  readonly?: boolean
  onSave: (newValue: number) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    if (!editing) setInputValue(String(value))
  }, [value, editing])

  const commitEdit = (): void => {
    setEditing(false)
    const parsed = parseInt(inputValue, 10)
    const clamped = Number.isNaN(parsed) ? value : Math.max(0, parsed)
    if (clamped !== value) onSave(clamped)
  }

  const style = COIN_STYLES[label] || 'border-gray-500 bg-gray-600 text-white'

  if (editing && !readonly) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <input
          ref={inputRef}
          type="number"
          min={0}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-10 h-10 rounded-full bg-gray-800 border-2 border-amber-500 text-center text-sm text-gray-100 focus:outline-none"
        />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col items-center gap-0.5 ${!readonly ? 'cursor-pointer' : ''}`}
      onClick={() => {
        if (!readonly) {
          setInputValue(String(value))
          setEditing(true)
        }
      }}
      title={!readonly ? 'Click to edit' : undefined}
    >
      <div
        className={`w-10 h-10 rounded-full border-2 ${style} flex items-center justify-center text-sm font-bold shadow-sm ${!readonly ? 'hover:opacity-80 transition-opacity' : ''}`}
      >
        {value}
      </div>
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  )
}
