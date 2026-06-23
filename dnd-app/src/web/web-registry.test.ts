import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./idb', () => ({
  idbGet: vi.fn(async () => undefined),
  idbSet: vi.fn(async () => {}),
  idbDelete: vi.fn(async () => {}),
  idbGetAll: vi.fn(async () => []),
  idbKeys: vi.fn(async () => []),
  idbWipeAll: vi.fn(async () => {})
}))

import { createWebApi } from './web-api'

describe('web shim registry — {ok} contract (PHASE-46 F1)', () => {
  // biome-ignore lint/suspicious/noExplicitAny: shim api is intentionally loose
  let api: any
  const realFetch = globalThis.fetch
  beforeEach(() => {
    api = createWebApi()
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  it('announce resolves { ok:false, error } (never null) when the POST fails', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    const r = await api.registry.announce({ invite_code: 'X' })
    expect(r).not.toBeNull()
    expect(r.ok).toBe(false)
    expect(typeof r.error).toBe('string')
  })

  it('announce passes through the Pi { ok:true } on success', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, game: 'X' }), { status: 201 })
    ) as unknown as typeof fetch
    const r = await api.registry.announce({ invite_code: 'X' })
    expect(r.ok).toBe(true)
  })

  it('list resolves { ok:true, games } on success and degrades to empty on failure', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ games: [{ invite_code: 'A' }] }), { status: 200 })
    ) as unknown as typeof fetch
    const ok = await api.registry.list(null)
    expect(ok).toEqual({ ok: true, games: [{ invite_code: 'A' }] })

    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 })) as unknown as typeof fetch
    const fail = await api.registry.list(null)
    expect(fail).toEqual({ ok: true, games: [] })
  })

  it('heartbeat / deregister resolve { ok:false } on failure (not null)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('x', { status: 404 })) as unknown as typeof fetch
    expect((await api.registry.heartbeat('X')).ok).toBe(false)
    expect((await api.registry.deregister('X')).ok).toBe(false)
  })
})
