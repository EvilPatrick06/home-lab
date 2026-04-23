import { describe, expect, it } from 'vitest'
import {
  cleanTextForDiscord,
  type DiscordIntegrationConfig,
  getDiscordConfigPreview,
  validateDiscordConfig
} from './discord-service'

describe('Discord Integration Service', () => {
  describe('validateDiscordConfig', () => {
    it('returns valid for disabled config', () => {
      const config: DiscordIntegrationConfig = {
        enabled: false,
        botToken: '',
        webhookUrl: '',
        dmMode: 'webhook'
      }
      const result = validateDiscordConfig(config)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('requires webhook URL for webhook mode', () => {
      const config: DiscordIntegrationConfig = {
        enabled: true,
        botToken: '',
        webhookUrl: '',
        dmMode: 'webhook'
      }
      const result = validateDiscordConfig(config)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Webhook URL is required')
    })

    it('validates webhook URL format', () => {
      const config: DiscordIntegrationConfig = {
        enabled: true,
        botToken: '',
        webhookUrl: 'https://example.com/webhook',
        dmMode: 'webhook'
      }
      const result = validateDiscordConfig(config)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid Discord webhook URL format')
    })

    it('accepts valid webhook URL', () => {
      const config: DiscordIntegrationConfig = {
        enabled: true,
        botToken: '',
        webhookUrl: 'https://discord.com/api/webhooks/123456789/abcdef',
        dmMode: 'webhook'
      }
      const result = validateDiscordConfig(config)
      expect(result.valid).toBe(true)
    })

    it('requires bot token for bot-api mode', () => {
      const config: DiscordIntegrationConfig = {
        enabled: true,
        botToken: '',
        webhookUrl: '',
        dmMode: 'bot-api',
        userId: '123456'
      }
      const result = validateDiscordConfig(config)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Bot token is required')
    })

    it('requires user ID for bot-api mode', () => {
      const config: DiscordIntegrationConfig = {
        enabled: true,
        botToken: 'my-token',
        webhookUrl: '',
        dmMode: 'bot-api'
      }
      const result = validateDiscordConfig(config)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('User ID is required')
    })

    it('accepts valid bot-api config', () => {
      const config: DiscordIntegrationConfig = {
        enabled: true,
        botToken: 'my-token',
        webhookUrl: '',
        dmMode: 'bot-api',
        userId: '123456789'
      }
      const result = validateDiscordConfig(config)
      expect(result.valid).toBe(true)
    })
  })

  describe('getDiscordConfigPreview', () => {
    it('returns preview with masked values', () => {
      const config: DiscordIntegrationConfig = {
        enabled: true,
        botToken: 'secret-token',
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
        dmMode: 'webhook',
        userId: '123456'
      }
      const preview = getDiscordConfigPreview(config)
      expect(preview.enabled).toBe(true)
      expect(preview.dmMode).toBe('webhook')
      expect(preview.webhookConfigured).toBe(true)
      expect(preview.botConfigured).toBe(true)
      expect(preview.userConfigured).toBe(true)
    })

    it('shows unconfigured when values are empty', () => {
      const config: DiscordIntegrationConfig = {
        enabled: false,
        botToken: '',
        webhookUrl: '',
        dmMode: 'webhook'
      }
      const preview = getDiscordConfigPreview(config)
      expect(preview.enabled).toBe(false)
      expect(preview.webhookConfigured).toBe(false)
      expect(preview.botConfigured).toBe(false)
      expect(preview.userConfigured).toBe(false)
    })
  })

  describe('cleanTextForDiscord', () => {
    it('removes DM_ACTIONS blocks', () => {
      const text = 'Hello world\n[DM_ACTIONS]{"actions":[]}[/DM_ACTIONS]\nMore text'
      const cleaned = cleanTextForDiscord(text)
      expect(cleaned).not.toContain('[DM_ACTIONS]')
      expect(cleaned).not.toContain('actions')
      expect(cleaned).toContain('Hello world')
      expect(cleaned).toContain('More text')
    })

    it('removes STAT_CHANGES blocks', () => {
      const text = 'The dragon attacks!\n[STAT_CHANGES]{"changes":[]}[/STAT_CHANGES]\nYou take damage.'
      const cleaned = cleanTextForDiscord(text)
      expect(cleaned).not.toContain('[STAT_CHANGES]')
      expect(cleaned).not.toContain('changes')
      expect(cleaned).toContain('The dragon attacks!')
      expect(cleaned).toContain('You take damage.')
    })

    it('removes RULE_CITATION blocks', () => {
      const text =
        'You cast a spell.\n[RULE_CITATION source="PHB" rule="Spellcasting"]See page 201[/RULE_CITATION]\nIt works!'
      const cleaned = cleanTextForDiscord(text)
      expect(cleaned).not.toContain('[RULE_CITATION')
      expect(cleaned).not.toContain('PHB')
      expect(cleaned).toContain('You cast a spell.')
      expect(cleaned).toContain('It works!')
    })

    it('removes FILE_READ tags', () => {
      const text = 'Reading file:\n[FILE_READ]path/to/file.txt[/FILE_READ]\nContent loaded.'
      const cleaned = cleanTextForDiscord(text)
      expect(cleaned).not.toContain('[FILE_READ]')
      expect(cleaned).toContain('Reading file:')
      expect(cleaned).toContain('Content loaded.')
    })

    it('removes WEB_SEARCH tags', () => {
      const text = 'Searching:\n[WEB_SEARCH]query here[/WEB_SEARCH]\nResults found.'
      const cleaned = cleanTextForDiscord(text)
      expect(cleaned).not.toContain('[WEB_SEARCH]')
      expect(cleaned).toContain('Searching:')
      expect(cleaned).toContain('Results found.')
    })

    it('removes PROVIDER_CONTEXT blocks', () => {
      const text = 'Hello\n[PROVIDER_CONTEXT]Ollama context[/PROVIDER_CONTEXT]\nWorld'
      const cleaned = cleanTextForDiscord(text)
      expect(cleaned).not.toContain('[PROVIDER_CONTEXT]')
      expect(cleaned).not.toContain('Ollama')
      expect(cleaned).toContain('Hello')
      expect(cleaned).toContain('World')
    })

    it('handles multiple tag types', () => {
      const text = `
The party enters the dungeon.
[DM_ACTIONS]{"actions":[{"action":"place_token"}]}[/DM_ACTIONS]
[STAT_CHANGES]{"changes":[]}[/STAT_CHANGES]
The room is dark and foreboding.
[RULE_CITATION source="DMG" rule="Darkness"]See darkness rules[/RULE_CITATION]
What do you do?
      `.trim()
      const cleaned = cleanTextForDiscord(text)
      expect(cleaned).not.toContain('[DM_ACTIONS]')
      expect(cleaned).not.toContain('[STAT_CHANGES]')
      expect(cleaned).not.toContain('[RULE_CITATION')
      expect(cleaned).toContain('The party enters the dungeon.')
      expect(cleaned).toContain('The room is dark and foreboding.')
      expect(cleaned).toContain('What do you do?')
    })

    it('handles empty text', () => {
      const cleaned = cleanTextForDiscord('')
      expect(cleaned).toBe('')
    })

    it('handles text with no tags', () => {
      const text = 'Just plain narrative text.'
      const cleaned = cleanTextForDiscord(text)
      expect(cleaned).toBe(text)
    })

    it('cleans up excessive whitespace', () => {
      const text = 'Hello\n\n\n\n\nWorld'
      const cleaned = cleanTextForDiscord(text)
      expect(cleaned).toBe('Hello\n\nWorld')
    })
  })
})
