import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockHandle, mockSendInitiativeToPi, mockSendGameStateToPi, mockStartSyncReceiver } = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockSendInitiativeToPi: vi.fn(),
  mockSendGameStateToPi: vi.fn(),
  mockStartSyncReceiver: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle }
}))

vi.mock('../../shared/ipc-channels', () => ({
  IPC_CHANNELS: {
    BMO_SYNC_INITIATIVE: 'bmo:sync-initiative',
    BMO_SYNC_SEND_STATE: 'bmo:sync-send-state'
  }
}))

vi.mock('../bmo-bridge', () => ({
  sendInitiativeToPi: mockSendInitiativeToPi,
  sendGameStateToPi: mockSendGameStateToPi,
  startSyncReceiver: mockStartSyncReceiver,
  stopSyncReceiver: vi.fn()
}))

vi.mock('../log', () => ({ logToFile: vi.fn() }))

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { registerBmoSyncHandlers } from './bmo-sync-handlers'

describe('bmo-sync-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts the sync receiver on registration', () => {
    registerBmoSyncHandlers()
    expect(mockStartSyncReceiver).toHaveBeenCalledOnce()
  })

  it('registers the BMO_SYNC_INITIATIVE handler', () => {
    registerBmoSyncHandlers()
    const channels = mockHandle.mock.calls.map((c) => c[0])
    expect(channels).toContain(IPC_CHANNELS.BMO_SYNC_INITIATIVE)
  })

  it('registers the BMO_SYNC_SEND_STATE handler', () => {
    registerBmoSyncHandlers()
    const channels = mockHandle.mock.calls.map((c) => c[0])
    expect(channels).toContain(IPC_CHANNELS.BMO_SYNC_SEND_STATE)
  })

  describe('BMO_SYNC_INITIATIVE handler', () => {
    it('delegates to sendInitiativeToPi and returns result', async () => {
      mockSendInitiativeToPi.mockResolvedValueOnce({ ok: true })
      registerBmoSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.BMO_SYNC_INITIATIVE)![1]
      const initiative = { entries: [], currentIndex: 0, round: 1 }

      const result = await handler({}, initiative)
      expect(mockSendInitiativeToPi).toHaveBeenCalledWith(initiative)
      expect(result).toEqual({ ok: true })
    })

    it('returns error object when sendInitiativeToPi throws', async () => {
      mockSendInitiativeToPi.mockRejectedValueOnce(new Error('Network failure'))
      registerBmoSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.BMO_SYNC_INITIATIVE)![1]
      const result = await handler({}, {})
      expect(result).toMatchObject({ ok: false })
    })

    it('handles null payload without throwing', async () => {
      mockSendInitiativeToPi.mockResolvedValueOnce({ ok: true })
      registerBmoSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.BMO_SYNC_INITIATIVE)![1]
      const result = await handler({}, null)
      expect(mockSendInitiativeToPi).toHaveBeenCalledWith(null)
      expect(result).toEqual({ ok: true })
    })
  })

  describe('BMO_SYNC_SEND_STATE handler', () => {
    it('delegates to sendGameStateToPi and returns result', async () => {
      mockSendGameStateToPi.mockResolvedValueOnce({ ok: true })
      registerBmoSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.BMO_SYNC_SEND_STATE)![1]
      const state = { mapName: 'Dungeon', partyHp: [] }

      const result = await handler({}, state)
      expect(mockSendGameStateToPi).toHaveBeenCalledWith(state)
      expect(result).toEqual({ ok: true })
    })

    it('returns error object when sendGameStateToPi throws', async () => {
      mockSendGameStateToPi.mockRejectedValueOnce(new Error('Pi unreachable'))
      registerBmoSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.BMO_SYNC_SEND_STATE)![1]
      const result = await handler({}, {})
      expect(result).toMatchObject({ ok: false })
    })

    it('handles null state payload without throwing', async () => {
      mockSendGameStateToPi.mockResolvedValueOnce({ ok: true })
      registerBmoSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.BMO_SYNC_SEND_STATE)![1]
      await handler({}, null)
      expect(mockSendGameStateToPi).toHaveBeenCalledWith(null)
    })
  })
})
