import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'
import type { z } from 'zod'
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

/**
 * Phase 35a — payload-schema validation wrapper. Wraps a handler so the first
 * argument is Zod-validated before the body runs; the parsed (narrowed) value is
 * passed through. On a validation failure it throws (so {@link safeHandler}
 * normalizes it to a `{ success: false, error }` envelope and logs it) — this
 * preserves the existing SUCCESS contract (raw return / existing envelope) while
 * adding input validation. Compose as `handle(channel, withSchema(channel, Schema, fn))`.
 */
export function withSchema<S extends z.ZodTypeAny>(
  channel: string,
  schema: S,
  handler: (event: IpcMainInvokeEvent, data: z.infer<S>, ...rest: unknown[]) => unknown
): IpcInvokeHandler {
  return ((event: IpcMainInvokeEvent, payload: unknown, ...rest: unknown[]) => {
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new Error(
        `[${channel}] invalid payload: ${issue?.path.join('.') || '(root)'} ${issue?.message ?? ''}`.trim()
      )
    }
    return handler(event, parsed.data, ...rest)
  }) as IpcInvokeHandler
}

/**
 * Phase 35 — multi-argument variant of {@link withSchema}. Many `ipcMain.handle`
 * sites take several positional args (e.g. `(campaignId, fileName, buffer)`)
 * rather than a single payload object. `withArgsSchema` validates the full
 * argument tuple with a `z.tuple([...])` schema and passes the parsed args
 * through. Validation failure throws → {@link safeHandler} normalizes it to a
 * `{ success: false, error }` envelope, preserving the success contract.
 */
export function withArgsSchema<S extends z.ZodTypeAny>(
  channel: string,
  schema: S,
  handler: (event: IpcMainInvokeEvent, ...args: z.infer<S> extends unknown[] ? z.infer<S> : never[]) => unknown
): IpcInvokeHandler {
  return ((event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const parsed = schema.safeParse(args)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new Error(`[${channel}] invalid args: ${issue?.path.join('.') || '(root)'} ${issue?.message ?? ''}`.trim())
    }
    return (handler as (event: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...(parsed.data as unknown[]))
  }) as IpcInvokeHandler
}
