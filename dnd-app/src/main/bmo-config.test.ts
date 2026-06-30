import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * bmo-config holds module-level singleton state (userOverrideUrl,
 * discoveredBmoUrl, userBmoApiKey, resolvedBmoBaseUrl). Each test reloads the
 * module fresh via vi.resetModules() + dynamic import so prior precedence
 * mutations don't leak. process.env is snapshotted and restored.
 */

type BmoConfig = typeof import('./bmo-config')

async function loadFresh(): Promise<BmoConfig> {
  vi.resetModules()
  return import('./bmo-config')
}

const savedEnv = { ...process.env }

beforeEach(() => {
  delete process.env.BMO_PI_URL
  delete process.env.BMO_API_KEY
})

afterEach(() => {
  process.env = { ...savedEnv }
})

describe('getBmoBaseUrl precedence', () => {
  it('falls back to the hardcoded default when nothing else is set', async () => {
    const mod = await loadFresh()
    expect(mod.getBmoBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
    expect(mod.BMO_PI_URL_DEFAULT).toBe('https://bmo.mybmoai.work')
  })

  it('uses process.env.BMO_PI_URL over the default', async () => {
    process.env.BMO_PI_URL = 'https://env.example.test'
    const mod = await loadFresh()
    expect(mod.getBmoBaseUrl()).toBe('https://env.example.test')
  })

  it('prefers the discovered URL over env', async () => {
    process.env.BMO_PI_URL = 'https://env.example.test'
    const mod = await loadFresh()
    mod.setDiscoveredBmoUrl('http://discovered.local:5000')
    expect(mod.getBmoBaseUrl()).toBe('http://discovered.local:5000')
  })

  it('prefers the user setting over discovered and env', async () => {
    process.env.BMO_PI_URL = 'https://env.example.test'
    const mod = await loadFresh()
    mod.setDiscoveredBmoUrl('http://discovered.local:5000')
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'https://user.example.test' })
    expect(mod.getBmoBaseUrl()).toBe('https://user.example.test')
  })

  it('drops back to discovered when the user setting is cleared', async () => {
    const mod = await loadFresh()
    mod.setDiscoveredBmoUrl('http://discovered.local:5000')
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'https://user.example.test' })
    expect(mod.getBmoBaseUrl()).toBe('https://user.example.test')
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: '' })
    expect(mod.getBmoBaseUrl()).toBe('http://discovered.local:5000')
  })
})

describe('applyBmoBaseUrlFromSettings normalization', () => {
  it('strips a trailing slash from the user URL', async () => {
    const mod = await loadFresh()
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'https://user.example.test/' })
    expect(mod.getBmoBaseUrl()).toBe('https://user.example.test')
  })

  it('trims surrounding whitespace before applying', async () => {
    const mod = await loadFresh()
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: '  https://spaced.example.test  ' })
    expect(mod.getBmoBaseUrl()).toBe('https://spaced.example.test')
  })

  it('rejects a non-http(s) protocol and falls back to the default', async () => {
    const mod = await loadFresh()
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'ftp://nope.example.test' })
    expect(mod.getBmoBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
  })

  it('rejects an unparseable URL and falls back to the default', async () => {
    const mod = await loadFresh()
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'not a url at all' })
    expect(mod.getBmoBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
  })

  it('falls back to env when an invalid user URL is supplied', async () => {
    process.env.BMO_PI_URL = 'https://env.example.test'
    const mod = await loadFresh()
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'ftp://bad.example.test' })
    expect(mod.getBmoBaseUrl()).toBe('https://env.example.test')
  })

  it('treats null/undefined/empty settings as no override', async () => {
    const mod = await loadFresh()
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'https://user.example.test' })
    mod.applyBmoBaseUrlFromSettings(null)
    expect(mod.getBmoBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'https://user.example.test' })
    mod.applyBmoBaseUrlFromSettings(undefined)
    expect(mod.getBmoBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'https://user.example.test' })
    mod.applyBmoBaseUrlFromSettings({})
    expect(mod.getBmoBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
  })
})

