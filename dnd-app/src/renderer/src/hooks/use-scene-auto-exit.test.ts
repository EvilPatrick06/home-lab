// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { exitSceneMode, addToast } = vi.hoisted(() => ({ exitSceneMode: vi.fn(), addToast: vi.fn() }))
vi.mock('../services/game/scene-mode-controller', () => ({ exitSceneMode }))
vi.mock('./use-toast', () => ({ addToast }))
vi.mock('../i18n', () => ({ useT: () => ({ t: (k: string) => k }) }))

import { useGameStore } from '../stores/use-game-store'
import { useSceneAutoExit } from './use-scene-auto-exit'

const COMBAT = { round: 1, entries: [], currentIndex: 0 } as never

function startCombat(): void {
  act(() => {
    useGameStore.setState({ initiative: COMBAT })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useGameStore.getState().reset()
})

describe('useSceneAutoExit (PHASE-35 35F)', () => {
  it('exits the scene once when combat starts (authority + scene + pref on)', () => {
    useGameStore.getState().setSceneMode({ imageData: null, caption: null, particleEffect: 'none', enteredAt: 1 })
    renderHook(() => useSceneAutoExit(true))
    expect(exitSceneMode).not.toHaveBeenCalled()
    startCombat()
    expect(exitSceneMode).toHaveBeenCalledTimes(1)
    expect(addToast).toHaveBeenCalledWith('game.sceneMode.combatAutoExit', 'info')
  })

  it('does nothing for a non-authority (client)', () => {
    useGameStore.getState().setSceneMode({ imageData: null, caption: null, particleEffect: 'none', enteredAt: 1 })
    renderHook(() => useSceneAutoExit(false))
    startCombat()
    expect(exitSceneMode).not.toHaveBeenCalled()
  })

  it('does nothing when no scene is active', () => {
    renderHook(() => useSceneAutoExit(true))
    startCombat()
    expect(exitSceneMode).not.toHaveBeenCalled()
  })

  it('respects autoExitOnCombat=false', () => {
    localStorage.setItem('dnd-vtt-scene-mode-prefs', JSON.stringify({ autoExitOnCombat: false }))
    useGameStore.getState().setSceneMode({ imageData: null, caption: null, particleEffect: 'none', enteredAt: 1 })
    renderHook(() => useSceneAutoExit(true))
    startCombat()
    expect(exitSceneMode).not.toHaveBeenCalled()
  })

  it('does not re-fire on subsequent initiative changes (only the null→non-null edge)', () => {
    useGameStore.getState().setSceneMode({ imageData: null, caption: null, particleEffect: 'none', enteredAt: 1 })
    renderHook(() => useSceneAutoExit(true))
    startCombat()
    expect(exitSceneMode).toHaveBeenCalledTimes(1)
    // A round advance keeps initiative non-null — must not re-fire.
    act(() => {
      useGameStore.setState({ initiative: { round: 2, entries: [], currentIndex: 1 } as never })
    })
    expect(exitSceneMode).toHaveBeenCalledTimes(1)
  })
})
