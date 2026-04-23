import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { logToFile } from '../log'

export interface DiscordIntegrationConfig {
  enabled: boolean
  botToken: string
  webhookUrl: string
  channelId?: string
  userId?: string
  dmMode: 'webhook' | 'bot-api'
}

interface DiscordMessagePayload {
  content: string
  username?: string
  avatar_url?: string
  embeds?: Array<{
    title?: string
    description?: string
    color?: number
    footer?: { text: string }
    timestamp?: string
  }>
}

const CONFIG_FILE_NAME = 'discord-integration.json'
const MAX_MESSAGE_LENGTH = 2000

let cachedConfig: DiscordIntegrationConfig | null = null

function getConfigPath(): string {
  return join(app.getPath('userData'), CONFIG_FILE_NAME)
}

/**
 * Load Discord integration configuration from secure storage.
 */
export async function loadDiscordConfig(): Promise<DiscordIntegrationConfig> {
  if (cachedConfig) return cachedConfig

  try {
    const configPath = getConfigPath()
    const content = await readFile(configPath, 'utf-8')
    const parsed = JSON.parse(content) as DiscordIntegrationConfig

    cachedConfig = {
      enabled: parsed.enabled ?? false,
      botToken: parsed.botToken ?? '',
      webhookUrl: parsed.webhookUrl ?? '',
      channelId: parsed.channelId,
      userId: parsed.userId,
      dmMode: parsed.dmMode ?? 'webhook'
    }

    return cachedConfig
  } catch {
    // Return default config if file doesn't exist or is corrupted
    cachedConfig = {
      enabled: false,
      botToken: '',
      webhookUrl: '',
      dmMode: 'webhook'
    }
    return cachedConfig
  }
}

/**
 * Save Discord integration configuration to secure storage.
 * Special values 'keep' mean to preserve the existing value.
 */
export async function saveDiscordConfig(config: DiscordIntegrationConfig): Promise<void> {
  const configPath = getConfigPath()
  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })

  // Load existing config to handle 'keep' values
  const existingConfig = await loadDiscordConfig()

  const finalConfig: DiscordIntegrationConfig = {
    enabled: config.enabled,
    botToken: config.botToken === 'keep' ? existingConfig.botToken : config.botToken,
    webhookUrl: config.webhookUrl === 'keep' ? existingConfig.webhookUrl : config.webhookUrl,
    channelId: config.channelId,
    userId: config.userId,
    dmMode: config.dmMode
  }

  await writeFile(
    configPath,
    JSON.stringify(
      {
        enabled: finalConfig.enabled,
        botToken: finalConfig.botToken,
        webhookUrl: finalConfig.webhookUrl,
        channelId: finalConfig.channelId,
        userId: finalConfig.userId,
        dmMode: finalConfig.dmMode
      },
      null,
      2
    ),
    'utf-8'
  )

  cachedConfig = finalConfig
}

/**
 * Validate Discord configuration.
 */
export function validateDiscordConfig(config: DiscordIntegrationConfig): {
  valid: boolean
  error?: string
} {
  if (!config.enabled) {
    return { valid: true }
  }

  if (config.dmMode === 'webhook') {
    if (!config.webhookUrl?.trim()) {
      return { valid: false, error: 'Webhook URL is required for webhook mode' }
    }
    if (!config.webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return { valid: false, error: 'Invalid Discord webhook URL format' }
    }
  }

  if (config.dmMode === 'bot-api') {
    if (!config.botToken?.trim()) {
      return { valid: false, error: 'Bot token is required for bot API mode' }
    }
    if (!config.userId?.trim()) {
      return { valid: false, error: 'User ID is required for bot API DM mode' }
    }
  }

  return { valid: true }
}

/**
 * Get a preview of the configuration (with sensitive data masked).
 */
export function getDiscordConfigPreview(config: DiscordIntegrationConfig): {
  enabled: boolean
  dmMode: string
  webhookConfigured: boolean
  botConfigured: boolean
  userConfigured: boolean
} {
  return {
    enabled: config.enabled,
    dmMode: config.dmMode,
    webhookConfigured: !!config.webhookUrl?.trim(),
    botConfigured: !!config.botToken?.trim(),
    userConfigured: !!config.userId?.trim()
  }
}

/**
 * Send a message via Discord webhook.
 */
