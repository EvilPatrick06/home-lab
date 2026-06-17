/**
 * PHASE-33 33B — OpenAI image adapter (gpt-image-* default, dall-e-* supported). Reuses the OpenAI
 * API key the AI DM config already persists/encrypts. `gpt-image-*` ignores negative prompts (folded
 * into the prompt by 33C) and returns base64 by default; dall-e needs explicit response_format.
 */

import OpenAI from 'openai'
import type { ValidatedAiImageConfig } from '../../../shared/ipc-schemas'
import * as aiService from '../ai-service'
import type { ImageGenOutcome, ImageGenRequest, ImageProviderAdapter } from './image-provider'

/** Pure params builder — exported so the unit test needs no SDK mock. */
export function buildOpenAiImageParams(
  config: ValidatedAiImageConfig,
  prompt: string,
  width: number,
  height: number
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    model: config.openaiModel,
    prompt,
    size: `${width}x${height}`,
    quality: config.openaiQuality
  }
  // gpt-image-* returns b64_json by default; dall-e-* must be told to.
  if (config.openaiModel.startsWith('dall-e')) params.response_format = 'b64_json'
  return params
}

async function generate(
  req: ImageGenRequest,
  config: ValidatedAiImageConfig,
  signal?: AbortSignal
): Promise<ImageGenOutcome> {
  const apiKey = aiService.getConfig().openaiApiKey
  if (!apiKey) return { success: false, error: 'No OpenAI API key configured' }
  const client = new OpenAI({ apiKey })
  const params = buildOpenAiImageParams(config, req.prompt, req.width, req.height)
  // biome-ignore lint/suspicious/noExplicitAny: OpenAI's images.generate param union is narrower than our dynamic params object
  const response = await client.images.generate(params as any, { signal })
  const b64 = response.data?.[0]?.b64_json
  if (!b64) return { success: false, error: 'OpenAI returned no base64 image' }
  return { success: true, base64: b64, mimeType: 'image/png', provider: 'openai', model: config.openaiModel }
}

async function isAvailable(): Promise<boolean> {
  return !!aiService.getConfig().openaiApiKey
}

export const openaiImageAdapter: ImageProviderAdapter = { type: 'openai', isAvailable, generate }
