export const meta = {
  name: 'p6-complete-dm-gap-audit',
  description: 'Audit engine capabilities the AI DM cannot yet drive or see, across DM domains',
  phases: [
    { title: 'Audit', detail: 'one read-only agent per DM-capability domain' },
    { title: 'Verify', detail: 'adversarially confirm each high-value gap is real' }
  ]
}

// How the AI DM drives / perceives the game (shared context every auditor needs):
const HOWAI = `
The AI DM (Electron main process) interacts with the game through exactly these channels:
- DM ACTIONS (engine commands): zod schemas in src/main/ai/ai-schemas.ts (DM_ACTION_SCHEMAS),
  the DmAction union in src/main/ai/dm-actions.ts, executor cases in
  src/renderer/src/services/game-action-executor.ts (+ src/renderer/src/services/game-actions/*),
  documented to the model in src/main/ai/prompt-sections/dm-actions-schema.ts.
  A schema↔executor contract test (src/main/ai/ai-schemas.test.ts) requires every action to have BOTH.
- STAT CHANGES (character/creature mutations): StatChange union in src/main/ai/types.ts, applied via
  src/main/ai/stat-mutations.ts (players) and src/renderer/src/utils/creature-mutations.ts (tokens).
- CONTEXT the AI SEES: src/renderer/src/services/game-actions/state-snapshot.ts (live game-state snapshot),
  src/main/ai/memory-manager.ts assembleContext (world state / NPCs / places / rulings),
  src/main/ai/context-builder.ts, and the prompt sections in src/main/ai/prompt-sections/*.
- RESPONSE TAGS parsed in src/main/ai/ai-response-parser.ts + ai-service.ts finalize.

ALREADY SHIPPED in P6 (treat as DONE — do NOT report these as gaps):
- inter-combatant distances in the snapshot
- attacker-relative cover/line-of-sight in the snapshot
- [ACTION ECONOMY] block (reaction availability + Dodge/Disengage/Dash/Hidden stances)
- reactions/opportunity-attack guidance in the combat prompt
- request_roll DM action (AI prompts players for ability/save/skill checks)
- house-ruling write path ([RULING] tag -> rulings ledger)

A GAP = an engine capability that EXISTS in the codebase (a service/function/store action with real
implementation) but the AI DM CANNOT trigger it (no DM action / stat change) OR cannot perceive its
state (absent from the snapshot/context). NOT a gap: something the engine itself doesn't implement
(that would be net-new, out of scope), or something only cosmetic.`

const GAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['domain', 'gaps'],
  properties: {
    domain: { type: 'string' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'engineEvidence', 'aiGap', 'wireUpSketch', 'value'],
        properties: {
          capability: { type: 'string', description: 'the engine capability, one line' },
          engineEvidence: { type: 'string', description: 'file:symbol proof the engine already implements it' },
          aiGap: { type: 'string', description: 'precisely why the AI cannot drive/see it today' },
          wireUpSketch: { type: 'string', description: 'concrete wire-up: which schema/executor/snapshot/prompt to add' },
          value: { type: 'string', enum: ['high', 'medium', 'low'] }
        }
      }
    }
  }
}

