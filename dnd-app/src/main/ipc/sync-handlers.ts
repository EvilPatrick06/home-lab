/**
 * Sync IPC handlers (Electron main) — thin proxy from the renderer sync engine
 * to the Pi `/api/sync/*`, authorized with the main-held bearer token. Every
 * handler degrades to a safe shape on failure so the engine never throws.
 */

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import * as sync from '../account/sync-client'
import { logToFile } from '../log'
import { handle } from './_safe'

export function registerSyncHandlers(): void {
  handle(IPC_CHANNELS.SYNC_MANIFEST, async () => {
    try {
      return { ok: true, objects: await sync.getManifest() }
    } catch (err) {
      return {
        ok: false,
        objects: [] as sync.SyncObjectMeta[],
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  handle(IPC_CHANNELS.SYNC_GET_OBJECT, async (_e, domain: string, id: string) => {
    try {
      return await sync.getObject(domain, id)
    } catch {
      return null
    }
  })

  handle(
    IPC_CHANNELS.SYNC_PUT_OBJECT,
    async (_e, domain: string, id: string, version: number, mtime: number, hash: string | null, bytes: ArrayBuffer) => {
      try {
        return await sync.putObject(domain, id, version, mtime, hash, bytes)
      } catch (err) {
        logToFile('ERROR', `sync put ${domain}/${id} failed:`, err instanceof Error ? err.message : String(err))
        return { accepted: false }
      }
    }
  )

  handle(IPC_CHANNELS.SYNC_DELETE_OBJECT, async (_e, domain: string, id: string, version: number) => {
    try {
      return await sync.deleteObject(domain, id, version)
    } catch {
      return { accepted: false }
    }
  })

  logToFile('INFO', 'Sync IPC handlers registered')
}
