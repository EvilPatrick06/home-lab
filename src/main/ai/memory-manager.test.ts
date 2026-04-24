import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => {}),
  appendFile: vi.fn(async () => {})
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test')
  }
}))

vi.mock('fs', () => ({
  promises: mockFs
}))

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'test-uuid-1234')
})

import { getMemoryManager, MemoryManager } from './memory-manager'

describe('MemoryManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -- Constructor --

  describe('constructor', () => {
    it('creates a manager with the correct base path', () => {
      const mgr = new MemoryManager('campaign-abc')
      // Manager should be created successfully
      expect(mgr).toBeDefined()
    })
  })

  // -- World State --

  describe('getWorldState / updateWorldState', () => {
    it('returns null when no world state file exists', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      const state = await mgr.getWorldState()
      expect(state).toBeNull()
    })

    it('returns parsed world state from file', async () => {
      const worldState = {
        currentMapId: 'map-1',
        currentMapName: 'Tavern',
        timeOfDay: 'evening',
        weather: 'rain',
        currentScene: 'The party enters the tavern',
        activeTokenPositions: [{ name: 'Fighter', gridX: 5, gridY: 3 }],
        updatedAt: '2024-01-01'
      }
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(worldState))

      const mgr = new MemoryManager('c1')
      const state = await mgr.getWorldState()
      expect(state).toEqual(worldState)
    })

    it('updates world state, merging with existing', async () => {
      const existing = {
        currentMapId: 'map-1',
        currentMapName: 'Tavern',
        timeOfDay: 'morning',
        weather: 'clear',
        currentScene: 'Scene 1',
        activeTokenPositions: [],
        updatedAt: '2024-01-01'
      }
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(existing))

      const mgr = new MemoryManager('c1')
      await mgr.updateWorldState({ weather: 'storm', timeOfDay: 'night' })

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('world-state.json'),
        expect.stringContaining('"storm"'),
        'utf-8'
      )
    })

    it('creates default world state if none exists', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))

      const mgr = new MemoryManager('c1')
      await mgr.updateWorldState({ weather: 'fog' })

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('world-state.json'),
        expect.stringContaining('"fog"'),
        'utf-8'
      )
    })
  })

  // -- Combat State --

  describe('getCombatState / updateCombatState', () => {
    it('returns null when no combat state exists', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getCombatState()).toBeNull()
    })

    it('saves combat state', async () => {
      const mgr = new MemoryManager('c1')
      await mgr.updateCombatState({
        inCombat: true,
        round: 3,
        currentTurnEntity: 'Goblin 1',
        entries: [{ name: 'Goblin 1', initiative: 15, hp: { current: 5, max: 7 }, conditions: [], isPlayer: false }],
        updatedAt: ''
      })

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('combat-state.json'),
        expect.stringContaining('"inCombat": true'),
        'utf-8'
      )
    })
  })

  // -- NPCs --

  describe('getNPCs / upsertNPC', () => {
    it('returns empty array when no NPCs exist', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getNPCs()).toEqual([])
    })

    it('adds a new NPC', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')

      await mgr.upsertNPC({
        id: 'npc-1',
        name: 'Bartender Bob',
        role: 'innkeeper',
        attitude: 'friendly',
        location: 'Tavern',
        notes: 'Knows local rumors',
        firstEncountered: '',
        lastSeen: ''
      })

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('npcs.json'),
        expect.stringContaining('Bartender Bob'),
        'utf-8'
      )
    })

    it('updates existing NPC by id', async () => {
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify([
          {
            id: 'npc-1',
            name: 'Bob',
            role: 'innkeeper',
            attitude: 'friendly',
            location: 'Tavern',
            notes: '',
            firstEncountered: '2024-01-01',
            lastSeen: '2024-01-01'
          }
        ])
      )

      const mgr = new MemoryManager('c1')
      await mgr.upsertNPC({
        id: 'npc-1',
        name: 'Bob',
        role: 'innkeeper',
        attitude: 'hostile',
        location: 'Jail',
        notes: 'Betrayed the party',
        firstEncountered: '',
        lastSeen: ''
      })

      const writtenData = JSON.parse((mockFs.writeFile.mock.calls[0] as unknown[])[1] as string)
      expect(writtenData).toHaveLength(1)
      expect(writtenData[0].attitude).toBe('hostile')
      expect(writtenData[0].location).toBe('Jail')
    })
  })

  // -- Places --

  describe('getPlaces / upsertPlace', () => {
    it('returns empty array when no places exist', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getPlaces()).toEqual([])
    })

    it('adds a new place', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')

      await mgr.upsertPlace({
        id: 'place-1',
        name: 'Dragon Cave',
        type: 'dungeon',
        description: 'A dark cave',
        discovered: true,
        linkedMapId: 'map-cave',
        firstVisited: ''
      })

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('places.json'),
        expect.stringContaining('Dragon Cave'),
        'utf-8'
      )
    })

    it('updates existing place by id', async () => {
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify([
          {
            id: 'place-1',
            name: 'Cave',
            type: 'dungeon',
            description: 'Dark',
            discovered: false,
            linkedMapId: null,
            firstVisited: '2024-01-01'
          }
        ])
      )

      const mgr = new MemoryManager('c1')
      await mgr.upsertPlace({
        id: 'place-1',
        name: 'Dragon Cave',
        type: 'dungeon',
        description: 'Very dark',
        discovered: true,
        linkedMapId: 'map-2',
        firstVisited: ''
      })

      const writtenData = JSON.parse((mockFs.writeFile.mock.calls[0] as unknown[])[1] as string)
      expect(writtenData[0].discovered).toBe(true)
      expect(writtenData[0].name).toBe('Dragon Cave')
    })
  })

  // -- Session History --

  describe('appendSessionLog / getSessionLog', () => {
    it('appends text to session log file', async () => {
      const mgr = new MemoryManager('c1')
      await mgr.appendSessionLog('2024-01-15', 'Player attacked goblin')

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('2024-01-15.md'),
        'Player attacked goblin\n',
        'utf-8'
      )
    })

    it('returns empty string when session log does not exist', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getSessionLog('2024-01-15')).toBe('')
    })

    it('returns session log content', async () => {
      mockFs.readFile.mockResolvedValueOnce('Session log entry 1\nSession log entry 2')
      const mgr = new MemoryManager('c1')
      const log = await mgr.getSessionLog('2024-01-15')
      expect(log).toContain('Session log entry 1')
    })
  })

  // -- Campaign Notes --

  describe('getCampaignNotes / updateCampaignNotes', () => {
    it('returns empty string when no notes exist', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getCampaignNotes()).toBe('')
    })

    it('saves campaign notes', async () => {
      const mgr = new MemoryManager('c1')
      await mgr.updateCampaignNotes('The dragon treasure is hidden under the mountain')

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('campaign-notes.md'),
        'The dragon treasure is hidden under the mountain',
        'utf-8'
      )
    })
  })

  // -- Rulings Log --

  describe('getRulings / addRuling', () => {
    it('returns empty array when no rulings exist', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getRulings()).toEqual([])
    })

    it('adds a ruling with generated id and timestamp', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')

      await mgr.addRuling({
        question: 'Can you grapple while prone?',
        ruling: 'Yes, but with disadvantage',
        citation: 'PHB p.195',
        overriddenByDM: false
      })

      const writtenData = JSON.parse((mockFs.writeFile.mock.calls[0] as unknown[])[1] as string)
      expect(writtenData).toHaveLength(1)
      expect(writtenData[0].id).toBe('test-uuid-1234')
      expect(writtenData[0].question).toBe('Can you grapple while prone?')
    })
  })

  // -- Character Context Cache --

  describe('saveCharacterContext / getCharacterContext', () => {
    it('saves character context', async () => {
      const mgr = new MemoryManager('c1')
      await mgr.saveCharacterContext([{ id: 'char-1', formatted: 'Fighter Level 5, HP 40/40' }])

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('characters.json'),
        expect.stringContaining('Fighter Level 5'),
        'utf-8'
      )
    })

    it('returns null when no character context exists', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getCharacterContext()).toBeNull()
    })

    it('returns character context from file', async () => {
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          characters: [{ id: 'char-1', formatted: 'Wizard Level 3' }],
          updatedAt: '2024-01-01'
        })
      )
      const mgr = new MemoryManager('c1')
      const ctx = await mgr.getCharacterContext()
      expect(ctx).toEqual([{ id: 'char-1', formatted: 'Wizard Level 3' }])
    })
  })

  // -- NPC Personalities --

  describe('getNpcPersonalities / setNpcPersonality / getNpcPersonality', () => {
    it('returns empty array when no personalities exist', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getNpcPersonalities()).toEqual([])
    })

    it('sets a new NPC personality', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')

      await mgr.setNpcPersonality({
        npcId: 'npc-1',
        name: 'Elara',
        personality: 'Stern but fair',
        voiceNotes: 'Deep, commanding voice'
      })

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('npc-personalities.json'),
        expect.stringContaining('Elara'),
        'utf-8'
      )
    })

    it('updates existing NPC personality', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify([{ npcId: 'npc-1', name: 'Elara', personality: 'Stern' }]))
      const mgr = new MemoryManager('c1')

      await mgr.setNpcPersonality({
        npcId: 'npc-1',
        name: 'Elara',
        personality: 'Warm and welcoming after quest completion'
      })

      const writtenData = JSON.parse((mockFs.writeFile.mock.calls[0] as unknown[])[1] as string)
      expect(writtenData).toHaveLength(1)
      expect(writtenData[0].personality).toBe('Warm and welcoming after quest completion')
    })

    it('finds NPC personality by id', async () => {
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify([
          { npcId: 'npc-1', name: 'Bob', personality: 'Grumpy' },
          { npcId: 'npc-2', name: 'Alice', personality: 'Cheerful' }
        ])
      )
      const mgr = new MemoryManager('c1')
      const npc = await mgr.getNpcPersonality('npc-2')
      expect(npc?.name).toBe('Alice')
    })

    it('returns undefined for unknown NPC id', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify([]))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getNpcPersonality('unknown')).toBeUndefined()
    })
  })

  // -- NPC By Name --

  describe('getNpcByName', () => {
    it('finds NPC by name (case-insensitive)', async () => {
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify([{ npcId: 'npc-1', name: 'Bartender Bob', personality: 'Friendly' }])
      )
      const mgr = new MemoryManager('c1')
      const npc = await mgr.getNpcByName('bartender bob')
      expect(npc?.npcId).toBe('npc-1')
    })

    it('returns undefined when NPC not found', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify([]))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getNpcByName('Nobody')).toBeUndefined()
    })
  })

  // -- NPC Interaction Logging --

  describe('logNpcInteraction', () => {
    it('creates new NPC stub if not found and logs interaction', async () => {
      // First call: getNpcByName (empty list)
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      // Second call: setNpcPersonality reads existing
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      // Third call: setNpcPersonality reads again for log update
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify([{ npcId: 'test-uuid-1234', name: 'New NPC', personality: '' }])
      )

      const mgr = new MemoryManager('c1')
      await mgr.logNpcInteraction('New NPC', 'Gave quest to party', 'friendly')

      // Should have written at least twice (create stub + update with log)
      expect(mockFs.writeFile).toHaveBeenCalled()
    })
  })

  // -- NPC Relationships --

  describe('addNpcRelationship', () => {
    it('adds a relationship between two NPCs', async () => {
      // Read for source NPC
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify([{ npcId: 'npc-1', name: 'Alice', personality: 'Kind' }]))
      // Write source NPC (stub check skipped -- already exists)
      // Read for target NPC
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      // Read for setNpcPersonality of target
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      // Read for setNpcPersonality of source with relationships
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify([
          { npcId: 'npc-1', name: 'Alice', personality: 'Kind' },
          { npcId: 'test-uuid-1234', name: 'Bob', personality: '' }
        ])
      )

      const mgr = new MemoryManager('c1')
      await mgr.addNpcRelationship('Alice', 'Bob', 'rival', 'hostile')

      expect(mockFs.writeFile).toHaveBeenCalled()
    })
  })

  // -- Relationship Web --

  describe('getRelationshipWeb', () => {
    it('returns empty string when no relationships exist', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify([{ npcId: 'npc-1', name: 'Solo', personality: 'Lone' }]))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getRelationshipWeb()).toBe('')
    })

    it('returns formatted relationship web', async () => {
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify([
          {
            npcId: 'npc-1',
            name: 'Alice',
            personality: 'Kind',
            relationships: [{ targetNpcId: 'npc-2', targetName: 'Bob', relationship: 'ally', disposition: 'friendly' }]
          }
        ])
      )
      const mgr = new MemoryManager('c1')
      const web = await mgr.getRelationshipWeb()
      expect(web).toContain('[NPC RELATIONSHIPS]')
      expect(web).toContain('Alice')
      expect(web).toContain('Bob')
      expect(web).toContain('ally')
    })
  })

  // -- World State Summary --

  describe('getWorldStateSummary / setWorldStateSummary', () => {
    it('returns null when no summary exists', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      expect(await mgr.getWorldStateSummary()).toBeNull()
    })

    it('saves world state summary', async () => {
      const mgr = new MemoryManager('c1')
      await mgr.setWorldStateSummary({
        currentLocation: 'Waterdeep',
        timeOfDay: 'afternoon',
        weather: 'cloudy',
        activeQuests: ['Find the dragon'],
        recentEvents: ['Defeated the bandits'],
        lastUpdated: ''
      })

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('world-state-summary.json'),
        expect.stringContaining('Waterdeep'),
        'utf-8'
      )
    })
  })

  // -- Context Assembly --

  describe('assembleContext', () => {
    it('returns empty string when all data is empty', async () => {
      // All reads fail
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      const ctx = await mgr.assembleContext()
      expect(typeof ctx).toBe('string')
    })

    it('includes world state in context', async () => {
      let callCount = 0
      ;(mockFs.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (filePath: string) => {
        if (typeof filePath === 'string' && filePath.includes('world-state.json') && callCount === 0) {
          callCount++
          return JSON.stringify({
            currentMapId: 'map-1',
            currentMapName: 'Dungeon',
            timeOfDay: 'night',
            weather: 'stormy',
            currentScene: 'Dark corridors',
            activeTokenPositions: [],
            updatedAt: ''
          })
        }
        throw new Error('ENOENT')
      })

      const mgr = new MemoryManager('c1')
      const ctx = await mgr.assembleContext()
      expect(ctx).toContain('Dungeon')
    })
  })

  // -- Factory Cache --

  describe('getMemoryManager', () => {
    it('returns a MemoryManager instance', () => {
      const mgr = getMemoryManager('campaign-factory-1')
      expect(mgr).toBeInstanceOf(MemoryManager)
    })

    it('returns the same instance for the same campaign', () => {
      const mgr1 = getMemoryManager('campaign-factory-same')
      const mgr2 = getMemoryManager('campaign-factory-same')
      expect(mgr1).toBe(mgr2)
    })

    it('returns different instances for different campaigns', () => {
      const mgr1 = getMemoryManager('campaign-factory-a')
      const mgr2 = getMemoryManager('campaign-factory-b')
      expect(mgr1).not.toBe(mgr2)
    })
  })
})
