import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock logger ---
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}))

// --- Mock window.api ---
const mockShowSaveDialog = vi.fn()
const mockShowOpenDialog = vi.fn()
const mockWriteFile = vi.fn()
const mockReadFile = vi.fn()
const mockLoadCharacters = vi.fn()
const mockLoadCampaigns = vi.fn()
const mockLoadBastions = vi.fn()
const mockLoadCustomCreatures = vi.fn()
const mockLoadAllHomebrew = vi.fn()
const mockLoadSettings = vi.fn()
const mockSaveCharacter = vi.fn()
const mockSaveCampaign = vi.fn()
const mockSaveBastion = vi.fn()
const mockSaveCustomCreature = vi.fn()
const mockSaveHomebrew = vi.fn()
const mockSaveSettings = vi.fn()

vi.stubGlobal('window', {
  api: {
    showSaveDialog: mockShowSaveDialog,
    showOpenDialog: mockShowOpenDialog,
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    loadCharacters: mockLoadCharacters,
    loadCampaigns: mockLoadCampaigns,
    loadBastions: mockLoadBastions,
    loadCustomCreatures: mockLoadCustomCreatures,
    loadAllHomebrew: mockLoadAllHomebrew,
    loadSettings: mockLoadSettings,
    saveCharacter: mockSaveCharacter,
    saveCampaign: mockSaveCampaign,
    saveBastion: mockSaveBastion,
    saveCustomCreature: mockSaveCustomCreature,
    saveHomebrew: mockSaveHomebrew,
    saveSettings: mockSaveSettings
  }
})

// --- Mock localStorage ---
const localStorageMap = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageMap.set(key, value),
  key: (index: number) => [...localStorageMap.keys()][index] ?? null,
  get length() {
    return localStorageMap.size
  }
})

import {
  exportAllData,
  exportCampaign,
  exportCharacter,
  importAllData,
  importCampaign,
  importCharacter
} from './import-export'

