/**
 * PHASE-37 37A — pure apply/extract between a SeedPack and a Campaign. No IO, no window access beyond
 * crypto.randomUUID(). apply APPENDS (never replaces/dedupes — AI Dungeon's overwrite-everything is the
 * documented failure mode to avoid) and re-IDs every imported entry; tone/openingScene only fill empty
 * slots (seeding never clobbers an author's text). extract maps a campaign back to a pack, excluding all
 * play-state + secrets by construction.
 */

import type { AdventureEntry, Campaign, CustomRule, LoreEntry, NPC, OpeningScene } from '../../types/campaign'
import type { Encounter } from '../../types/encounter'
import type { SeedPack } from './seed-pack-schema'

export interface ApplySeedPackOptions {
  lore?: boolean
  npcs?: boolean
  adventures?: boolean
  encounterTables?: boolean
  encounters?: boolean
  customRules?: boolean
  tone?: boolean
  openingScene?: boolean
}

const ALL_ON: Required<ApplySeedPackOptions> = {
  lore: true,
  npcs: true,
  adventures: true,
  encounterTables: true,
  encounters: true,
  customRules: true,
  tone: true,
  openingScene: true
}

const uid = (): string => crypto.randomUUID()
const now = (): string => new Date().toISOString()

export function slugifyPackId(name: string): string {
  const slug = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return slug || 'seed-pack'
}

export function applySeedPackToCampaign(campaign: Campaign, pack: SeedPack, opts?: ApplySeedPackOptions): Campaign {
  const o = { ...ALL_ON, ...opts }
  const next: Campaign = { ...campaign }

  if (o.lore && pack.lore?.length) {
    const imported: LoreEntry[] = pack.lore.map((l) => ({
      id: uid(),
      title: l.title,
      content: l.content,
      category: l.category,
      isVisibleToPlayers: l.isVisibleToPlayers ?? true,
      createdAt: now(),
      ...(l.keywords?.length ? { keywords: l.keywords } : {})
    }))
    next.lore = [...(campaign.lore ?? []), ...imported]
  }

  if (o.npcs && pack.npcs?.length) {
    const imported: NPC[] = pack.npcs.map((n) => ({
      id: uid(),
      name: n.name,
      description: n.description ?? '',
      location: n.location,
      role: n.role,
      personality: n.personality,
      motivation: n.motivation,
      statBlockId: n.statBlockId,
      notes: n.notes ?? '',
      isVisible: n.isVisible ?? n.role !== 'enemy' // mirror CampaignWizard's default
    }))
    next.npcs = [...(campaign.npcs ?? []), ...imported]
  }

  if (o.adventures && pack.adventures?.length) {
    const imported: AdventureEntry[] = pack.adventures.map((a) => ({
      id: uid(),
      title: a.title,
      levelTier: a.levelTier ?? '',
      premise: a.premise ?? '',
      hook: a.hook ?? '',
      villain: a.villain ?? '',
      setting: a.setting ?? '',
      playerStakes: a.playerStakes ?? '',
      encounters: a.encounters ?? '',
      climax: a.climax ?? '',
      resolution: a.resolution ?? '',
      createdAt: now()
    }))
    next.adventures = [...(campaign.adventures ?? []), ...imported]
  }

  if (o.encounterTables && pack.encounterTables?.length) {
    const imported = pack.encounterTables.map((t) => ({
      id: uid(),
      name: t.name,
      diceFormula: t.diceFormula,
      entries: t.entries.map((e) => ({ min: e.min, max: e.max, text: e.text }))
    }))
    next.customRollTables = [...(campaign.customRollTables ?? []), ...imported]
  }

  if (o.encounters && pack.encounters?.length) {
    const imported = pack.encounters.map((e) => ({ ...e, id: uid() }) as unknown as Encounter)
    next.encounters = [...(campaign.encounters ?? []), ...imported]
  }

  if (o.customRules && pack.customRules?.length) {
    const imported: CustomRule[] = pack.customRules.map((r) => ({
      id: uid(),
      name: r.name,
      description: r.description ?? '',
      category: r.category
    }))
    next.customRules = [...(campaign.customRules ?? []), ...imported]
  }

  // Tone + opening scene only fill EMPTY slots — never clobber existing author text.
  if (o.tone && pack.toneInstructions?.trim() && !campaign.toneInstructions?.trim()) {
    next.toneInstructions = pack.toneInstructions.trim()
  }
  if (o.openingScene && pack.openingScene?.readAloud?.trim() && !campaign.openingScene?.readAloud?.trim()) {
    const os: OpeningScene = {
      title: pack.openingScene.title,
      readAloud: pack.openingScene.readAloud,
      dmNotes: pack.openingScene.dmNotes
    }
    next.openingScene = os
  }

  // levelRange + quests are NOT applied here (creation flow / 37D quest IPC own them).
  return next
}

export function extractSeedPackFromCampaign(
  campaign: Campaign,
  meta?: { id?: string; name?: string; description?: string; author?: string; tags?: string[] }
): SeedPack {
  const name = meta?.name ?? campaign.name
  // Built imperatively (not via conditional spreads) so the optional-field types stay exact.
  // By construction NO aiDm/players/journal/maps/inviteCode/metrics/savedGameState/permissions/
  // calendar/customAudio key is ever set — no secrets or play-state leak. `quests` stays undefined
  // (the export flow fills it from the quest-log IPC when available).
  const pack: SeedPack = {
    format: 'dnd-vtt-seed-pack',
    formatVersion: 1,
    id: meta?.id ?? slugifyPackId(name),
    name,
    description: meta?.description ?? campaign.description ?? '',
    system: 'dnd5e'
  }
  if (meta?.author) pack.author = meta.author
  if (meta?.tags?.length) pack.tags = meta.tags
  if (campaign.settings?.levelRange) pack.levelRange = campaign.settings.levelRange
  if (campaign.toneInstructions?.trim()) pack.toneInstructions = campaign.toneInstructions.trim()
  if (campaign.openingScene?.readAloud?.trim()) pack.openingScene = campaign.openingScene as SeedPack['openingScene']
  if (campaign.lore?.length) {
    pack.lore = campaign.lore.map((l) => ({
      id: l.id,
      title: l.title,
      content: l.content,
      category: l.category,
      isVisibleToPlayers: l.isVisibleToPlayers,
      ...(l.keywords?.length ? { keywords: l.keywords } : {})
    }))
  }
  if (campaign.npcs?.length) {
    pack.npcs = campaign.npcs.map((n) => ({
      id: n.id,
      name: n.name,
      description: n.description,
      location: n.location,
      role: n.role,
      personality: n.personality,
      motivation: n.motivation,
      statBlockId: n.statBlockId,
      notes: n.notes,
      isVisible: n.isVisible
    }))
  }
  if (campaign.adventures?.length) {
    pack.adventures = campaign.adventures.map(({ createdAt: _drop, ...rest }) => rest)
  }
  if (campaign.customRollTables?.length) pack.encounterTables = campaign.customRollTables
  if (campaign.encounters?.length) pack.encounters = campaign.encounters as unknown as SeedPack['encounters']
  if (campaign.customRules?.length) pack.customRules = campaign.customRules as SeedPack['customRules']
  return pack
}
