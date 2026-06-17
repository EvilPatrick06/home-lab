import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async (_path?: unknown) => ''),
  writeFile: vi.fn(async () => {}),
  appendFile: vi.fn(async () => {}),
  readdir: vi.fn(async (_path?: unknown, _opts?: unknown) => [] as unknown[]),
  stat: vi.fn(async () => ({ size: 0 }))
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

import { getMemoryManager, MemoryManager, npcMemoryFromAttitude } from './memory-manager'

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

  // -- NPC world-state fields (P6.16) --

  describe('updateNpcFields', () => {
    it('persists faction + location on a new NPC personality', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      await mgr.updateNpcFields('Volo', { faction: 'Thieves Guild', location: 'Waterdeep' })
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('npc-personalities.json'),
        expect.stringContaining('Thieves Guild'),
        'utf-8'
      )
    })

    it('merges fields onto an existing personality without dropping others', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify([{ npcId: 'n1', name: 'Volo', personality: 'boastful', faction: 'Writers Guild' }])
      )
      const mgr = new MemoryManager('c1')
      await mgr.updateNpcFields('Volo', { secretMotivation: 'wants fame' })
      const calls = mockFs.writeFile.mock.calls as unknown as Array<[string, string, string]>
      const written = JSON.parse(calls[calls.length - 1][1]) as Array<Record<string, unknown>>
      expect(written[0].secretMotivation).toBe('wants fame')
      expect(written[0].personality).toBe('boastful')
    })
  })

  // -- Quest log (P6.17) --

  // PHASE-28 28A — structured quest log. updateQuestLog now delegates to the quests.json store
  // and mirrors NAMES ONLY into the legacy activeQuests array. Stateful fs mock (two files).
  describe('quest log (PHASE-28 28A)', () => {
    const files = new Map<string, string>()
    const P = (f: string) => `/tmp/test/campaigns/c1/ai-context/${f}`
    beforeEach(() => {
      files.clear()
      mockFs.readFile.mockReset()
      mockFs.writeFile.mockReset()
      mockFs.mkdir.mockReset().mockResolvedValue(undefined)
      mockFs.readFile.mockImplementation((async (p: string) => {
        const c = files.get(p)
        if (c === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return c
      }) as never)
      mockFs.writeFile.mockImplementation((async (p: string, d: string) => {
        files.set(p, d)
      }) as never)
    })
    afterEach(() => {
      mockFs.readFile.mockReset()
      mockFs.writeFile.mockReset()
    })

    it('add writes a structured quest and mirrors the name into activeQuests', async () => {
      const mgr = new MemoryManager('c1')
      await mgr.updateQuestLog('add', 'Rescue the Mayor', 'kidnapped by goblins')
      const log = await mgr.getQuestLog()
      expect(log.quests).toHaveLength(1)
      expect(log.quests[0]).toMatchObject({
        name: 'Rescue the Mayor',
        description: 'kidnapped by goblins',
        status: 'active'
      })
      const summary = await mgr.getWorldStateSummary()
      expect(summary?.activeQuests).toEqual(['Rescue the Mayor'])
    })

    it('complete marks the quest completed, empties the active mirror, logs a recent event', async () => {
      const mgr = new MemoryManager('c1')
      await mgr.updateQuestLog('add', 'Rescue the Mayor', 'kidnapped')
      await mgr.updateQuestLog('complete', 'Rescue the Mayor')
      const log = await mgr.getQuestLog()
      expect(log.quests[0].status).toBe('completed')
      const summary = await mgr.getWorldStateSummary()
      expect(summary?.activeQuests).toEqual([])
      expect(summary?.recentEvents).toContain('Completed quest: Rescue the Mayor')
    })

    it('migrates legacy activeQuests on first read', async () => {
      files.set(
        P('world-state-summary.json'),
        JSON.stringify({
          currentLocation: 'Town',
          timeOfDay: 'day',
          activeQuests: ['Find the smith: ask around'],
          recentEvents: [],
          lastUpdated: ''
        })
      )
      const log = await new MemoryManager('c1').getQuestLog()
      expect(log.quests).toHaveLength(1)
      expect(log.quests[0].name).toBe('Find the smith')
    })

    it('serializes concurrent mutateQuestLog calls (10 parallel adds → 10 quests)', async () => {
      const mgr = new MemoryManager('c1')
      await Promise.all(Array.from({ length: 10 }, (_, i) => mgr.mutateQuestLog({ kind: 'add', name: `Quest ${i}` })))
      expect((await mgr.getQuestLog()).quests).toHaveLength(10)
    })

    it('assembleContext renders a [QUEST LOG] block when quests exist (and not in [WORLD SUMMARY])', async () => {
      const mgr = new MemoryManager('c1')
      await mgr.updateQuestLog('add', 'Rescue the Mayor', 'kidnapped')
      const ctx = await mgr.assembleContext()
      expect(ctx).toContain('[QUEST LOG]')
      expect(ctx).toContain('Rescue the Mayor')
      expect(ctx).not.toContain('Active Quests:')
    })
  })

  // -- Faction reputation (P6.17) --

  describe('adjustFactionReputation', () => {
    it('creates a new standing with the delta', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
      const mgr = new MemoryManager('c1')
      await mgr.adjustFactionReputation('Harpers', 10)
      const calls = mockFs.writeFile.mock.calls as unknown as Array<[string, string, string]>
      const written = JSON.parse(calls.at(-1)?.[1] ?? '[]') as Array<{ factionName: string; partyStanding: number }>
      expect(written[0]).toMatchObject({ factionName: 'Harpers', partyStanding: 10 })
    })

    it('accumulates onto an existing standing', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify([{ factionName: 'Zhentarim', partyStanding: -5, lastModified: '' }])
      )
      const mgr = new MemoryManager('c1')
      await mgr.adjustFactionReputation('zhentarim', -3)
      const calls = mockFs.writeFile.mock.calls as unknown as Array<[string, string, string]>
      const written = JSON.parse(calls.at(-1)?.[1] ?? '[]') as Array<{ partyStanding: number }>
      expect(written[0].partyStanding).toBe(-8)
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
    it('adds a relationship between two NPCs (PHASE-27 27B: read-after-write via mutate)', async () => {
      // Stateful fs so the "ensure target exists → re-read its id → mutate source" path works
      // (the new serialized pattern depends on read-after-write, unlike the old in-memory hold).
      const files = new Map<string, string>()
      const npcFile = '/tmp/test/campaigns/c1/ai-context/npc-personalities.json'
      files.set(npcFile, JSON.stringify([{ npcId: 'npc-1', name: 'Alice', personality: 'Kind' }]))
      mockFs.readFile.mockReset() // drain any leaked mockResolvedValueOnce from prior tests
      mockFs.writeFile.mockReset()
      mockFs.readFile.mockImplementation((async (p: string) => {
        const c = files.get(p)
        if (c === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return c
      }) as never)
      mockFs.writeFile.mockImplementation((async (p: string, d: string) => {
        files.set(p, d)
      }) as never)

      const mgr = new MemoryManager('c1')
      await mgr.addNpcRelationship('Alice', 'Bob', 'rival', 'hostile')

      const stored = JSON.parse(files.get(npcFile) as string) as Array<{ name: string; relationships?: unknown[] }>
      const alice = stored.find((p) => p.name === 'Alice')
      expect(stored.some((p) => p.name === 'Bob')).toBe(true) // target auto-created
      expect(alice?.relationships?.[0]).toMatchObject({
        targetName: 'Bob',
        relationship: 'rival',
        disposition: 'hostile'
      })

      // Restore the default non-stateful mock so later tests are unaffected.
      mockFs.readFile.mockImplementation(async () => '')
      mockFs.writeFile.mockImplementation(async () => {})
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

  describe('npcMemoryFromAttitude', () => {
    it('slugifies the name into an id and keeps the display name', () => {
      const npc = npcMemoryFromAttitude('Bardack the Grim', 'hostile', 'insulted the party')
      expect(npc.id).toBe('bardack-the-grim')
      expect(npc.name).toBe('Bardack the Grim')
      expect(npc.attitude).toBe('hostile')
      expect(npc.notes).toBe('insulted the party')
    })

    it("maps the StatChange 'indifferent' attitude to 'neutral'", () => {
      expect(npcMemoryFromAttitude('Guard', 'indifferent', '').attitude).toBe('neutral')
    })

    it('passes through friendly', () => {
      expect(npcMemoryFromAttitude('Innkeeper', 'friendly', '').attitude).toBe('friendly')
    })
  })

  describe('assembleContext (P3: rulings + recency)', () => {
    it('includes a [DM RULINGS] section from non-overridden rulings only', async () => {
      mockFs.readFile.mockImplementation(async (p: unknown) => {
        if (String(p).includes('rulings-log.json')) {
          return JSON.stringify([
            {
              id: 'r1',
              timestamp: 't',
              question: 'Can I dual-wield daggers?',
              ruling: 'Yes',
              citation: 'PHB p.150',
              overriddenByDM: false
            },
            {
              id: 'r2',
              timestamp: 't',
              question: 'A scrapped call',
              ruling: 'ScrappedRuling',
              citation: '',
              overriddenByDM: true
            }
          ])
        }
        return ''
      })
      const ctx = await new MemoryManager('c1').assembleContext()
      expect(ctx).toContain('[DM RULINGS]')
      expect(ctx).toContain('Can I dual-wield daggers?')
      expect(ctx).not.toContain('ScrappedRuling') // DM-overridden ruling excluded
    })

    it('lists NPCs most-recently-seen first', async () => {
      mockFs.readFile.mockImplementation(async (p: unknown) => {
        if (String(p).includes('npcs.json')) {
          return JSON.stringify([
            {
              id: 'a',
              name: 'OldFriend',
              role: 'r',
              attitude: 'friendly',
              location: 'X',
              notes: '',
              firstEncountered: '',
              lastSeen: '2026-01-01T00:00:00Z'
            },
            {
              id: 'b',
              name: 'RecentFoe',
              role: 'r',
              attitude: 'hostile',
              location: 'Y',
              notes: '',
              firstEncountered: '',
              lastSeen: '2026-06-01T00:00:00Z'
            }
          ])
        }
        return ''
      })
      const ctx = await new MemoryManager('c1').assembleContext()
      const npcsLine = ctx.split('\n').find((l) => l.startsWith('[NPCS]')) ?? ''
      expect(npcsLine.indexOf('RecentFoe')).toBeLessThan(npcsLine.indexOf('OldFriend'))
    })
  })
})

// PHASE-27 27B — read-modify-write paths now go through mutate(); concurrent writers no
// longer lose updates or create duplicate NPC stubs. Stateful fs so read-after-write holds.
describe('MemoryManager concurrency (PHASE-27 27B)', () => {
  const DIR = '/tmp/test/campaigns/c1/ai-context'
  let files: Map<string, string>
  beforeEach(() => {
    files = new Map<string, string>()
    mockFs.readFile.mockReset() // drain any leaked mockResolvedValueOnce from prior tests
    mockFs.writeFile.mockReset()
    mockFs.readFile.mockImplementation((async (p: string) => {
      const c = files.get(p)
      if (c === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return c
    }) as never)
    mockFs.writeFile.mockImplementation((async (p: string, d: string) => {
      files.set(p, d)
    }) as never)
  })
  afterEach(() => {
    mockFs.readFile.mockImplementation(async () => '')
    mockFs.writeFile.mockImplementation(async () => {})
  })

  it('two concurrent updateWorldState calls both land (no lost update)', async () => {
    const mgr = new MemoryManager('c1')
    await Promise.all([mgr.updateWorldState({ weather: 'rain' }), mgr.updateWorldState({ timeOfDay: 'night' })])
    const ws = JSON.parse(files.get(`${DIR}/world-state.json`) as string)
    expect(ws.weather).toBe('rain')
    expect(ws.timeOfDay).toBe('night')
  })

  it('two concurrent interactions for the same new NPC create exactly ONE personality', async () => {
    const mgr = new MemoryManager('c1')
    await Promise.all([
      mgr.logNpcInteraction('Brand New NPC', 'first', 'friendly'),
      mgr.logNpcInteraction('Brand New NPC', 'second', 'neutral')
    ])
    const npcs = JSON.parse(files.get(`${DIR}/npc-personalities.json`) as string) as Array<{ name: string }>
    expect(npcs.filter((n) => n.name === 'Brand New NPC')).toHaveLength(1)
  })

  it('two concurrent quest adds both persist', async () => {
    const mgr = new MemoryManager('c1')
    await Promise.all([mgr.updateQuestLog('add', 'Q1'), mgr.updateQuestLog('add', 'Q2')])
    const summary = JSON.parse(files.get(`${DIR}/world-state-summary.json`) as string)
    expect(summary.activeQuests).toContain('Q1')
    expect(summary.activeQuests).toContain('Q2')
  })
})

describe('MemoryManager recap cache + Q&A log (PHASE-31 31B/31C)', () => {
  const DIR = '/tmp/test/campaigns/c1/ai-context'
  let files: Map<string, string>
  beforeEach(() => {
    files = new Map<string, string>()
    mockFs.readFile.mockReset()
    mockFs.writeFile.mockReset()
    mockFs.readFile.mockImplementation((async (p: string) => {
      const c = files.get(p)
      if (c === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return c
    }) as never)
    mockFs.writeFile.mockImplementation((async (p: string, d: string) => {
      files.set(p, d)
    }) as never)
  })
  afterEach(() => {
    mockFs.readFile.mockImplementation(async () => '')
    mockFs.writeFile.mockImplementation(async () => {})
    mockFs.readdir.mockImplementation(async () => [])
  })

  it('session-start recap cache round-trips', async () => {
    const mgr = new MemoryManager('c1')
    expect(await mgr.getSessionStartRecap()).toBeNull()
    await mgr.saveSessionStartRecap({ text: 'Previously…', generatedAt: '2026-06-17T00:00:00Z' })
    const got = await mgr.getSessionStartRecap()
    expect(got).toEqual({ text: 'Previously…', generatedAt: '2026-06-17T00:00:00Z' })
  })

  it('listSessionLogDates returns sorted .md basenames, [] on ENOENT', async () => {
    const mgr = new MemoryManager('c1')
    mockFs.readdir.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    expect(await mgr.listSessionLogDates()).toEqual([])
    mockFs.readdir.mockResolvedValueOnce(['2026-01-03.md', '2026-01-01.md', 'notes.txt', '2026-01-02.md'] as never)
    expect(await mgr.listSessionLogDates()).toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
  })

  it('qa-log appends, caps at 50, and clears', async () => {
    const mgr = new MemoryManager('c1')
    expect(await mgr.getQaLog()).toEqual([])
    for (let i = 0; i < 55; i++) {
      await mgr.appendQaEntry({ id: `q${i}`, question: `Q${i}`, answer: `A${i}`, timestamp: `t${i}` })
    }
    const log = await mgr.getQaLog()
    expect(log).toHaveLength(50)
    expect(log[0].id).toBe('q5') // oldest 5 pruned
    expect(log[49].id).toBe('q54')
    await mgr.clearQaLog()
    expect(await mgr.getQaLog()).toEqual([])
  })
})
