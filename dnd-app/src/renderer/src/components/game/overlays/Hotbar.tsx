import { useCallback, useEffect, useRef, useState } from 'react'
import type { Macro } from '../../../stores/use-macro-store'
import { useMacroStore } from '../../../stores/use-macro-store'

interface HotbarProps {
  characterId: string | null
  onExecuteMacro: (macro: Macro) => void
}

/** Check if keyboard focus is on an editable element */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.isContentEditable) return true
  return false
}

const SLOT_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

const ICON_PRESETS = ['⚔️', '🛡️', '🏹', '🔥', '❄️', '⚡', '💀', '✨', '🎯', '💊', '🗡️', '🪄']
const COLOR_PRESETS = [
  { label: 'Red', value: 'bg-red-900/40' },
  { label: 'Orange', value: 'bg-orange-900/40' },
  { label: 'Amber', value: 'bg-amber-900/40' },
  { label: 'Green', value: 'bg-green-900/40' },
  { label: 'Blue', value: 'bg-blue-900/40' },
  { label: 'Purple', value: 'bg-purple-900/40' },
  { label: 'Gray', value: 'bg-gray-800/60' }
]

interface SlotEditorProps {
  slotIndex: number
  macro: Macro | null
  position: { x: number; y: number }
  onClose: () => void
  onSave: (slotIndex: number, macro: Macro) => void
  onRemove: (slotIndex: number) => void
  onPickFromLibrary: (slotIndex: number) => void
}

