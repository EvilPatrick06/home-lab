import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Z } from '../../constants'
import { useT } from '../../i18n'
import { useOnboardingStore } from '../../stores/use-onboarding-store'

// Global quick-action launcher (Ctrl/Cmd+K). v1 covers top-level navigation plus
// a few global actions; the action list is a simple registry that can be
// extended toward the full set of modals/actions. (suggestions-log 2026-06-22)
interface PaletteAction {
  id: string
  run: () => void
}

export default function CommandPalette(): JSX.Element | null {
  const { t } = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const actions = useMemo<PaletteAction[]>(
    () => [
      { id: 'home', run: () => navigate('/') },
      { id: 'characters', run: () => navigate('/characters') },
      { id: 'createCharacter', run: () => navigate('/characters/5e/create') },
      { id: 'makeCampaign', run: () => navigate('/make') },
      { id: 'joinGame', run: () => navigate('/join') },
      { id: 'library', run: () => navigate('/library') },
      { id: 'bastions', run: () => navigate('/bastions') },
      { id: 'calendar', run: () => navigate('/calendar') },
      { id: 'settings', run: () => navigate('/settings') },
      { id: 'about', run: () => navigate('/about') },
      { id: 'replayTour', run: () => useOnboardingStore.getState().open() },
      { id: 'openLog', run: () => void window.api?.log?.openFolder?.() }
    ],
    [navigate]
  )

  const filtered = useMemo(() => {
    const labelled = actions.map((a) => ({ ...a, label: t(`commandPalette.actions.${a.id}`) }))
    const q = query.trim().toLowerCase()
    return q ? labelled.filter((a) => a.label.toLowerCase().includes(q)) : labelled
  }, [actions, query, t])

  // Cmd/Ctrl+K toggles the palette.
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

  useEffect(() => {
    setSelected(0)
  }, [query])

  const runAt = useCallback(
    (idx: number) => {
      const a = filtered[idx]
      if (!a) return
      setOpen(false)
      a.run()
    },
    [filtered]
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelected((s) => Math.min(filtered.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelected((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              runAt(selected)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
          }}
          placeholder={t('commandPalette.placeholder')}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-fg outline-none"
        />
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && <li className="px-4 py-3 text-sm text-muted">{t('commandPalette.empty')}</li>}
          {filtered.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => runAt(i)}
                onMouseEnter={() => setSelected(i)}
                className={`w-full cursor-pointer px-4 py-2 text-left text-sm ${i === selected ? 'bg-surface-2 text-accent' : 'text-gray-300'}`}
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
