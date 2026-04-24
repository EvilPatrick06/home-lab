/**
 * BMO Pi Bridge — HTTP client for controlling BMO services on the Raspberry Pi.
 * Used to start/stop Discord DM sessions and send narration from the VTT.
 */

const BMO_BASE_URL = process.env.BMO_PI_URL || 'http://bmo.local:5000'
const TIMEOUT_MS = 15_000

interface BridgeResponse {
  ok?: boolean
  error?: string
  [key: string]: unknown
}

async function bmoPiFetch(path: string, options?: RequestInit): Promise<BridgeResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${BMO_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      }
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
    }
    return await res.json()
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

export async function startDiscordDm(campaignId: string): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/start', {
    method: 'POST',
    body: JSON.stringify({ campaign_id: campaignId })
  })
}

export async function stopDiscordDm(): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/stop', { method: 'POST' })
}

export async function sendNarration(text: string, npc?: string, emotion?: string): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/narrate', {
    method: 'POST',
    body: JSON.stringify({ text, npc, emotion })
  })
}

export async function getDmStatus(): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/status')
}