describe('setDiscoveredBmoUrl / getDiscoveredBmoUrl', () => {
  it('stores a normalized discovered URL (trailing slash stripped)', async () => {
    const mod = await loadFresh()
    mod.setDiscoveredBmoUrl('http://pi.local:5000/')
    expect(mod.getDiscoveredBmoUrl()).toBe('http://pi.local:5000')
  })

  it('rejects an invalid discovered URL (stored as null)', async () => {
    const mod = await loadFresh()
    mod.setDiscoveredBmoUrl('ftp://pi.local')
    expect(mod.getDiscoveredBmoUrl()).toBeNull()
    expect(mod.getBmoBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
  })

  it('clears the discovered URL when passed null', async () => {
    const mod = await loadFresh()
    mod.setDiscoveredBmoUrl('http://pi.local:5000')
    expect(mod.getDiscoveredBmoUrl()).toBe('http://pi.local:5000')
    mod.setDiscoveredBmoUrl(null)
    expect(mod.getDiscoveredBmoUrl()).toBeNull()
    expect(mod.getBmoBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
  })
})

describe('BMO API key precedence', () => {
  it('returns undefined when neither env nor settings provide a key', async () => {
    const mod = await loadFresh()
    expect(mod.getBmoApiKey()).toBeUndefined()
  })

  it('reads the key from process.env.BMO_API_KEY', async () => {
    process.env.BMO_API_KEY = 'env-secret'
    const mod = await loadFresh()
    expect(mod.getBmoApiKey()).toBe('env-secret')
  })

  it('reads the key from settings when env is unset', async () => {
    const mod = await loadFresh()
    mod.applyBmoApiKeyFromSettings({ bmoApiKey: 'settings-secret' })
    expect(mod.getBmoApiKey()).toBe('settings-secret')
  })

  it('prefers env over the settings value', async () => {
    process.env.BMO_API_KEY = 'env-secret'
    const mod = await loadFresh()
    mod.applyBmoApiKeyFromSettings({ bmoApiKey: 'settings-secret' })
    expect(mod.getBmoApiKey()).toBe('env-secret')
  })

  it('ignores a blank env value and uses settings instead', async () => {
    process.env.BMO_API_KEY = '   '
    const mod = await loadFresh()
    mod.applyBmoApiKeyFromSettings({ bmoApiKey: 'settings-secret' })
    expect(mod.getBmoApiKey()).toBe('settings-secret')
  })

  it('clears the settings key when given empty/null/undefined', async () => {
    const mod = await loadFresh()
    mod.applyBmoApiKeyFromSettings({ bmoApiKey: 'settings-secret' })
    mod.applyBmoApiKeyFromSettings({ bmoApiKey: '' })
    expect(mod.getBmoApiKey()).toBeUndefined()
    mod.applyBmoApiKeyFromSettings({ bmoApiKey: 'settings-secret' })
    mod.applyBmoApiKeyFromSettings(null)
    expect(mod.getBmoApiKey()).toBeUndefined()
    mod.applyBmoApiKeyFromSettings({ bmoApiKey: 'settings-secret' })
    mod.applyBmoApiKeyFromSettings(undefined)
    expect(mod.getBmoApiKey()).toBeUndefined()
  })
})

describe('getBmoAccessHeaders (Cloudflare Access service token)', () => {
  // The token is injected at build time as the `__CF_ACCESS_*__` defines. In
  // tests they're absent, so simulate a baked build by setting them on
  // globalThis (a bare identifier resolves to a globalThis property).
  const g = globalThis as unknown as Record<string, unknown>
  afterEach(() => {
    delete g.__CF_ACCESS_CLIENT_ID__
    delete g.__CF_ACCESS_CLIENT_SECRET__
  })

  it('returns no headers in an unconfigured build (defines absent)', async () => {
    const mod = await loadFresh()
    expect(mod.getBmoAccessHeaders()).toEqual({})
  })

  it('returns CF-Access headers when both id and secret are baked in', async () => {
    g.__CF_ACCESS_CLIENT_ID__ = 'client-id.access'
    g.__CF_ACCESS_CLIENT_SECRET__ = 'super-secret'
    const mod = await loadFresh()
    expect(mod.getBmoAccessHeaders()).toEqual({
      'CF-Access-Client-Id': 'client-id.access',
      'CF-Access-Client-Secret': 'super-secret'
    })
  })

  it('returns no headers when only one of the pair is present', async () => {
    g.__CF_ACCESS_CLIENT_ID__ = 'client-id.access'
    const mod = await loadFresh()
    expect(mod.getBmoAccessHeaders()).toEqual({})
  })
})

describe('isBmoBaseSecretTrusted / getBmoSecretBaseUrl (LAN Pi-impersonation guard)', () => {
  it('trusts the https tunnel default and routes credentialed calls to it', async () => {
    const mod = await loadFresh()
    expect(mod.isBmoBaseSecretTrusted()).toBe(true)
    expect(mod.getBmoSecretBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
  })

  it('does NOT trust an auto-discovered http LAN host with secrets', async () => {
    const mod = await loadFresh()
    mod.setDiscoveredBmoUrl('http://discovered.local:5000')
    // public/base URL still uses the discovered LAN host...
    expect(mod.getBmoBaseUrl()).toBe('http://discovered.local:5000')
    // ...but credentialed ops are NOT trusted to it and fall back to https.
    expect(mod.isBmoBaseSecretTrusted()).toBe(false)
    expect(mod.getBmoSecretBaseUrl()).toBe(mod.BMO_PI_URL_DEFAULT)
  })

  it('falls back to an explicit https env URL for credentialed ops over a discovered http host', async () => {
    process.env.BMO_PI_URL = 'https://env.example.test'
    const mod = await loadFresh()
    mod.setDiscoveredBmoUrl('http://discovered.local:5000')
    expect(mod.isBmoBaseSecretTrusted()).toBe(false)
    expect(mod.getBmoSecretBaseUrl()).toBe('https://env.example.test')
  })

  it('trusts a user-typed URL even when it is http (explicit user intent)', async () => {
    const mod = await loadFresh()
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'http://my-pi.lan:5000' })
    expect(mod.isBmoBaseSecretTrusted()).toBe(true)
    expect(mod.getBmoSecretBaseUrl()).toBe('http://my-pi.lan:5000')
  })
})

describe('getBmoAccessHeadersIfTrusted (LAN credential-leak guard)', () => {
  // Simulate a baked build (CF-Access defines present). The guard must still
  // withhold them when the base is not secret-trusted.
  const g = globalThis as unknown as Record<string, unknown>
  beforeEach(() => {
    g.__CF_ACCESS_CLIENT_ID__ = 'client-id.access'
    g.__CF_ACCESS_CLIENT_SECRET__ = 'super-secret'
  })
  afterEach(() => {
    delete g.__CF_ACCESS_CLIENT_ID__
    delete g.__CF_ACCESS_CLIENT_SECRET__
  })

  it('emits NO CF-Access headers when the base is an auto-discovered http LAN host', async () => {
    const mod = await loadFresh()
    mod.setDiscoveredBmoUrl('http://discovered.local:5000')
    expect(mod.isBmoBaseSecretTrusted()).toBe(false)
    expect(mod.getBmoAccessHeadersIfTrusted()).toEqual({})
  })

  it('emits the CF-Access headers when the base is the https tunnel default (trusted)', async () => {
    const mod = await loadFresh()
    expect(mod.getBmoAccessHeadersIfTrusted()).toEqual({
      'CF-Access-Client-Id': 'client-id.access',
      'CF-Access-Client-Secret': 'super-secret'
    })
  })

  it('emits the CF-Access headers for an explicit user-typed http base (trusted by intent)', async () => {
    const mod = await loadFresh()
    mod.applyBmoBaseUrlFromSettings({ bmoPiBaseUrl: 'http://my-pi.lan:5000' })
    expect(mod.getBmoAccessHeadersIfTrusted()).toEqual({
      'CF-Access-Client-Id': 'client-id.access',
      'CF-Access-Client-Secret': 'super-secret'
    })
  })
})
