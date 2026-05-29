import { cryptoRandom } from '../utils/crypto-random'
import { logger } from '../utils/logger'

/**
 * Phase 27j — ambient playlist system.
 *
 * Pure data layer: a playlist is an ordered list of tracks (preset ambients or
 * uploaded custom files) with shuffle / loop flags and a cursor. Persistence is
 * per-campaign in localStorage. Playback wiring (advancing on track end,
 * broadcasting to clients) lives in the DM audio panel; this module only owns
 * the list + cursor logic so it can be unit-tested without audio.
 */

export interface PlaylistTrack {
  kind: 'preset' | 'custom'
  /** Preset ambient id (e.g. "ambient-forest") or custom file name. */
  ref: string
}

export interface Playlist {
  id: string
  name: string
  tracks: PlaylistTrack[]
  shuffle: boolean
  loopPlaylist: boolean
  currentIndex: number
}

const STORAGE_PREFIX = 'dnd-vtt-playlists-'

function storageKey(campaignId: string): string {
  return `${STORAGE_PREFIX}${campaignId}`
}

/** Load all playlists for a campaign. Tolerates missing/corrupt data. */
export function loadPlaylists(campaignId: string): Playlist[] {
  try {
    const raw = localStorage.getItem(storageKey(campaignId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidPlaylist)
  } catch (err) {
    logger.warn('[playlist] failed to load playlists', err)
    return []
  }
}

/** Persist all playlists for a campaign. */
export function savePlaylists(campaignId: string, playlists: Playlist[]): void {
  try {
    localStorage.setItem(storageKey(campaignId), JSON.stringify(playlists))
  } catch (err) {
    logger.warn('[playlist] failed to save playlists', err)
  }
}

function isValidPlaylist(p: unknown): p is Playlist {
  if (!p || typeof p !== 'object') return false
  const pl = p as Record<string, unknown>
  return (
    typeof pl.id === 'string' &&
    typeof pl.name === 'string' &&
    Array.isArray(pl.tracks) &&
    typeof pl.shuffle === 'boolean' &&
    typeof pl.loopPlaylist === 'boolean' &&
    typeof pl.currentIndex === 'number'
  )
}

export function createPlaylist(name: string): Playlist {
  return {
    id: `pl-${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim() || 'New Playlist',
    tracks: [],
    shuffle: false,
    loopPlaylist: true,
    currentIndex: 0
  }
}

/** The track at the playlist's current cursor, or null if empty/out of range. */
export function currentTrack(playlist: Playlist): PlaylistTrack | null {
  return playlist.tracks[playlist.currentIndex] ?? null
}

/**
 * Compute the next index. With shuffle, picks a random index other than the
 * current one (unless there is only one track). Without shuffle, advances
 * sequentially; at the end it wraps to 0 only when `loopPlaylist` is on,
 * otherwise returns null (playback stops).
 */
export function nextIndex(playlist: Playlist): number | null {
  const n = playlist.tracks.length
  if (n === 0) return null
  if (playlist.shuffle) {
    if (n === 1) return playlist.loopPlaylist ? 0 : null
    let idx = playlist.currentIndex
    // Avoid immediately repeating the same track.
    while (idx === playlist.currentIndex) idx = Math.floor(cryptoRandom() * n)
    return idx
  }
  const next = playlist.currentIndex + 1
  if (next < n) return next
  return playlist.loopPlaylist ? 0 : null
}

/** Return a copy advanced to the next track; cursor unchanged if playback ends. */
export function advance(playlist: Playlist): { playlist: Playlist; track: PlaylistTrack | null } {
  const idx = nextIndex(playlist)
  if (idx === null) return { playlist, track: null }
  const next = { ...playlist, currentIndex: idx }
  return { playlist: next, track: currentTrack(next) }
}
