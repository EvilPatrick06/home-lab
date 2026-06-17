/**
 * PHASE-33 33B — AUTOMATIC1111-compatible Stable Diffusion adapter (also covers SD.Next + Forge,
 * which expose the same /sdapi/v1 routes). Keyless on a LAN.
 */

import type { ValidatedAiImageConfig } from '../../../shared/ipc-schemas'
import type { ImageGenOutcome, ImageGenRequest, ImageProviderAdapter } from './image-provider'

export function buildTxt2ImgBody(req: ImageGenRequest, config: ValidatedAiImageConfig): Record<string, unknown> {
  return {
    prompt: req.prompt,
    negative_prompt: req.negativePrompt ?? '',
    steps: config.sdSteps,
    sampler_name: config.sdSampler,
    cfg_scale: config.sdCfgScale,
    width: req.width,
    height: req.height,
    ...(config.sdModel
      ? {
          override_settings: { sd_model_checkpoint: config.sdModel },
          override_settings_restore_afterwards: true
        }
      : {})
  }
}

async function generate(
  req: ImageGenRequest,
  config: ValidatedAiImageConfig,
  signal?: AbortSignal
): Promise<ImageGenOutcome> {
  const res = await fetch(`${config.sdWebuiUrl}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTxt2ImgBody(req, config)),
    signal
  })
  if (!res.ok) {
    return { success: false, error: `SD WebUI HTTP ${res.status}: ${res.statusText}` }
  }
  const data = (await res.json()) as { images?: string[] }
  const base64 = data.images?.[0]
  if (!base64) return { success: false, error: 'SD WebUI returned no image' }
  // images[0] is raw base64 PNG (no data-URL prefix).
  return { success: true, base64, mimeType: 'image/png', provider: 'sd-webui', model: config.sdModel ?? 'sd-webui' }
}

async function isAvailable(config: ValidatedAiImageConfig): Promise<boolean> {
  try {
    const res = await fetch(`${config.sdWebuiUrl}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/** PHASE-33 33D — poll SD generation progress (0..1). Returns null on any failure (tolerant). */
export async function getProgress(
  url: string,
  signal?: AbortSignal
): Promise<{ progress: number; etaRelative: number } | null> {
  try {
    const res = await fetch(`${url}/sdapi/v1/progress?skip_current_image=true`, { signal })
    if (!res.ok) return null
    const data = (await res.json()) as { progress?: number; eta_relative?: number }
    return { progress: data.progress ?? 0, etaRelative: data.eta_relative ?? 0 }
  } catch {
    return null
  }
}

export const sdWebuiAdapter: ImageProviderAdapter = { type: 'sd-webui', isAvailable, generate }
