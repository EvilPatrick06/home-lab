import { beforeEach, describe, expect, it, vi } from 'vitest'

const bmoNarrate = vi.fn()

vi.stubGlobal('window', {
  api: {
    bmoNarrate
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

    expect(bmoNarrate).toHaveBeenCalledWith('Hello\n\nworld', undefined, undefined)
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
