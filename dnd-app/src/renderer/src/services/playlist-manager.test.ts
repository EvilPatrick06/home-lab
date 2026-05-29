import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  advance,
  createPlaylist,
  currentTrack,
  loadPlaylists,
  nextIndex,
  type Playlist,
  savePlaylists
} from './playlist-manager'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k)
})

function make(tracks: number, opts: Partial<Playlist> = {}): Playlist {
  return {
    id: 'pl-1',
    name: 'Test',
    tracks: Array.from({ length: tracks }, (_, i) => ({ kind: 'preset' as const, ref: `ambient-${i}` })),
    shuffle: false,
    loopPlaylist: true,
    currentIndex: 0,
    ...opts
  }
}

describe('playlist-manager (Phase 27j)', () => {
  beforeEach(() => store.clear())

  it('createPlaylist seeds sensible defaults', () => {
    const pl = createPlaylist('  My Mix  ')
    expect(pl.name).toBe('My Mix')
    expect(pl.tracks).toEqual([])
    expect(pl.loopPlaylist).toBe(true)
    expect(pl.currentIndex).toBe(0)
  })

  it('advances sequentially and wraps when loop is on', () => {
    let pl = make(3)
    expect(currentTrack(pl)?.ref).toBe('ambient-0')
    ;({ playlist: pl } = advance(pl))
    expect(pl.currentIndex).toBe(1)
    ;({ playlist: pl } = advance(pl))
    expect(pl.currentIndex).toBe(2)
    const res = advance(pl)
    expect(res.playlist.currentIndex).toBe(0) // wrapped
    expect(res.track?.ref).toBe('ambient-0')
  })

  it('stops at the end when loop is off', () => {
    const pl = make(2, { currentIndex: 1, loopPlaylist: false })
    expect(nextIndex(pl)).toBeNull()
    const res = advance(pl)
    expect(res.track).toBeNull()
    expect(res.playlist.currentIndex).toBe(1) // unchanged
  })

  it('shuffle never immediately repeats the current track', () => {
    const pl = make(4, { shuffle: true, currentIndex: 2 })
    for (let i = 0; i < 50; i++) {
      const idx = nextIndex(pl)
      expect(idx).not.toBe(2)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(4)
    }
  })

  it('round-trips through localStorage and drops corrupt entries', () => {
    const pl = make(2)
    savePlaylists('camp1', [pl])
    expect(loadPlaylists('camp1')).toHaveLength(1)

    localStorage.setItem('dnd-vtt-playlists-camp2', 'not json')
    expect(loadPlaylists('camp2')).toEqual([])

    localStorage.setItem('dnd-vtt-playlists-camp3', JSON.stringify([{ bogus: true }]))
    expect(loadPlaylists('camp3')).toEqual([])
  })
})
