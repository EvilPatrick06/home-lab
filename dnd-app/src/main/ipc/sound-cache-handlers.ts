/**
 * Sound Cache IPC Handlers (thin installer).
 *
 * Bridges the renderer's audio layer to the main-process {@link cacheGetSound} /
 * {@link prewarmSoundCache}. The MP3s are no longer bundled — these fetch them
 * from the Pi on demand and serve them from a disk cache. See `sound-cache.ts`.
 */

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { logToFile } from '../log'
import { cacheGetSound, prewarmSoundCache } from '../sound-cache'
import { handle } from './_safe'

export function registerSoundCacheHandlers(): void {
  // Resolve a bundled-sound rel-path to a cached on-disk path (null on failure).
  handle(IPC_CHANNELS.SOUND_CACHE_GET, async (_event, rel: string): Promise<string | null> => {
    if (typeof rel !== 'string' || rel.length === 0) return null
    return cacheGetSound(rel)
  })

  // Background-download every manifest clip into the cache (bounded concurrency).
  handle(IPC_CHANNELS.SOUND_CACHE_PREWARM, async (): Promise<{ ok: boolean }> => {
    // Fire-and-forget: kick off the prewarm but don't block the renderer on the
    // full download set. Errors are swallowed inside prewarmSoundCache.
    void prewarmSoundCache()
    return { ok: true }
  })

  logToFile('INFO', 'Sound cache IPC handlers registered')
}
