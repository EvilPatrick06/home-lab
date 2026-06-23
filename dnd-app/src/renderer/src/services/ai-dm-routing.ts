/**
 * AI-DM message routing.
 *
 * `routePlayerMessageToAiDm` builds the full AI context (party roster + game-state
 * snapshot + active-map creatures) and sends a player message to the AI DM. It is
 * the SINGLE path for all three cases, so they can't drift:
 *  - solo (`networkRole === 'none'`) — routed from ChatPanel,
 *  - the host's OWN message (`networkRole === 'host'`) — also routed from ChatPanel,
 *    because the network receive loop in `use-game-network` only ever sees PEER
 *    messages and so never observes the host's own typed message,
 *  - a peer's message received by the host — routed from `use-game-network`.
 */
import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useGameStore } from '../stores/use-game-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import type { Campaign, CampaignPlayer } from '../types/campaign'
import { logger } from '../utils/logger'
import { getTokenStats } from './game/token-stats'

/**
 * S-4 — push the CAMPAIGN's AI settings (provider + chosen model + URL + keys) to
 * the main process when a session starts, so the AI uses the model the user picked
 * for THIS campaign rather than whatever the global ai-config.json was last set to.
 * The campaign is the source of truth for its own AI config (it stores its own
 * keys), so this can't clobber a working setup. No-op when AI DM is disabled.
 */
export async function configureAiFromCampaign(campaign: Campaign): Promise<void> {
  const aiDm = campaign.aiDm
  if (!aiDm?.enabled) return
  try {
    // Capture the result instead of discarding it — a campaign pinned to a model
    // the provider no longer accepts would otherwise fail invisibly later.
    const result = await window.api.ai.configure({
      provider: aiDm.provider ?? 'ollama',
      model: aiDm.model ?? aiDm.ollamaModel,
      ollamaUrl: aiDm.ollamaUrl,
      claudeApiKey: aiDm.claudeApiKey,
      openaiApiKey: aiDm.openaiApiKey,
      geminiApiKey: aiDm.geminiApiKey,
      contextLength: aiDm.contextLength,
      ollamaKvCacheType: aiDm.ollamaKvCacheType,
      structuredExtraction: aiDm.structuredExtraction,
      ragEmbeddingsEnabled: aiDm.ragEmbeddingsEnabled,
      ragEmbeddingModel: aiDm.ragEmbeddingModel,
      ragCampaignDocsEnabled: aiDm.ragCampaignDocsEnabled,
      // PHASE-29 29C/29E: per-task routing + local-endpoint flavor (absent = off / 'ollama').
      routing: { enabled: aiDm.routingEnabled ?? false, smallModel: aiDm.routingSmallModel ?? '' },
      localEndpointFlavor: aiDm.localEndpointFlavor
    })
    if (result && !result.success) {
      logger.warn('[ai] campaign AI config rejected', result.error)
    }
  } catch (err) {
    logger.warn('[ai] configureAiFromCampaign failed', err)
  }
}

/** Build a `[PARTY ROSTER]` block for AI context. Lobby players (multiplayer) take
 *  precedence; campaign players are the solo fallback. */
export function buildPlayerRoster(
  lobbyPlayers: Array<{
    displayName: string
    characterId: string | null
    characterName: string | null
    peerId: string
  }>,
  campaignPlayers: CampaignPlayer[]
): { charIds: string[]; rosterText: string } {
  const resolved =
    lobbyPlayers.length > 0
      ? lobbyPlayers
          .filter((p) => p.characterId)
          .map((p) => ({ displayName: p.displayName, characterId: p.characterId!, characterName: p.characterName }))
      : campaignPlayers
          .filter((p) => p.characterId && p.isActive)
          .map((p) => ({ displayName: p.displayName, characterId: p.characterId!, characterName: null }))

  const charIds = resolved.map((p) => p.characterId)
  const isSolo = lobbyPlayers.length <= 1

  if (resolved.length === 0) return { charIds: [], rosterText: '' }

  let rosterText: string
  if (isSolo) {
    const p = resolved[0]
    const charLabel = p.characterName ? `${p.characterName} (charId: ${p.characterId})` : `(charId: ${p.characterId})`
    rosterText = `[PARTY ROSTER]\nSolo play: ${p.displayName} controls ${charLabel}\n[/PARTY ROSTER]`
  } else {
    const lines = resolved.map((p) => {
      const charLabel = p.characterName ? `${p.characterName} (charId: ${p.characterId})` : `(charId: ${p.characterId})`
      return `- ${p.displayName} → ${charLabel}`
    })
    rosterText = `[PARTY ROSTER]\nParty roster (${resolved.length} players):\n${lines.join('\n')}\n[/PARTY ROSTER]`
  }

  return { charIds, rosterText }
}

