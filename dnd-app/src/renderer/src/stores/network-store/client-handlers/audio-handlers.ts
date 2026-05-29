import type {
  NetworkMessage,
  PlayAmbientPayload,
  PlayCustomAudioPayload,
  PlaySoundPayload,
  StopCustomAudioPayload
} from '../../../network'
import {
  playAmbient as playAmbientSound,
  playCustomAudio,
  play as playSound,
  setAmbientVolume,
  stopAmbient,
  stopCustomAudio
} from '../../../services/sound-manager'
import { customAudioUrlCache } from './shared'

/** DM-driven audio handlers (host -> client). Self-contained: each reads only
 *  its message payload and drives the sound manager. Custom-audio handlers
 *  share the Blob-URL cache so a stop revokes the exact URL its play created. */

export function handlePlaySound(message: NetworkMessage): void {
  const payload = message.payload as PlaySoundPayload
  try {
    playSound(payload.event as Parameters<typeof playSound>[0])
  } catch {
    // Sound system not available
  }
}

export function handlePlayAmbient(message: NetworkMessage): void {
  const payload = message.payload as PlayAmbientPayload
  try {
    if (payload.volume != null) setAmbientVolume(payload.volume)
    playAmbientSound(payload.ambient as Parameters<typeof playAmbientSound>[0])
  } catch {
    // Sound system not available
  }
}

export function handleStopAmbient(): void {
  try {
    stopAmbient()
  } catch {
    // Sound system not available
  }
}

// Phase 27i — DM custom-audio sync. Decode the base64 payload into a Blob
// URL and play it keyed by fileName; cache the URL so stop can revoke it.
export function handlePlayCustomAudio(message: NetworkMessage): void {
  const payload = message.payload as PlayCustomAudioPayload
  try {
    if (!payload.audioData) return
    // Reuse a cached URL if we already have this track.
    let url = customAudioUrlCache.get(payload.fileName)
    if (!url) {
      const bytes = Uint8Array.from(atob(payload.audioData), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: payload.mimeType || 'audio/mpeg' })
      url = URL.createObjectURL(blob)
      customAudioUrlCache.set(payload.fileName, url)
    }
    playCustomAudio(url, { loop: payload.loop, volume: payload.volume })
  } catch {
    // Sound system not available / decode failed
  }
}

export function handleStopCustomAudio(message: NetworkMessage): void {
  const payload = message.payload as StopCustomAudioPayload
  try {
    const url = customAudioUrlCache.get(payload.fileName)
    if (url) {
      stopCustomAudio(url)
      URL.revokeObjectURL(url)
      customAudioUrlCache.delete(payload.fileName)
    }
  } catch {
    // Sound system not available
  }
}
