// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCharacterStore } from '../stores/use-character-store'
import { createMockCharacter } from '../test-helpers'
import { migrateCharacter5eFromV3ToV4 } from '../types/character-5e-migration'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router', () => ({
  useParams: () => ({ id: 'char-1' }),
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/characters/5e/char-1', state: {} })
}))

// Permissive window.api so the real sheet sections mount without crashing into
// the sheet ErrorBoundary (which would mask render behaviour under test).
function installApiMock(): void {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'lan') return new Proxy({}, { get: () => () => () => undefined })
      return (..._args: unknown[]) => Promise.resolve({ success: true, data: [] })
    }
  }
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = new Proxy({}, handler)
}

describe('CharacterSheet5ePage', () => {
  beforeEach(() => {
    installApiMock()
    const c = migrateCharacter5eFromV3ToV4(createMockCharacter({ id: 'char-1', playerId: 'local', name: 'Smoke' }))
    useCharacterStore.setState({ characters: [c], loading: false, selectedCharacterId: null })
  })
  afterEach(() => {
    useCharacterStore.setState({ characters: [], loading: false, selectedCharacterId: null })
    vi.clearAllMocks()
  })

  it('renders the sheet for a saved character (not the not-found fallback)', async () => {
    const { default: CharacterSheet5ePage } = await import('./CharacterSheet5ePage')
    render(<CharacterSheet5ePage />)
    expect(screen.queryByText(/character not found/i)).toBeNull()
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeTruthy()
  })

  // Regression guard: toggling edit mode / opening rest+history must not throw or
  // enter a render loop (a setState/effect loop would exceed React's update depth
  // and surface here as a thrown #185 rather than a silent hang).
  it('survives toolbar interactions without crashing or looping', async () => {
    const { default: CharacterSheet5ePage } = await import('./CharacterSheet5ePage')
    render(<CharacterSheet5ePage />)
    const click = (re: RegExp): void => {
      const btn = screen.queryAllByRole('button', { name: re })[0]
      if (btn) fireEvent.click(btn)
    }
    click(/^edit$/i)
    click(/short rest/i)
    click(/long rest/i)
    click(/history/i)
    click(/^done$/i)
    expect(screen.queryByText(/character not found/i)).toBeNull()
  })
})
