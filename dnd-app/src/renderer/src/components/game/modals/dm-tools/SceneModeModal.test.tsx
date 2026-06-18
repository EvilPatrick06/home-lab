// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { enterSceneMode, exitSceneMode, prepareSceneImage, list, readData, gameState } = vi.hoisted(() => ({
  enterSceneMode: vi.fn(),
  exitSceneMode: vi.fn(),
  prepareSceneImage: vi.fn(async () => 'data:prepared'),
  list: vi.fn(async () => ({
    success: true,
    data: [{ id: 'aiimg-1', name: 'Crypt Art', fileName: 'a.png', savedAt: '' }]
  })),
  readData: vi.fn(async () => ({ success: true, data: { dataUrl: 'data:lib', name: 'Crypt Art' } })),
  gameState: {
    sceneMode: null as unknown,
    maps: [] as Array<{ id: string; imagePath: string }>,
    activeMapId: null as string | null
  }
}))

vi.mock('../../../../services/game/scene-mode-controller', () => ({ enterSceneMode, exitSceneMode }))
vi.mock('../../../../services/game/scene-image', () => ({ prepareSceneImage }))
vi.mock('../../../../services/sound-manager', () => ({ getAllAmbientSounds: () => ['ambient-cave'] }))
vi.mock('../../../../stores/use-game-store', () => ({
  useGameStore: (sel: (s: typeof gameState) => unknown) => sel(gameState)
}))

import SceneModeModal from './SceneModeModal'

beforeEach(() => {
  vi.clearAllMocks()
  gameState.sceneMode = null
  localStorage.clear()
  // @ts-expect-error — test stub of the preload bridge
  window.api = { imageLibrary: { list, readData } }
})

describe('SceneModeModal (PHASE-35 35E)', () => {
  it('Enter passes the composed options to enterSceneMode', () => {
    render(<SceneModeModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/torches gutter/i), { target: { value: 'The crypt' } })
    fireEvent.click(screen.getByText('Enter scene'))
    expect(enterSceneMode).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'The crypt', imageData: null, ambient: 'keep' })
    )
  })

  it('a library pick calls readData with the chosen id', async () => {
    render(<SceneModeModal onClose={() => {}} />)
    fireEvent.click(screen.getByText('Image library'))
    await waitFor(() => expect(list).toHaveBeenCalled())
    const select = await screen.findByLabelText('Pick a saved image')
    fireEvent.change(select, { target: { value: 'aiimg-1' } })
    await waitFor(() => expect(readData).toHaveBeenCalledWith('aiimg-1'))
  })

  it('Exit button shows only when a scene is active and calls exitSceneMode', () => {
    gameState.sceneMode = { imageData: null, caption: null, particleEffect: 'none', enteredAt: 1 }
    render(<SceneModeModal onClose={() => {}} />)
    fireEvent.click(screen.getByText('Exit scene'))
    expect(exitSceneMode).toHaveBeenCalledTimes(1)
  })

  it('persists prefs to localStorage on change', () => {
    render(<SceneModeModal onClose={() => {}} />)
    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'embers' } }) // particle select
    const saved = JSON.parse(localStorage.getItem('dnd-vtt-scene-mode-prefs') ?? '{}')
    expect(saved.particleEffect).toBe('embers')
  })

  it('caps the caption at 500 characters', () => {
    render(<SceneModeModal onClose={() => {}} />)
    const input = screen.getByPlaceholderText(/torches gutter/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'x'.repeat(600) } })
    expect(input.value.length).toBe(500)
  })
})
