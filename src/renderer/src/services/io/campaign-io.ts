import type { Campaign } from '../../types/campaign'

/**
 * Serialize a campaign to a portable JSON string.
 * Preserves all campaign data including players and journal entries.
 */
export function exportCampaign(campaign: Campaign): string {
  return JSON.stringify(campaign, null, 2)
}

/**
 * Parse and validate a campaign JSON string from an imported file.
 * Re-generates timestamps so the imported campaign is treated as new.
 */
export function importCampaign(json: string): Campaign {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid campaign file: malformed JSON')
  }

  // Validate required fields
  const required: Array<keyof Campaign> = ['id', 'name', 'system', 'type', 'dmId', 'inviteCode', 'turnMode', 'settings']
  for (const field of required) {
    if (parsed[field] === undefined) {
      throw new Error(`Invalid campaign file: missing required field "${field}"`)
    }
  }

  // Ensure arrays exist
  parsed.maps = parsed.maps ?? []
  parsed.npcs = parsed.npcs ?? []
  parsed.lore = parsed.lore ?? []
  parsed.players = parsed.players ?? []
  parsed.customRules = parsed.customRules ?? []
  parsed.journal = parsed.journal ?? { entries: [] }

  const now = new Date().toISOString()
  parsed.updatedAt = now

  return parsed as unknown as Campaign
}

/**
 * Show a native "Save As" dialog and write the campaign JSON to disk.
 * Returns true if saved successfully, false if the user cancelled.
 */
export async function exportCampaignToFile(campaign: Campaign): Promise<boolean> {
  const filePath = await window.api.showSaveDialog({
    title: 'Export Campaign',
    filters: [{ name: 'D&D Campaign', extensions: ['dndcamp'] }]
  })

  if (!filePath) return false

  const json = exportCampaign(campaign)
  await window.api.writeFile(filePath, json)
  return true
}

/**
 * Show a native "Open" dialog and read a .dndcamp file from disk.
 * Returns the parsed Campaign, or null if the user cancelled.
 */
export async function importCampaignFromFile(): Promise<Campaign | null> {
  const filePath = await window.api.showOpenDialog({
    title: 'Import Campaign',
    filters: [{ name: 'D&D Campaign', extensions: ['dndcamp'] }]
  })

  if (!filePath) return null

  const json = await window.api.readFile(filePath)
  return importCampaign(json)
}