async function sendViaWebhook(webhookUrl: string, payload: DiscordMessagePayload): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Discord webhook failed: ${response.status} ${errorText}`)
  }
}

/**
 * Send a DM via Discord bot API.
 * Note: This requires the bot to be in a shared guild with the user
 * and have proper permissions.
 */
async function sendViaBotApi(botToken: string, userId: string, content: string): Promise<void> {
  // First, create a DM channel
  const dmResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ recipient_id: userId })
  })

  if (!dmResponse.ok) {
    const errorText = await dmResponse.text().catch(() => 'Unknown error')
    throw new Error(`Discord DM channel creation failed: ${dmResponse.status} ${errorText}`)
  }

  const dmChannel = (await dmResponse.json()) as { id: string }

  // Then send the message
  const messageResponse = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  })

  if (!messageResponse.ok) {
    const errorText = await messageResponse.text().catch(() => 'Unknown error')
    throw new Error(`Discord message send failed: ${messageResponse.status} ${errorText}`)
  }
}

/**
 * Clean narrative text for Discord by removing technical metadata tags.
 */
export function cleanTextForDiscord(text: string): string {
  // Remove DM_ACTIONS blocks
  let cleaned = text.replace(/\s*\[DM_ACTIONS\][\s\S]*?\[\/DM_ACTIONS\]\s*/g, '')

  // Remove STAT_CHANGES blocks
  cleaned = cleaned.replace(/\s*\[STAT_CHANGES\][\s\S]*?\[\/STAT_CHANGES\]\s*/g, '')

  // Remove RULE_CITATION blocks
  cleaned = cleaned.replace(/\s*\[RULE_CITATION[^\]]*\][\s\S]*?\[\/RULE_CITATION\]\s*/g, '')

  // Remove FILE_READ tags
  cleaned = cleaned.replace(/\s*\[FILE_READ\][\s\S]*?\[\/FILE_READ\]\s*/g, '')

  // Remove WEB_SEARCH tags
  cleaned = cleaned.replace(/\s*\[WEB_SEARCH\][\s\S]*?\[\/WEB_SEARCH\]\s*/g, '')

  // Remove PROVIDER_CONTEXT blocks
  cleaned = cleaned.replace(/\s*\[PROVIDER_CONTEXT\][\s\S]*?\[\/PROVIDER_CONTEXT\]\s*/g, '')

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  return cleaned.trim()
}

/**
 * Truncate text to Discord's message limit with an indicator.
 */
function truncateForDiscord(text: string, maxLength: number = MAX_MESSAGE_LENGTH): string {
  if (text.length <= maxLength) return text

  const truncateIndicator = '\n\n...[message truncated]'
  const availableLength = maxLength - truncateIndicator.length
  return text.slice(0, availableLength) + truncateIndicator
}

/**
 * Send AI DM narration to Discord.
 * Returns success status and any error message.
 */
export async function sendNarrationToDiscord(
  narrativeText: string,
  campaignName?: string
): Promise<{ success: boolean; error?: string }> {
  const config = await loadDiscordConfig()

  if (!config.enabled) {
    return { success: true }
  }

  const validation = validateDiscordConfig(config)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  try {
    // Clean the text for Discord
    const cleanedText = cleanTextForDiscord(narrativeText)

    if (!cleanedText.trim()) {
      return { success: true }
    }

    const truncatedText = truncateForDiscord(cleanedText)

    if (config.dmMode === 'webhook' && config.webhookUrl) {
      const payload: DiscordMessagePayload = {
        content: truncatedText,
        username: campaignName ? `AI DM - ${campaignName}` : 'AI DM',
        avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
      }

      await sendViaWebhook(config.webhookUrl, payload)
      logToFile('info', '[Discord] Narration sent via webhook')
    } else if (config.dmMode === 'bot-api' && config.botToken && config.userId) {
      const prefix = campaignName ? `**${campaignName}**\n\n` : ''
      await sendViaBotApi(config.botToken, config.userId, prefix + truncatedText)
      logToFile('info', '[Discord] Narration sent via bot API')
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logToFile('error', `[Discord] Failed to send narration: ${errorMessage}`)
    return { success: false, error: errorMessage }
  }
}

/**
 * Send a test message to verify Discord integration is working.
 */
export async function sendTestMessage(): Promise<{ success: boolean; error?: string }> {
  const config = await loadDiscordConfig()

  if (!config.enabled) {
    return { success: false, error: 'Discord integration is not enabled' }
  }

  const validation = validateDiscordConfig(config)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  const testMessage =
    '**Test Message from VTT AI DM**\n\n' +
    'Your Discord integration is configured correctly! ' +
    'AI narration will appear here when the DM responds to players.'

  return await sendNarrationToDiscord(testMessage, 'Test')
}

/**
 * Reset cached config (useful for testing).
 */
export function clearDiscordConfigCache(): void {
  cachedConfig = null
}
