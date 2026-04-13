import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import {
  calculateSoundOcclusion,
  getPlayerListenerPosition,
  type SoundOcclusionResult
} from '../../../services/map/sound-occlusion'
import type { GameMap } from '../../../types/map'
import { logger } from '../../../utils/logger'

export interface AudioEmitter {
  id: string
  x: number // grid cell X
  y: number // grid cell Y
  soundId: string
  displayName: string
  radius: number // in cells
  volume: number // 0-1
  spatial: boolean // whether to use distance-based volume
  playing: boolean
}

export interface AudioEmitterWithOcclusion extends AudioEmitter {
  occlusionResult?: SoundOcclusionResult
}

/** Manages per-emitter HTMLAudioElement playback with volume based on occlusion/distance */
class EmitterAudioManager {
  private audioElements: Map<string, HTMLAudioElement> = new Map()

  /** Start or resume playback for an emitter */
  play(emitterId: string, soundId: string, volume: number): void {
    if (typeof Audio === 'undefined') return // Guard for non-browser environments
    let audio = this.audioElements.get(emitterId)
    if (!audio) {
      const path = `./sounds/ambient/${soundId.replace('ambient-', '')}.mp3`
      audio = new Audio(path)
      audio.loop = true
      audio.preload = 'auto'
      audio.addEventListener(
        'error',
        () => {
          logger.debug('[EmitterAudio] Failed to load sound for emitter:', emitterId, path)
        },
        { once: true }
      )
      this.audioElements.set(emitterId, audio)
    }
    audio.volume = Math.max(0, Math.min(1, volume))
    if (audio.paused) {
      audio.play().catch((err) => {
        logger.debug('[EmitterAudio] Play failed for emitter:', emitterId, err)
      })
    }
  }

  /** Stop playback for an emitter */
  stop(emitterId: string): void {
    const audio = this.audioElements.get(emitterId)
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      this.audioElements.delete(emitterId)
    }
  }

  /** Update volume for an active emitter */
  setVolume(emitterId: string, volume: number): void {
    const audio = this.audioElements.get(emitterId)
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume))
    }
  }

  /** Check if an emitter is currently playing audio */
  isPlaying(emitterId: string): boolean {
    const audio = this.audioElements.get(emitterId)
    return audio != null && !audio.paused
  }

  /** Stop all emitter audio and clear state */
  destroyAll(): void {
    for (const [, audio] of this.audioElements) {
      audio.pause()
      audio.currentTime = 0
    }
    this.audioElements.clear()
  }
}

export class AudioEmitterLayer {
  private container: Container
  private emitters: Map<string, { data: AudioEmitterWithOcclusion; graphic: Graphics; label: Text }> = new Map()
  private cellSize: number = 40
  private map: GameMap | null = null
  private listenerPosition: { x: number; y: number } | null = null
  private audioManager = new EmitterAudioManager()
  private onToggleCallback: ((emitterId: string) => void) | null = null

  constructor() {
    this.container = new Container()
    this.container.label = 'audioEmitters'
  }

  getContainer(): Container {
    return this.container
  }

  setCellSize(size: number): void {
    this.cellSize = size
  }

  /** Register a callback invoked when the DM clicks an emitter to toggle play/pause */
  onToggle(callback: (emitterId: string) => void): void {
    this.onToggleCallback = callback
  }

  setMap(map: GameMap): void {
    this.map = map
    this.updateListenerPosition()
  }

  setListenerPosition(x: number, y: number): void {
    this.listenerPosition = { x, y }
    this.updateEmitterOcclusion()
    this.syncAudioVolumes()
  }

  private updateListenerPosition(): void {
    if (!this.map) return
    const listenerPos = getPlayerListenerPosition(this.map)
    if (listenerPos) {
      this.listenerPosition = listenerPos
      this.updateEmitterOcclusion()
      this.syncAudioVolumes()
    }
  }

  private updateEmitterOcclusion(): void {
    if (!this.map || !this.listenerPosition) return

    for (const [_id, entry] of this.emitters) {
      const emitter = entry.data
      if (emitter.spatial && emitter.playing) {
        const occlusion = calculateSoundOcclusion(
          emitter.x,
          emitter.y,
          this.listenerPosition.x,
          this.listenerPosition.y,
          this.map,
          emitter.volume,
          emitter.radius
        )
        entry.data.occlusionResult = occlusion
      }
    }
  }

  /** Sync HTMLAudioElement volumes to match current occlusion-adjusted volumes */
  private syncAudioVolumes(): void {
    for (const [id, entry] of this.emitters) {
      if (entry.data.playing) {
        const vol = this.getEmitterVolume(id)
        this.audioManager.setVolume(id, vol)
      }
    }
  }

  /** Start/stop audio playback to match the playing state of each emitter */
  private syncAudioPlayback(): void {
    // Start audio for emitters that should be playing
    for (const [id, entry] of this.emitters) {
      const emitter = entry.data
      if (emitter.playing) {
        const vol = this.getEmitterVolume(id)
        this.audioManager.play(id, emitter.soundId, vol)
      } else {
        this.audioManager.stop(id)
      }
    }

    // Stop audio for emitters that were removed
    // (handled by updateEmitters removing from this.emitters before calling this)
  }

