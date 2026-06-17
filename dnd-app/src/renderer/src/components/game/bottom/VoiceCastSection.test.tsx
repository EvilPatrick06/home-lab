// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import VoiceCastSection from './VoiceCastSection'

const bmoVoiceCastGet = vi.fn()
const bmoVoiceCastSet = vi.fn()
const bmoVoiceCastReset = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // Assign window.api directly — replacing the whole window would clobber
  // happy-dom's document and break @testing-library's waitFor.
  ;(window as unknown as { api: unknown }).api = { bmoVoiceCastGet, bmoVoiceCastSet, bmoVoiceCastReset }
})

describe('VoiceCastSection (PHASE-21 21C)', () => {
  it('fetches the cast only when expanded', async () => {
    bmoVoiceCastGet.mockResolvedValue({ ok: true, cast: [], pool: [], backend: 'fish' })
    render(<VoiceCastSection campaignId="c1" />)
    expect(bmoVoiceCastGet).not.toHaveBeenCalled() // collapsed by default

    fireEvent.click(screen.getByText(/Voice Cast/))
    await waitFor(() => expect(bmoVoiceCastGet).toHaveBeenCalledWith('c1'))
    expect(await screen.findByText(/No NPCs cast yet/)).toBeTruthy()
  })

  it('lists cast entries and re-rolls a voice', async () => {
    bmoVoiceCastGet.mockResolvedValue({
      ok: true,
      cast: [{ speaker: 'Volo', backend: 'kokoro', voice_id: 'af_bella', speed: 1, pitch: 0 }],
      pool: ['af_bella', 'am_adam'],
      backend: 'kokoro'
    })
    bmoVoiceCastReset.mockResolvedValue({ ok: true, reset: true })
    render(<VoiceCastSection campaignId="c1" />)
    fireEvent.click(screen.getByText(/Voice Cast/))

    expect(await screen.findByText('Volo')).toBeTruthy()
    fireEvent.click(screen.getByText('Re-roll'))
    await waitFor(() => expect(bmoVoiceCastReset).toHaveBeenCalledWith('c1', 'Volo'))
  })

  it('overrides a voice via the select', async () => {
    bmoVoiceCastGet.mockResolvedValue({
      ok: true,
      cast: [{ speaker: 'Volo', backend: 'kokoro', voice_id: 'af_bella', speed: 1, pitch: 0 }],
      pool: ['af_bella', 'am_adam'],
      backend: 'kokoro'
    })
    bmoVoiceCastSet.mockResolvedValue({ ok: true, entry: { speaker: 'Volo', voice_id: 'am_adam' } })
    render(<VoiceCastSection campaignId="c1" />)
    fireEvent.click(screen.getByText(/Voice Cast/))
    await screen.findByText('Volo')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'am_adam' } })
    await waitFor(() =>
      expect(bmoVoiceCastSet).toHaveBeenCalledWith({ campaignId: 'c1', speaker: 'Volo', voiceId: 'am_adam' })
    )
  })
})
