import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') },
  ipcMain: { handle: mockHandle },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => [])
  },
  dialog: { showOpenDialog: vi.fn() }
}))

vi.mock('../../shared/ipc-channels', () => ({
  IPC_CHANNELS: {
    PLUGIN_SCAN: 'plugin:scan',
    PLUGIN_ENABLE: 'plugin:enable',
    PLUGIN_DISABLE: 'plugin:disable',
    PLUGIN_LOAD_CONTENT: 'plugin:load-content',
    PLUGIN_GET_ENABLED: 'plugin:get-enabled',
    PLUGIN_INSTALL: 'plugin:install',
    PLUGIN_UNINSTALL: 'plugin:uninstall',
    PLUGIN_STORAGE_GET: 'plugin:storage-get',
    PLUGIN_STORAGE_SET: 'plugin:storage-set',
    PLUGIN_STORAGE_DELETE: 'plugin:storage-delete'
  }
}))

vi.mock('../plugins/content-pack-loader', () => ({
  loadAllContentPackData: vi.fn()
}))

vi.mock('../plugins/plugin-config', () => ({
  getEnabledPluginIds: vi.fn(() => new Set()),
  setPluginEnabled: vi.fn()
}))

vi.mock('../plugins/plugin-installer', () => ({
  installFromZip: vi.fn(),
  uninstallPlugin: vi.fn()
}))

vi.mock('../plugins/plugin-scanner', () => ({
  scanPlugins: vi.fn()
}))

vi.mock('../plugins/plugin-storage', () => ({
  getPluginStorage: vi.fn(),
  setPluginStorage: vi.fn(),
  deletePluginStorage: vi.fn()
}))

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { registerPluginHandlers } from './plugin-handlers'

describe('plugin-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register all plugin IPC handlers', () => {
    registerPluginHandlers()

    const registeredChannels = mockHandle.mock.calls.map((call) => call[0])
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_SCAN)
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_ENABLE)
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_DISABLE)
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_LOAD_CONTENT)
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_GET_ENABLED)
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_INSTALL)
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_UNINSTALL)
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_STORAGE_GET)
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_STORAGE_SET)
    expect(registeredChannels).toContain(IPC_CHANNELS.PLUGIN_STORAGE_DELETE)
  })

  it('should register exactly 10 handlers', () => {
    registerPluginHandlers()
    expect(mockHandle).toHaveBeenCalledTimes(10)
  })

  describe('PLUGIN_SCAN handler', () => {
    it('should call scanPlugins and return result', async () => {
      const { scanPlugins } = await import('../plugins/plugin-scanner')
      vi.mocked(scanPlugins).mockResolvedValue({ success: true, data: [] })

      registerPluginHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.PLUGIN_SCAN)![1]

      const result = await handler({})
      expect(result).toEqual({ success: true, data: [] })
      expect(scanPlugins).toHaveBeenCalled()
    })
  })

  describe('PLUGIN_ENABLE handler', () => {
    it('should call setPluginEnabled with true', async () => {
      const { setPluginEnabled } = await import('../plugins/plugin-config')
      vi.mocked(setPluginEnabled).mockResolvedValue(undefined)

      registerPluginHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.PLUGIN_ENABLE)![1]

      const result = await handler({}, 'my-plugin')
      expect(result).toEqual({ success: true })
      expect(setPluginEnabled).toHaveBeenCalledWith('my-plugin', true)
    })
  })

  describe('PLUGIN_DISABLE handler', () => {
    it('should call setPluginEnabled with false', async () => {
      const { setPluginEnabled } = await import('../plugins/plugin-config')
      vi.mocked(setPluginEnabled).mockResolvedValue(undefined)

      registerPluginHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.PLUGIN_DISABLE)![1]

      const result = await handler({}, 'my-plugin')
      expect(result).toEqual({ success: true })
      expect(setPluginEnabled).toHaveBeenCalledWith('my-plugin', false)
    })
  })

  describe('PLUGIN_GET_ENABLED handler', () => {
    it('should return enabled plugin IDs as an array', async () => {
      const { getEnabledPluginIds } = await import('../plugins/plugin-config')
      vi.mocked(getEnabledPluginIds).mockResolvedValue(new Set(['plugin-a', 'plugin-b']))

      registerPluginHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.PLUGIN_GET_ENABLED)![1]

      const result = await handler({})
      expect(result).toEqual(['plugin-a', 'plugin-b'])
    })
  })

  describe('PLUGIN_UNINSTALL handler', () => {
    it('should call uninstallPlugin', async () => {
      const { uninstallPlugin } = await import('../plugins/plugin-installer')
      vi.mocked(uninstallPlugin).mockResolvedValue({ success: true, data: true })

      registerPluginHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.PLUGIN_UNINSTALL)![1]

      const result = await handler({}, 'my-plugin')
      expect(result).toEqual({ success: true, data: true })
      expect(uninstallPlugin).toHaveBeenCalledWith('my-plugin')
    })
  })

  describe('PLUGIN_STORAGE_GET handler', () => {
    it('should call getPluginStorage', async () => {
      const { getPluginStorage } = await import('../plugins/plugin-storage')
      vi.mocked(getPluginStorage).mockResolvedValue('stored-value')

      registerPluginHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.PLUGIN_STORAGE_GET)![1]

      const result = await handler({}, 'my-plugin', 'key1')
      expect(result).toBe('stored-value')
      expect(getPluginStorage).toHaveBeenCalledWith('my-plugin', 'key1')
    })
  })
})
