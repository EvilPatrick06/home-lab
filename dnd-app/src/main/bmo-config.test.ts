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
