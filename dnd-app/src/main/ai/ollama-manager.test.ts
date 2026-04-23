import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'temp') return '/tmp/test-temp'
      return '/tmp/test'
    }),
    getAppPath: vi.fn(() => '/tmp/app'),
    isPackaged: false
  }
}))

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
  execFile: vi.fn((_path: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => {
    cb(null)
  }),
  spawn: vi.fn(() => ({
    unref: vi.fn()
  }))
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'finish') cb()
    })
  }))
}))

vi.mock('./ollama-client', () => ({
  listOllamaModels: vi.fn(async () => ['llama3.1'])
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  CURATED_MODELS,
  checkOllamaUpdate,
  deleteModel,
  detectOllama,
  getOllamaVersion,
  getPerformanceTier,
  getSystemVram,
  installOllama,
  listInstalledModels,
  listInstalledModelsDetailed,
  OLLAMA_BASE_URL,
  pullModel
} from './ollama-manager'

describe('ollama-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Constants ──

  describe('OLLAMA_BASE_URL', () => {
    it('is set to localhost:11434', () => {
      expect(OLLAMA_BASE_URL).toBe('http://localhost:11434')
    })
  })

  describe('CURATED_MODELS', () => {
    it('is a non-empty array of model definitions', () => {
      expect(Array.isArray(CURATED_MODELS)).toBe(true)
      expect(CURATED_MODELS.length).toBeGreaterThan(0)
    })

    it('each model has required fields', () => {
      for (const model of CURATED_MODELS) {
        expect(model.id).toBeDefined()
        expect(model.name).toBeDefined()
        expect(typeof model.vramMB).toBe('number')
        expect(typeof model.contextSize).toBe('number')
        expect(model.desc).toBeDefined()
      }
    })

    it('includes llama3.1:8b', () => {
      const llama = CURATED_MODELS.find((m) => m.id === 'llama3.1:8b')
      expect(llama).toBeDefined()
      expect(llama!.name).toBe('Llama 3.1 8B')
    })

    it('includes llama3.2:3b as lightweight option', () => {
      const llama = CURATED_MODELS.find((m) => m.id === 'llama3.2:3b')
      expect(llama).toBeDefined()
      expect(llama!.vramMB).toBeLessThan(3000)
    })
  })

  // ── getPerformanceTier ──

  describe('getPerformanceTier', () => {
    it('returns optimal when VRAM is at least 2x model requirement', () => {
      expect(getPerformanceTier(16000, 5000)).toBe('optimal')
    })

    it('returns good when VRAM is 1.2x to 2x model requirement', () => {
      expect(getPerformanceTier(7000, 5000)).toBe('good')
    })

    it('returns limited when VRAM is 0.8x to 1.2x model requirement', () => {
      expect(getPerformanceTier(4500, 5000)).toBe('limited')
    })

    it('returns insufficient when VRAM is less than 0.8x model requirement', () => {
      expect(getPerformanceTier(2000, 5000)).toBe('insufficient')
    })

    it('returns optimal at exactly 2x ratio', () => {
      expect(getPerformanceTier(10000, 5000)).toBe('optimal')
    })

    it('returns good at exactly 1.2x ratio', () => {
      expect(getPerformanceTier(6000, 5000)).toBe('good')
    })

    it('returns limited at exactly 0.8x ratio', () => {
      expect(getPerformanceTier(4000, 5000)).toBe('limited')
    })
  })

  // ── detectOllama ──

  describe('detectOllama', () => {
    it('detects Ollama when server is running', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found')
      })
      mockFetch.mockResolvedValueOnce({ ok: true })

      const status = await detectOllama()
      expect(status.running).toBe(true)
      expect(status.installed).toBe(true)
    })

    it('reports not running when server is down', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found')
      })
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const status = await detectOllama()
      expect(status.running).toBe(false)
      expect(status.installed).toBe(false)
    })

    it('detects installed Ollama via existsSync', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(true) // bundled path check
      mockFetch.mockRejectedValueOnce(new Error('not running'))

      const status = await detectOllama()
      expect(status.installed).toBe(true)
      expect(status.path).toBeDefined()
    })
  })

  // ── getSystemVram ──

  describe('getSystemVram', () => {
    it('returns VRAM from nvidia-smi', async () => {
      vi.mocked(execSync).mockReturnValueOnce('8192\n')
      const vram = await getSystemVram()
      expect(vram.totalMB).toBe(8192)
    })

    it('returns 0 when nvidia-smi is not available', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('nvidia-smi not found')
      })
      const vram = await getSystemVram()
      expect(vram.totalMB).toBe(0)
    })

    it('returns 0 for non-numeric output', async () => {
      vi.mocked(execSync).mockReturnValueOnce('not a number\n')
      const vram = await getSystemVram()
      expect(vram.totalMB).toBe(0)
    })
  })

  // ── installOllama ──

  describe('installOllama', () => {
    it('rejects installer paths outside temp directory', async () => {
      await expect(installOllama('C:\\Windows\\System32\\evil.exe')).rejects.toThrow('Access denied')
    })

    it('rejects non-exe files', async () => {
      await expect(installOllama('/tmp/test-temp/installer.bat')).rejects.toThrow('Access denied')
    })
  })

  // ── listInstalledModels ──

  describe('listInstalledModels', () => {
    it('delegates to listOllamaModels from ollama-client', async () => {
      const models = await listInstalledModels()
      expect(models).toEqual(['llama3.1'])
    })
  })

  // ── listInstalledModelsDetailed ──

  describe('listInstalledModelsDetailed', () => {
    it('returns detailed model info from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'llama3.1:8b',
              size: 5000000000,
              modified_at: '2024-06-01',
              digest: 'abc123',
              details: {
                parameter_size: '8B',
                quantization_level: 'Q4_0',
                family: 'llama'
              }
            }
          ]
        })
      })

      const models = await listInstalledModelsDetailed()
      expect(models).toHaveLength(1)
      expect(models[0].name).toBe('llama3.1:8b')
      expect(models[0].parameterSize).toBe('8B')
      expect(models[0].family).toBe('llama')
    })

    it('returns empty array on API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      expect(await listInstalledModelsDetailed()).toEqual([])
    })

    it('returns empty array on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      expect(await listInstalledModelsDetailed()).toEqual([])
    })
  })

  // ── getOllamaVersion ──

  describe('getOllamaVersion', () => {
    it('returns version string from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '0.3.12' })
      })
      expect(await getOllamaVersion()).toBe('0.3.12')
    })

    it('returns null on API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      expect(await getOllamaVersion()).toBeNull()
    })

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))
      expect(await getOllamaVersion()).toBeNull()
    })
  })

  // ── checkOllamaUpdate ──

  describe('checkOllamaUpdate', () => {
    it('returns unknown when Ollama is not running', async () => {
      // getOllamaVersion fails
      mockFetch.mockResolvedValueOnce({ ok: false })

      const result = await checkOllamaUpdate()
      expect(result.installed).toBe('unknown')
      expect(result.updateAvailable).toBe(false)
    })

    it('detects available update', async () => {
      // getOllamaVersion
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '0.3.10' })
      })
      // GitHub releases
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: 'v0.3.12' })
      })

      const result = await checkOllamaUpdate()
      expect(result.installed).toBe('0.3.10')
      expect(result.latest).toBe('0.3.12')
      expect(result.updateAvailable).toBe(true)
    })

    it('reports no update when versions match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '0.3.12' })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: 'v0.3.12' })
      })

      const result = await checkOllamaUpdate()
      expect(result.updateAvailable).toBe(false)
    })

    it('handles GitHub API failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '0.3.10' })
      })
      mockFetch.mockRejectedValueOnce(new Error('GitHub unreachable'))

      const result = await checkOllamaUpdate()
      expect(result.installed).toBe('0.3.10')
      expect(result.updateAvailable).toBe(false)
    })
  })

  // ── pullModel ──

  describe('pullModel', () => {
    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, body: null })
      await expect(pullModel('nonexistent')).rejects.toThrow('Failed to pull model')
    })

    it('reports progress during download', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"status":"downloading","total":1000,"completed":500}\n'))
          controller.enqueue(new TextEncoder().encode('{"status":"downloading","total":1000,"completed":1000}\n'))
          controller.enqueue(new TextEncoder().encode('{"status":"success"}\n'))
          controller.close()
        }
      })

      mockFetch.mockResolvedValueOnce({ ok: true, body: stream })

      const progress: number[] = []
      await pullModel('llama3.1', (p) => progress.push(p))

      expect(progress).toEqual([50, 100])
    })

    it('throws on model pull error in stream', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"error":"model not found"}\n'))
          controller.close()
        }
      })

      mockFetch.mockResolvedValueOnce({ ok: true, body: stream })

      await expect(pullModel('bad-model')).rejects.toThrow('Model pull failed')
    })
  })

  // ── deleteModel ──

  describe('deleteModel', () => {
    it('sends DELETE request to Ollama API', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })
      await deleteModel('llama3.1')

      expect(mockFetch).toHaveBeenCalledWith(
        `${OLLAMA_BASE_URL}/api/delete`,
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ name: 'llama3.1' })
        })
      )
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'model not found'
      })

      await expect(deleteModel('nonexistent')).rejects.toThrow('Failed to delete model')
    })
  })
})