describe('import-export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMap.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =========================================================================
  // exportCharacter
  // =========================================================================

  describe('exportCharacter', () => {
    it('writes character JSON to selected file path and returns true', async () => {
      mockShowSaveDialog.mockResolvedValue('/tmp/char.json')
      mockWriteFile.mockResolvedValue(undefined)

      const character = { id: 'c1', name: 'Hero', level: 5 }
      const result = await exportCharacter(character)

      expect(result).toBe(true)
      expect(mockShowSaveDialog).toHaveBeenCalledWith({
        title: 'Export Character',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      })
      expect(mockWriteFile).toHaveBeenCalledWith('/tmp/char.json', JSON.stringify(character, null, 2))
    })

    it('returns false when user cancels the save dialog', async () => {
      mockShowSaveDialog.mockResolvedValue(null)

      const result = await exportCharacter({ id: 'c1' })

      expect(result).toBe(false)
      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('returns false when writeFile throws', async () => {
      mockShowSaveDialog.mockResolvedValue('/tmp/char.json')
      mockWriteFile.mockRejectedValue(new Error('disk full'))

      const result = await exportCharacter({ id: 'c1' })

      expect(result).toBe(false)
    })
  })

  // =========================================================================
  // exportCampaign
  // =========================================================================

  describe('exportCampaign', () => {
    it('writes campaign JSON and returns true', async () => {
      mockShowSaveDialog.mockResolvedValue('/tmp/camp.json')
      mockWriteFile.mockResolvedValue(undefined)

      const campaign = { id: 'camp-1', name: 'Lost Mine' }
      const result = await exportCampaign(campaign)

      expect(result).toBe(true)
      expect(mockWriteFile).toHaveBeenCalledWith('/tmp/camp.json', JSON.stringify(campaign, null, 2))
    })

    it('returns false on cancel', async () => {
      mockShowSaveDialog.mockResolvedValue(null)
      expect(await exportCampaign({ id: 'x' })).toBe(false)
    })
  })

  // =========================================================================
  // importCharacter
  // =========================================================================

  describe('importCharacter', () => {
    it('reads and returns a valid character object', async () => {
      const char = { id: 'c1', name: 'Gandalf', gameSystem: 'dnd5e' }
      mockShowOpenDialog.mockResolvedValue('/tmp/char.json')
      mockReadFile.mockResolvedValue(JSON.stringify(char))

      const result = await importCharacter()

      expect(result).toEqual(char)
    })

    it('returns null when dialog is cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue(null)
      expect(await importCharacter()).toBeNull()
    })

    it('returns null when parsed JSON lacks required id field', async () => {
      mockShowOpenDialog.mockResolvedValue('/tmp/bad.json')
      mockReadFile.mockResolvedValue(JSON.stringify({ name: 'X', gameSystem: 'dnd5e' }))

      expect(await importCharacter()).toBeNull()
    })

    it('returns null when parsed JSON lacks required name field', async () => {
      mockShowOpenDialog.mockResolvedValue('/tmp/bad.json')
      mockReadFile.mockResolvedValue(JSON.stringify({ id: 'c1', gameSystem: 'dnd5e' }))

      expect(await importCharacter()).toBeNull()
    })

    it('returns null when parsed JSON lacks required gameSystem field', async () => {
      mockShowOpenDialog.mockResolvedValue('/tmp/bad.json')
      mockReadFile.mockResolvedValue(JSON.stringify({ id: 'c1', name: 'X' }))

      expect(await importCharacter()).toBeNull()
    })

    it('returns null for non-object JSON (e.g., array)', async () => {
      mockShowOpenDialog.mockResolvedValue('/tmp/bad.json')
      mockReadFile.mockResolvedValue('[1,2,3]')

      expect(await importCharacter()).toBeNull()
    })

    it('returns null for invalid JSON (parse error)', async () => {
      mockShowOpenDialog.mockResolvedValue('/tmp/bad.json')
      mockReadFile.mockResolvedValue('not json at all')

      expect(await importCharacter()).toBeNull()
    })
  })

  // =========================================================================
  // importCampaign
  // =========================================================================

  describe('importCampaign', () => {
    it('reads and returns a valid campaign object', async () => {
      const camp = { id: 'camp-1', name: 'Strahd', system: '5e' }
      mockShowOpenDialog.mockResolvedValue('/tmp/camp.json')
      mockReadFile.mockResolvedValue(JSON.stringify(camp))

      expect(await importCampaign()).toEqual(camp)
    })

    it('returns null when dialog is cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue(null)
      expect(await importCampaign()).toBeNull()
    })

    it('returns null when missing required fields (id, name, system)', async () => {
      mockShowOpenDialog.mockResolvedValue('/tmp/bad.json')
      mockReadFile.mockResolvedValue(JSON.stringify({ id: 'x', name: 'Y' }))

      expect(await importCampaign()).toBeNull()
    })

    it('returns null for null parsed value', async () => {
      mockShowOpenDialog.mockResolvedValue('/tmp/bad.json')
      mockReadFile.mockResolvedValue('null')

      expect(await importCampaign()).toBeNull()
    })
  })

  // =========================================================================
  // exportAllData
  // =========================================================================

  describe('exportAllData', () => {
    it('gathers all data and writes backup file', async () => {
      mockLoadCharacters.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }])
      mockLoadCampaigns.mockResolvedValue([{ id: 'camp1' }])
      mockLoadBastions.mockResolvedValue([])
      mockLoadCustomCreatures.mockResolvedValue([{ id: 'cr1' }])
      mockLoadAllHomebrew.mockResolvedValue([])
      mockLoadSettings.mockResolvedValue({ theme: 'dark' })
      mockShowSaveDialog.mockResolvedValue('/tmp/backup.dndbackup')
      mockWriteFile.mockResolvedValue(undefined)

      localStorageMap.set('dnd-vtt-volume', '0.8')
      localStorageMap.set('other-key', 'ignored')

      const result = await exportAllData()

      expect(result).toEqual({
        characters: 2,
        campaigns: 1,
        bastions: 0,
        customCreatures: 1,
        homebrew: 0
      })
      expect(mockWriteFile).toHaveBeenCalledTimes(1)

      const writtenJson = JSON.parse(mockWriteFile.mock.calls[0][1])
      expect(writtenJson.version).toBe(2)
      expect(writtenJson.preferences['dnd-vtt-volume']).toBe('0.8')
      expect(writtenJson.preferences['other-key']).toBeUndefined()
    })

    it('returns null when save dialog is cancelled', async () => {
      mockLoadCharacters.mockResolvedValue([])
      mockLoadCampaigns.mockResolvedValue([])
      mockLoadBastions.mockResolvedValue([])
      mockLoadCustomCreatures.mockResolvedValue([])
      mockLoadAllHomebrew.mockResolvedValue([])
      mockLoadSettings.mockResolvedValue({})
      mockShowSaveDialog.mockResolvedValue(null)

      expect(await exportAllData()).toBeNull()
    })

    it('handles load failures gracefully, using empty arrays', async () => {
      mockLoadCharacters.mockRejectedValue(new Error('fail'))
      mockLoadCampaigns.mockRejectedValue(new Error('fail'))
      mockLoadBastions.mockRejectedValue(new Error('fail'))
      mockLoadCustomCreatures.mockRejectedValue(new Error('fail'))
      mockLoadAllHomebrew.mockRejectedValue(new Error('fail'))
      mockLoadSettings.mockRejectedValue(new Error('fail'))
      mockShowSaveDialog.mockResolvedValue('/tmp/backup.dndbackup')
      mockWriteFile.mockResolvedValue(undefined)

      const result = await exportAllData()

      expect(result).toEqual({
        characters: 0,
        campaigns: 0,
        bastions: 0,
        customCreatures: 0,
        homebrew: 0
      })
    })
  })

  // =========================================================================
  // importAllData
  // =========================================================================

  describe('importAllData', () => {
    it('restores all data from a valid backup file', async () => {
      const backup = {
        version: 2,
        exportedAt: '2025-01-01T00:00:00.000Z',
        characters: [{ id: 'c1' }],
        campaigns: [{ id: 'camp1' }],
        bastions: [{ id: 'b1' }],
        customCreatures: [{ id: 'cr1' }],
        homebrew: [{ id: 'h1' }],
        appSettings: { theme: 'dark' },
        preferences: { 'dnd-vtt-volume': '0.5' }
      }
      mockShowOpenDialog.mockResolvedValue('/tmp/backup.dndbackup')
      mockReadFile.mockResolvedValue(JSON.stringify(backup))
      mockSaveCharacter.mockResolvedValue(undefined)
      mockSaveCampaign.mockResolvedValue(undefined)
      mockSaveBastion.mockResolvedValue(undefined)
      mockSaveCustomCreature.mockResolvedValue(undefined)
      mockSaveHomebrew.mockResolvedValue(undefined)
      mockSaveSettings.mockResolvedValue(undefined)

      const result = await importAllData()

      expect(result).toEqual({
        characters: 1,
        campaigns: 1,
        bastions: 1,
        customCreatures: 1,
        homebrew: 1
      })
      expect(mockSaveCharacter).toHaveBeenCalledWith({ id: 'c1' })
      expect(mockSaveCampaign).toHaveBeenCalledWith({ id: 'camp1' })
      expect(mockSaveBastion).toHaveBeenCalledWith({ id: 'b1' })
      expect(mockSaveCustomCreature).toHaveBeenCalledWith({ id: 'cr1' })
      expect(mockSaveHomebrew).toHaveBeenCalledWith({ id: 'h1' })
      expect(mockSaveSettings).toHaveBeenCalled()
      expect(localStorageMap.get('dnd-vtt-volume')).toBe('0.5')
    })

    it('returns null when dialog is cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue(null)
      expect(await importAllData()).toBeNull()
    })

    it('returns null on malformed JSON', async () => {
      mockShowOpenDialog.mockResolvedValue('/tmp/bad.dndbackup')
      mockReadFile.mockResolvedValue('not json')

      expect(await importAllData()).toBeNull()
    })

    it('returns null on unsupported version', async () => {
      mockShowOpenDialog.mockResolvedValue('/tmp/bad.dndbackup')
      mockReadFile.mockResolvedValue(JSON.stringify({ version: 999, characters: [] }))

      expect(await importAllData()).toBeNull()
    })

    it('handles v1 backups missing customCreatures and homebrew', async () => {
      const v1Backup = {
        version: 1,
        exportedAt: '2024-01-01T00:00:00.000Z',
        characters: [],
        campaigns: [],
        bastions: [],
        appSettings: {},
        preferences: {}
      }
      mockShowOpenDialog.mockResolvedValue('/tmp/v1.dndbackup')
      mockReadFile.mockResolvedValue(JSON.stringify(v1Backup))
      mockSaveSettings.mockResolvedValue(undefined)

      const result = await importAllData()

      expect(result).toEqual({
        characters: 0,
        campaigns: 0,
        bastions: 0,
        customCreatures: 0,
        homebrew: 0
      })
    })

    it('ignores localStorage keys not matching the prefix', async () => {
      const backup = {
        version: 2,
        exportedAt: '2025-01-01T00:00:00.000Z',
        characters: [],
        campaigns: [],
        bastions: [],
        customCreatures: [],
        homebrew: [],
        appSettings: {},
        preferences: { 'other-key': 'value', 'dnd-vtt-theme': 'dark' }
      }
      mockShowOpenDialog.mockResolvedValue('/tmp/backup.dndbackup')
      mockReadFile.mockResolvedValue(JSON.stringify(backup))
      mockSaveSettings.mockResolvedValue(undefined)

      await importAllData()

      expect(localStorageMap.has('other-key')).toBe(false)
      expect(localStorageMap.get('dnd-vtt-theme')).toBe('dark')
    })
  })
})
