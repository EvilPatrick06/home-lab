// Discord Integration Module
// Provides secure storage and API for Discord bot/webhook integration

export {
  cleanTextForDiscord,
  clearDiscordConfigCache,
  type DiscordIntegrationConfig,
  getDiscordConfigPreview,
  loadDiscordConfig,
  saveDiscordConfig,
  sendNarrationToDiscord,
  sendTestMessage,
  validateDiscordConfig
} from './discord-service'
