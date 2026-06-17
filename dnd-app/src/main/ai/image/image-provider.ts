/**
 * PHASE-33 33B — image-provider contracts + the primary→fallback orchestrator. Image generation is
 * MUCH slower than chat (A1111 on CPU/older GPUs can take minutes), so it has its own long timeout —
 * never reuse the chat provider timeout.
 */

import type { AiImageProviderType, ValidatedAiImageConfig } from '../../../shared/ipc-schemas'
import { logToFile } from '../../log'
import { geminiImageAdapter } from './gemini-image-client'
import { openaiImageAdapter } from './openai-image-client'
import { sdWebuiAdapter } from './sd-webui-client'

export const IMAGE_REQUEST_TIMEOUT_MS = 300_000 // 5 min — image gen is slow; NOT the chat timeout

export interface ImageGenRequest {
  prompt: string
  negativePrompt?: string
  width: number
  height: number
}

export type ImageGenOutcome =
  | {
      success: true
      base64: string
      mimeType: 'image/png' | 'image/jpeg'
      provider: AiImageProviderType
      model: string
    }
  | { success: false; error: string }

export interface ImageProviderAdapter {
  type: AiImageProviderType
  isAvailable(config: ValidatedAiImageConfig): Promise<boolean>
  generate(req: ImageGenRequest, config: ValidatedAiImageConfig, signal?: AbortSignal): Promise<ImageGenOutcome>
}

const ADAPTERS: Record<AiImageProviderType, ImageProviderAdapter> = {
  'sd-webui': sdWebuiAdapter,
  openai: openaiImageAdapter,
  gemini: geminiImageAdapter
}

export function getImageAdapter(type: AiImageProviderType): ImageProviderAdapter {
  return ADAPTERS[type]
}

/** Per-attempt signal: caller cancel OR the long image timeout, whichever fires first. */
function attemptSignal(callerSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS)
  return callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout
}

async function runAdapter(
  adapter: ImageProviderAdapter,
  req: ImageGenRequest,
  config: ValidatedAiImageConfig,
  callerSignal?: AbortSignal
): Promise<ImageGenOutcome> {
  try {
    return await adapter.generate(req, config, attemptSignal(callerSignal))
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Generate via the configured primary provider; on failure (and only then) try the configured
 * fallback ONCE — never the same adapter twice. Reports which path produced the result.
 */
export async function generateImage(
  req: ImageGenRequest,
  config: ValidatedAiImageConfig,
  callerSignal?: AbortSignal
): Promise<ImageGenOutcome & { usedFallback: boolean }> {
  const primary = await runAdapter(getImageAdapter(config.provider), req, config, callerSignal)
  if (primary.success) return { ...primary, usedFallback: false }

  const fb = config.fallbackProvider
  if (fb !== 'none' && fb !== config.provider) {
    logToFile('WARN', `[AI Image] primary ${config.provider} failed (${primary.error}); trying fallback ${fb}`)
    const fallback = await runAdapter(getImageAdapter(fb), req, config, callerSignal)
    return { ...fallback, usedFallback: true }
  }
  return { ...primary, usedFallback: false }
}
