import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Z } from '../../constants'
import { useT } from '../../i18n'
import type { ActiveModal } from './active-modal-types'

// In-game quick-action launcher (Ctrl/Cmd+K) covering the game-board modals.
// Labels come from i18n (gameCommandPalette.actions.<id>); dmOnly entries are
// hidden from players. (suggestions-log 2026-06-22 — command palette, in-game half.)
const ACTIONS: Array<{ id: Exclude<ActiveModal, null>; dmOnly?: boolean }> = [
  { id: 'action' },
  { id: 'item' },
  { id: 'hiddenDice' },
  { id: 'whisper' },
  { id: 'quickCondition' },
  { id: 'timer' },
  { id: 'initiative' },
  { id: 'notes' },
  { id: 'attack' },
  { id: 'help' },
  { id: 'jump' },
  { id: 'falling' },
  { id: 'influence' },
  { id: 'aoe' },
  { id: 'travelPace' },
  { id: 'mount' },
  { id: 'creatures' },
  { id: 'familiar' },
  { id: 'wildShape' },
  { id: 'steed' },
  { id: 'summonCreature' },
  { id: 'timeEdit', dmOnly: true },
  { id: 'lightSource' },
  { id: 'shortRest' },
  { id: 'longRest' },
  { id: 'dmRoller', dmOnly: true },
  { id: 'commandRef' },
  { id: 'customEffect', dmOnly: true },
  { id: 'encounterBuilder', dmOnly: true },
  { id: 'treasureGenerator', dmOnly: true },
  { id: 'chaseTracker', dmOnly: true },
  { id: 'mobCalculator', dmOnly: true },
  { id: 'groupRoll', dmOnly: true },
  { id: 'study' },
  { id: 'shortcutRef' },
  { id: 'dispute' },
  { id: 'downtime', dmOnly: true },
  { id: 'shop', dmOnly: true },
  { id: 'spellRef' },
  { id: 'calendar' },
  { id: 'gridSettings', dmOnly: true },
  { id: 'tokenEditor', dmOnly: true },
  { id: 'handout', dmOnly: true },
  { id: 'handoutViewer' },
  { id: 'npcGenerator', dmOnly: true },
  { id: 'magic-item-tracker', dmOnly: true },
  { id: 'themeSelector' },
  { id: 'sentientItem', dmOnly: true },
  { id: 'itemTrade' },
  { id: 'sharedJournal' },
  { id: 'compendium' },
  { id: 'dm-screen', dmOnly: true },
  { id: 'roll-table', dmOnly: true },
  { id: 'diceRoller' },
  { id: 'partyInventory' },
  { id: 'triggerManager', dmOnly: true },
  { id: 'aiMapAnalysis', dmOnly: true },
  { id: 'aiImage', dmOnly: true },
  { id: 'generateBattlemap', dmOnly: true },
  { id: 'sceneMode', dmOnly: true },
  { id: 'recaps', dmOnly: true },
  { id: 'previouslyOn', dmOnly: true },
  { id: 'campaignQa', dmOnly: true },
  { id: 'playerNotes' },
  { id: 'spellPrep' }
]

interface GameCommandPaletteProps {
  onOpenModal: (modal: ActiveModal) => void
  isDM: boolean
}

export default function GameCommandPalette({ onOpenModal, isDM }: GameCommandPaletteProps): JSX.Element | null {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => {
    const visible = ACTIONS.filter((a) => isDM || !a.dmOnly).map((a) => ({
      id: a.id,
      label: t(`gameCommandPalette.actions.${a.id}`)
    }))
    const q = query.trim().toLowerCase()
    return q ? visible.filter((a) => a.label.toLowerCase().includes(q)) : visible
  }, [isDM, query, t])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset the highlight to the top whenever the query changes
  useEffect(() => {
    setSelected(0)
  }, [query])

  const run = useCallback(
    (idx: number) => {
      const a = items[idx]
      if (!a) return
      setOpen(false)
      onOpenModal(a.id)
    },
    [items, onOpenModal]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
      style={{ zIndex: Z.MODAL }}
      role="dialog"
      aria-modal="true"
      aria-label={t('commandPalette.placeholder')}
      onClick={() => setOpen(false)}
    >
      <div
        className="mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          name="command-palette-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelected((s) => Math.min(items.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelected((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(selected)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
          }}
          placeholder={t('commandPalette.placeholder')}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-fg outline-none"
        />
        <ul className="max-h-72 overflow-y-auto py-1">
          {items.length === 0 && <li className="px-4 py-3 text-sm text-muted">{t('commandPalette.empty')}</li>}
          {items.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => run(i)}
                onMouseEnter={() => setSelected(i)}
                className={`w-full cursor-pointer px-4 py-2 text-start text-sm ${i === selected ? 'bg-surface-2 text-accent' : 'text-gray-300'}`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[11px] text-gray-500">{t('commandPalette.hint')}</p>
      </div>
    </div>
  )
}
