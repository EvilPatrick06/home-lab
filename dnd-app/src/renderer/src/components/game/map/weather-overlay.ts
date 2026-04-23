/**
 * WeatherOverlay — PixiJS-based particle system for weather effects on the map canvas.
 *
 * Supports: rain, snow, ash, hail, sandstorm
 * Each weather type has unique particle behaviour, color, count, and speed.
 */

import { type Application, Container, Graphics } from 'pixi.js'

// ─── Weather Type Definitions ────────────────────────────────

export type WeatherType = 'rain' | 'snow' | 'ash' | 'hail' | 'sandstorm'

interface WeatherConfig {
  color: number
  particleCount: number
  speed: number
  radius: number
  /** Angle of travel in radians (0 = straight down, positive = right) */
  angle: number
}

const WEATHER_CONFIGS: Record<WeatherType, WeatherConfig> = {
  rain: {
    color: 0x4488cc,
    particleCount: 500,
    speed: 4,
    radius: 1,
    angle: (15 * Math.PI) / 180 // 15 degrees
  },
  snow: {
    color: 0xffffff,
    particleCount: 200,
    speed: 1,
    radius: 2,
    angle: 0
  },
  ash: {
    color: 0x888888,
    particleCount: 150,
    speed: 1.2,
    radius: 2,
    angle: (5 * Math.PI) / 180
  },
  hail: {
    color: 0xddeeff,
    particleCount: 100,
    speed: 6,
    radius: 3,
    angle: (10 * Math.PI) / 180
  },
  sandstorm: {
    color: 0xc2a060,
    particleCount: 400,
    speed: 5,
    radius: 1.5,
    angle: Math.PI / 2 // horizontal, right-to-left
  }
}

// ─── Particle Structure ──────────────────────────────────────

interface Particle {
  x: number
  y: number
  /** Unique phase offset for sine-wave drift (snow) or bounce (hail) */
  phase: number
  /** Per-particle speed multiplier for variation */
  speedMul: number
  /** Per-particle alpha for visual depth */
  alpha: number
}

// ─── WeatherOverlayLayer ─────────────────────────────────────

export class WeatherOverlayLayer {
  private app: Application
  private container: Container
  private gfx: Graphics
  private particles: Particle[] = []
  private currentType: WeatherType | null = null
  private tickerBound: (() => void) | null = null
  private width = 0
  private height = 0

  constructor(app: Application) {
    this.app = app
    this.container = new Container()
    this.container.label = 'weather'
    this.gfx = new Graphics()
    this.container.addChild(this.gfx)

    // Add container to the stage (caller will reposition as needed)
    app.stage.addChild(this.container)
  }

  /** Returns the container so the caller can insert it at the right z-order. */
  getContainer(): Container {
    return this.container
  }

  /** Start or switch to a weather effect. Pass null to stop. */
  setWeather(type: WeatherType | null): void {
    if (type === this.currentType) return

    // Stop current
    this.stopTicker()
    this.particles = []
    this.gfx.clear()
    this.currentType = type

    if (!type) return

    // Capture canvas dimensions
    this.width = this.app.screen.width
    this.height = this.app.screen.height

    // Initialize particles
    const config = WEATHER_CONFIGS[type]
    for (let i = 0; i < config.particleCount; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        phase: Math.random() * Math.PI * 2,
        speedMul: 0.7 + Math.random() * 0.6,
        alpha: 0.3 + Math.random() * 0.5
      })
    }

    // Start ticker
    this.tickerBound = () => this.update()
    this.app.ticker.add(this.tickerBound)
  }

  private stopTicker(): void {
    if (this.tickerBound) {
      this.app.ticker.remove(this.tickerBound)
      this.tickerBound = null
    }
  }

  private update(): void {
    if (!this.currentType) return

    const config = WEATHER_CONFIGS[this.currentType]
    const w = this.app.screen.width
    const h = this.app.screen.height

    // Update particle positions based on weather type
    for (const p of this.particles) {
      p.phase += 0.02

      switch (this.currentType) {
        case 'rain': {
          const dx = Math.sin(config.angle) * config.speed * p.speedMul
          const dy = Math.cos(config.angle) * config.speed * p.speedMul
          p.x += dx
          p.y += dy
          break
        }
        case 'snow': {
          // Gentle lateral sway via sine wave
          const sway = Math.sin(p.phase) * 0.8
          p.x += sway
          p.y += config.speed * p.speedMul
          break
        }
        case 'ash': {
          const dx = Math.sin(config.angle) * config.speed * p.speedMul
          const dy = Math.cos(config.angle) * config.speed * p.speedMul
          // Slight horizontal wobble
          p.x += dx + Math.sin(p.phase * 0.5) * 0.3
          p.y += dy
          break
        }
        case 'hail': {
          const dx = Math.sin(config.angle) * config.speed * p.speedMul
          const dy = Math.cos(config.angle) * config.speed * p.speedMul
          // Slight bounce effect via absolute sine
          const bounce = Math.abs(Math.sin(p.phase * 2)) * 1.5
          p.x += dx
          p.y += dy - bounce
          break
        }
        case 'sandstorm': {
          // Horizontal right-to-left
          p.x -= config.speed * p.speedMul
          // Slight vertical drift
          p.y += Math.sin(p.phase) * 0.6
          break
        }
      }

      // Wrap around screen edges
      if (p.y > h) {
        p.y = -5
        p.x = Math.random() * w
      }
      if (p.y < -10) {
        p.y = h + 5
        p.x = Math.random() * w
      }
      if (p.x > w + 10) {
        p.x = -5
        p.y = Math.random() * h
      }
      if (p.x < -10) {
        p.x = w + 5
        p.y = Math.random() * h
      }
    }

    // Redraw all particles
    this.gfx.clear()
    for (const p of this.particles) {
      this.gfx.circle(p.x, p.y, config.radius)
    }
    this.gfx.fill({ color: config.color, alpha: 0.6 })
  }

  /** Cleanup all resources. */
  destroy(): void {
    this.stopTicker()
    this.particles = []
    this.gfx.clear()
    if (this.container.parent) {
      this.container.parent.removeChild(this.container)
    }
    this.container.destroy({ children: true })
  }
}

// ─── Preset → WeatherType mapping ────────────────────────────

/**
 * Maps weather preset strings (from the calendar / game store) to particle types.
 * Returns null for presets that have no visual particle effect.
 */
export function presetToWeatherType(preset: string | undefined | null): WeatherType | null {
  if (!preset) return null
  const normalized = preset.toLowerCase()
  if (normalized.includes('rain') || normalized === 'thunderstorm') return 'rain'
  if (normalized.includes('snow') || normalized === 'blizzard') return 'snow'
  if (normalized === 'sandstorm') return 'sandstorm'
  if (normalized.includes('ash') || normalized === 'volcanic ash') return 'ash'
  if (normalized === 'hail') return 'hail'
  return null
}