function SlotEditor({
  slotIndex,
  macro,
  position,
  onClose,
  onSave,
  onRemove,
  onPickFromLibrary
}: SlotEditorProps): JSX.Element {
  const [name, setName] = useState(macro?.name ?? '')
  const [command, setCommand] = useState(macro?.command ?? '')
  const [icon, setIcon] = useState(macro?.icon ?? '')
  const [color, setColor] = useState(macro?.color ?? 'bg-gray-800/60')
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleSave = (): void => {
    if (!name.trim() || !command.trim()) return
    const id = macro?.id ?? `macro-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`
    onSave(slotIndex, {
      id,
      name: name.trim(),
      command: command.trim(),
      icon: icon || undefined,
      color: color || undefined
    })
  }

  // Position the popover above the slot, clamped to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(position.x - 140, window.innerWidth - 296)),
    bottom: window.innerHeight - position.y + 8
  }

  return (
    <div
      ref={popoverRef}
      style={style}
      className="w-72 bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-3 shadow-2xl z-50"
    >
      <div className="text-[11px] font-semibold text-amber-400 mb-2">
        {macro ? 'Edit Macro' : 'New Macro'} — Slot {SLOT_LABELS[slotIndex]}
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Macro name"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
        />
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="/roll 1d20+$mod.str or 2d6+3"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono"
        />

        {/* Icon picker */}
        <div>
          <div className="text-[10px] text-gray-500 mb-1">Icon</div>
          <div className="flex flex-wrap gap-1">
            {ICON_PRESETS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setIcon(icon === emoji ? '' : emoji)}
                className={`w-6 h-6 text-sm rounded cursor-pointer transition-colors ${icon === emoji ? 'bg-amber-600/50 ring-1 ring-amber-500' : 'bg-gray-800 hover:bg-gray-700'}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <div className="text-[10px] text-gray-500 mb-1">Color</div>
          <div className="flex gap-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={`w-6 h-6 rounded cursor-pointer transition-all ${c.value} ${color === c.value ? 'ring-1 ring-amber-500 scale-110' : 'hover:scale-105'}`}
                title={c.label}
              />
            ))}
          </div>
        </div>

        {/* Variables reference */}
        <div className="text-[9px] text-gray-600 leading-tight">
          Variables: $mod.str/dex/con/int/wis/cha, $prof, $level, $self, $target
        </div>
      </div>

      <div className="flex gap-1.5 mt-3">
        <button
          onClick={handleSave}
          disabled={!name.trim() || !command.trim()}
          className="flex-1 px-2 py-1 text-[10px] font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
        {macro && (
          <button
            onClick={() => onRemove(slotIndex)}
            className="px-2 py-1 text-[10px] font-semibold bg-red-900/50 hover:bg-red-800/60 text-red-300 rounded cursor-pointer"
          >
            Remove
          </button>
        )}
        <button
          onClick={() => onPickFromLibrary(slotIndex)}
          className="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-200 border border-gray-700/50 rounded cursor-pointer"
        >
          Library
        </button>
        <button onClick={onClose} className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  )
}

interface LibraryPickerProps {
  macros: Macro[]
  position: { x: number; y: number }
  onPick: (macro: Macro) => void
  onClose: () => void
}

function LibraryPicker({ macros, position, onPick, onClose }: LibraryPickerProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(position.x - 100, window.innerWidth - 216)),
    bottom: window.innerHeight - position.y + 8
  }

  return (
    <div
      ref={ref}
      style={style}
      className="w-52 max-h-64 overflow-y-auto bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-2 shadow-2xl z-50"
    >
      <div className="text-[11px] font-semibold text-amber-400 mb-1.5">Macro Library</div>
      {macros.length === 0 ? (
        <div className="text-[10px] text-gray-500 italic py-2">No saved macros</div>
      ) : (
        macros.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m)}
            className={`w-full text-left px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-gray-800 flex items-center gap-2 ${m.color ?? ''}`}
          >
            {m.icon && <span className="text-sm">{m.icon}</span>}
            <div className="min-w-0">
              <div className="text-gray-200 truncate">{m.name}</div>
              <div className="text-[9px] text-gray-500 truncate font-mono">{m.command}</div>
            </div>
          </button>
        ))
      )}
      <button
        onClick={onClose}
        className="w-full mt-1 px-2 py-1 text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer"
      >
        Close
      </button>
    </div>
  )
}

export default function Hotbar({ characterId, onExecuteMacro }: HotbarProps): JSX.Element {
  const hotbar = useMacroStore((s) => s.hotbar)
  const macros = useMacroStore((s) => s.macros)
  const { setHotbarSlot, clearHotbarSlot, swapHotbarSlots } = useMacroStore()

  const [editingSlot, setEditingSlot] = useState<{ index: number; position: { x: number; y: number } } | null>(null)
  const [librarySlot, setLibrarySlot] = useState<{ index: number; position: { x: number; y: number } } | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  // Keyboard shortcuts: 1-9 → slots 0-8, 0 → slot 9
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return

      let slotIndex: number | null = null
      if (e.key >= '1' && e.key <= '9') {
        slotIndex = parseInt(e.key, 10) - 1 // '1' → 0, '9' → 8
      } else if (e.key === '0') {
        slotIndex = 9
      }

      if (slotIndex !== null) {
        const macro = hotbar[slotIndex]
        if (macro) {
          e.preventDefault()
          e.stopPropagation()
          onExecuteMacro(macro)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [hotbar, onExecuteMacro])

  const handleSlotClick = useCallback(
    (index: number) => {
      const macro = hotbar[index]
      if (macro) onExecuteMacro(macro)
    },
    [hotbar, onExecuteMacro]
  )

  const handleSlotContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    setEditingSlot({ index, position: { x: e.clientX, y: e.clientY } })
    setLibrarySlot(null)
  }, [])

  const handleEmptySlotClick = useCallback((e: React.MouseEvent, index: number) => {
    setEditingSlot({ index, position: { x: e.clientX, y: e.clientY } })
    setLibrarySlot(null)
  }, [])

  const handleSave = useCallback(
    (slotIndex: number, macro: Macro) => {
      useMacroStore.getState().addMacro(macro)
      setHotbarSlot(slotIndex, macro)
      setEditingSlot(null)
    },
    [setHotbarSlot]
  )

  const handleRemove = useCallback(
    (slotIndex: number) => {
      clearHotbarSlot(slotIndex)
      setEditingSlot(null)
    },
    [clearHotbarSlot]
  )

  const handlePickFromLibrary = useCallback(
    (slotIndex: number) => {
      setEditingSlot(null)
      setLibrarySlot({
        index: slotIndex,
        position: editingSlot?.position ?? { x: window.innerWidth / 2, y: window.innerHeight - 100 }
      })
    },
    [editingSlot]
  )

  const handleLibraryPick = useCallback(
    (macro: Macro) => {
      if (librarySlot) {
        setHotbarSlot(librarySlot.index, macro)
        setLibrarySlot(null)
      }
    },
    [librarySlot, setHotbarSlot]
  )

  // Drag-and-drop between slots
  const handleDragStart = useCallback((index: number) => {
    setDragFrom(index)
  }, [])

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragFrom !== null && dragFrom !== toIndex) {
        swapHotbarSlots(dragFrom, toIndex)
      }
      setDragFrom(null)
    },
    [dragFrom, swapHotbarSlots]
  )

  if (!characterId) return <div />

  return (
    <>
      <div
        role="toolbar"
        aria-label="Quick action hotbar"
        className="flex items-center gap-1 px-2 py-1 bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl"
      >
        {hotbar.map((slot, index) => (
          <div
            key={index}
            draggable={!!slot}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            onClick={slot ? () => handleSlotClick(index) : (e) => handleEmptySlotClick(e, index)}
            onContextMenu={(e) => handleSlotContextMenu(e, index)}
            className={`relative w-10 h-10 rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-all select-none
              ${
                slot
                  ? `${slot.color ?? 'bg-gray-800/60'} border-gray-600/50 hover:border-amber-500/50 hover:scale-105 active:scale-95`
                  : 'bg-gray-800/30 border-gray-700/30 border-dashed hover:border-gray-600/50 hover:bg-gray-800/50'
              }
              ${dragFrom === index ? 'opacity-40' : ''}
            `}
            title={
              slot
                ? `${slot.name}\n${slot.command}\n\nClick to execute · Right-click to edit`
                : `Slot ${SLOT_LABELS[index]} (empty)\nClick or right-click to assign`
            }
            aria-label={
              slot ? `Hotbar slot ${SLOT_LABELS[index]}: ${slot.name}` : `Hotbar slot ${SLOT_LABELS[index]}: empty`
            }
          >
            {slot ? (
              <>
                {slot.icon ? (
                  <span className="text-sm leading-none">{slot.icon}</span>
                ) : (
                  <span className="text-[9px] font-medium text-gray-300 truncate max-w-[34px] leading-tight text-center">
                    {slot.name}
                  </span>
                )}
              </>
            ) : (
              <span className="text-[10px] font-mono text-gray-600">{SLOT_LABELS[index]}</span>
            )}
            {/* Slot number badge */}
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 text-[8px] font-bold rounded-full bg-gray-900 border border-gray-700 text-gray-500 flex items-center justify-center">
              {SLOT_LABELS[index]}
            </span>
          </div>
        ))}
      </div>

      {/* Inline editor popover */}
      {editingSlot && (
        <SlotEditor
          slotIndex={editingSlot.index}
          macro={hotbar[editingSlot.index]}
          position={editingSlot.position}
          onClose={() => setEditingSlot(null)}
          onSave={handleSave}
          onRemove={handleRemove}
          onPickFromLibrary={handlePickFromLibrary}
        />
      )}

      {/* Library picker popover */}
      {librarySlot && (
        <LibraryPicker
          macros={macros}
          position={librarySlot.position}
          onPick={handleLibraryPick}
          onClose={() => setLibrarySlot(null)}
        />
      )}
    </>
  )
}
