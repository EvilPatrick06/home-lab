import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Z } from '../../constants'
import { useT } from '../../i18n'
import { searchAllCategories } from '../../services/library-service'
import { useLibraryStore } from '../../stores/use-library-store'
import { useOnboardingStore } from '../../stores/use-onboarding-store'
import type { LibraryItem } from '../../types/library'

// Global quick-action launcher (Ctrl/Cmd+K). Covers top-level navigation plus a
// few global actions AND fuzzy content search: type a spell/monster/item/
// character/campaign name and jump straight to it in the Library (deep-linked
// via ?entry=<id>&category=<cat>). The route actions are a simple registry;
// content results are fed from library-service.searchAllCategories (the same
// fuse index the Library page uses). (suggestions-log 2026-06-22 / 2026-06-29)
interface PaletteAction {
  id: string
  run: () => void
}

interface PaletteRow {
  key: string
  label: string
  /** Sublabel shown on the right (e.g. content category). */
  hint?: string
  run: () => void
}

// Debounce the content search so we don't kick off a full multi-category load
// on every keystroke.
const CONTENT_SEARCH_DEBOUNCE_MS = 180
const MAX_CONTENT_RESULTS = 8

export default function CommandPalette(): JSX.Element | null {
  const { t } = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [contentResults, setContentResults] = useState<LibraryItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const homebrewEntries = useLibraryStore((s) => s.homebrewEntries)
  const loadHomebrew = useLibraryStore((s) => s.loadHomebrew)
  const homebrewLoaded = useLibraryStore((s) => s.homebrewLoaded)

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

  const openLibraryEntry = useCallback(
    (item: LibraryItem) => {
      const params = new URLSearchParams({
        entry: item.id,
        category: item.category,
        from: location.pathname
      })
      navigate(`/library?${params.toString()}`)
    },
    [navigate, location.pathname]
  )

  // Cmd/Ctrl+K toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        // In a game session the in-game GameCommandPalette owns Ctrl/Cmd+K.
        if (location.pathname.startsWith('/game/')) return
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [location.pathname])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setContentResults([])
      requestAnimationFrame(() => inputRef.current?.focus())
      // Lazily load homebrew once so content search covers the user's own entries.
      if (!homebrewLoaded) void loadHomebrew()
    }
  }, [open, homebrewLoaded, loadHomebrew])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset the highlight to the top whenever the query changes
  useEffect(() => {
    setSelected(0)
  }, [query])

  // Debounced content search (spells / monsters / items / characters / campaigns).
  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) {
      setContentResults([])
      return
    }
    let cancelled = false
    const handle = setTimeout(() => {
      void searchAllCategories(q, homebrewEntries)
        .then((items) => {
          if (!cancelled) setContentResults(items.slice(0, MAX_CONTENT_RESULTS))
        })
        .catch(() => {
          if (!cancelled) setContentResults([])
        })
    }, CONTENT_SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, open, homebrewEntries])

  const rows = useMemo<PaletteRow[]>(() => {
    const q = query.trim().toLowerCase()
    const actionRows: PaletteRow[] = actions
      .map((a) => ({ key: `action:${a.id}`, label: t(`commandPalette.actions.${a.id}`), run: a.run }))
      .filter((r) => (q ? r.label.toLowerCase().includes(q) : true))

    const contentRows: PaletteRow[] = contentResults.map((item) => ({
      key: `content:${item.category}:${item.id}`,
      label: item.name,
      hint: t(`commandPalette.categories.${item.category}`, { defaultValue: item.category.replace(/-/g, ' ') }),
      run: () => openLibraryEntry(item)
    }))

    return [...actionRows, ...contentRows]
  }, [actions, query, t, contentResults, openLibraryEntry])

  const runAt = useCallback(
    (idx: number) => {
      const r = rows[idx]
      if (!r) return
      setOpen(false)
      r.run()
    },
    [rows]
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
              setSelected((s) => Math.min(rows.length - 1, s + 1))
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
          {rows.length === 0 && <li className="px-4 py-3 text-sm text-muted">{t('commandPalette.empty')}</li>}
          {rows.map((r, i) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => runAt(i)}
                onMouseEnter={() => setSelected(i)}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2 text-start text-sm ${i === selected ? 'bg-surface-2 text-accent' : 'text-gray-300'}`}
              >
                <span className="truncate">{r.label}</span>
                {r.hint && <span className="shrink-0 text-[11px] uppercase tracking-wide text-gray-500">{r.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[11px] text-gray-500">{t('commandPalette.hint')}</p>
      </div>
    </div>
  )
}
