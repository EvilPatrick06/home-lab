import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------
const storageMap = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  get length() { return storageMap.size },
  key: vi.fn((i: number) => Array.from(storageMap.keys())[i] ?? null)
})

import {
  cancelPendingDraftSave,
  clearBuilderDraft,
  debouncedSaveBuilderDraft,
  listBuilderDrafts,
  loadBuilderDraft,
  saveBuilderDraft
} from './builder-auto-save'

describe('builder-auto-save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMap.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    cancelPendingDraftSave()
    vi.useRealTimers()
  })

  // ---- saveBuilderDraft / loadBuilderDraft ----------------------------------

  describe('saveBuilderDraft', () => {
    it('persists state under the characterId key', () => {
      const state = { name: 'Gandalf', level: 20 }
      saveBuilderDraft(state, 'char-1')
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'builder-draft-char-1',
        expect.any(String)
      )
    })

    it('uses "new" when characterId is null', () => {
      saveBuilderDraft({ name: 'New' }, null)
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'builder-draft-new',
        expect.any(String)
      )
    })

    it('uses "new" when characterId is undefined', () => {
      saveBuilderDraft({ name: 'New' })
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'builder-draft-new',
        expect.any(String)
      )
    })

    it('includes a savedAt timestamp', () => {
      const before = Date.now()
      saveBuilderDraft({ x: 1 }, 'char-2')
      const after = Date.now()
      const raw = storageMap.get('builder-draft-char-2')!
      const parsed = JSON.parse(raw)
      expect(parsed.savedAt).toBeGreaterThanOrEqual(before)
      expect(parsed.savedAt).toBeLessThanOrEqual(after)
    })

    it('silently ignores localStorage errors', () => {
      vi.mocked(localStorage.setItem).mockImplementationOnce(() => {
        throw new Error('QuotaExceededError')
      })
      expect(() => saveBuilderDraft({ x: 1 }, 'char-err')).not.toThrow()
    })
  })

  describe('loadBuilderDraft', () => {
    it('returns saved state', () => {
      const state = { name: 'Legolas', species: 'Elf' }
      saveBuilderDraft(state, 'char-3')
      const loaded = loadBuilderDraft('char-3')
      expect(loaded).not.toBeNull()
      expect(loaded!.state).toEqual(state)
    })

    it('returns null when no draft exists', () => {
      expect(loadBuilderDraft('char-missing')).toBeNull()
    })

    it('returns null when characterId is undefined and no draft exists', () => {
      expect(loadBuilderDraft()).toBeNull()
    })

    it('returns null on malformed JSON', () => {
      storageMap.set('builder-draft-char-bad', 'not-json{{{')
      expect(loadBuilderDraft('char-bad')).toBeNull()
    })

    it('returns null when savedAt is missing', () => {
      storageMap.set('builder-draft-char-nosave', JSON.stringify({ state: { x: 1 } }))
      expect(loadBuilderDraft('char-nosave')).toBeNull()
    })

    it('round-trip preserves full state', () => {
      const state = { name: 'Aragorn', classes: ['ranger', 'fighter'], level: 20 }
      saveBuilderDraft(state, 'char-rt')
      const loaded = loadBuilderDraft('char-rt')
      expect(loaded!.state).toEqual(state)
    })
  })

  // ---- clearBuilderDraft ---------------------------------------------------

  describe('clearBuilderDraft', () => {
    it('removes the draft from localStorage', () => {
      saveBuilderDraft({ x: 1 }, 'char-5')
      clearBuilderDraft('char-5')
      expect(localStorage.removeItem).toHaveBeenCalledWith('builder-draft-char-5')
      expect(loadBuilderDraft('char-5')).toBeNull()
    })

    it('is a no-op when no draft exists', () => {
      expect(() => clearBuilderDraft('char-ghost')).not.toThrow()
    })

    it('silently ignores localStorage errors', () => {
      vi.mocked(localStorage.removeItem).mockImplementationOnce(() => {
        throw new Error('SecurityError')
      })
      expect(() => clearBuilderDraft('char-5')).not.toThrow()
    })
  })

  // ---- listBuilderDrafts ---------------------------------------------------

  describe('listBuilderDrafts', () => {
    it('returns empty array when no drafts exist', () => {
      expect(listBuilderDrafts()).toEqual([])
    })

    it('returns keys for all draft entries', () => {
      saveBuilderDraft({ a: 1 }, 'char-a')
      saveBuilderDraft({ b: 2 }, 'char-b')
      saveBuilderDraft({ c: 3 }, null)
      const drafts = listBuilderDrafts()
      expect(drafts).toContain('char-a')
      expect(drafts).toContain('char-b')
      expect(drafts).toContain('new')
    })

    it('does not include non-draft keys', () => {
      storageMap.set('unrelated-key', 'value')
      saveBuilderDraft({ x: 1 }, 'char-d')
      const drafts = listBuilderDrafts()
      expect(drafts).not.toContain('unrelated-key')
      expect(drafts).toContain('char-d')
    })
  })

  // ---- debouncedSaveBuilderDraft -------------------------------------------

  describe('debouncedSaveBuilderDraft', () => {
    it('does not save immediately', () => {
      debouncedSaveBuilderDraft({ x: 1 }, 'char-6')
      expect(loadBuilderDraft('char-6')).toBeNull()
    })

    it('saves after the debounce window', () => {
      debouncedSaveBuilderDraft({ x: 1 }, 'char-6')
      vi.advanceTimersByTime(2_000)
      expect(loadBuilderDraft('char-6')).not.toBeNull()
    })

    it('only saves the last call within the debounce window', () => {
      debouncedSaveBuilderDraft({ call: 1 }, 'char-7')
      vi.advanceTimersByTime(500)
      debouncedSaveBuilderDraft({ call: 2 }, 'char-7')
      vi.advanceTimersByTime(500)
      debouncedSaveBuilderDraft({ call: 3 }, 'char-7')
      vi.advanceTimersByTime(2_000)
      const loaded = loadBuilderDraft('char-7')
      expect(loaded!.state).toEqual({ call: 3 })
    })

    it('does not save if cancelPendingDraftSave is called before timeout', () => {
      debouncedSaveBuilderDraft({ x: 1 }, 'char-8')
      cancelPendingDraftSave()
      vi.advanceTimersByTime(2_000)
      expect(loadBuilderDraft('char-8')).toBeNull()
    })
  })

  // ---- cancelPendingDraftSave ----------------------------------------------

  describe('cancelPendingDraftSave', () => {
    it('is a no-op when no pending save exists', () => {
      expect(() => cancelPendingDraftSave()).not.toThrow()
    })
  })
})
