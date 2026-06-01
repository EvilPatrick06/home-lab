/**
 * Pi 5e-library IPC handlers.
 *
 * Bridges the renderer's `window.api.library.*` calls to the main-process
 * library fetcher (library-bridge.ts), so the renderer makes ZERO direct
 * http(s) fetch to the Pi for library data. The renderer keeps the content-hash
 * localStorage cache + bundled-data fallback.
 */

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { fetchLibraryFile, fetchLibraryManifest, type LibraryManifest } from '../library-bridge'
import { logToFile } from '../log'
import { handle } from './_safe'

export function registerLibraryHandlers(): void {
  handle(IPC_CHANNELS.LIBRARY_MANIFEST, async (): Promise<LibraryManifest | null> => fetchLibraryManifest())

  handle(IPC_CHANNELS.LIBRARY_FILE, async (_event, rel: string): Promise<string | null> => fetchLibraryFile(rel))

  logToFile('INFO', 'Library IPC handlers registered')
}
