import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(() => '/app') },
  ipcMain: { handle: mockHandle }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn()
}))

vi.mock('../../shared/ipc-channels', () => ({
  IPC_CHANNELS: {
    GAME_LOAD_JSON: 'game:load-json'
  }
}))

import { readFile } from 'node:fs/promises'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { registerGameDataHandlers } from './game-data-handlers'

describe('game-data-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register the GAME_LOAD_JSON handler', () => {
    registerGameDataHandlers()

    const registeredChannels = mockHandle.mock.calls.map((call) => call[0])
    expect(registeredChannels).toContain(IPC_CHANNELS.GAME_LOAD_JSON)
  })

  it('should register exactly 1 handler', () => {
    registerGameDataHandlers()
    expect(mockHandle).toHaveBeenCalledTimes(1)
  })

  describe('GAME_LOAD_JSON handler', () => {
    it('should throw on empty path', async () => {
      registerGameDataHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.GAME_LOAD_JSON)![1]

      await expect(handler({}, '')).rejects.toThrow('Invalid path')
    })

    it('should throw on non-string path', async () => {
      registerGameDataHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.GAME_LOAD_JSON)![1]

      await expect(handler({}, 123)).rejects.toThrow('Invalid path')
    })

    it('should load and parse JSON file', async () => {
      const mockData = { classes: [{ name: 'Fighter' }] }
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData))

      registerGameDataHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.GAME_LOAD_JSON)![1]

      const result = await handler({}, 'data/5e/classes.json')
      expect(result).toEqual(mockData)
    })

    it('should strip leading ./ from path', async () => {
      const mockData = { spells: [] }
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData))

      registerGameDataHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.GAME_LOAD_JSON)![1]

      const result = await handler({}, './data/5e/spells.json')
      expect(result).toEqual(mockData)
    })
  })
})
