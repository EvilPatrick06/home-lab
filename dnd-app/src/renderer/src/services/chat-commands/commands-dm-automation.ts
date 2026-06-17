import { getGameStore, getLobbyStore, getNetworkStore } from '../../stores/store-accessors'
import { buildMonsterTurnContext, runMonsterTurn } from '../combat/monster-turn-executor'
import { planMonsterTurn } from '../combat/monster-turn-planner'
import type { StoreAccessors } from '../game-actions/types'
import type { ChatCommand } from './types'

// PHASE-30 30D — DM-only deterministic combat automation. /suggestturn previews a plan privately;
// /monsterturn runs it for real (the executor posts the broadcast summary). Both default to the
// creature whose turn it currently is when no name is given.

function stores(): StoreAccessors {
  return { getGameStore, getLobbyStore, getNetworkStore }
}

/** The explicit creature name, or — when omitted — the current initiative entry's name. */
function resolveLabel(args: string): string | null {
  const explicit = args.trim()
  if (explicit) return explicit
  const init = getGameStore().getState().initiative
  const entry = init?.entries[init.currentIndex]
  return entry?.entityName ?? null
}

const suggestTurn: ChatCommand = {
  name: 'suggestturn',
  aliases: [],
  description: 'Privately preview the engine-suggested turn for an enemy (no dice rolled)',
  usage: '/suggestturn [creature]',
  examples: ['/suggestturn', '/suggestturn Goblin 1'],
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const label = resolveLabel(args)
    if (!label) return { type: 'error', content: 'No creature is in initiative to suggest a turn for.' }
    const ctx = buildMonsterTurnContext(label, stores())
    if ('error' in ctx) return { type: 'error', content: ctx.error }
    const plan = planMonsterTurn(ctx)
    const lines = [
      `🧭 Suggested turn — ${plan.actorLabel} (${plan.intTier} tactics):`,
      ...plan.rationale.map((r) => `• ${r}`)
    ]
    // type:'system' is posted LOCALLY (DM-only) — players never see the suggestion.
    return { type: 'system', content: lines.join('\n') }
  }
}

const monsterTurn: ChatCommand = {
  name: 'monsterturn',
  aliases: ['runturn'],
  description: "Run an enemy's whole turn deterministically (targeting, movement, attacks)",
  usage: '/monsterturn [creature]',
  examples: ['/monsterturn', '/monsterturn Goblin 1'],
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const label = resolveLabel(args)
    if (!label) return { type: 'error', content: 'No creature is in initiative to run.' }
    const result = runMonsterTurn(label, stores())
    if ('error' in result) return { type: 'error', content: result.error }
    // The executor already posts the broadcast "[Monster Turn]" summary; nothing else to say.
    return undefined
  }
}

export const commands: ChatCommand[] = [suggestTurn, monsterTurn]
