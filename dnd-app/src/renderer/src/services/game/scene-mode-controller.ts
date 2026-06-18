/**
 * PHASE-35 35E — the single owner of cinematic scene-mode enter/exit semantics: store mutation,
 * the `dm:scene-mode` broadcast, and ambient snapshot/restore through the existing dm:play/stop-ambient
 * pipeline. Components-only consumer, so it imports the stores + sound-manager directly.
 */

import {
  type AmbientSound,
  getCurrentAmbient,
  playAmbient,
  setAmbientVolume,
  stopAmbient
} from '../../services/sound-manager'
import type { SceneModeState, SceneParticleEffect } from '../../stores/game/types'
import { useNetworkStore } from '../../stores/network-store'
import { useGameStore } from '../../stores/use-game-store'

export interface EnterSceneOptions {
  imageData: string | null
  caption: string | null
  particleEffect: SceneParticleEffect
  ambient: 'keep' | 'stop' | AmbientSound
  ambientVolume?: number // 0..1, only when ambient is a track
}

function broadcast(scene: SceneModeState | null): void {
  useNetworkStore.getState().sendMessage('dm:scene-mode', { scene })
}

export function isSceneActive(): boolean {
  return useGameStore.getState().sceneMode !== null
}

export function enterSceneMode(opts: EnterSceneOptions): void {
  const store = useGameStore.getState()
  const firstEnter = store.sceneMode === null
  // Snapshot the pre-scene ambient only on the first enter — updates keep the original snapshot.
  if (firstEnter) store.setSceneModePrevAmbient(getCurrentAmbient())

  const scene: SceneModeState = {
    imageData: opts.imageData,
    caption: opts.caption,
    particleEffect: opts.particleEffect,
    enteredAt: Date.now()
  }
  store.setSceneMode(scene)
  broadcast(scene)

  if (opts.ambient === 'keep') return
  if (opts.ambient === 'stop') {
    stopAmbient()
    useNetworkStore.getState().sendMessage('dm:stop-ambient', {})
    return
  }
  // A specific track.
  if (typeof opts.ambientVolume === 'number') setAmbientVolume(opts.ambientVolume)
  playAmbient(opts.ambient)
  useNetworkStore.getState().sendMessage('dm:play-ambient', { ambient: opts.ambient, volume: opts.ambientVolume })
}

export function exitSceneMode(): void {
  const store = useGameStore.getState()
  if (store.sceneMode === null) return // idempotent
  store.setSceneMode(null)
  broadcast(null)

  // Restore the pre-scene ambient if it changed while the scene was up.
  const prev = store.sceneModePrevAmbient
  const current = getCurrentAmbient()
  if (prev !== current) {
    if (prev) {
      playAmbient(prev as AmbientSound)
      useNetworkStore.getState().sendMessage('dm:play-ambient', { ambient: prev })
    } else {
      stopAmbient()
      useNetworkStore.getState().sendMessage('dm:stop-ambient', {})
    }
  }
  store.setSceneModePrevAmbient(null)
}
