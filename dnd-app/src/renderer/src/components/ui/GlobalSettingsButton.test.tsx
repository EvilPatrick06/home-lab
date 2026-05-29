// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mutable pathname the mocked useLocation returns; navigate spy shared per test.
const state = vi.hoisted(() => ({ pathname: '/' }))
const navigate = vi.hoisted(() => vi.fn())

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: state.pathname })
}))

import GlobalSettingsButton from './GlobalSettingsButton'

afterEach(() => {
  navigate.mockClear()
})

describe('GlobalSettingsButton', () => {
  it('navigates to /settings from another page', () => {
    state.pathname = '/characters'
    render(<GlobalSettingsButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(navigate).toHaveBeenCalledWith('/settings')
  })

  it('toggles back (navigate(-1)) when already on /settings', () => {
    state.pathname = '/settings'
    render(<GlobalSettingsButton />)
    // Label flips to "Close settings" on the settings page.
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(navigate).toHaveBeenCalledWith(-1)
    expect(navigate).not.toHaveBeenCalledWith('/settings')
  })

  it('renders nothing on the in-game route (game has its own dropdown)', () => {
    state.pathname = '/game/abc123'
    const { container } = render(<GlobalSettingsButton />)
    expect(container.firstChild).toBeNull()
  })
})
