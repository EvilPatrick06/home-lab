// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bmoDmStatus = vi.fn()
const bmoStartDm = vi.fn()
const bmoStopDm = vi.fn()

import DiscordSessionSection from './DiscordSessionSection'

beforeEach(() => {
  bmoDmStatus.mockReset()
  bmoStartDm.mockReset()
  bmoStopDm.mockReset()
  ;(window as any).api = { bmoDmStatus, bmoStartDm, bmoStopDm }
})
afterEach(() => {
  ;(window as any).api = undefined
})

describe('DiscordSessionSection (PHASE-20 20G)', () => {
  it('renders idle status with a Start button', async () => {
    bmoDmStatus.mockResolvedValue({ running: true, active: false, players: [] })
    render(<DiscordSessionSection campaignId="c1" />)
    await waitFor(() => expect(screen.getByText(/No active session/)).toBeTruthy())
    expect(screen.getByRole('button', { name: /Start session/ })).toBeTruthy()
  })

  it('Start calls bmoStartDm with the campaign id', async () => {
    bmoDmStatus.mockResolvedValue({ running: true, active: false, players: [] })
    bmoStartDm.mockResolvedValue({ ok: true })
    render(<DiscordSessionSection campaignId="camp-42" />)
    await waitFor(() => screen.getByRole('button', { name: /Start session/ }))
    fireEvent.click(screen.getByRole('button', { name: /Start session/ }))
    await waitFor(() => expect(bmoStartDm).toHaveBeenCalledWith('camp-42'))
  })

  it('renders a structured start error (channel_not_found)', async () => {
    bmoDmStatus.mockResolvedValue({ running: true, active: false, players: [] })
    bmoStartDm.mockResolvedValue({ ok: false, error: 'channel_not_found' })
    render(<DiscordSessionSection campaignId="c1" />)
    await waitFor(() => screen.getByRole('button', { name: /Start session/ }))
    fireEvent.click(screen.getByRole('button', { name: /Start session/ }))
    await waitFor(() => expect(screen.getByText(/Could not find the Dungeon voice channel/)).toBeTruthy())
  })

  it('renders active status with players + a Stop button, and the recap on stop', async () => {
    bmoDmStatus.mockResolvedValue({ running: true, active: true, players: ['Alice', 'Bob'], voice_connected: true })
    bmoStopDm.mockResolvedValue({ ok: true, recap: 'The party slew the dragon.' })
    render(<DiscordSessionSection campaignId="c1" />)
    await waitFor(() => expect(screen.getByText(/Alice, Bob/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Stop session/ }))
    await waitFor(() => expect(screen.getByText(/The party slew the dragon/)).toBeTruthy())
  })

  it('renders the bot-down state when the bridge reports not running', async () => {
    bmoDmStatus.mockResolvedValue({ ok: false, error: 'DM bot not running' })
    render(<DiscordSessionSection campaignId="c1" />)
    await waitFor(() => expect(screen.getByText(/Bot offline/)).toBeTruthy())
  })
})
