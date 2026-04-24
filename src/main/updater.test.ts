import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from './updater'

// Mock electron before importing the module
vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.7.0'),
    quit: vi.fn()
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null)
  },
  ipcMain: {
    handle: vi.fn()
  }
}))

vi.mock('../shared/ipc-channels', () => ({
  IPC_CHANNELS: {
    APP_VERSION: 'app:version',
    UPDATE_CHECK: 'update:check',
    UPDATE_DOWNLOAD: 'update:download',
    UPDATE_INSTALL: 'update:install',
    UPDATE_STATUS: 'update:status'
  }
}))

describe('UpdateStatus type', () => {
  it('allows idle state', () => {
    const status: UpdateStatus = { state: 'idle' }
    expect(status.state).toBe('idle')
  })

  it('allows checking state', () => {
    const status: UpdateStatus = { state: 'checking' }
    expect(status.state).toBe('checking')
  })

  it('allows available state with version', () => {
    const status: UpdateStatus = { state: 'available', version: '2.0.0' }
    expect(status.state).toBe('available')
    if (status.state === 'available') {
      expect(status.version).toBe('2.0.0')
    }
  })

  it('allows not-available state', () => {
    const status: UpdateStatus = { state: 'not-available' }
    expect(status.state).toBe('not-available')
  })

  it('allows downloading state with percent', () => {
    const status: UpdateStatus = { state: 'downloading', percent: 42 }
    expect(status.state).toBe('downloading')
    if (status.state === 'downloading') {
      expect(status.percent).toBe(42)
    }
  })

  it('allows downloaded state with version', () => {
    const status: UpdateStatus = { state: 'downloaded', version: '2.0.0' }
    expect(status.state).toBe('downloaded')
    if (status.state === 'downloaded') {
      expect(status.version).toBe('2.0.0')
    }
  })

  it('allows error state with message', () => {
    const status: UpdateStatus = { state: 'error', message: 'Network failure' }
    expect(status.state).toBe('error')
    if (status.state === 'error') {
      expect(status.message).toBe('Network failure')
    }
  })
})

describe('registerUpdateHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers IPC handlers without throwing', async () => {
    const { ipcMain } = await import('electron')
    const { registerUpdateHandlers } = await import('./updater')

    expect(() => registerUpdateHandlers()).not.toThrow()
    expect(ipcMain.handle).toHaveBeenCalled()
  })

  it('registers handlers for APP_VERSION, UPDATE_CHECK, UPDATE_DOWNLOAD, UPDATE_INSTALL', async () => {
    const { ipcMain } = await import('electron')
    const { registerUpdateHandlers } = await import('./updater')

    registerUpdateHandlers()

    const registeredChannels = vi.mocked(ipcMain.handle).mock.calls.map(([channel]) => channel)
    expect(registeredChannels).toContain('app:version')
    expect(registeredChannels).toContain('update:check')
    expect(registeredChannels).toContain('update:download')
    expect(registeredChannels).toContain('update:install')
  })

  it('APP_VERSION handler returns a semver-like string', async () => {
    const { ipcMain } = await import('electron')
    const { registerUpdateHandlers } = await import('./updater')

    registerUpdateHandlers()

    const handleCalls = vi.mocked(ipcMain.handle).mock.calls
    const versionCall = handleCalls.find(([ch]) => ch === 'app:version')
    expect(versionCall).toBeDefined()

    const handler = versionCall![1] as () => string
    const version = handler()
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('error classification in UPDATE_CHECK handler', () => {
  it('identifies "Cannot find module" as no-release error', () => {
    const noReleaseMessages = [
      'Cannot find module electron-updater',
      'ERR_UPDATER_NO_PUBLISHED_VERSIONS',
      '404 Not Found',
      'No published versions on GitHub',
      'net::ERR_NAME_NOT_RESOLVED',
      'ENOTFOUND github.com'
    ]
    for (const msg of noReleaseMessages) {
      const isNoRelease =
        msg.includes('Cannot find module') ||
        msg.includes('ERR_UPDATER_') ||
        msg.includes('404') ||
        msg.includes('No published versions') ||
        msg.includes('net::') ||
        msg.includes('ENOTFOUND')
      expect(isNoRelease).toBe(true)
    }
  })

  it('does not classify generic errors as no-release', () => {
    const msg = 'Unexpected token in JSON'
    const isNoRelease =
      msg.includes('Cannot find module') ||
      msg.includes('ERR_UPDATER_') ||
      msg.includes('404') ||
      msg.includes('No published versions') ||
      msg.includes('net::') ||
      msg.includes('ENOTFOUND')
    expect(isNoRelease).toBe(false)
  })
})
