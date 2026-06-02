/**
 * Solo-play AI-DM message routing.
 *
 * BUG-1 (2026-06-01 QA): in solo play `networkRole === 'none'`, so the host-side
 * AI trigger in `use-game-network` (which fires only for `networkRole === 'host'`
 * and early-returns on `'none'`) never routes the player's chat to the AI DM — the
 * solo player saw no narration, no "thinking" state, and no error. There is no
 * network loop in solo, so the local chat-send routes the message here directly.
 *
 * Multiplayer host/client are unchanged: they still route through the network
 * message path in `use-game-network`. This helper is called ONLY when solo.
 */
import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useGameStore } from '../stores/use-game-store'
import type { Campaign } from '../types/campaign'
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
    await window.api.ai.configure({
      provider: aiDm.provider ?? 'ollama',
      model: aiDm.model ?? aiDm.ollamaModel,
      ollamaUrl: aiDm.ollamaUrl,
      claudeApiKey: aiDm.claudeApiKey,
      openaiApiKey: aiDm.openaiApiKey,
      geminiApiKey: aiDm.geminiApiKey
    })
  } catch (err) {
    logger.warn('[ai] configureAiFromCampaign failed', err)
  }
}

/** Route a solo player's chat message to the AI DM with the same context
 * enrichment (party roster + game-state snapshot + active map creatures) the
 * host path builds, so a solo session gets responses of the same quality. */
export function routeSoloMessageToAiDm(campaign: Campaign, message: string, senderName: string): void {
  const players = campaign.players ?? []
  const withChar = players.filter((p) => p.characterId)
  const charIds = withChar.map((p) => p.characterId as string)
  const rosterText = withChar.length
    ? `[PARTY ROSTER]\nSolo play:\n${withChar
        .map((p) => `- ${p.displayName} (charId: ${p.characterId})`)
        .join('\n')}\n[/PARTY ROSTER]`
    : ''

  // buildGameStateSnapshot lives in game-action-executor (renderer-only, heavy);
  // lazy-import to avoid pulling it into the chat-send hot path / circular deps.
  import('./game-action-executor')
    .then(({ buildGameStateSnapshot }) => {
      const base = buildGameStateSnapshot()
      const gameState = rosterText ? `${base}\n\n${rosterText}` : base

      const gs = useGameStore.getState()
      const currentMap = gs.maps.find((m) => m.id === gs.activeMapId)
      const activeCreatures = (currentMap?.tokens ?? [])
        .filter((t) => (t.entityType === 'enemy' || t.entityType === 'npc') && t.currentHP != null)
        .map((t) => {
          const s = getTokenStats(t)
          return {
            label: t.label,
            currentHP: t.currentHP as number,
            maxHP: s.maxHP ?? (t.currentHP as number),
            ac: s.ac ?? 10,
            conditions: t.conditions,
            monsterStatBlockId: t.monsterStatBlockId
          }
        })

      void useAiDmStore
        .getState()
        .sendMessage(
          campaign.id,
          message,
          charIds,
          senderName,
          activeCreatures.length > 0 ? activeCreatures : undefined,
          gameState
        )
    })
    .catch(() => {
      // Fall back to a context-free send so the AI still responds in solo.
      void useAiDmStore.getState().sendMessage(campaign.id, message, charIds, senderName)
    })
}
