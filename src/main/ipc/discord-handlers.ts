import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  type DiscordIntegrationConfig,
  loadDiscordConfig,
  saveDiscordConfig,
  sendNarrationToDiscord,
  sendTestMessage,
  validateDiscordConfig
} from '../discord-integration'
import { logToFile } from '../log'

export function registerDiscordHandlers(): void {
  // Get current Discord integration configuration
  ipcMain.handle(IPC_CHANNELS.DISCORD_GET_CONFIG, async () => {
    try {
      const config = await loadDiscordConfig()
      return {
        success: true,
        config: {
          enabled: config.enabled,
          dmMode: config.dmMode,
          webhookUrl: config.webhookUrl ? '[configured]' : '',
          botToken: config.botToken ? '[configured]' : '',
          channelId: config.channelId ?? '',
          userId: config.userId ?? ''
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logToFile('error', `[Discord IPC] Failed to load config: ${message}`)
      return { success: false, error: message }
    }
  })

  // Save Discord integration configuration
  ipcMain.handle(IPC_CHANNELS.DISCORD_SAVE_CONFIG, async (_event, config: DiscordIntegrationConfig) => {
    try {
      // Validate before saving
      const validation = validateDiscordConfig(config)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      await saveDiscordConfig(config)
      logToFile('info', '[Discord IPC] Configuration saved')
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logToFile('error', `[Discord IPC] Failed to save config: ${message}`)
      return { success: false, error: message }
    }
  })

  // Test Discord connection
  ipcMain.handle(IPC_CHANNELS.DISCORD_TEST_CONNECTION, async () => {
    try {
      const result = await sendTestMessage()
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logToFile('error', `[Discord IPC] Test connection failed: ${message}`)
      return { success: false, error: message }
    }
  })

  // Send a message to Discord (manual trigger)
  ipcMain.handle(IPC_CHANNELS.DISCORD_SEND_MESSAGE, async (_event, text: string, campaignName?: string) => {
    try {
      const result = await sendNarrationToDiscord(text, campaignName)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logToFile('error', `[Discord IPC] Send message failed: ${message}`)
      return { success: false, error: message }
    }
  })
}
