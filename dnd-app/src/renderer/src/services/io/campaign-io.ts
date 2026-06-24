import type { Campaign } from '../../types/campaign'

/** AI provider API-key fields on `campaign.aiDm` that must never leave the device in a shared export. */
const AI_DM_SECRET_FIELDS = ['claudeApiKey', 'openaiApiKey', 'geminiApiKey'] as const

/**
 * Return a copy of the campaign with the AI provider API keys stripped from `aiDm`.
 * Never mutates the input. A shared `.dndcamp` must not leak the owner's
 * Claude/OpenAI/Gemini keys to whoever receives the file.
 */
export function redactCampaignSecrets(campaign: Campaign): Campaign {
  const aiDm = campaign.aiDm
  if (!aiDm) return campaign
  const strippedAiDm = { ...aiDm } as Record<string, unknown>
  let stripped = false
  for (const field of AI_DM_SECRET_FIELDS) {
    if (field in strippedAiDm) {
      delete strippedAiDm[field]
      stripped = true
    }
  }
  if (!stripped) return campaign
  return { ...campaign, aiDm: strippedAiDm as Campaign['aiDm'] }
}

/**
 * Serialize a campaign to a portable JSON string.
 * Preserves all campaign data including players and journal entries, plus game state if provided.
 * AI provider API keys are stripped from the payload (see redactCampaignSecrets).
 */
export function exportCampaign(campaign: Campaign, gameState: Record<string, unknown> | null = null): string {
  return JSON.stringify({ campaign: redactCampaignSecrets(campaign), gameState }, null, 2)
}

/**
 * Parse and validate a campaign JSON string from an imported file.
 * Re-generates timestamps so the imported campaign is treated as new.
 */
export function importCampaign(json: string): { campaign: Campaign; gameState: Record<string, unknown> | null } {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid campaign file: malformed JSON')
  }

  // Handle both v1 (raw campaign) and v2 (bundled) formats
  let campaignData = parsed
  let gameStateData: Record<string, unknown> | null = null

  if (parsed.campaign && typeof parsed.campaign === 'object') {
    campaignData = parsed.campaign as Record<string, unknown>
    gameStateData = (parsed.gameState as Record<string, unknown>) || null
  }

  // Validate required fields
  const required: Array<keyof Campaign> = ['id', 'name', 'system', 'type', 'dmId', 'inviteCode', 'turnMode', 'settings']
  for (const field of required) {
    if (campaignData[field] === undefined) {
      throw new Error(`Invalid campaign file: missing required field "${field}"`)
    }
  }

  // Ensure arrays exist
  campaignData.maps = campaignData.maps ?? []
  campaignData.npcs = campaignData.npcs ?? []
  campaignData.lore = campaignData.lore ?? []
  campaignData.players = campaignData.players ?? []
  campaignData.customRules = campaignData.customRules ?? []
  campaignData.journal = campaignData.journal ?? { entries: [] }

  // Defensive: exports made before key-redaction landed may carry the owner's AI
  // provider keys in cleartext. Never import them — the importer supplies their own.
  if (campaignData.aiDm && typeof campaignData.aiDm === 'object') {
    const aiDm = campaignData.aiDm as Record<string, unknown>
    for (const field of ['claudeApiKey', 'openaiApiKey', 'geminiApiKey']) delete aiDm[field]
  }

  const now = new Date().toISOString()
  campaignData.updatedAt = now

  return { campaign: campaignData as unknown as Campaign, gameState: gameStateData }
}

/**
 * Show a native "Save As" dialog and write the campaign JSON to disk.
 * Returns true if saved successfully, false if the user cancelled.
 */
export async function exportCampaignToFile(campaign: Campaign): Promise<boolean> {
  const filePath = await window.api.showSaveDialog({
    title: 'Export Campaign (with Game State)',
    filters: [{ name: 'D&D Campaign', extensions: ['dndcamp'] }]
  })

  if (!filePath) return false

  const gameState = await window.api.loadGameState(campaign.id).catch(() => null)
  const json = exportCampaign(campaign, gameState)
  await window.api.writeFile(filePath, json)
  return true
}

/**
 * Show a native "Open" dialog and read a .dndcamp file from disk.
 * Returns the parsed Campaign payload (with gameState), or null if cancelled.
 */
export async function importCampaignFromFile(): Promise<{
  campaign: Campaign
  gameState: Record<string, unknown> | null
} | null> {
  const filePath = await window.api.showOpenDialog({
    title: 'Import Campaign',
    filters: [{ name: 'D&D Campaign', extensions: ['dndcamp'] }]
  })

  if (!filePath) return null

  const json = await window.api.readFile(filePath)
  return importCampaign(json)
}
