import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../storage/campaign-storage', () => ({
  loadCampaign: vi.fn()
}))

import { loadCampaign } from '../../storage/campaign-storage'
import { formatCampaignForContext, loadCampaignById } from './campaign-context'

const mockLoadCampaign = vi.mocked(loadCampaign)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadCampaignById', () => {
  it('returns campaign data on success', async () => {
    const campaign = { id: 'c1', name: 'Test Campaign' }
    mockLoadCampaign.mockResolvedValue({ success: true, data: campaign })
    const result = await loadCampaignById('c1')
    expect(result).toEqual(campaign)
  })

  it('returns null when campaign not found', async () => {
    mockLoadCampaign.mockResolvedValue({ success: false })
    const result = await loadCampaignById('missing')
    expect(result).toBeNull()
  })

  it('returns null when data is undefined', async () => {
    mockLoadCampaign.mockResolvedValue({ success: true, data: undefined })
    const result = await loadCampaignById('empty')
    expect(result).toBeNull()
  })
})

describe('formatCampaignForContext', () => {
  it('formats minimal campaign with defaults', () => {
    const result = formatCampaignForContext({})
    expect(result).toContain('[CAMPAIGN DATA]')
    expect(result).toContain('[/CAMPAIGN DATA]')
    expect(result).toContain('Campaign: Unnamed')
    expect(result).toContain('System: 5e')
    expect(result).toContain('Type: custom')
  })

  it('formats campaign name and description', () => {
    const result = formatCampaignForContext({
      name: 'Dragon Hunt',
      description: 'An epic quest'
    })
    expect(result).toContain('Campaign: Dragon Hunt')
    expect(result).toContain('Description: An epic quest')
  })

  it('formats in-progress downtime activities (G26)', () => {
    const result = formatCampaignForContext({
      downtimeProgress: [
        {
          characterName: 'Aria',
          activityName: 'Crafting a Longsword',
          daysSpent: 3,
          daysRequired: 7,
          goldSpent: 7,
          goldRequired: 15,
          status: 'in-progress'
        },
        { characterName: 'Thorin', activityName: 'Old Job', daysSpent: 2, daysRequired: 2, status: 'abandoned' }
      ]
    })
    expect(result).toContain('[DOWNTIME ACTIVITIES]')
    expect(result).toContain('Aria: Crafting a Longsword (3/7 days, 7/15 gp, in-progress)')
    // abandoned entries are filtered out
    expect(result).not.toContain('Old Job')
  })

  it('omits the downtime block when there are no activities', () => {
    const result = formatCampaignForContext({ downtimeProgress: [] })
    expect(result).not.toContain('[DOWNTIME ACTIVITIES]')
  })

  it('formats custom rules', () => {
    const result = formatCampaignForContext({
      customRules: [{ name: 'Flanking', description: 'Grants advantage' }]
    })
    expect(result).toContain('Custom Rules:')
    expect(result).toContain('- Flanking: Grants advantage')
  })

  it('formats NPCs with details', () => {
    const result = formatCampaignForContext({
      npcs: [
        {
          name: 'Gandalf',
          description: 'A wizard',
          role: 'Quest Giver',
          location: 'Tavern',
          personality: 'Wise',
          motivation: 'Save the world',
          isVisible: true
        }
      ]
    })
    expect(result).toContain('NPCs:')
    expect(result).toContain('Gandalf')
    expect(result).toContain('A wizard')
    expect(result).toContain('Role: Quest Giver')
    expect(result).toContain('Location: Tavern')
    expect(result).toContain('Visible to players: true')
  })

  // PHASE-25 25E — lore now renders inside a labeled [LORE] block (wrapper changed from
  // "Lore:"); the entry-line format is byte-identical.
  it('formats lore entries inside a [LORE] block', () => {
    const result = formatCampaignForContext({
      lore: [{ title: 'Ancient War', content: 'Long ago...', category: 'history' }]
    })
    expect(result).toContain('[LORE]')
    expect(result).toContain('[/LORE]')
    expect(result).not.toContain('Lore:')
    expect(result).toContain('- Ancient War [history]: Long ago...')
  })

  it('formats lore with default category', () => {
    const result = formatCampaignForContext({
      lore: [{ title: 'Mystery', content: 'Unknown origins' }]
    })
    expect(result).toContain('- Mystery [other]: Unknown origins')
  })

  it('uses opts.lore (the already-selected set) when provided', () => {
    const result = formatCampaignForContext(
      { lore: [{ title: 'Full', content: 'all of it' }] },
      { lore: [{ title: 'Only This', content: 'selected', category: 'world' }] }
    )
    expect(result).toContain('- Only This [world]: selected')
    expect(result).not.toContain('Full')
  })

  it('emits no [LORE] block for a campaign with no lore', () => {
    expect(formatCampaignForContext({})).not.toContain('[LORE]')
    expect(formatCampaignForContext({ lore: [] }, { lore: [] })).not.toContain('[LORE]')
  })

  it('formats maps with dimensions', () => {
    const result = formatCampaignForContext({
      maps: [{ name: 'Dungeon Level 1', width: 40, height: 30, grid: { cellSize: 50 } }]
    })
    expect(result).toContain('Maps:')
    expect(result).toContain('- Dungeon Level 1 (40x30, 50px cells)')
  })

  it('formats maps without dimensions', () => {
    const result = formatCampaignForContext({
      maps: [{ name: 'Wilderness' }]
    })
    expect(result).toContain('- Wilderness')
  })

  it('formats settings', () => {
    const result = formatCampaignForContext({
      settings: { levelRange: { min: 1, max: 10 }, maxPlayers: 6 }
    })
    expect(result).toContain('Level range: 1-10')
    expect(result).toContain('Max players: 6')
  })

  it('formats turn mode', () => {
    const result = formatCampaignForContext({ turnMode: 'round-robin' })
    expect(result).toContain('Turn Mode: round-robin')
  })

  it('formats session zero preferences', () => {
    const result = formatCampaignForContext({
      sessionZero: {
        tone: 'dark fantasy',
        pvpAllowed: false,
        characterDeathExpectation: 'possible',
        contentLimits: ['gore', 'romance'],
        playSchedule: 'weekly',
        additionalNotes: 'Be kind'
      }
    })
    expect(result).toContain('Session Zero Preferences:')
    expect(result).toContain('Campaign Tone: dark fantasy')
    expect(result).toContain('PvP Allowed: No')
    expect(result).toContain('Character Death: possible')
    // PHASE-32 32B — content limits moved to the dedicated [SAFETY CONSTRAINTS] block; no longer here.
    expect(result).not.toContain('Content Limits (AVOID these topics)')
    expect(result).toContain('Play Schedule: weekly')
    expect(result).toContain('Additional Notes: Be kind')
  })

  it('formats calendar', () => {
    const result = formatCampaignForContext({
      calendar: {
        preset: 'Harptos',
        months: [{ name: 'Hammer' }, { name: 'Alturiak' }],
        startingYear: 1492
      }
    })
    expect(result).toContain('Calendar:')
    expect(result).toContain('Preset: Harptos')
    expect(result).toContain('Months: Hammer, Alturiak')
    expect(result).toContain('Starting Year: 1492')
  })

  it('formats encounters', () => {
    const result = formatCampaignForContext({
      encounters: [
        {
          name: 'Goblin Ambush',
          monsters: [
            { name: 'Goblin', count: 3 },
            { name: 'Hobgoblin', count: 1 }
          ]
        }
      ]
    })
    expect(result).toContain('Prepared Encounters:')
    expect(result).toContain('- Goblin Ambush: 3x Goblin, Hobgoblin')
  })

  it('formats custom audio', () => {
    const result = formatCampaignForContext({
      customAudio: [{ displayName: 'Battle Music', category: 'combat' }]
    })
    expect(result).toContain('Available Audio:')
    expect(result).toContain('- Battle Music [combat]')
  })

  it('formats adventures', () => {
    const result = formatCampaignForContext({
      adventures: [
        {
          title: 'Dragon of Icespire Peak',
          levelTier: '1-5',
          premise: 'A white dragon terrorizes',
          villain: 'Cryovain',
          setting: 'Phandalin',
          playerStakes: 'The town will be destroyed'
        }
      ]
    })
    expect(result).toContain('Adventure Arcs:')
    expect(result).toContain('Dragon of Icespire Peak (1-5): A white dragon terrorizes')
    expect(result).toContain('Villain: Cryovain')
    expect(result).toContain('Setting: Phandalin')
    expect(result).toContain('Stakes: The town will be destroyed')
  })

  it('formats session journal (most recent first, max 5)', () => {
    const entries = Array.from({ length: 8 }, (_, i) => ({
      sessionNumber: i + 1,
      title: `Session ${i + 1}`,
      content: `Events of session ${i + 1}`
    }))
    const result = formatCampaignForContext({
      journal: { entries }
    })
    expect(result).toContain('Recent Session Journal:')
    expect(result).toContain('Session 8')
    expect(result).toContain('Session 4')
    expect(result).not.toContain('Session 3:')
  })

  it('truncates long journal content', () => {
    const result = formatCampaignForContext({
      journal: {
        entries: [
          {
            sessionNumber: 1,
            title: 'Long Session',
            content: 'A'.repeat(400)
          }
        ]
      }
    })
    expect(result).toContain('...')
  })

  it('formats players', () => {
    const result = formatCampaignForContext({
      players: [{ displayName: 'Alice' }, { displayName: 'Bob' }]
    })
    expect(result).toContain('Players:')
    expect(result).toContain('- Alice')
    expect(result).toContain('- Bob')
  })

  it('handles empty arrays gracefully', () => {
    const result = formatCampaignForContext({
      customRules: [],
      npcs: [],
      lore: [],
      maps: [],
      encounters: [],
      customAudio: [],
      adventures: [],
      players: []
    })
    expect(result).not.toContain('Custom Rules:')
    expect(result).not.toContain('NPCs:')
    expect(result).not.toContain('Lore:')
    expect(result).not.toContain('Maps:')
    expect(result).not.toContain('Encounters:')
    expect(result).not.toContain('Audio:')
    expect(result).not.toContain('Adventure Arcs:')
    expect(result).not.toContain('Players:')
  })

  // PHASE-37 37D — tone instructions + roll-table names.
  it('renders the tone block (early) when toneInstructions is set, absent otherwise', () => {
    const withTone = formatCampaignForContext({ name: 'C', description: 'A camp', toneInstructions: 'Grim and slow.' })
    expect(withTone).toContain('Narrative Tone & Style')
    expect(withTone).toContain('Grim and slow.')
    expect(withTone.indexOf('Narrative Tone & Style')).toBeLessThan(withTone.indexOf('System:'))
    expect(formatCampaignForContext({ name: 'C' })).not.toContain('Narrative Tone & Style')
  })

  it('lists random-table names when customRollTables is present', () => {
    const result = formatCampaignForContext({ name: 'C', customRollTables: [{ name: 'Travel' }, { name: 'Loot' }] })
    expect(result).toContain('Random Tables (DM can roll these on request): Travel, Loot')
    expect(formatCampaignForContext({ name: 'C' })).not.toContain('Random Tables')
  })
})
