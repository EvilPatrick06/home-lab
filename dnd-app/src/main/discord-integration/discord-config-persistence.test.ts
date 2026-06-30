import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Round-trip persistence guard for the Discord integration config.
 * Verifies the 2026-06-29 security fixes:
 *  - settings/secret files are written owner-only (0o600), and
 *  - the webhook URL (a bearer credential) is encrypted at rest like the bot
 *    token, decrypts back on load, and a legacy-plaintext webhook is migrated.
 */

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') },
  // Deterministic, available safeStorage so encryptOptional emits the ss1: form.
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(s, 'utf-8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf-8'))
  }
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  chmod: vi.fn()
}))

vi.mock('../log', () => ({ logToFile: vi.fn() }))

type FsMock = {
  readFile: ReturnType<typeof vi.fn>
  writeFile: ReturnType<typeof vi.fn>
  mkdir: ReturnType<typeof vi.fn>
  chmod: ReturnType<typeof vi.fn>
}

async function load(): Promise<{ mod: typeof import('./discord-service'); fs: FsMock }> {
  vi.resetModules()
  const mod = await import('./discord-service')
  const fs = (await import('fs/promises')) as unknown as FsMock
  return { mod, fs }
}

const enc = (s: string): string => `ss1:${Buffer.from(s, 'utf-8').toString('base64')}`
const WEBHOOK = 'https://discord.com/api/webhooks/1/abc'

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('discord config persistence (security)', () => {
  it('writes 0o600 and encrypts BOTH the bot token and webhook URL at rest', async () => {
    const { mod, fs } = await load()
    fs.readFile.mockRejectedValue(new Error('ENOENT'))
    fs.mkdir.mockResolvedValue(undefined)
    fs.writeFile.mockResolvedValue(undefined)

    await mod.saveDiscordConfig({
      enabled: true,
      botToken: 'bot-secret',
      webhookUrl: WEBHOOK,
      dmMode: 'webhook'
    })

    expect(fs.writeFile).toHaveBeenCalledTimes(1)
    const [path, json, opts] = fs.writeFile.mock.calls[0]
    expect(String(path)).toContain('discord-integration.json')
    expect(opts).toEqual({ encoding: 'utf-8', mode: 0o600 })
    const persisted = JSON.parse(json as string)
    expect(persisted.webhookUrl.startsWith('ss1:')).toBe(true)
    expect(persisted.webhookUrl).not.toContain('discord.com')
    expect(persisted.botToken.startsWith('ss1:')).toBe(true)
  })

  it('decrypts the stored webhook back to plaintext and self-heals perms on load', async () => {
    const { mod, fs } = await load()
    fs.readFile.mockResolvedValue(
      JSON.stringify({ enabled: true, botToken: enc('bot-secret'), webhookUrl: enc(WEBHOOK), dmMode: 'webhook' })
    )
    fs.chmod.mockResolvedValue(undefined)

    const cfg = await mod.loadDiscordConfig()
    expect(cfg.webhookUrl).toBe(WEBHOOK)
    expect(cfg.botToken).toBe('bot-secret')
    expect(fs.chmod).toHaveBeenCalledWith(expect.stringContaining('discord-integration.json'), 0o600)
    // Already encrypted → no migration re-save.
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('migrates a legacy plaintext webhook-only config to encrypted-at-rest', async () => {
    const { mod, fs } = await load()
    fs.readFile.mockResolvedValue(
      JSON.stringify({ enabled: true, botToken: '', webhookUrl: WEBHOOK, dmMode: 'webhook' })
    )
    fs.chmod.mockResolvedValue(undefined)
    fs.mkdir.mockResolvedValue(undefined)
    fs.writeFile.mockResolvedValue(undefined)

    await mod.loadDiscordConfig()
    // migration re-save is fire-and-forget; flush the microtask/macrotask queue.
    await new Promise((r) => setTimeout(r, 0))

    expect(fs.writeFile).toHaveBeenCalled()
    const json = fs.writeFile.mock.calls[0][1] as string
    expect(JSON.parse(json).webhookUrl.startsWith('ss1:')).toBe(true)
  })
})
