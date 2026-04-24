import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockProtocolHandle, mockRegisterSchemesAsPrivileged } = vi.hoisted(() => ({
  mockProtocolHandle: vi.fn(),
  mockRegisterSchemesAsPrivileged: vi.fn()
}))

vi.mock('electron', () => ({
  protocol: {
    handle: mockProtocolHandle,
    registerSchemesAsPrivileged: mockRegisterSchemesAsPrivileged
  }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  mkdir: vi.fn()
}))

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

vi.mock('./plugin-scanner', () => ({
  getPluginsDir: vi.fn(() => Promise.resolve('/tmp/test-userdata/plugins'))
}))

import { registerPluginProtocol, registerPluginScheme } from './plugin-protocol'

describe('plugin-protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('registerPluginProtocol', () => {
    it('should register the plugin:// protocol handler', () => {
      registerPluginProtocol()

      expect(mockProtocolHandle).toHaveBeenCalledTimes(1)
      expect(mockProtocolHandle).toHaveBeenCalledWith('plugin', expect.any(Function))
    })

    it('should return 400 for invalid plugin ID', async () => {
      registerPluginProtocol()

      const handler = mockProtocolHandle.mock.calls[0][1]
      const response = await handler({ url: 'plugin://bad@plugin!/main.js' })

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(400)
    })

    it('should return 404 for missing files', async () => {
      const { readFile } = await import('node:fs/promises')
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      registerPluginProtocol()

      const handler = mockProtocolHandle.mock.calls[0][1]
      const response = await handler({ url: 'plugin://my-plugin/main.js' })

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(404)
    })

    it('should return file content with correct MIME type for .js', async () => {
      const { readFile } = await import('node:fs/promises')
      vi.mocked(readFile).mockResolvedValue(Buffer.from('console.log("hello")'))

      registerPluginProtocol()

      const handler = mockProtocolHandle.mock.calls[0][1]
      const response = await handler({ url: 'plugin://my-plugin/main.js' })

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/javascript')
    })

    it('should return correct MIME type for .json', async () => {
      const { readFile } = await import('node:fs/promises')
      vi.mocked(readFile).mockResolvedValue(Buffer.from('{}'))

      registerPluginProtocol()

      const handler = mockProtocolHandle.mock.calls[0][1]
      const response = await handler({ url: 'plugin://my-plugin/data.json' })

      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    it('should return correct MIME type for .css', async () => {
      const { readFile } = await import('node:fs/promises')
      vi.mocked(readFile).mockResolvedValue(Buffer.from('body{}'))

      registerPluginProtocol()

      const handler = mockProtocolHandle.mock.calls[0][1]
      const response = await handler({ url: 'plugin://my-plugin/style.css' })

      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get('Content-Type')).toBe('text/css')
    })
  })

  describe('registerPluginScheme', () => {
    it('should register plugin:// as a privileged scheme', () => {
      registerPluginScheme()

      expect(mockRegisterSchemesAsPrivileged).toHaveBeenCalledTimes(1)
      expect(mockRegisterSchemesAsPrivileged).toHaveBeenCalledWith([
        {
          scheme: 'plugin',
          privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true
          }
        }
      ])
    })
  })
})
