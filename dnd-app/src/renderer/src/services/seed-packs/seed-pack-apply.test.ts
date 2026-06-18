import { describe, expect, it } from 'vitest'
import type { Campaign } from '../../types/campaign'
import { applySeedPackToCampaign, extractSeedPackFromCampaign, slugifyPackId } from './seed-pack-apply'
import type { SeedPack } from './seed-pack-schema'

function pack(over: Partial<SeedPack> = {}): SeedPack {
  return {
    format: 'dnd-vtt-seed-pack',
    formatVersion: 1,
    id: 'p1',
    name: 'Pack One',
    description: 'd',
    system: 'dnd5e',
    lore: [{ id: 'l1', title: 'World', content: 'Lore', category: 'world', keywords: ['mere'] }],
    npcs: [
      { id: 'n1', name: 'Ally', description: 'a', role: 'ally' },
      { id: 'n2', name: 'Bad', description: 'b', role: 'enemy' }
    ],
    adventures: [{ id: 'a1', title: 'Arc' }],
    encounterTables: [{ id: 't1', name: 'Travel', diceFormula: '1d8', entries: [{ min: 1, max: 8, text: 'x' }] }],
    customRules: [{ id: 'r1', name: 'Rule', description: 'x', category: 'rest' }],
    toneInstructions: 'Grim.',
    openingScene: { readAloud: 'Fog rolls in.' },
    ...over
  } as SeedPack
}

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1',
    name: 'Camp',
    description: '',
    npcs: [],
    lore: [],
    customRules: [],
    settings: { levelRange: { min: 1, max: 5 } },
    ...over
  } as unknown as Campaign
}

describe('seed-pack-apply (PHASE-37 37A)', () => {
  it('applies every section onto an empty campaign with fresh ids', () => {
    const c = applySeedPackToCampaign(campaign(), pack())
    expect(c.lore).toHaveLength(1)
    expect(c.npcs).toHaveLength(2)
    expect(c.adventures).toHaveLength(1)
    expect(c.customRollTables).toHaveLength(1)
    expect(c.customRules).toHaveLength(1)
    expect(c.toneInstructions).toBe('Grim.')
    expect(c.openingScene?.readAloud).toBe('Fog rolls in.')
    expect(c.lore?.[0].id).not.toBe('l1') // re-IDed
    expect(c.lore?.[0].keywords).toEqual(['mere'])
  })

  it('appends to existing collections without dropping or reordering', () => {
    const existing = campaign({
      lore: [{ id: 'old', title: 'Old', content: 'c', category: 'other', isVisibleToPlayers: true, createdAt: 'x' }]
    })
    const c = applySeedPackToCampaign(existing, pack())
    expect(c.lore).toHaveLength(2)
    expect(c.lore?.[0].id).toBe('old') // existing kept first
  })

  it('npc isVisible defaults to role !== enemy', () => {
    const c = applySeedPackToCampaign(campaign(), pack())
    expect(c.npcs?.find((n) => n.name === 'Ally')?.isVisible).toBe(true)
    expect(c.npcs?.find((n) => n.name === 'Bad')?.isVisible).toBe(false)
  })

  it('per-section opt-out skips exactly that section', () => {
    const c = applySeedPackToCampaign(campaign(), pack(), { npcs: false, tone: false })
    expect(c.npcs).toHaveLength(0)
    expect(c.toneInstructions).toBeUndefined()
    expect(c.lore).toHaveLength(1) // others still applied
  })

  it('does not overwrite existing toneInstructions / openingScene', () => {
    const c = applySeedPackToCampaign(campaign({ toneInstructions: 'Mine.' }), pack())
    expect(c.toneInstructions).toBe('Mine.')
  })

  it('does not apply quests (37D IPC owns them)', () => {
    const c = applySeedPackToCampaign(
      campaign(),
      pack({ quests: [{ name: 'Q', description: '', objectives: [], chapterQuest: false }] })
    )
    expect((c as unknown as { quests?: unknown }).quests).toBeUndefined()
  })

  it('extract excludes secrets + play-state by construction', () => {
    const c = campaign({
      lore: [{ id: 'l', title: 'T', content: 'C', category: 'world', isVisibleToPlayers: true, createdAt: 'x' }],
      // these must NOT appear in the extracted pack:
      aiDm: { enabled: true, claudeApiKey: 'sk-secret' },
      players: [{ userId: 'u', displayName: 'P', characterId: null, joinedAt: '', isActive: true, isReady: true }],
      inviteCode: 'JOIN123'
    } as unknown as Partial<Campaign>)
    const extracted = extractSeedPackFromCampaign(c)
    const json = JSON.stringify(extracted)
    expect(json).not.toMatch(/claudeApiKey|openaiApiKey|geminiApiKey|sk-secret|inviteCode|JOIN123|players/)
    expect(extracted.lore).toHaveLength(1)
  })

  it('extract → parse-shape → apply round trip preserves titles/names', () => {
    const seeded = applySeedPackToCampaign(campaign(), pack())
    const extracted = extractSeedPackFromCampaign(seeded)
    const reApplied = applySeedPackToCampaign(campaign(), extracted)
    expect(reApplied.lore?.map((l) => l.title)).toEqual(['World'])
    expect(reApplied.npcs?.map((n) => n.name).sort()).toEqual(['Ally', 'Bad'])
  })

  it('slugifyPackId normalizes + falls back', () => {
    expect(slugifyPackId('The Hollow Mere!')).toBe('the-hollow-mere')
    expect(slugifyPackId('  ')).toBe('seed-pack')
  })
})
