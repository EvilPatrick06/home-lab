import { beforeEach, describe, expect, it, vi } from 'vitest'

const bmoNarrate = vi.fn()
const bmoNarrateCancel = vi.fn()

vi.stubGlobal('window', {
  api: {
    bmoNarrate,
    bmoNarrateCancel
  }
})

describe('bmo-narration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes narration text before sending', async () => {
    const { normalizeNarrationText, speakNarrationThroughBmo } = await import('./bmo-narration')

    expect(normalizeNarrationText('Hello\n\n\n\nworld')).toBe('Hello\n\nworld')

    await speakNarrationThroughBmo('  Hello\n\n\n\nworld  ')

    // PHASE-21 21B: single payload object.
    expect(bmoNarrate).toHaveBeenCalledWith({ text: 'Hello\n\nworld' })
  })

  it('forwards opts (speaker/interrupt) in the payload', async () => {
    const { speakNarrationThroughBmo } = await import('./bmo-narration')
    await speakNarrationThroughBmo('Hello there.', { speaker: 'Volo', interrupt: true })
    expect(bmoNarrate).toHaveBeenCalledWith({ text: 'Hello there.', speaker: 'Volo', interrupt: true })
  })

  it('cancelNarrationThroughBmo invokes the cancel channel', async () => {
    bmoNarrateCancel.mockResolvedValueOnce({ ok: true, cancelled: true, flushed: 0 })
    const { cancelNarrationThroughBmo } = await import('./bmo-narration')
    const result = await cancelNarrationThroughBmo()
    expect(bmoNarrateCancel).toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })

  it('returns an error when narration is empty after trimming', async () => {
    const { speakNarrationThroughBmo } = await import('./bmo-narration')

    const result = await speakNarrationThroughBmo('   ')

    expect(result).toEqual({
      success: false,
      error: 'No narration text to speak'
    })
    expect(bmoNarrate).not.toHaveBeenCalled()
  })

  it('surfaces BMO bridge errors', async () => {
    bmoNarrate.mockResolvedValueOnce({ ok: false, error: 'Bridge offline' })

    const { speakNarrationThroughBmo } = await import('./bmo-narration')
    const result = await speakNarrationThroughBmo('The chamber opens.')

    expect(result).toEqual({
      success: false,
      error: 'Bridge offline'
    })
  })
})