  updateEmitters(emitters: AudioEmitter[]): void {
    // Remove old
    const newIds = new Set(emitters.map((e) => e.id))
    for (const [id, entry] of this.emitters) {
      if (!newIds.has(id)) {
        this.container.removeChild(entry.graphic)
        this.container.removeChild(entry.label)
        entry.graphic.destroy()
        entry.label.destroy()
        this.audioManager.stop(id)
        this.emitters.delete(id)
      }
    }

    // Add/update
    for (const emitter of emitters) {
      const existing = this.emitters.get(emitter.id)
      if (existing) {
        this.drawEmitter(existing.graphic, emitter)
        existing.label.text = emitter.playing ? '\uD83D\uDD0A' : '\uD83D\uDD07'
        existing.label.x = emitter.x * this.cellSize + this.cellSize / 2
        existing.label.y = emitter.y * this.cellSize + this.cellSize / 2
        existing.data = { ...emitter, occlusionResult: undefined } // Reset occlusion, will be recalculated
      } else {
        const graphic = new Graphics()
        this.drawEmitter(graphic, emitter)
        const label = new Text({
          text: emitter.playing ? '\uD83D\uDD0A' : '\uD83D\uDD07',
          style: new TextStyle({ fontSize: 14, fill: '#ffffff' })
        })
        label.anchor.set(0.5)
        label.x = emitter.x * this.cellSize + this.cellSize / 2
        label.y = emitter.y * this.cellSize + this.cellSize / 2

        // Make the graphic interactive for DM click-to-toggle
        graphic.eventMode = 'static'
        graphic.cursor = 'pointer'
        const emitterId = emitter.id
        graphic.on('pointerdown', (e) => {
          e.stopPropagation()
          this.onToggleCallback?.(emitterId)
        })

        this.container.addChild(graphic)
        this.container.addChild(label)
        this.emitters.set(emitter.id, {
          data: { ...emitter, occlusionResult: undefined },
          graphic,
          label
        })
      }
    }

    // Update occlusion for all emitters
    this.updateEmitterOcclusion()

    // Sync audio playback state
    this.syncAudioPlayback()
  }

  private drawEmitter(g: Graphics, emitter: AudioEmitterWithOcclusion): void {
    g.clear()
    const cx = emitter.x * this.cellSize + this.cellSize / 2
    const cy = emitter.y * this.cellSize + this.cellSize / 2
    const radiusPx = emitter.radius * this.cellSize

    // Determine colors based on playing state and occlusion
    const isOccluded = emitter.occlusionResult?.isOccluded ?? false
    let fillColor: number
    let strokeColor: number
    let centerColor: number

    if (!emitter.playing) {
      fillColor = 0x6b7280
      strokeColor = 0x6b7280
      centerColor = 0x9ca3af
    } else if (isOccluded) {
      // Reddish color for occluded emitters
      fillColor = 0xdc2626
      strokeColor = 0xdc2626
      centerColor = 0xef4444
    } else {
      // Normal blue for clear line-of-sight
      fillColor = 0x3b82f6
      strokeColor = 0x3b82f6
      centerColor = 0x60a5fa
    }

    // Pulsing circle showing radius
    g.circle(cx, cy, radiusPx)
    g.fill({ color: fillColor, alpha: 0.1 })
    g.stroke({ color: strokeColor, width: 1, alpha: 0.4 })

    // Center dot — make hit area larger for click interaction
    g.circle(cx, cy, 8)
    g.fill({ color: centerColor, alpha: 0.8 })
  }

  /** Get the current effective volume for an emitter accounting for occlusion */
  getEmitterVolume(emitterId: string): number {
    const entry = this.emitters.get(emitterId)
    if (!entry) return 0
    const emitter = entry.data
    if (!emitter.playing) return 0
    if (!emitter.spatial) return emitter.volume
    return emitter.occlusionResult?.volume ?? 0
  }

  /** Get occlusion result for a specific emitter */
  getEmitterOcclusion(emitterId: string): SoundOcclusionResult | undefined {
    const entry = this.emitters.get(emitterId)
    return entry?.data.occlusionResult
  }

  /** Get all active emitters with their current occlusion results */
  getActiveEmitters(): AudioEmitterWithOcclusion[] {
    return Array.from(this.emitters.values())
      .map((entry) => entry.data)
      .filter((emitter) => emitter.playing)
  }

  /** Calculate volume for a token at position (tx, ty) based on distance from emitter */
  static calculateSpatialVolume(emitter: AudioEmitter, tx: number, ty: number, _cellSize: number): number {
    if (!emitter.spatial) return emitter.volume
    const dx = emitter.x + 0.5 - (tx + 0.5)
    const dy = emitter.y + 0.5 - (ty + 0.5)
    const distCells = Math.sqrt(dx * dx + dy * dy)
    if (distCells >= emitter.radius) return 0
    const factor = 1 - distCells / emitter.radius
    return emitter.volume * Math.max(0, factor)
  }

  destroy(): void {
    this.audioManager.destroyAll()
    for (const [, entry] of this.emitters) {
      entry.graphic.destroy()
      entry.label.destroy()
    }
    this.emitters.clear()
    this.container.destroy()
  }
}
