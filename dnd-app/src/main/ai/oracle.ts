/**
 * PHASE-28 28D — dice-driven yes/no oracle (opt-in `aiDm.oracleEnabled`).
 *
 * Engine-rolled fate checks with a chaos factor and random-event twists, surfaced transparently
 * in chat (the full roll math) and injected into the next prompt as authoritative `[ORACLE]`
 * facts — countering the LLM's "yes-and" agreeability bias. Pure logic with an injectable RNG so
 * tests are deterministic; the default RNG wraps Node `crypto.randomInt` (main-side; F6).
 *
 * ORIGINAL formula + word tables. The mechanic (odds ladder × chaos shift, doubles → event,
 * end-of-scene d10 vs chaos) is genre-standard and unprotectable; the numbers/wordings here are
 * ours — NOT copied from any commercial GM emulator.
 */

import { randomInt } from 'node:crypto'

export type Likelihood = 'impossible' | 'very-unlikely' | 'unlikely' | 'even' | 'likely' | 'very-likely' | 'sure-thing'

export type OracleAnswer = 'yes' | 'no' | 'exceptional-yes' | 'exceptional-no'
export interface RandomEvent {
  focus: string
  meaning: [string, string]
}
export interface FateCheckResult {
  question: string
  likelihood: Likelihood
  chaos: number
  roll: number
  threshold: number
  answer: OracleAnswer
  randomEvent?: RandomEvent
}
export interface SceneTestResult {
  roll: number
  result: 'as-planned' | 'altered' | 'interrupt'
}

// Persisted state (oracle-state.json). `pending` = results not yet shown to the model (injected
// into the next prompt, then consumed on finalize); `history` is a capped audit trail.
export interface OracleEntry extends FateCheckResult {
  at: string // ISO
}
export interface OracleState {
  version: 1
  chaos: number
  pending: OracleEntry[]
  history: OracleEntry[]
}
export function emptyOracleState(): OracleState {
  return { version: 1, chaos: 5, pending: [], history: [] }
}

export type Rng = () => number // [0, 1)

// Default RNG: cryptographically-seeded, main-side. randomInt(0, 1e6)/1e6 ∈ [0, 1).
const defaultRng: Rng = () => randomInt(0, 1_000_000) / 1_000_000

// Base d100 yes-targets per odds tier (original numbers). Shifted by (chaos − 5) × 5, clamped 1..99.
const BASE_TARGETS: Record<Likelihood, number> = {
  impossible: 5,
  'very-unlikely': 15,
  unlikely: 35,
  even: 50,
  likely: 65,
  'very-likely': 85,
  'sure-thing': 95
}

// Random-event tables (original wordings; module constants).
export const EVENT_FOCUS: readonly string[] = [
  'npc-acts',
  'pc-setback',
  'pc-boon',
  'new-npc-appears',
  'faction-moves',
  'environment-shifts',
  'object-revealed',
  'omen-or-clue',
  'threat-advances',
  'quest-twist'
]
export const MEANING_VERBS: readonly string[] = [
  'betray',
  'conceal',
  'pursue',
  'abandon',
  'reveal',
  'threaten',
  'aid',
  'demand',
  'deceive',
  'protect',
  'seek',
  'destroy',
  'bargain',
  'summon',
  'flee',
  'corrupt',
  'restore',
  'ambush',
  'delay',
  'expose'
]
export const MEANING_SUBJECTS: readonly string[] = [
  'ally',
  'relic',
  'rumor',
  'enemy',
  'secret',
  'debt',
  'route',
  'ritual',
  'stronghold',
  'bargain',
  'heir',
  'weapon',
  'message',
  'boundary',
  'alliance',
  'prisoner',
  'omen',
  'treasure',
  'betrayal',
  'refuge'
]

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))
const rollDie = (sides: number, rng: Rng): number => Math.floor(rng() * sides) + 1
const pick = <T>(arr: readonly T[], rng: Rng): T => arr[rollDie(arr.length, rng) - 1]

/** Normalize a likelihood token (accepts a few aliases like `50/50`). */
export function parseLikelihood(token: string): Likelihood | null {
  const t = token.trim().toLowerCase()
  if (t === '50/50' || t === 'even') return 'even'
  const all: Likelihood[] = ['impossible', 'very-unlikely', 'unlikely', 'even', 'likely', 'very-likely', 'sure-thing']
  return (all as string[]).includes(t) ? (t as Likelihood) : null
}

export function fateCheck(
  question: string,
  likelihood: Likelihood,
  chaos: number,
  rng: Rng = defaultRng
): FateCheckResult {
  const c = clamp(Math.round(chaos), 1, 9)
  const threshold = clamp(BASE_TARGETS[likelihood] + (c - 5) * 5, 1, 99)
  const roll = rollDie(100, rng)

  const exceptionalYesEdge = Math.ceil(threshold / 5)
  const exceptionalNoEdge = threshold + Math.floor(((100 - threshold) * 4) / 5)
  let answer: OracleAnswer
  if (roll <= threshold) answer = roll <= exceptionalYesEdge ? 'exceptional-yes' : 'yes'
  else answer = roll > exceptionalNoEdge ? 'exceptional-no' : 'no'

  // Random-event trigger: doubles (11,22,…,99) whose digit ≤ chaos.
  let randomEvent: RandomEvent | undefined
  if (roll % 11 === 0 && roll <= 99) {
    const digit = roll / 11 // 1..9
    if (digit <= c) {
      randomEvent = { focus: pick(EVENT_FOCUS, rng), meaning: [pick(MEANING_VERBS, rng), pick(MEANING_SUBJECTS, rng)] }
    }
  }

  return { question, likelihood, chaos: c, roll, threshold, answer, randomEvent }
}

/** End-of-scene test (consumed by the director, 28E): d10 ≤ chaos ⇒ scene shifts. */
export function sceneTest(chaos: number, rng: Rng = defaultRng): SceneTestResult {
  const c = clamp(Math.round(chaos), 1, 9)
  const roll = rollDie(10, rng)
  if (roll > c) return { roll, result: 'as-planned' }
  return { roll, result: roll % 2 === 1 ? 'altered' : 'interrupt' }
}

function answerWord(a: OracleAnswer): string {
  return a.replace(/-/g, ' ').toUpperCase()
}

/** Render the bounded `[ORACLE]` context block (newest entries last). '' when empty. */
export function renderOracleBlock(entries: FateCheckResult[]): string {
  if (entries.length === 0) return ''
  const lines: string[] = [
    '[ORACLE]',
    '(Engine dice results. These are established facts — weave them in; do not contradict or re-roll them.)'
  ]
  for (const e of entries) {
    let line = `Q: "${e.question}" → ${answerWord(e.answer)} (rolled ${e.roll} vs ${e.threshold}, chaos ${e.chaos})`
    if (e.randomEvent)
      line += ` + EVENT: ${e.randomEvent.focus} — ${e.randomEvent.meaning[0]} / ${e.randomEvent.meaning[1]}`
    lines.push(line)
  }
  lines.push('[/ORACLE]')
  return lines.join('\n')
}
