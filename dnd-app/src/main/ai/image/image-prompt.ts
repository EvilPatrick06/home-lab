/**
 * PHASE-33 33C — deterministic image-prompt templates. Turns a DM's plain-English description into a
 * competent image prompt per subject type, with provider-aware negative-prompt handling: SD takes a
 * real negative_prompt; OpenAI/Gemini have no such parameter, so the avoid-list is folded into the prompt.
 */

import type { AiImageProviderType } from '../../../shared/ipc-schemas'

export type ImageSubjectType = 'npc-portrait' | 'scene' | 'item' | 'creature' | 'custom'
export type ImageStylePreset = 'painterly' | 'ink-sketch' | 'photorealistic' | 'isometric'

/** Subject templates keyed by the AiImageSubjectSchema enum values (test asserts exhaustiveness). */
export const SUBJECT_TEMPLATES: Record<ImageSubjectType, (d: string) => string> = {
  'npc-portrait': (d) =>
    `Fantasy character portrait, head and shoulders, ${d}, detailed face, dramatic lighting, neutral dark background`,
  scene: (d) =>
    `Fantasy landscape illustration, wide establishing shot, ${d}, atmospheric depth, cinematic composition`,
  item: (d) =>
    `Single fantasy item illustration, ${d}, centered on a plain parchment background, no hands, studio lighting`,
  creature: (d) => `Fantasy monster illustration, full body, ${d}, dynamic pose, dungeon ambiance`,
  custom: (d) => d
}

const STYLE_SUFFIX: Record<ImageStylePreset, string> = {
  painterly: ', oil painting style, visible brushwork',
  'ink-sketch': ', black ink sketch, crosshatching, monochrome',
  photorealistic: ', photorealistic, 8k detail',
  isometric: ', isometric view, game asset style'
}

const DEFAULT_SD_NEGATIVE =
  'text, watermark, signature, logo, blurry, lowres, deformed hands, extra fingers, extra limbs, jpeg artifacts'
const CLOUD_NO_TEXT_INSTRUCTION = '\nDo not include any text, lettering, watermarks, or signatures in the image.'

/** Comma-join + case-insensitive dedupe (user terms first). */
function mergeNegatives(userNegative: string | undefined): string {
  const parts = [...(userNegative ? userNegative.split(',') : []), ...DEFAULT_SD_NEGATIVE.split(',')]
    .map((s) => s.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const k = p.toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(p)
    }
  }
  return out.join(', ')
}

export function buildImagePrompt(
  subjectType: ImageSubjectType,
  description: string,
  stylePreset: ImageStylePreset | undefined,
  providerType: AiImageProviderType,
  userNegativePrompt?: string
): { prompt: string; negativePrompt?: string } {
  let prompt = SUBJECT_TEMPLATES[subjectType](description.trim())
  if (stylePreset) prompt += STYLE_SUFFIX[stylePreset]

  if (providerType === 'sd-webui') {
    return { prompt, negativePrompt: mergeNegatives(userNegativePrompt) }
  }
  // OpenAI / Gemini: no negative-prompt parameter — fold the no-text instruction into the prompt.
  return { prompt: prompt + CLOUD_NO_TEXT_INSTRUCTION, negativePrompt: undefined }
}
