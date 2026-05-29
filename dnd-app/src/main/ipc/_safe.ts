import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'
import { logToFile } from '../log'

/**
 * Phase 17d (NET-6 / NET-29 / NET-30) — uniform IPC error containment.
 *
 * An uncaught throw inside an `ipcMain.handle` callback rejects the renderer
 * promise with a stringified error and leaves the failure invisible in the
 * main-process logs. `safeHandler` wraps a handler so that:
 *  - a successful return value passes through unchanged (raw data OR an
 *    existing `{ success, error }` envelope — both contracts are preserved);
 *  - any thrown error is logged once and normalized to
 *    `{ success: false, error: <message> }` instead of rejecting.
 *
 * Use the `handle` convenience below to register a channel with the guard
 * already applied.
 */
export type IpcInvokeHandler = (event: IpcMainInvokeEvent, ...args: never[]) => unknown | Promise<unknown>

export function safeHandler(
  channel: string,
  handler: IpcInvokeHandler
): (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> {
  return async (event, ...args) => {
    try {
      return await (handler as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown)(event, ...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logToFile('error', `[ipc] ${channel} handler threw: ${message}`, err instanceof Error ? err.stack : undefined)
      return { success: false, error: message }
    }
  }
}

/** Register an IPC handler wrapped in {@link safeHandler}. Drop-in for `ipcMain.handle`. */
export function handle(channel: string, handler: IpcInvokeHandler): void {
  ipcMain.handle(channel, safeHandler(channel, handler))
}
