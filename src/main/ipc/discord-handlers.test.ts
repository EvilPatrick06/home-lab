import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockHandle,
  mockLoadDiscordConfig,
  mockSaveDiscordConfig,
  mockSendNarrationToDiscord,
  mockSendTestMessage,
  mockValidateDiscordConfig
} = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockLoadDiscordConfig: vi.fn(),
  mockSaveDiscordConfig: vi.fn(),
  mockSendNarrationToDiscord: vi.fn(),
  mockSendTestMessage: vi.fn(),
  mockValidateDiscordConfig: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle }
}))

vi.mock('../../shared/ipc-channels', () => ({
  IPC_CHANNELS: {
    DISCORD_GET_CONFIG: 'discord:get-config',
    DISCORD_SAVE_CONFIG: 'discord:save-config',
    DISCORD_TEST_CONNECTION: 'discord:test-connection',
    DISCORD_SEND_MESSAGE: 'discord:send-message'
  }
}))

vi.mock('../discord-integration', () => ({
  loadDiscordConfig: mockLoadDiscordConfig,
  saveDiscordConfig: mockSaveDiscordConfig,
  sendNarrationToDiscord: mockSendNarrationToDiscord,
  sendTestMessage: mockSendTestMessage,
  validateDiscordConfig: mockValidateDiscordConfig
}))

vi.mock('../log', () => ({ logToFile: vi.fn() }))

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { registerDiscordHandlers } from './discord-handlers'

describe('discord-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all Discord IPC handlers', () => {
    registerDiscordHandlers()
    const channels = mockHandle.mock.calls.map((c) => c[0])
    expect(channels).toContain(IPC_CHANNELS.DISCORD_GET_CONFIG)
    expect(channels).toContain(IPC_CHANNELS.DISCORD_SAVE_CONFIG)
    expect(channels).toContain(IPC_CHANNELS.DISCORD_TEST_CONNECTION)
    expect(channels).toContain(IPC_CHANNELS.DISCORD_SEND_MESSAGE)
  })

  describe('DISCORD_GET_CONFIG handler', () => {
    it('returns masked config on success', async () => {
      mockLoadDiscordConfig.mockResolvedValueOnce({
        enabled: true,
        dmMode: 'webhook',
        webhookUrl: 'https://discord.com/api/webhooks/123/secret',
        botToken: 'my-bot-token',
        channelId: 'chan-1',
        userId: 'user-1'
      })
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_GET_CONFIG)![1]
      const result = await handler()

      expect(result.success).toBe(true)
      // Sensitive fields should be masked
      expect(result.config.webhookUrl).not.toBe('https://discord.com/api/webhooks/123/secret')
      expect(result.config.enabled).toBe(true)
    })

    it('returns error when loadDiscordConfig throws', async () => {
      mockLoadDiscordConfig.mockRejectedValueOnce(new Error('File read error'))
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_GET_CONFIG)![1]
      const result = await handler()

      expect(result.success).toBe(false)
    })
  })

  describe('DISCORD_SAVE_CONFIG handler', () => {
    const validConfig = {
      enabled: true,
      dmMode: 'webhook' as const,
      webhookUrl: 'https://discord.com/api/webhooks/123/secret',
      botToken: '',
      channelId: '',
      userId: ''
    }

    it('validates config before saving', async () => {
      mockValidateDiscordConfig.mockReturnValueOnce({ valid: true })
      mockSaveDiscordConfig.mockResolvedValueOnce(undefined)
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_SAVE_CONFIG)![1]
      const result = await handler({}, validConfig)

      expect(mockValidateDiscordConfig).toHaveBeenCalledWith(validConfig)
      expect(mockSaveDiscordConfig).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('does not save when validation fails', async () => {
      mockValidateDiscordConfig.mockReturnValueOnce({ valid: false, error: 'Webhook URL is required' })
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_SAVE_CONFIG)![1]
      const result = await handler({}, { ...validConfig, webhookUrl: '' })

      expect(mockSaveDiscordConfig).not.toHaveBeenCalled()
      expect(result.success).toBe(false)
    })

    it('returns error when save throws', async () => {
      mockValidateDiscordConfig.mockReturnValueOnce({ valid: true })
      mockSaveDiscordConfig.mockRejectedValueOnce(new Error('Write permission denied'))
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_SAVE_CONFIG)![1]
      const result = await handler({}, validConfig)

      expect(result.success).toBe(false)
    })
  })

  describe('DISCORD_TEST_CONNECTION handler', () => {
    it('delegates to sendTestMessage and returns result', async () => {
      mockSendTestMessage.mockResolvedValueOnce({ success: true, message: 'Test message sent' })
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_TEST_CONNECTION)![1]
      const result = await handler()

      expect(mockSendTestMessage).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('returns error when sendTestMessage throws', async () => {
      mockSendTestMessage.mockRejectedValueOnce(new Error('Invalid webhook URL'))
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_TEST_CONNECTION)![1]
      const result = await handler()

      expect(result.success).toBe(false)
    })
  })

  describe('DISCORD_SEND_MESSAGE handler', () => {
    it('delegates to sendNarrationToDiscord', async () => {
      mockSendNarrationToDiscord.mockResolvedValueOnce({ success: true })
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_SEND_MESSAGE)![1]
      const result = await handler({}, 'The goblin attacks!', 'Dragon Heist')

      expect(mockSendNarrationToDiscord).toHaveBeenCalledWith('The goblin attacks!', 'Dragon Heist')
      expect(result.success).toBe(true)
    })

    it('works without campaign name', async () => {
      mockSendNarrationToDiscord.mockResolvedValueOnce({ success: true })
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_SEND_MESSAGE)![1]
      await handler({}, 'Narration text')

      expect(mockSendNarrationToDiscord).toHaveBeenCalled()
    })

    it('returns error when sendNarrationToDiscord throws', async () => {
      mockSendNarrationToDiscord.mockRejectedValueOnce(new Error('Rate limited'))
      registerDiscordHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.DISCORD_SEND_MESSAGE)![1]
      const result = await handler({}, 'Some text')

      expect(result.success).toBe(false)
    })
  })
})
