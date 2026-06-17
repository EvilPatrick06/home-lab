/**
 * PHASE-33 33D — AI image-generation IPC. Config get/set, provider availability, and a single-flight
 * generate that builds the prompt (33C), runs the primary→fallback orchestrator (33B), streams SD
 * progress to the renderer, and saves the result to the existing image library. Disabled by default.
 */

import { randomUUID } from 'crypto'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { AiImageConfigSchema, AiImageGenerateRequestSchema } from '../../shared/ipc-schemas'
import * as aiService from '../ai/ai-service'
import { configureImageGen, getImageGenConfig } from '../ai/image/image-gen-config'
import { buildImagePrompt } from '../ai/image/image-prompt'
import { generateImage } from '../ai/image/image-provider'
import { getProgress, sdWebuiAdapter } from '../ai/image/sd-webui-client'
import { logToFile } from '../log'
import { saveImage } from '../storage/image-library-storage'
import { validateUploadExtension } from '../upload-validation'
import { handle, withSchema } from './_safe'

let inFlight = false

function parseSize(size: string): { width: number; height: number } {
  const [w, h] = size.split('x').map((n) => Number.parseInt(n, 10))
  return { width: w || 1024, height: h || 1024 }
}

export function registerImageGenHandlers(): void {
  handle(IPC_CHANNELS.AI_IMAGE_GET_CONFIG, async () => getImageGenConfig())

  handle(
    IPC_CHANNELS.AI_IMAGE_CONFIGURE,
    withSchema(IPC_CHANNELS.AI_IMAGE_CONFIGURE, AiImageConfigSchema, async (_e, cfg) => {
      await configureImageGen(cfg)
      return { success: true }
    })
  )

  handle(IPC_CHANNELS.AI_IMAGE_CHECK_PROVIDERS, async () => {
    const cfg = getImageGenConfig()
    return {
      sdWebui: await sdWebuiAdapter.isAvailable(cfg),
      openai: Boolean(aiService.getConfig().openaiApiKey),
      gemini: Boolean(aiService.getConfig().geminiApiKey)
    }
  })

  handle(
    IPC_CHANNELS.AI_IMAGE_GENERATE,
    withSchema(IPC_CHANNELS.AI_IMAGE_GENERATE, AiImageGenerateRequestSchema, async (event, req) => {
      const cfg = getImageGenConfig()
      if (!cfg.enabled) {
        return {
          success: false,
          disabled: true,
          error: 'Image generation is disabled. Enable it in the AI DM settings.'
        }
      }
      if (inFlight) return { success: false, error: 'A generation is already in progress.' }
      inFlight = true

      const { width, height } = parseSize(req.size ?? cfg.size)
      const { prompt, negativePrompt } = buildImagePrompt(
        req.subjectType,
        req.description,
        req.stylePreset,
        cfg.provider,
        req.negativePrompt
      )

      // SD progress polling → renderer (guarded against a closed window).
      let poller: ReturnType<typeof setInterval> | null = null
      if (cfg.provider === 'sd-webui') {
        poller = setInterval(async () => {
          const p = await getProgress(cfg.sdWebuiUrl)
          if (p && !event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.AI_IMAGE_PROGRESS, { progress: p.progress, etaSeconds: p.etaRelative })
          }
        }, 1000)
      }

      try {
        const result = await generateImage({ prompt, negativePrompt, width, height }, cfg)
        if (!result.success) return { success: false, error: result.error, usedFallback: result.usedFallback }

        const buf = Buffer.from(result.base64, 'base64')
        const ext = result.mimeType === 'image/jpeg' ? '.jpg' : '.png'
        const extError = validateUploadExtension(buf, ext)
        if (extError) return { success: false, error: extError }

        const id = `aiimg-${randomUUID()}`
        const name = `${req.subjectType}: ${req.description.slice(0, 60)}`
        const saved = await saveImage(id, name, buf, ext)
        if (!saved.success) logToFile('WARN', `[AI Image] library save failed: ${saved.error}`)

        return {
          success: true,
          imageId: id,
          dataUrl: `data:${result.mimeType};base64,${result.base64}`,
          provider: result.provider,
          model: result.model,
          usedFallback: result.usedFallback
        }
      } finally {
        if (poller) clearInterval(poller)
        inFlight = false
      }
    })
  )
}
