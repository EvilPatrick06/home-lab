/**
 * PHASE-34 34B — turn a prose prompt into a validated BattlemapSpec via the configured provider.
 * Ollama uses native constrained decoding (the json schema as `format`); cloud providers echo the
 * schema in the prompt and we validate + repair + retry once. Uses the PRIMARY model (not task-routed).
 */

import {
  type BattlemapSpec,
  BattlemapSpecError,
  BattlemapSpecSchema,
  battlemapSpecJsonSchema,
  repairBattlemapSpec
} from '../../shared/battlemap-spec'
import type { BattlemapGenerationRequest } from '../../shared/ipc-schemas'
import { repairJson } from './ai-schemas'
import { chatOncePrimary, getPrimaryProviderInfo } from './ai-service'
import { ollamaStructuredOnce } from './clients/ollama-client'

export type BattlemapGenerationResult =
  | { success: true; spec: BattlemapSpec; warnings: string[] }
  | { success: false; error: string }

export function buildBattlemapSystemPrompt(jsonSchemaText: string): string {
  return [
    'You design D&D 5e tactical battlemaps and output them as a single JSON object.',
    'Coordinate rules: a 0-indexed grid, 5 ft per cell. Rooms are axis-aligned rectangles (x,y is the',
    'top-left cell; w,h are sizes in cells). Corridors connect two room ids. Doors sit on a room edge.',
    'Lights and terrain are single cells. spawns.party is where the players start; spawns.enemies are',
    'monster start cells. Keep everything inside the width×height grid.',
    '',
    'Output MUST match this JSON schema exactly:',
    jsonSchemaText,
    '',
    'Output ONLY the JSON object — no markdown fences, no commentary.'
  ].join('\n')
}

function buildUserPrompt(request: BattlemapGenerationRequest): string {
  const parts = [`Design a battlemap: ${request.prompt}`]
  if (request.theme) parts.push(`Theme: ${request.theme}.`)
  if (request.widthCells && request.heightCells)
    parts.push(`Grid size: ${request.widthCells}x${request.heightCells} cells.`)
  return parts.join(' ')
}

async function callModel(system: string, user: string, jsonSchema: Record<string, unknown>): Promise<string> {
  const { provider } = getPrimaryProviderInfo()
  if (provider === 'ollama') {
    const { model } = getPrimaryProviderInfo()
    return ollamaStructuredOnce(system, [{ role: 'user', content: user }], model, jsonSchema)
  }
  // Cloud providers: schema is echoed in the system prompt; we validate + repair + retry.
  return chatOncePrimary(system, user)
}

function parseSpec(raw: string): { ok: true; spec: BattlemapSpec } | { ok: false; issues: string } {
  const stripped = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(repairJson(stripped))
  } catch (err) {
    return { ok: false, issues: `not valid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  const result = BattlemapSpecSchema.safeParse(parsed)
  if (result.success) return { ok: true, spec: result.data }
  return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}

export async function generateBattlemapSpec(request: BattlemapGenerationRequest): Promise<BattlemapGenerationResult> {
  const jsonSchema = battlemapSpecJsonSchema()
  const system = buildBattlemapSystemPrompt(JSON.stringify(jsonSchema))
  let user = buildUserPrompt(request)

  let parsed: { ok: true; spec: BattlemapSpec } | { ok: false; issues: string } | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string
    try {
      raw = await callModel(system, user, jsonSchema)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
    parsed = parseSpec(raw)
    if (parsed.ok) break
    // ONE retry with the validation issues fed back.
    user = `${buildUserPrompt(request)}\n\nYour previous output failed validation: ${parsed.issues}. Output ONLY corrected JSON.`
  }
  if (!parsed?.ok) {
    return {
      success: false,
      error: `Could not produce a valid battlemap (${parsed?.ok === false ? parsed.issues : 'unknown'})`
    }
  }

  // Apply requested hard overrides (clamp dims before repair) then deterministic repair.
  let spec = parsed.spec
  if (request.theme) spec = { ...spec, theme: request.theme }
  if (request.widthCells) spec = { ...spec, width: request.widthCells }
  if (request.heightCells) spec = { ...spec, height: request.heightCells }
  try {
    const repaired = repairBattlemapSpec(spec)
    return { success: true, spec: repaired.spec, warnings: repaired.warnings }
  } catch (err) {
    return { success: false, error: err instanceof BattlemapSpecError ? err.message : String(err) }
  }
}
