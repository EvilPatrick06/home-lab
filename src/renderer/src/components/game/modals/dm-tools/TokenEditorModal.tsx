import { lazy, Suspense, useEffect, useState } from 'react'
import { loadStatBlockById } from '../../../../services/data-provider'
import { useGameStore } from '../../../../stores/use-game-store'
import type { MapToken } from '../../../../types/map'
import type { MonsterStatBlock } from '../../../../types/monster'
import { monsterToDisplay } from '../../../../utils/stat-block-converter'

const UnifiedStatBlock = lazy(() => import('../../UnifiedStatBlock'))

interface TokenEditorModalProps {
  token: MapToken
  mapId: string
  onClose: () => void
}

const SIZE_OPTIONS: { label: string; sizeX: number; sizeY: number }[] = [
  { label: 'Tiny', sizeX: 1, sizeY: 1 },
  { label: 'Small', sizeX: 1, sizeY: 1 },
  { label: 'Medium', sizeX: 1, sizeY: 1 },
  { label: 'Large', sizeX: 2, sizeY: 2 },
  { label: 'Huge', sizeX: 3, sizeY: 3 },
  { label: 'Gargantuan', sizeX: 4, sizeY: 4 }
]

function getSizeLabel(sizeX: number, sizeY: number): string {
  const match = SIZE_OPTIONS.find((s) => s.sizeX === sizeX && s.sizeY === sizeY)
  if (match) {
    // Tiny, Small, Medium are all 1x1 -- default to Medium for 1x1
    if (sizeX === 1 && sizeY === 1) return 'Medium'
    return match.label
  }
  return 'Medium'
}

export default function TokenEditorModal({ token, mapId, onClose }: TokenEditorModalProps): JSX.Element {
  const updateToken = useGameStore((s) => s.updateToken)

  const [label, setLabel] = useState(token.label)
  const [labelFontSize, setLabelFontSize] = useState(token.labelFontSize ?? 12)
  const [color, setColor] = useState(token.color ?? '#4b5563')
  const [borderColor, setBorderColor] = useState(token.borderColor ?? '#9ca3af')
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dashed' | 'double'>(token.borderStyle ?? 'solid')
  const [sizeLabel, setSizeLabel] = useState(getSizeLabel(token.sizeX, token.sizeY))
  const [linkedMonster, setLinkedMonster] = useState<MonsterStatBlock | null>(null)
  const [showLinkedStatBlock, setShowLinkedStatBlock] = useState(false)
  const [loadingStatBlock, setLoadingStatBlock] = useState(false)

  // Load linked creature stat block if token has monsterStatBlockId
  useEffect(() => {
    if (!token.monsterStatBlockId) return
    setLoadingStatBlock(true)
    void loadStatBlockById(token.monsterStatBlockId).then((monster) => {
      setLinkedMonster(monster ?? null)
      setLoadingStatBlock(false)
    })
  }, [token.monsterStatBlockId])

  const applyUpdate = (updates: Partial<MapToken>): void => {
    updateToken(mapId, token.id, updates)
  }

  const handleLabelChange = (value: string): void => {
    const clamped = value.slice(0, 3)
    setLabel(clamped)
    applyUpdate({ label: clamped })
  }

  const handleLabelFontSizeChange = (value: string): void => {
    const num = Math.min(24, Math.max(8, parseInt(value, 10) || 8))
    setLabelFontSize(num)
    applyUpdate({ labelFontSize: num })
  }

  const handleColorChange = (value: string): void => {
    setColor(value)
    applyUpdate({ color: value })
  }

  const handleBorderColorChange = (value: string): void => {
    setBorderColor(value)
    applyUpdate({ borderColor: value })
  }

  const handleBorderStyleChange = (value: string): void => {
    const style = value as 'solid' | 'dashed' | 'double'
    setBorderStyle(style)
    applyUpdate({ borderStyle: style })
  }

  const handleSizeChange = (value: string): void => {
    setSizeLabel(value)
    const option = SIZE_OPTIONS.find((s) => s.label === value)
    if (option) {
      applyUpdate({ sizeX: option.sizeX, sizeY: option.sizeY })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-96 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">Edit Token</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="space-y-3">
          {/* Label */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Label (1-3 chars)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              maxLength={3}
              className="w-24 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Label Font Size */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Label Font Size</label>
            <input
              type="number"
              min={8}
              max={24}
              value={labelFontSize}
              onChange={(e) => handleLabelFontSizeChange(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Token Color */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Token Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent"
              />
              <span className="text-[10px] text-gray-500 font-mono">{color}</span>
            </div>
          </div>

          {/* Border Color */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Border Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={borderColor}
                onChange={(e) => handleBorderColorChange(e.target.value)}
                className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent"
              />
              <span className="text-[10px] text-gray-500 font-mono">{borderColor}</span>
            </div>
          </div>

          {/* Border Style */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Border Style</label>
            <select
              value={borderStyle}
              onChange={(e) => handleBorderStyleChange(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="double">Double</option>
            </select>
          </div>

          {/* Size Override */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Size Override</label>
            <select
              value={sizeLabel}
              onChange={(e) => handleSizeChange(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
            >
              {SIZE_OPTIONS.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Linked Creature Stat Block */}
        {token.monsterStatBlockId && (
          <div className="mt-4 border-t border-gray-700/50 pt-3">
            <button
              onClick={() => setShowLinkedStatBlock(!showLinkedStatBlock)}
              className="w-full flex items-center justify-between text-xs font-semibold text-gray-300 hover:text-amber-400 transition-colors cursor-pointer"
            >
              <span>View Stat Block</span>
              <span className="text-gray-500 text-[10px]">{showLinkedStatBlock ? '\u25B2' : '\u25BC'}</span>
            </button>
            {showLinkedStatBlock && (
              <div className="mt-2">
                {loadingStatBlock && <p className="text-[10px] text-gray-500">Loading stat block...</p>}
                {!loadingStatBlock && linkedMonster && (
                  <Suspense fallback={<div className="text-[10px] text-gray-500">Loading...</div>}>
                    <UnifiedStatBlock statBlock={monsterToDisplay(linkedMonster)} />
                  </Suspense>
                )}
                {!loadingStatBlock && !linkedMonster && (
                  <p className="text-[10px] text-gray-500">Creature not found: {token.monsterStatBlockId}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Close button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
