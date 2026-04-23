/**
 * Ambient and custom audio playback functions for the sound manager.
 */

import { logger } from '../utils/logger'
import type { AmbientSound } from './sound-manager'

// --- Module-level state for ambient/custom playback ---

/** Currently playing ambient loop */
let currentAmbient: HTMLAudioElement | null = null
let currentAmbientName: AmbientSound | null = null

/** Custom audio tracks (file path -> Audio element) */
const customAudioTracks: Map<string, HTMLAudioElement> = new Map()

/** Tier 2: DM custom audio overrides (event -> custom file path) */
export const customOverrides: Map<string, string> = new Map()

// --- Ambient playback ---

/**
 * Start playing an ambient sound loop.
 * Stops any currently playing ambient sound.
 */
export function playAmbient(ambient: AmbientSound, muted: boolean, ambientVolume: number): void {
  stopAmbient()

  const customPath = customOverrides.get(ambient)
  const path = customPath ?? `assets/audio/ambient/${ambient}.ogg`
  const audio = new Audio(path)
  audio.loop = true
  audio.volume = muted ? 0 : ambientVolume
  audio.play().catch(() => {})

  currentAmbient = audio
  currentAmbientName = ambient
}

/**
 * Stop the currently playing ambient sound.
 */
export function stopAmbient(): void {
  if (currentAmbient) {
    currentAmbient.pause()
    currentAmbient.currentTime = 0
    currentAmbient = null
    currentAmbientName = null
  }
}

/**
 * Get the name of the currently playing ambient sound, if any.
 */
export function getCurrentAmbient(): AmbientSound | null {
  return currentAmbientName
}

/**
 * Update the ambient audio element volume directly.
 */
export function updateAmbientVolume(muted: boolean, ambientVolume: number): void {
  if (currentAmbient) {
    currentAmbient.volume = muted ? 0 : ambientVolume
  }
}

/**
 * Smoothly fade the ambient volume to a target level over a duration.
 * Uses requestAnimationFrame for smooth interpolation.
 * @param targetVolume Target volume level (0-1).
 * @param durationMs Duration of the fade in milliseconds.
 * @param getAmbientVolume Getter for the current ambient volume.
 * @param setAmbientVolume Setter for ambient volume (updates module state).
 * @returns A promise that resolves when the fade is complete.
 */
export function fadeAmbient(
  targetVolume: number,
  durationMs: number,
  getAmbientVolume: () => number,
  setAmbientVolume: (v: number) => void
): Promise<void> {
  return new Promise<void>((resolve) => {
    const target = Math.max(0, Math.min(1, targetVolume))
    const startVolume = getAmbientVolume()
    const delta = target - startVolume

    if (durationMs <= 0 || Math.abs(delta) < 0.001) {
      setAmbientVolume(target)
      resolve()
      return
    }

    const startTime = performance.now()

    function step(now: number): void {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / durationMs, 1)

      // Ease-in-out for smoother perception
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2

      setAmbientVolume(startVolume + delta * eased)

      if (progress < 1) {
        requestAnimationFrame(step)
      } else {
        setAmbientVolume(target)
        resolve()
      }
    }

    requestAnimationFrame(step)
  })
}

// --- Custom audio playback ---

/**
 * Play a custom audio file from an absolute file path.
 * Supports loop and volume options. Tracks the audio element for later stopping.
 * @param filePath Absolute path to the audio file on disk.
 * @param options Playback options (loop, volume).
 * @param enabled Whether the sound system is enabled.
 * @param muted Whether sounds are muted.
 */
export function playCustomAudio(
  filePath: string,
  options: { loop?: boolean; volume?: number } | undefined,
  enabled: boolean,
  muted: boolean
): void {
  if (!enabled) return

  // Stop any existing playback of this file
  stopCustomAudio(filePath)

  // Convert file path to file:// URL for Audio element
  const fileUrl = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`
  const audio = new Audio(fileUrl)
  audio.loop = options?.loop ?? false
  audio.volume = muted ? 0 : Math.max(0, Math.min(1, options?.volume ?? 1))
  audio.play().catch((err) => {
    logger.warn('[SoundManager] Failed to play custom audio:', filePath, err)
  })

  customAudioTracks.set(filePath, audio)
}

/**
 * Stop a custom audio file that is currently playing.
 * @param filePath The file path used when starting playback.
 */
export function stopCustomAudio(filePath: string): void {
  const audio = customAudioTracks.get(filePath)
  if (audio) {
    audio.pause()
    audio.currentTime = 0
    customAudioTracks.delete(filePath)
  }
}

/**
 * Stop all currently playing custom audio tracks.
 */
export function stopAllCustomAudio(): void {
  for (const [key, audio] of customAudioTracks) {
    audio.pause()
    audio.currentTime = 0
    customAudioTracks.delete(key)
  }
}
