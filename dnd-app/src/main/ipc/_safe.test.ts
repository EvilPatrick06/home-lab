import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../log', () => ({ logToFile: vi.fn() }))

import { z } from 'zod'
import { safeHandler, withArgsSchema, withSchema } from './_safe'

describe('safeHandler (Phase 17d)', () => {
  it('passes a successful return through unchanged', async () => {
    const wrapped = safeHandler('ch', (() => ({ ok: 1 })) as never)
    expect(await wrapped({} as never)).toEqual({ ok: 1 })
  })

  it('normalizes a thrown error to a {success:false} envelope', async () => {
    const wrapped = safeHandler('ch', (() => {
      throw new Error('boom')
    }) as never)
    expect(await wrapped({} as never)).toEqual({ success: false, error: 'boom' })
  })
})

describe('withSchema (Phase 35a)', () => {
  const Schema = z.object({ name: z.string(), n: z.number() })

  it('passes the parsed payload to the handler on valid input', () => {
    const fn = vi.fn(() => 'ok')
    const wrapped = withSchema('ch', Schema, fn)
    const result = wrapped({} as never, { name: 'a', n: 1 } as never)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledWith({}, { name: 'a', n: 1 })
  })

  it('throws on invalid payload (safeHandler turns it into an error envelope)', async () => {
    const fn = vi.fn()
    const wrapped = withSchema('ch', Schema, fn)
    expect(() => wrapped({} as never, { name: 'a' } as never)).toThrow(/invalid payload/)
    expect(fn).not.toHaveBeenCalled()
    // Composed with safeHandler → error envelope.
    const composed = safeHandler('ch', wrapped)
    expect(await composed({} as never, { name: 'a' } as never)).toMatchObject({ success: false })
  })
})

describe('withArgsSchema (Phase 35)', () => {
  const Tuple = z.tuple([z.string().regex(/^[a-z]+$/), z.number()])

  it('passes the parsed positional args through on valid input', () => {
    const fn = vi.fn(() => 'ok')
    const wrapped = withArgsSchema('ch', Tuple, fn as never)
    const result = wrapped({} as never, 'abc' as never, 2 as never)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledWith({}, 'abc', 2)
  })

  it('throws on an invalid arg tuple (→ error envelope under safeHandler)', async () => {
    const fn = vi.fn()
    const wrapped = withArgsSchema('ch', Tuple, fn as never)
    expect(() => wrapped({} as never, 'ABC' as never, 2 as never)).toThrow(/invalid args/)
    expect(fn).not.toHaveBeenCalled()
    const composed = safeHandler('ch', wrapped)
    expect(await composed({} as never, '..' as never, 0 as never)).toMatchObject({ success: false })
  })
})
