import { beforeEach, describe, expect, it, vi } from 'vitest'

// The game store's slices touch `window.api` at import time in some paths;
// stub a minimal shape (same approach as the slice unit tests) so importing the
// store under the node test environment doesn't throw.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { useGameStore } from '../../../stores/use-game-store'
import type { SharedJournalEntry } from '../../../types/game-state'
import { applyDelta } from '../diff'
import { findShard } from '../registry'
import { sharedJournalShard } from './shared-journal-shard'

function makeEntry(id: string, title: string, visibility: 'public' | 'private' = 'public'): SharedJournalEntry {
  return {
    id,
    title,
    content: `content for ${title}`,
    authorPeerId: 'p1',
    authorName: 'Alice',
    visibility,
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('shared-journal-shard (Phase 31k)', () => {
  beforeEach(() => {
    useGameStore.setState({ sharedJournal: [] })
  })

  it('registers itself under the name "sharedJournal"', () => {
    expect(sharedJournalShard.name).toBe('sharedJournal')
    expect(findShard('sharedJournal')).toBe(sharedJournalShard)
  })

  it('is UNFILTERED (declares no permissionFilter)', () => {
    expect(sharedJournalShard.permissionFilter).toBeUndefined()
  })

  it('read() returns the live store sharedJournal array', () => {
    const entries = [makeEntry('j1', 'Session 1')]
    useGameStore.setState({ sharedJournal: entries })
    expect(sharedJournalShard.read()).toBe(entries)
  })

  it('diff() returns null when the array is structurally unchanged', () => {
    const prev = [makeEntry('j1', 'Session 1')]
    const next = [makeEntry('j1', 'Session 1')]
    expect(sharedJournalShard.diff(prev, next)).toBeNull()
  })

  it('round-trips an add: applyDelta(read, diff(prev, next)) deep-equals next', () => {
    const prev: SharedJournalEntry[] = []
    const next = [makeEntry('j1', 'Intro'), makeEntry('j2', 'The Dungeon', 'private')]
    const delta = sharedJournalShard.diff(prev, next)
    expect(delta).not.toBeNull()
    if (!delta) return
    expect(applyDelta(prev, delta)).toEqual(next)
  })

  it('round-trips an update + a removal against the real store via applyDelta', () => {
    const initial = [makeEntry('j1', 'Session 1'), makeEntry('j2', 'Session 2')]
    useGameStore.setState({ sharedJournal: initial })

    // j1 gets a new title (edited), j2 is deleted.
    const next: SharedJournalEntry[] = [{ ...makeEntry('j1', 'Session 1 — Revised'), updatedAt: 2000 }]
    const delta = sharedJournalShard.diff(sharedJournalShard.read(), next)
    expect(delta).not.toBeNull()
    if (!delta) return

    sharedJournalShard.applyDelta(delta)
    expect(useGameStore.getState().sharedJournal).toEqual(next)
  })

  it('onChange fires only when the sharedJournal reference changes', () => {
    const cb = vi.fn()
    const off = sharedJournalShard.onChange(cb)

    // Mutating an unrelated slice must not fire the journal callback.
    useGameStore.setState({ round: 5 })
    expect(cb).not.toHaveBeenCalled()

    const next = [makeEntry('j1', 'New entry')]
    useGameStore.setState({ sharedJournal: next })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(next)

    off()
    useGameStore.setState({ sharedJournal: [makeEntry('j2', 'After unsubscribe')] })
    expect(cb).toHaveBeenCalledTimes(1) // unsubscribed → no further calls
  })
})