const DOMAINS = [
  { key: 'combat-actions', prompt: 'Combat actions & automation: grapple, shove, hide/stealth, two-weapon/multiattack, mounted combat, opportunity attacks the AI itself takes, dodge/disengage/dash/ready as AI-issued actions, knockout/death. What does the engine resolve (services/combat/*, use-token-movement, combat-resolver, attack-resolver, reaction-tracker) that the AI cannot issue as a DM action or stat change?' },
  { key: 'spells-effects', prompt: 'Spells, concentration & area effects: AoE targeting/templates, concentration checks & breaks, counterspell the AI casts, spell-slot/pact-slot tracking, summoned creatures, ongoing spell effects. What can the engine do (concentration-manager, aoe-targeting, damage-resolver, spell services) that the AI cannot trigger or does not see in context?' },
  { key: 'environment-world', prompt: 'Environment & world state: lighting/vision/darkvision/obscurement, weather, terrain (difficult/hazardous), traps, environmental hazards, darkness zones, moon/time-of-day. What environmental state can the engine model that the AI cannot set via a DM action or read from the snapshot?' },
  { key: 'encounter-loot', prompt: 'Encounter building, treasure & loot: CR/XP encounter budget, mob calculator, treasure/loot tables, magic-item generation, awarding loot/gold/XP. What generation or award capability exists (mob calc, encounter budget context, library treasure data, downtime-service) that the AI cannot drive end-to-end?' },
  { key: 'exploration-downtime', prompt: 'Exploration, travel, rest & downtime: travel pace, rest mechanics (short/long), downtime activities/projects (downtime-service.ts), exhaustion from travel, food/water. What does the engine implement that the AI cannot drive or perceive?' },
  { key: 'npc-social-quest', prompt: 'NPC, social, faction & quest tracking: NPC personalities/relationships/dispositions, faction state, quest log/journal, handouts, secrets. Compare the memory-manager world-state WRITE surface the AI has vs the READ surface in assembleContext — find asymmetries (state the AI can recall but never set, or vice versa).' },
  { key: 'character-mutations', prompt: 'Character-sheet mutations: compare the StatChange union (src/main/ai/types.ts) against what the character engine actually supports — conditions with durations, attunement, equipment/armor changes, ability-score/save/skill proficiency changes, feats/features, multiclassing, currency types. What character changes can the engine apply that the AI has no StatChange for?' },
  { key: 'map-initiative', prompt: 'Map, token & initiative orchestration: token placement/movement/sizing/visibility, fog of war, initiative (legendary actions/resistances, lair actions, recharge, surprise), map switching, drawing/measurement. What orchestration does the engine support that the AI cannot issue as a DM action?' }
]

phase('Audit')
const audited = await pipeline(
  DOMAINS,
  (d) =>
    agent(`${HOWAI}\n\nAUDIT DOMAIN: ${d.prompt}\n\nSearch the codebase thoroughly. Return ONLY genuine gaps where the engine already implements the capability but the AI DM cannot drive or perceive it. Ground every gap in a real file:symbol. Be precise and skeptical — if you cannot find engine evidence, do not invent a gap. It is fine to return an empty gaps array.`, {
      label: `audit:${d.key}`,
      phase: 'Audit',
      agentType: 'Explore',
      schema: GAP_SCHEMA
    }),
  // Verify each high/medium gap adversarially: confirm the engine evidence is real AND the AI truly can't already do it.
  (report, d) => {
    if (!report || !report.gaps?.length) return { domain: d.key, confirmed: [] }
    const worth = report.gaps.filter((g) => g.value === 'high' || g.value === 'medium')
    if (!worth.length) return { domain: d.key, confirmed: [] }
    return parallel(
      worth.map((g) => () =>
        agent(`${HOWAI}\n\nA prior auditor claims this is a real gap in domain "${d.key}":\n- capability: ${g.capability}\n- engineEvidence: ${g.engineEvidence}\n- aiGap: ${g.aiGap}\n\nADVERSARIALLY VERIFY. Open the cited files. Confirm BOTH: (1) the engine genuinely implements this capability, and (2) the AI DM genuinely has NO existing DM action / stat change / context field for it (check DM_ACTION_SCHEMAS, the StatChange union, state-snapshot.ts, and the prompt sections). Default to real=false if you cannot confirm both. Return the gap with a verdict.`, {
          label: `verify:${d.key}:${g.capability.slice(0, 24)}`,
          phase: 'Verify',
          agentType: 'Explore',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['capability', 'real', 'reason', 'value', 'wireUpSketch'],
            properties: {
              capability: { type: 'string' },
              real: { type: 'boolean' },
              reason: { type: 'string' },
              value: { type: 'string', enum: ['high', 'medium', 'low'] },
              wireUpSketch: { type: 'string' }
            }
          }
        })
      )
    ).then((verdicts) => ({ domain: d.key, confirmed: verdicts.filter(Boolean).filter((v) => v.real) }))
  }
)

const confirmed = audited.flatMap((a) => (a?.confirmed ?? []).map((c) => ({ ...c, domain: a.domain })))
log(`Confirmed ${confirmed.length} real AI-DM gaps across ${DOMAINS.length} domains`)
return { confirmed }
