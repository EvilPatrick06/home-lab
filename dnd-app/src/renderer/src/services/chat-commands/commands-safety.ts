import { i18n } from '../../i18n'
import { useNetworkStore } from '../../stores/network-store'
import { useAiDmStore } from '../../stores/use-ai-dm-store'
import { useCampaignStore } from '../../stores/use-campaign-store'
import type { ChatCommand, CommandContext } from './types'

/**
 * PHASE-32 32E — the X-Card safety tool. Any participant may tap it to remove the last AI narration,
 * no questions asked. The shared `tapXCard` helper backs both the `/xcard` command and the chat-panel
 * button so they cannot drift. The table-facing notice is anonymous: it never names the tapper or echoes
 * the topic (the topic appears only in the DM-visible ban list).
 */

type TapResult = { ok: true } | { ok: false; reason: 'no-ai-dm' | 'not-enabled' }

/** Run the X-card. Returns ok, or why it was blocked (so the caller can show the right message). */
export function tapXCard(topic?: string): TapResult {
  const campaign = useCampaignStore.getState().getActiveCampaign()
  if (!campaign?.aiDm?.enabled) return { ok: false, reason: 'no-ai-dm' }
  if (!campaign.sessionZero?.xCardEnabled) return { ok: false, reason: 'not-enabled' }

  const clean = topic?.trim() || undefined
  const role = useNetworkStore.getState().role
  if (role === 'client') {
    // A peer can't drive the host's AI directly — relay the tap; the host handles it.
    useNetworkStore.getState().sendMessage?.('player:x-card', { topic: clean })
  } else {
    void useAiDmStore.getState().invokeXCard(campaign.id, clean)
  }
  return { ok: true }
}

const xCardCommand: ChatCommand = {
  name: 'xcard',
  aliases: ['x'],
  description: 'Tap the X-Card to remove the last AI narration — no questions asked',
  usage: '/xcard [topic]',
  examples: ['/xcard', '/xcard spiders'],
  category: 'player',
  dmOnly: false,
  execute: (args: string, ctx: CommandContext) => {
    const result = tapXCard(args)
    if (!result.ok) {
      ctx.addSystemMessage(result.reason === 'no-ai-dm' ? i18n.t('game.xCard.noAiDm') : i18n.t('game.xCard.notEnabled'))
      return { handled: true }
    }
    // Anonymous, neutral notice — never names the tapper, never echoes the topic.
    ctx.broadcastSystemMessage(i18n.t('game.xCard.tapped'))
    return { handled: true }
  }
}

export const commands: ChatCommand[] = [xCardCommand]
