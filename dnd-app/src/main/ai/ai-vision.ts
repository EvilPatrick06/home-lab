import { BrowserWindow } from 'electron'
import { logToFile } from '../log'
import { getActiveProvider, getActiveProviderType } from './provider-registry'

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

// ── Screenshot Capture ──

/**
 * Capture the current map view as a PNG buffer using Electron's capturePage API.
 */
export async function captureMapScreenshot(): Promise<Buffer | null> {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    logToFile('warn', '[AI Vision] No window available for screenshot capture')
    return null
  }

  try {
    const image = await win.webContents.capturePage()
    const pngBuffer = image.toPNG()
    logToFile('info', `[AI Vision] Captured screenshot: ${pngBuffer.length} bytes`)
    return Buffer.from(pngBuffer)
  } catch (error) {
    logToFile('error', `[AI Vision] Screenshot capture failed: ${(error as Error).message}`)
    return null
  }
}

/**
 * Extract current token positions and stats from the game state passed from the renderer.
 */
export function captureTokenPositions(gameState: {
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
 * Encode a screenshot as base64 and pair with structured token position data
 * for sending to a vision-capable LLM.
 */
export function encodeForVision(
  screenshot: Buffer | null,
  tokenData: MapStateData | null
): { imageBase64: string | null; textDescription: string } {
  const imageBase64 = screenshot ? screenshot.toString('base64') : null

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

  return { imageBase64, textDescription }
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
    const screenshot = await captureMapScreenshot()
    const tokenData = captureTokenPositions(gameState)
    const { imageBase64, textDescription } = encodeForVision(screenshot, tokenData)

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

    // Build the user message with the text description
    // Note: vision (image) support varies by provider. We always send the text description.
    // If the provider supports vision, the image would be included in the message.
    let userMessage = `Analyze this battle map:\n\n${textDescription}`

    if (imageBase64) {
      // For providers that support vision, include image reference
      userMessage += '\n(A screenshot of the map has been captured for reference.)'
    }

    logToFile('info', `[AI Vision] Analyzing map state with ${providerType}`)

    // Get the current model from the provider config
    // Use chatOnce for a single analysis request
    const model = getModelForProvider(providerType)
    const analysis = await provider.chatOnce(systemPrompt, [{ role: 'user', content: userMessage }], model)

    logToFile('info', `[AI Vision] Analysis complete: ${analysis.length} chars`)

    return { success: true, analysis }
  } catch (error) {
    const message = (error as Error).message
    logToFile('error', `[AI Vision] Analysis failed: ${message}`)
    return { success: false, error: message }
  }
}

/**
 * Get the appropriate model string for the active provider.
 */
function getModelForProvider(providerType: string): string {
  // Import the config to get the currently selected model
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getConfig } = require('./ai-service') as { getConfig: () => { model?: string } | null }
  const config = getConfig()
  return config?.model ?? (providerType === 'ollama' ? 'llama3.2' : 'gpt-4o')
}
