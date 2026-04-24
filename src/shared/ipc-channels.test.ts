import { describe, expect, it } from 'vitest'
import type { IpcChannel } from './ipc-channels'
import { IPC_CHANNELS } from './ipc-channels'

describe('ipc-channels', () => {
  it('should export IPC_CHANNELS object', () => {
    expect(IPC_CHANNELS).toBeDefined()
    expect(typeof IPC_CHANNELS).toBe('object')
  })

  it('should have all channel values as strings', () => {
    for (const [key, value] of Object.entries(IPC_CHANNELS)) {
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  it('should have unique channel values (no duplicates)', () => {
    const values = Object.values(IPC_CHANNELS)
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  it('should have channel values with colon-separated format', () => {
    for (const value of Object.values(IPC_CHANNELS)) {
      expect(value).toMatch(/^[a-z-]+:[a-z-]+/)
    }
  })

  describe('character storage channels', () => {
    it('should define SAVE_CHARACTER channel', () => {
      expect(IPC_CHANNELS.SAVE_CHARACTER).toBe('storage:save-character')
    })

    it('should define LOAD_CHARACTER channel', () => {
      expect(IPC_CHANNELS.LOAD_CHARACTER).toBe('storage:load-character')
    })

    it('should define LOAD_CHARACTERS channel', () => {
      expect(IPC_CHANNELS.LOAD_CHARACTERS).toBe('storage:load-characters')
    })

    it('should define DELETE_CHARACTER channel', () => {
      expect(IPC_CHANNELS.DELETE_CHARACTER).toBe('storage:delete-character')
    })
  })

  describe('campaign storage channels', () => {
    it('should define SAVE_CAMPAIGN channel', () => {
      expect(IPC_CHANNELS.SAVE_CAMPAIGN).toBe('storage:save-campaign')
    })

    it('should define LOAD_CAMPAIGNS channel', () => {
      expect(IPC_CHANNELS.LOAD_CAMPAIGNS).toBe('storage:load-campaigns')
    })

    it('should define DELETE_CAMPAIGN channel', () => {
      expect(IPC_CHANNELS.DELETE_CAMPAIGN).toBe('storage:delete-campaign')
    })
  })

  describe('bastion storage channels', () => {
    it('should define SAVE_BASTION channel', () => {
      expect(IPC_CHANNELS.SAVE_BASTION).toBe('storage:save-bastion')
    })

    it('should define LOAD_BASTIONS channel', () => {
      expect(IPC_CHANNELS.LOAD_BASTIONS).toBe('storage:load-bastions')
    })
  })

  describe('AI DM channels', () => {
    it('should define AI chat stream channels', () => {
      expect(IPC_CHANNELS.AI_CHAT_STREAM).toBe('ai:chat-stream')
      expect(IPC_CHANNELS.AI_CANCEL_STREAM).toBe('ai:cancel-stream')
    })

    it('should define AI configuration channels', () => {
      expect(IPC_CHANNELS.AI_CONFIGURE).toBe('ai:configure')
      expect(IPC_CHANNELS.AI_GET_CONFIG).toBe('ai:get-config')
    })

    it('should define AI Ollama management channels', () => {
      expect(IPC_CHANNELS.AI_DETECT_OLLAMA).toBe('ai:detect-ollama')
      expect(IPC_CHANNELS.AI_PULL_MODEL).toBe('ai:pull-model')
    })
  })

  describe('game data channels', () => {
    it('should define GAME_LOAD_JSON channel', () => {
      expect(IPC_CHANNELS.GAME_LOAD_JSON).toBe('game:load-json')
    })
  })

  describe('plugin channels', () => {
    it('should define PLUGIN_SCAN channel', () => {
      expect(IPC_CHANNELS.PLUGIN_SCAN).toBe('plugin:scan')
    })

    it('should define PLUGIN_ENABLE and PLUGIN_DISABLE channels', () => {
      expect(IPC_CHANNELS.PLUGIN_ENABLE).toBe('plugin:enable')
      expect(IPC_CHANNELS.PLUGIN_DISABLE).toBe('plugin:disable')
    })

    it('should define plugin storage channels', () => {
      expect(IPC_CHANNELS.PLUGIN_STORAGE_GET).toBe('plugin:storage-get')
      expect(IPC_CHANNELS.PLUGIN_STORAGE_SET).toBe('plugin:storage-set')
      expect(IPC_CHANNELS.PLUGIN_STORAGE_DELETE).toBe('plugin:storage-delete')
    })
  })

  describe('audio channels', () => {
    it('should define audio custom track channels', () => {
      expect(IPC_CHANNELS.AUDIO_UPLOAD_CUSTOM).toBe('audio:upload-custom')
      expect(IPC_CHANNELS.AUDIO_LIST_CUSTOM).toBe('audio:list-custom')
      expect(IPC_CHANNELS.AUDIO_DELETE_CUSTOM).toBe('audio:delete-custom')
      expect(IPC_CHANNELS.AUDIO_GET_CUSTOM_PATH).toBe('audio:get-custom-path')
      expect(IPC_CHANNELS.AUDIO_PICK_FILE).toBe('audio:pick-file')
    })
  })

  describe('window control channels', () => {
    it('should define window channels', () => {
      expect(IPC_CHANNELS.TOGGLE_FULLSCREEN).toBe('window:toggle-fullscreen')
      expect(IPC_CHANNELS.IS_FULLSCREEN).toBe('window:is-fullscreen')
      expect(IPC_CHANNELS.OPEN_DEVTOOLS).toBe('window:open-devtools')
    })
  })

  describe('IpcChannel type', () => {
    it('should accept valid channel values', () => {
      const channel: IpcChannel = 'storage:save-character'
      expect(channel).toBe('storage:save-character')
    })
  })

  it('should verify the module can be dynamically imported', async () => {
    const mod = await import('./ipc-channels')
    expect(mod.IPC_CHANNELS).toBeDefined()
  })
})
