import { loadCampaign } from '../storage/campaign-storage'

export async function loadCampaignById(id: string): Promise<Record<string, unknown> | null> {
  const result = await loadCampaign(id)
  if (result.success && result.data) {
    return result.data
  }
  return null
}

export function formatCampaignForContext(campaign: Record<string, unknown>): string {
  const parts: string[] = []
  parts.push('[CAMPAIGN DATA]')

  parts.push(`Campaign: ${campaign.name || 'Unnamed'}`)
  if (campaign.description) {
    parts.push(`Description: ${campaign.description}`)
  }
  parts.push(`System: ${campaign.system || '5e'}`)
  parts.push(`Type: ${campaign.type || 'custom'}`)

  // Custom rules
  const customRules = campaign.customRules as Array<{ name: string; description: string }> | undefined
  if (customRules && customRules.length > 0) {
    parts.push('')
    parts.push('Custom Rules:')
    for (const rule of customRules) {
      parts.push(`- ${rule.name}: ${rule.description}`)
    }
  }

  // NPCs
  const npcs = campaign.npcs as
    | Array<{
        name: string
        description?: string
        location?: string
        isVisible?: boolean
        role?: string
        personality?: string
        motivation?: string
        notes?: string
      }>
    | undefined
  if (npcs && npcs.length > 0) {
    parts.push('')
    parts.push('NPCs:')
    for (const npc of npcs) {
      let line = `- ${npc.name}`
      if (npc.description) line += `: ${npc.description}`
      const details: string[] = []
      if (npc.role) details.push(`Role: ${npc.role}`)
      if (npc.location) details.push(`Location: ${npc.location}`)
      if (npc.personality) details.push(`Personality: ${npc.personality}`)
      if (npc.motivation) details.push(`Motivation: ${npc.motivation}`)
      if (npc.isVisible !== undefined) details.push(`Visible to players: ${npc.isVisible}`)
      if (details.length > 0) line += ` (${details.join(', ')})`
      parts.push(line)
    }
  }

  // Lore entries
  const lore = campaign.lore as
    | Array<{
        title: string
        content: string
        category?: string
      }>
    | undefined
  if (lore && lore.length > 0) {
    parts.push('')
    parts.push('Lore:')
    for (const entry of lore) {
      parts.push(`- ${entry.title} [${entry.category || 'other'}]: ${entry.content}`)
    }
  }

  // Maps (brief summary)
  const maps = campaign.maps as
    | Array<{
        name: string
        width?: number
        height?: number
        grid?: { cellSize?: number }
      }>
    | undefined
  if (maps && maps.length > 0) {
    parts.push('')
    parts.push('Maps:')
    for (const map of maps) {
      const grid = map.grid?.cellSize ? `, ${map.grid.cellSize}px cells` : ''
      const size = map.width && map.height ? ` (${map.width}x${map.height}${grid})` : ''
      parts.push(`- ${map.name}${size}`)
    }
  }

  // Settings
  const settings = campaign.settings as
    | {
        levelRange?: { min: number; max: number }
        maxPlayers?: number
      }
    | undefined
  if (settings) {
    const meta: string[] = []
    if (settings.levelRange) meta.push(`Level range: ${settings.levelRange.min}-${settings.levelRange.max}`)
    if (settings.maxPlayers) meta.push(`Max players: ${settings.maxPlayers}`)
    if (meta.length > 0) {
      parts.push('')
      parts.push(meta.join(', '))
    }
  }

  // Turn mode
  if (campaign.turnMode) {
    parts.push(`Turn Mode: ${campaign.turnMode}`)
  }

  // Lobby message
  const lobbyMsg = (settings as Record<string, unknown> | undefined)?.lobbyMessage as string | undefined
  if (lobbyMsg) {
    parts.push(`Lobby Message: ${lobbyMsg}`)
  }

  // Session Zero preferences
  const sessionZero = campaign.sessionZero as
    | {
        contentLimits?: string[]
        tone?: string
        pvpAllowed?: boolean
        characterDeathExpectation?: string
        playSchedule?: string
        additionalNotes?: string
      }
    | undefined
  if (sessionZero) {
    parts.push('')
    parts.push('Session Zero Preferences:')
    if (sessionZero.tone) parts.push(`- Campaign Tone: ${sessionZero.tone}`)
    if (sessionZero.pvpAllowed !== undefined) parts.push(`- PvP Allowed: ${sessionZero.pvpAllowed ? 'Yes' : 'No'}`)
    if (sessionZero.characterDeathExpectation) parts.push(`- Character Death: ${sessionZero.characterDeathExpectation}`)
    if (sessionZero.contentLimits && sessionZero.contentLimits.length > 0) {
      parts.push(`- Content Limits (AVOID these topics): ${sessionZero.contentLimits.join(', ')}`)
    }
    if (sessionZero.playSchedule) parts.push(`- Play Schedule: ${sessionZero.playSchedule}`)
    if (sessionZero.additionalNotes) parts.push(`- Additional Notes: ${sessionZero.additionalNotes}`)
  }

  // Calendar config
  const calendar = campaign.calendar as
    | {
        preset?: string
        months?: Array<{ name: string }>
        daysPerYear?: number
        startingYear?: number
        hoursPerDay?: number
      }
    | undefined
  if (calendar) {
    parts.push('')
    parts.push('Calendar:')
    if (calendar.preset) parts.push(`- Preset: ${calendar.preset}`)
    if (calendar.months) parts.push(`- Months: ${calendar.months.map((m) => m.name).join(', ')}`)
    if (calendar.startingYear) parts.push(`- Starting Year: ${calendar.startingYear}`)
  }

  // Encounters
  const encounters = campaign.encounters as
    | Array<{ name?: string; monsters?: Array<{ name: string; count?: number }> }>
    | undefined
  if (encounters && encounters.length > 0) {
    parts.push('')
    parts.push('Prepared Encounters:')
    for (const enc of encounters) {
      const monsters =
        enc.monsters?.map((m) => (m.count && m.count > 1 ? `${m.count}x ${m.name}` : m.name)).join(', ') ?? ''
      parts.push(`- ${enc.name || 'Unnamed'}: ${monsters}`)
    }
  }

  // Custom audio (so AI can reference music/ambient cues)
  const customAudio = campaign.customAudio as Array<{ displayName: string; category?: string }> | undefined
  if (customAudio && customAudio.length > 0) {
    parts.push('')
    parts.push('Available Audio:')
    for (const a of customAudio) {
      parts.push(`- ${a.displayName}${a.category ? ` [${a.category}]` : ''}`)
    }
  }

  // Adventures (narrative arcs)
  const adventures = campaign.adventures as
    | Array<{
        title: string
        levelTier?: string
        premise?: string
        villain?: string
        setting?: string
        playerStakes?: string
      }>
    | undefined
  if (adventures && adventures.length > 0) {
    parts.push('')
    parts.push('Adventure Arcs:')
    for (const adv of adventures) {
      let line = `- ${adv.title}`
      if (adv.levelTier) line += ` (${adv.levelTier})`
      if (adv.premise) line += `: ${adv.premise}`
      parts.push(line)
      if (adv.villain) parts.push(`  Villain: ${adv.villain}`)
      if (adv.setting) parts.push(`  Setting: ${adv.setting}`)
      if (adv.playerStakes) parts.push(`  Stakes: ${adv.playerStakes}`)
    }
  }

  // Session journal (recent entries for continuity)
  const journal = campaign.journal as
    | { entries?: Array<{ sessionNumber: number; title: string; content: string }> }
    | undefined
  if (journal?.entries && journal.entries.length > 0) {
    const sorted = [...journal.entries].sort((a, b) => b.sessionNumber - a.sessionNumber)
    const recent = sorted.slice(0, 5)
    parts.push('')
    parts.push('Recent Session Journal:')
    for (const entry of recent) {
      parts.push(`- Session ${entry.sessionNumber}: ${entry.title}`)
      if (entry.content) {
        const truncated = entry.content.length > 300 ? `${entry.content.slice(0, 300)}...` : entry.content
        parts.push(`  ${truncated}`)
      }
    }
  }

  // Players
  const players = campaign.players as Array<{ displayName?: string; characterId?: string }> | undefined
  if (players && players.length > 0) {
    parts.push('')
    parts.push('Players:')
    for (const p of players) {
      parts.push(`- ${p.displayName || 'Unknown'}`)
    }
  }

  parts.push('[/CAMPAIGN DATA]')
  return parts.join('\n')
}
