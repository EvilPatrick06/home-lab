/**
 * PHASE-33 33B — Gemini image adapter via RAW REST (`:generateContent` with image response modality).
 * Kept SDK-independent + fetch-mockable; reuses the Gemini API key the AI DM config persists. Gemini
 * ignores explicit size — the aspect ratio is requested in prose by 33C; we accept what comes back.
 */

import type { ValidatedAiImageConfig } from '../../../shared/ipc-schemas'
import * as aiService from '../ai-service'
import type { ImageGenOutcome, ImageGenRequest, ImageProviderAdapter } from './image-provider'

interface GeminiPart {
  text?: string
  inlineData?: { mimeType?: string; data?: string }
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
  promptFeedback?: { blockReason?: string }
}

async function generate(
  req: ImageGenRequest,
  config: ValidatedAiImageConfig,
  signal?: AbortSignal
): Promise<ImageGenOutcome> {
  const apiKey = aiService.getConfig().geminiApiKey
  if (!apiKey) return { success: false, error: 'No Gemini API key configured' }

  // PHASE-43 (CodeQL js/request-forgery): geminiModel is a user-configurable string
  // interpolated into the request URL's PATH. Constrain it to a model-name charset so a
  // poisoned/typo'd config can't inject extra path segments, a query string, or a host
  // override (e.g. '../', ':', '?', '#', '@'). Real Gemini model ids (gemini-2.5-flash …)
  // are [a-z0-9.-] and pass unchanged.
  if (!/^[a-zA-Z0-9.-]+$/.test(config.geminiModel)) {
    return { success: false, error: `Invalid Gemini model name: "${config.geminiModel}"` }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      }),
      signal
    }
  )
  if (!res.ok) return { success: false, error: `Gemini HTTP ${res.status}: ${res.statusText}` }

  const data = (await res.json()) as GeminiResponse
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData?.data)
  if (!imagePart?.inlineData?.data) {
    const reason = data.promptFeedback?.blockReason
    return { success: false, error: reason ? `Gemini returned no image (${reason})` : 'Gemini returned no image' }
  }
  const mime = imagePart.inlineData.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  return {
    success: true,
    base64: imagePart.inlineData.data,
    mimeType: mime,
    provider: 'gemini',
    model: config.geminiModel
  }
}

async function isAvailable(): Promise<boolean> {
  return !!aiService.getConfig().geminiApiKey
}

export const geminiImageAdapter: ImageProviderAdapter = { type: 'gemini', isAvailable, generate }
