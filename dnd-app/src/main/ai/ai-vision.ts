import { logToFile } from '../log'
import { getActiveProvider, getActiveProviderType } from './clients/provider-registry'

// PHASE-11 11H — map analysis is deliberately TEXT-ONLY. The structured token-position
// description below carries exact grid/HP/AC/condition data no screenshot can; real image
// wiring would require multimodal-trained models + per-provider image-content support
// (the app's defaults are text-only). The old code captured + base64-encoded a screenshot
// it never sent, then told the model an image existed — that misleading sentence is gone.

// ── Types ──

interface TokenPositionData {
  entityId: string
  label: string
  entityType: string
  gridX: number
  gridY: number
  currentHP?: number
  maxHP?: number
  ac?: number
  conditions: string[]
}

interface MapStateData {
  mapName: string
  gridWidth: number
  gridHeight: number
  tokens: TokenPositionData[]
}

interface VisionAnalysisResult {
  success: boolean
  analysis?: string
  error?: string
}

/**
 * Extract current token positions and stats from the game state passed from the renderer.
 */
function captureTokenPositions(gameState: {
  maps: Array<{
    id: string
    name: string
    gridWidth: number
    gridHeight: number
    tokens: Array<{
      entityId?: string
      label: string
      entityType: string
      gridX: number
      gridY: number
      currentHP?: number
      maxHP?: number
      ac?: number
      conditions?: string[]
    }>
  }>
  activeMapId: string | null
}): MapStateData | null {
  const activeMap = gameState.maps.find((m) => m.id === gameState.activeMapId)
  if (!activeMap) return null

  return {
    mapName: activeMap.name,
    gridWidth: activeMap.gridWidth,
    gridHeight: activeMap.gridHeight,
    tokens: activeMap.tokens.map((t) => ({
      entityId: t.entityId ?? '',
      label: t.label,
      entityType: t.entityType,
      gridX: t.gridX,
      gridY: t.gridY,
      currentHP: t.currentHP,
      maxHP: t.maxHP,
      ac: t.ac,
      conditions: t.conditions ?? []
    }))
  }
}

/**
 * Build the structured text description of the map state sent to the LLM.
 */
function buildMapStateDescription(tokenData: MapStateData | null): string {
  let textDescription = 'Current map state:\n'

  if (tokenData) {
    textDescription += `Map: "${tokenData.mapName}" (${tokenData.gridWidth}x${tokenData.gridHeight} grid)\n\n`
    textDescription += 'Token positions:\n'

    if (tokenData.tokens.length === 0) {
      textDescription += '  (no tokens on map)\n'
    } else {
      for (const token of tokenData.tokens) {
        const hpStr =
          token.currentHP !== undefined && token.maxHP !== undefined ? ` HP: ${token.currentHP}/${token.maxHP}` : ''
        const acStr = token.ac !== undefined ? ` AC: ${token.ac}` : ''
        const condStr = token.conditions.length > 0 ? ` Conditions: ${token.conditions.join(', ')}` : ''
        textDescription += `  - ${token.label} (${token.entityType}) at (${token.gridX}, ${token.gridY})${hpStr}${acStr}${condStr}\n`
      }
    }
  } else {
    textDescription += '  (no active map)\n'
  }

  return textDescription
}

/**
 * Send the vision-encoded map state to the active LLM provider for analysis.
 * Uses the provider's chatOnce method with a vision-oriented system prompt.
 */
export async function analyzeMapState(gameState: {
  maps: Array<{
    id: string
    name: string
    gridWidth: number
    gridHeight: number
    tokens: Array<{
      entityId?: string
      label: string
      entityType: string
      gridX: number
      gridY: number
      currentHP?: number
      maxHP?: number
      ac?: number
      conditions?: string[]
    }>
  }>
  activeMapId: string | null
}): Promise<VisionAnalysisResult> {
  try {
    const tokenData = captureTokenPositions(gameState)
    const textDescription = buildMapStateDescription(tokenData)

    const provider = getActiveProvider()
    const providerType = getActiveProviderType()

    const systemPrompt = [
      'You are an expert D&D 5e Dungeon Master assistant analyzing the current battle map.',
      'Provide tactical analysis of the current map state including:',
      '1. Token positioning and tactical advantages/disadvantages',
      '2. Potential flanking opportunities',
      '3. Chokepoints and terrain considerations',
      '4. Suggested creature tactics based on positions',
      '5. Any notable patterns or concerns',
      '',
      'Keep the analysis concise and actionable. Use D&D terminology.'
    ].join('\n')

    const userMessage = `Analyze this battle map:\n\n${textDescription}`

    logToFile('info', `[AI Vision] Analyzing map state with ${providerType}`)

    // Get the current model from the provider config
    // Use chatOnce for a single analysis request
    const model = await getModelForProvider(providerType)
    const analysis = await provider.chatOnce(systemPrompt, [{ role: 'user', content: userMessage }], model)

    logToFile('info', `[AI Vision] Analysis complete: ${analysis.length} chars`)

    return { success: true, analysis }
  } catch (error) {
    const message = (error as Error).message
    logToFile('error', `[AI Vision] Analysis failed: ${message}`)
    return { success: false, error: message }
  }
}

/** IPC / handler input type for `analyzeMapState` */
export type MapStateForVisionAnalysis = Parameters<typeof analyzeMapState>[0]

/**
 * Get the appropriate model string for the active provider.
 */
async function getModelForProvider(_providerType: string): Promise<string> {
  // Use the model the user actually configured — never a per-provider hardcode.
  // Falls back to the single central default only if nothing is configured.
  // Resolve through the AI service so a missing/stale Ollama model auto-switches to an
  // installed one (no streamId → no renderer notice; no-op for cloud providers). (03G)
  const { getConfig, DEFAULT_AI_MODEL, resolveOllamaModel } = require('./ai-service') as {
    getConfig: () => { model?: string } | null
    DEFAULT_AI_MODEL: string
    resolveOllamaModel: (configured: string, streamId?: string) => Promise<string>
  }
  return await resolveOllamaModel(getConfig()?.model || DEFAULT_AI_MODEL)
}