/** Active enemy/NPC creatures on the current map, for AI tactical context. */
function buildActiveCreatures(): Array<{
  label: string
  currentHP: number
  maxHP: number
  ac: number
  conditions: string[]
  monsterStatBlockId?: string
}> {
  const gs = useGameStore.getState()
  const currentMap = gs.maps.find((m) => m.id === gs.activeMapId)
  return (currentMap?.tokens ?? [])
    .filter((t) => (t.entityType === 'enemy' || t.entityType === 'npc') && t.currentHP != null)
    .map((t) => {
      const s = getTokenStats(t)
      return {
        label: t.label,
        currentHP: t.currentHP as number,
        maxHP: s.maxHP ?? (t.currentHP as number),
        ac: s.ac ?? 10,
        conditions: t.conditions,
        monsterStatBlockId: t.monsterStatBlockId ?? undefined
      }
    })
}

/** Resolve the acting character for an AI message: the sender's OWN character.
 *  Lobby players (multiplayer) take precedence; active campaign players are the
 *  solo fallback; a single-member resolved roster is the actor regardless of name
 *  match (solo, where playerName may differ from the campaign-player display name).
 *  PHASE-11 11F — activates the per-actor full/abbreviated context split. */
export function resolveActingCharacterId(
  senderName: string,
  lobbyPlayers: Array<{ displayName: string; characterId: string | null }>,
  campaignPlayers: CampaignPlayer[]
): string | undefined {
  const byLobby = lobbyPlayers.find((p) => p.displayName === senderName && p.characterId)?.characterId
  if (byLobby) return byLobby
  const byCampaign = campaignPlayers.find(
    (p) => p.displayName === senderName && p.isActive && p.characterId
  )?.characterId
  if (byCampaign) return byCampaign
  // Single-member roster (the buildPlayerRoster resolution set): that member is the actor.
  const resolved =
    lobbyPlayers.length > 0
      ? lobbyPlayers.filter((p) => p.characterId)
      : campaignPlayers.filter((p) => p.characterId && p.isActive)
  if (resolved.length === 1) return resolved[0].characterId ?? undefined
  return undefined
}

/** Route a player's chat message to the AI DM with full context (party roster +
 *  game-state snapshot + active-map creatures). Used for solo, the host's own
 *  message, AND a peer's message — one path so they can't diverge. */
export function routePlayerMessageToAiDm(
  campaignId: string,
  message: string,
  senderName: string,
  campaignPlayers: CampaignPlayer[],
  exactTimeDefault?: 'always' | 'contextual' | 'never'
): void {
  const lobbyPlayers = useLobbyStore.getState().players
  const { charIds, rosterText } = buildPlayerRoster(lobbyPlayers, campaignPlayers)
  const actingCharacterId = resolveActingCharacterId(senderName, lobbyPlayers, campaignPlayers)

  // buildGameStateSnapshot lives in game-action-executor (renderer-only, heavy);
  // lazy-import to keep it off the chat-send hot path / avoid circular deps.
  import('./game-action-executor')
    .then(({ buildGameStateSnapshot }) => {
      const base = buildGameStateSnapshot(exactTimeDefault)
      const gameState = rosterText ? `${base}\n\n${rosterText}` : base
      const activeCreatures = buildActiveCreatures()
      void useAiDmStore
        .getState()
        .sendMessage(
          campaignId,
          message,
          charIds,
          senderName,
          activeCreatures.length > 0 ? activeCreatures : undefined,
          gameState,
          actingCharacterId
        )
    })
    .catch(() => {
      // Fall back to a context-free send so the AI still responds.
      void useAiDmStore
        .getState()
        .sendMessage(campaignId, message, charIds, senderName, undefined, undefined, actingCharacterId)
    })
}
