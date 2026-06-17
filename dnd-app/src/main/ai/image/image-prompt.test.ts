import { describe, expect, it } from 'vitest'
import { AiImageSubjectSchema } from '../../../shared/ipc-schemas'
import { buildImagePrompt, type ImageSubjectType, SUBJECT_TEMPLATES } from './image-prompt'

describe('image-prompt (PHASE-33 33C)', () => {
  it('SUBJECT_TEMPLATES is exhaustive over the AiImageSubjectSchema enum', () => {
    expect(Object.keys(SUBJECT_TEMPLATES).sort()).toEqual([...AiImageSubjectSchema.options].sort())
  })

  it('every subject yields a non-empty, distinct prompt', () => {
    const prompts = AiImageSubjectSchema.options.map(
      (s) => buildImagePrompt(s as ImageSubjectType, 'a grizzled dwarf', undefined, 'sd-webui').prompt
    )
    expect(prompts.every((p) => p.length > 0)).toBe(true)
    expect(new Set(prompts).size).toBe(prompts.length)
  })

  it('custom subject is verbatim', () => {
    const { prompt } = buildImagePrompt('custom', 'exactly this text', undefined, 'sd-webui')
    expect(prompt).toBe('exactly this text')
  })

  it('style suffix appended exactly once', () => {
    const { prompt } = buildImagePrompt('npc-portrait', 'a mage', 'ink-sketch', 'sd-webui')
    expect(prompt.match(/black ink sketch/g)?.length).toBe(1)
  })

  it('SD gets a negative list; cloud gets the no-text instruction in the prompt instead', () => {
    const sd = buildImagePrompt('scene', 'a forest', undefined, 'sd-webui')
    expect(sd.negativePrompt).toContain('watermark')
    expect(sd.prompt).not.toContain('Do not include any text')

    const openai = buildImagePrompt('scene', 'a forest', undefined, 'openai')
    expect(openai.negativePrompt).toBeUndefined()
    expect(openai.prompt).toContain('Do not include any text')

    const gemini = buildImagePrompt('scene', 'a forest', undefined, 'gemini')
    expect(gemini.negativePrompt).toBeUndefined()
    expect(gemini.prompt).toContain('Do not include any text')
  })

  it('user negative is merged ahead of the defaults, deduped', () => {
    const { negativePrompt } = buildImagePrompt('item', 'a sword', undefined, 'sd-webui', 'nsfw, watermark')
    expect(negativePrompt?.startsWith('nsfw, watermark')).toBe(true)
    // 'watermark' appears once (user's), not duplicated by the default list.
    expect(negativePrompt?.match(/watermark/g)?.length).toBe(1)
  })
})
