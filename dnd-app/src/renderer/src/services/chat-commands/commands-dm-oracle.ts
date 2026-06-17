import type { ChatCommand, CommandContext } from './types'

// PHASE-28 28D — DM dice oracle. The engine rolls main-side (transparent math posted to chat);
// the next AI request carries the result as an authoritative [ORACLE] fact. The `oracleEnabled`
// flag gates USE here (the only renderer gate) — main rolls regardless to keep the handler simple.

type Likelihood = 'impossible' | 'very-unlikely' | 'unlikely' | 'even' | 'likely' | 'very-likely' | 'sure-thing'
const LIKELIHOODS: Likelihood[] = [
  'impossible',
  'very-unlikely',
  'unlikely',
  'even',
  'likely',
  'very-likely',
  'sure-thing'
]

function parseLikelihood(token: string): Likelihood | null {
  const t = token.trim().toLowerCase()
  if (t === '50/50') return 'even'
  return (LIKELIHOODS as string[]).includes(t) ? (t as Likelihood) : null
}

const pretty = (s: string): string => s.replace(/-/g, ' ')

async function handleChaos(rest: string, ctx: CommandContext): Promise<{ type: string; content: string }> {
  const token = rest.trim()
  if (!token) return { type: 'error', content: 'Usage: /oracle chaos <+1|-1|N>' }
  const signed = token.startsWith('+') || token.startsWith('-')
  const n = Number.parseInt(token, 10)
  if (Number.isNaN(n)) return { type: 'error', content: 'Usage: /oracle chaos <+1|-1|N>' }
  const payload = signed ? { delta: n } : { value: n }
  const r = await window.api.ai.oracleSetChaos?.(ctx.campaignId as string, payload)
  if (!r?.success) return { type: 'error', content: r?.error ?? 'Failed to set chaos.' }
  return { type: 'system', content: `Oracle chaos factor is now ${r.chaos}.` }
}

const oracleCommand: ChatCommand = {
  name: 'oracle',
  aliases: ['fate'],
  description: 'Roll a yes/no oracle (with chaos factor + random-event twists) for solo/assisted play',
  usage: '/oracle [likelihood] <question> | /oracle chaos <+1|-1|N>',
  examples: ['/oracle Does the guard notice us?', '/oracle likely Is the door locked?', '/oracle chaos +1'],
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    if (!ctx.oracleEnabled) {
      return { type: 'error', content: 'The dice oracle is off. Enable it in this campaign’s AI DM settings.' }
    }
    if (!ctx.campaignId) return { type: 'error', content: 'No active campaign.' }

    const parts = args.trim().split(/\s+/)
    if (parts[0]?.toLowerCase() === 'chaos') {
      return handleChaos(parts.slice(1).join(' '), ctx)
    }

    // Optional leading likelihood token; the remainder is the question.
    let likelihood: Likelihood = 'even'
    let rest = args.trim()
    const lead = parts[0] ? parseLikelihood(parts[0]) : null
    if (lead) {
      likelihood = lead
      rest = parts.slice(1).join(' ')
    }
    const question = rest.trim()
    if (!question) return { type: 'error', content: 'Usage: /oracle [likelihood] <question>' }

    const r = await window.api.ai.oracleFateCheck?.(ctx.campaignId, { question, likelihood })
    if (!r?.success || !r.result) return { type: 'error', content: r?.error ?? 'Oracle roll failed.' }
    const res = r.result
    let content = `Oracle: "${res.question}" → ${pretty(res.answer).toUpperCase()} — d100=${res.roll} vs target ${res.threshold} (${pretty(res.likelihood)} odds, chaos ${res.chaos})`
    if (res.randomEvent) {
      content += `\nRandom event: ${res.randomEvent.focus} — ${res.randomEvent.meaning[0]} / ${res.randomEvent.meaning[1]}`
    }
    return { type: 'system', content }
  }
}

export const commands: ChatCommand[] = [oracleCommand]
