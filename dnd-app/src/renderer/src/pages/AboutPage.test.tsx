// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AboutPage from './AboutPage'

function stubApi(): void {
  ;(window as unknown as { api: unknown }).api = {
    getVersion: vi.fn().mockResolvedValue('2.4.77'),
    update: {
      onStatus: vi.fn(() => () => undefined),
      checkForUpdates: vi.fn().mockResolvedValue({ state: 'not-available' }),
      downloadUpdate: vi.fn().mockResolvedValue(undefined),
      installUpdate: vi.fn().mockResolvedValue(undefined)
    }
  }
}

afterEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { __DND_WEB__?: boolean }).__DND_WEB__ = undefined
})

describe('AboutPage updater gate (PHASE-45 F1/F3)', () => {
  beforeEach(stubApi)

  it('shows the "Check for Updates" control in the desktop build', async () => {
    ;(window as unknown as { __DND_WEB__?: boolean }).__DND_WEB__ = undefined
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /check for updates/i })).toBeTruthy())
  })

  it('hides every updater affordance in the web build', () => {
    ;(window as unknown as { __DND_WEB__?: boolean }).__DND_WEB__ = true
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    )
    expect(screen.queryByRole('button', { name: /check for updates/i })).toBeNull()
  })
})
