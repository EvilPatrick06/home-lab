// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

// Selector-based store mocks (return a stable state for every field the dropdown reads).
const gameState = {
  inGameTime: null,
  turnMode: 'free',
  isPaused: false,
  setPaused: vi.fn(),
  setTurnMode: vi.fn(),
  endInitiative: vi.fn()
}
// biome-ignore lint/suspicious/noExplicitAny: selector mocks
vi.mock('../../../stores/use-game-store', () => ({ useGameStore: (sel: any) => sel(gameState) }))
const aiDmState = { paused: false, isTyping: false, setPaused: vi.fn() }
// biome-ignore lint/suspicious/noExplicitAny: selector mocks
vi.mock('../../../stores/use-ai-dm-store', () => ({ useAiDmStore: (sel: any) => sel(aiDmState) }))
// biome-ignore lint/suspicious/noExplicitAny: selector mocks
vi.mock('../../../stores/network-store', () => ({ useNetworkStore: (sel: any) => sel({ localPeerId: 'p1' }) }))
const lobbyState = {
  getLocalDiceColors: () => ({ primary: '#fff', secondary: '#000' }),
  setDiceColors: vi.fn()
}
// biome-ignore lint/suspicious/noExplicitAny: selector mocks
vi.mock('../../../stores/use-lobby-store', () => ({ useLobbyStore: (sel: any) => sel(lobbyState) }))
vi.mock('../../../services/sound-manager', () => ({
  getAllSoundEvents: () => [],
  getCustomSounds: () => [],
  registerCustomSound: vi.fn(),
  reinit: vi.fn(),
  removeCustomSound: vi.fn(),
  stopAllCustomAudio: vi.fn()
}))
vi.mock('../../../hooks/use-toast', () => ({ addToast: vi.fn() }))

import SettingsDropdown from './SettingsDropdown'

// biome-ignore lint/suspicious/noExplicitAny: minimal campaign fixture
function makeCampaign(aiDm: any) {
  return { id: 'c1', name: 'Test', players: [], aiDm } as any
}

function renderDropdown(aiDm: unknown) {
  return render(
    <MemoryRouter>
      <SettingsDropdown
        campaign={makeCampaign(aiDm)}
        isDM
        isOpen
        onToggle={vi.fn()}
        onToggleFullscreen={vi.fn()}
        isFullscreen={false}
        onLeaveGame={vi.fn()}
      />
    </MemoryRouter>
  )
}

describe('SettingsDropdown AI DM label (PHASE-10 10A)', () => {
  it('can be imported', async () => {
    const mod = await import('./SettingsDropdown')
    expect(mod).toBeDefined()
  })

  it('shows the configured Gemini model and never "Ollama"', () => {
    renderDropdown({ enabled: true, provider: 'gemini', model: 'gemini-2.0-flash' })
    expect(screen.getByText('gemini-2.0-flash')).toBeTruthy()
    expect(screen.queryByText(/Ollama/)).toBeNull()
  })
})
