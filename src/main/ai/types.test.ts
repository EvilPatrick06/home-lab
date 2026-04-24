import { describe, expect, it } from 'vitest'

describe('types', () => {
  it('exports all expected type interfaces', async () => {
    const types = await import('./types')

    // The types module primarily exports TypeScript interfaces/types
    // which are erased at runtime. We verify the module loads successfully
    // and any runtime values (none expected) are accessible.
    expect(types).toBeDefined()
  })

  it('allows creating valid AiConfig objects', () => {
    const config: import('./types').AiConfig = {
      ollamaModel: 'llama3.1',
      ollamaUrl: 'http://localhost:11434'
    }
    expect(config.ollamaModel).toBe('llama3.1')
    expect(config.ollamaUrl).toBe('http://localhost:11434')
  })

  it('allows creating valid AiChatRequest objects', () => {
    const request: import('./types').AiChatRequest = {
      campaignId: 'campaign-1',
      message: 'Hello DM',
      characterIds: ['char-1'],
      senderName: 'Player1',
      activeCreatures: [
        {
          label: 'Goblin 1',
          currentHP: 5,
          maxHP: 7,
          ac: 15,
          conditions: ['frightened']
        }
      ],
      gameState: 'Initiative round 2'
    }
    expect(request.campaignId).toBe('campaign-1')
    expect(request.characterIds).toHaveLength(1)
    expect(request.activeCreatures).toHaveLength(1)
  })

  it('allows creating valid ProviderStatus objects', () => {
    const status: import('./types').ProviderStatus = {
      ollama: true,
      ollamaModels: ['llama3.1', 'mistral']
    }
    expect(status.ollama).toBe(true)
    expect(status.ollamaModels).toHaveLength(2)
  })

  it('allows creating valid RuleCitation objects', () => {
    const citation: import('./types').RuleCitation = {
      source: 'PHB',
      rule: 'Opportunity Attack',
      text: 'A creature provokes an Opportunity Attack when...'
    }
    expect(citation.source).toBe('PHB')
  })

  it('allows creating valid StatChange objects of various types', () => {
    const damage: import('./types').StatChange = {
      type: 'damage',
      value: 10,
      damageType: 'fire',
      reason: "dragon's breath"
    }
    expect(damage.type).toBe('damage')

    const heal: import('./types').StatChange = {
      type: 'heal',
      value: 8,
      reason: 'cure wounds'
    }
    expect(heal.type).toBe('heal')

    const condition: import('./types').StatChange = {
      type: 'add_condition',
      name: 'poisoned',
      reason: 'failed CON save'
    }
    expect(condition.type).toBe('add_condition')

    const spellSlot: import('./types').StatChange = {
      type: 'expend_spell_slot',
      level: 3,
      reason: 'cast Fireball'
    }
    expect(spellSlot.type).toBe('expend_spell_slot')

    const gold: import('./types').StatChange = {
      type: 'gold',
      value: -50,
      denomination: 'gp',
      reason: 'bought a longsword'
    }
    expect(gold.type).toBe('gold')

    const creatureDamage: import('./types').StatChange = {
      type: 'creature_damage',
      targetLabel: 'Goblin 1',
      value: 15,
      damageType: 'slashing',
      reason: 'longsword hit'
    }
    expect(creatureDamage.type).toBe('creature_damage')

    const creatureKill: import('./types').StatChange = {
      type: 'creature_kill',
      targetLabel: 'Wolf 2',
      reason: 'sneak attack'
    }
    expect(creatureKill.type).toBe('creature_kill')
  })

  it('allows creating valid NPCPersonality objects', () => {
    const npc: import('./types').NPCPersonality = {
      npcId: 'npc-1',
      name: 'Bartender Bob',
      personality: 'Gruff but helpful',
      voiceNotes: 'Deep gravelly voice',
      relationships: [
        {
          targetNpcId: 'npc-2',
          targetName: 'Guard Captain',
          relationship: 'informant',
          disposition: 'friendly'
        }
      ],
      conversationLog: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          summary: 'Gave party a quest to find missing goods',
          attitudeAfter: 'friendly'
        }
      ],
      faction: 'Merchants Guild',
      location: 'The Rusty Mug Tavern',
      secretMotivation: 'Actually working for the thieves guild'
    }
    expect(npc.name).toBe('Bartender Bob')
    expect(npc.relationships).toHaveLength(1)
    expect(npc.conversationLog).toHaveLength(1)
  })

  it('allows creating valid WorldStateSummary objects', () => {
    const summary: import('./types').WorldStateSummary = {
      currentLocation: 'Waterdeep',
      timeOfDay: 'evening',
      weather: 'light rain',
      activeQuests: ['Find the artifact', 'Rescue the prisoner'],
      recentEvents: ['Defeated the goblin war band'],
      lastUpdated: '2024-01-15T18:00:00Z'
    }
    expect(summary.currentLocation).toBe('Waterdeep')
    expect(summary.activeQuests).toHaveLength(2)
  })

  it('allows creating valid ChunkIndex objects', () => {
    const index: import('./types').ChunkIndex = {
      version: 1,
      createdAt: '2024-01-01',
      sources: [{ file: 'phb.md', book: 'PHB', totalChunks: 100 }],
      chunks: [
        {
          id: 'chunk-1',
          source: 'PHB',
          headingPath: ['Chapter 1', 'Races'],
          heading: 'Races',
          content: 'Choose a race for your character...',
          tokenEstimate: 50,
          keywords: ['race', 'species', 'character']
        }
      ]
    }
    expect(index.version).toBe(1)
    expect(index.chunks).toHaveLength(1)
  })

  it('allows creating valid ConversationData objects', () => {
    const data: import('./types').ConversationData = {
      messages: [
        { role: 'user', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: 'Welcome!', timestamp: '2024-01-01T00:00:01Z' }
      ],
      summaries: [{ content: 'Party entered the dungeon', coversUpTo: 5 }],
      activeCharacterIds: ['char-1', 'char-2']
    }
    expect(data.messages).toHaveLength(2)
    expect(data.summaries).toHaveLength(1)
  })

  it('allows creating valid ChatMessage objects', () => {
    const msg: import('./types').ChatMessage = {
      role: 'user',
      content: 'I cast Fireball at the group of enemies'
    }
    expect(msg.role).toBe('user')
  })

  it('allows creating valid MutationResult objects', () => {
    const result: import('./types').MutationResult = {
      applied: [{ type: 'damage', value: 10, reason: 'goblin attack' }],
      rejected: [
        {
          change: { type: 'heal', value: 100, reason: 'overheal' },
          reason: 'Character is already at full HP'
        }
      ]
    }
    expect(result.applied).toHaveLength(1)
    expect(result.rejected).toHaveLength(1)
  })

  it('allows creating valid DmActionData objects', () => {
    const action: import('./types').DmActionData = {
      action: 'place_token',
      label: 'Goblin',
      gridX: 5,
      gridY: 10
    }
    expect(action.action).toBe('place_token')
  })
})
