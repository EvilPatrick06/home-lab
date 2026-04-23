// ---------------------------------------------------------------------------
// CombatAnimations.ts
// PixiJS-based particle / animation system for combat effects on the map canvas.
// Uses only PIXI.Graphics (no external textures).
// ---------------------------------------------------------------------------

import { type Application, Container, Graphics, Text } from 'pixi.js'

// ---- Public types ---------------------------------------------------------

export type CombatAnimationType = 'slash' | 'projectile' | 'spell-burst' | 'kill' | 'heal' | 'floating-text'

export interface CombatAnimationEvent {
  type: CombatAnimationType
  fromX: number // pixel coordinates on the map
  fromY: number
  toX: number
  toY: number
  color?: number // hex color override
  text?: string // text to display (for floating-text type)
  textColor?: number // text color override (for floating-text type)
}

// ---- Global event bus (singleton callback) --------------------------------

let animationCallback: ((event: CombatAnimationEvent) => void) | null = null

/**
 * Register a listener that will be called whenever `triggerCombatAnimation` is
 * invoked.  Returns an unsubscribe function.
 */
export function onCombatAnimation(cb: (event: CombatAnimationEvent) => void): () => void {
  animationCallback = cb
  return () => {
    if (animationCallback === cb) {
      animationCallback = null
    }
  }
}

/**
 * Fire a combat animation event.  If a listener has been registered via
 * `onCombatAnimation` it will be called synchronously.
 */
export function triggerCombatAnimation(event: CombatAnimationEvent): void {
  if (animationCallback) {
    animationCallback(event)
  }
}

// ---- Internal particle helpers --------------------------------------------

interface Particle {
  gfx: Graphics | Text
  /** Elapsed time in seconds */
  elapsed: number
  /** Total lifetime in seconds */
  duration: number
  /** Per-tick update; return `true` to keep alive, `false` to remove. */
  update: (dt: number, p: Particle) => boolean
}

// Utility: linear interpolation
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Utility: clamp 0-1
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// Utility: random float in [min, max)
function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

// ---- Animation layer factory ----------------------------------------------

export function createCombatAnimationLayer(app: Application): {
  container: Container
  destroy: () => void
} {
  const container = new Container()
  const particles: Particle[] = []
  let destroyed = false

  // --- Particle spawners ---------------------------------------------------

  function addParticle(p: Particle): void {
    particles.push(p)
    container.addChild(p.gfx)
  }

  function spawnSlash(event: CombatAnimationEvent): void {
    const arcCount = 3 + Math.floor(Math.random() * 3) // 3-5
    const color = event.color ?? 0xffffff
    const cx = event.toX
    const cy = event.toY
    const baseAngle = Math.atan2(event.toY - event.fromY, event.toX - event.fromX)
    const duration = 0.4

    for (let i = 0; i < arcCount; i++) {
      const gfx = new Graphics()
      const radius = 18 + i * 6
      const startOffset = rand(-0.15, 0.15)

      addParticle({
        gfx,
        elapsed: 0,
        duration,
        update(dt, p) {
          p.elapsed += dt
          const t = clamp01(p.elapsed / p.duration)

          // Sweep from -45deg to +45deg relative to the attack direction
          const sweepAngle = lerp(-Math.PI / 4, Math.PI / 4, t) + startOffset
          const segmentLen = Math.PI / 2 // 90-degree arc segment drawn so far

          gfx.clear()
          gfx.setStrokeStyle({ width: 2, color, alpha: 1 - t })

          // Draw arc as a series of line segments
          const steps = 12
          const arcStart = baseAngle + sweepAngle - segmentLen * t
          const arcEnd = baseAngle + sweepAngle
          gfx.moveTo(cx + Math.cos(arcStart) * radius, cy + Math.sin(arcStart) * radius)
          for (let s = 1; s <= steps; s++) {
            const a = lerp(arcStart, arcEnd, s / steps)
            gfx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
          }
          gfx.stroke()

          return t < 1
        }
      })
    }
  }

  function spawnProjectile(event: CombatAnimationEvent): void {
    const color = event.color ?? 0x00aaff
    const duration = 0.3
    const trailDots: { x: number; y: number; age: number }[] = []

    // Main projectile
    const gfx = new Graphics()

    addParticle({
      gfx,
      elapsed: 0,
      duration: duration + 0.3, // extra time for trail fade
      update(dt, p) {
        p.elapsed += dt
        const tMove = clamp01(p.elapsed / duration)
        const px = lerp(event.fromX, event.toX, tMove)
        const py = lerp(event.fromY, event.toY, tMove)

        // Add trail dot every frame while moving
        if (tMove < 1) {
          trailDots.push({ x: px, y: py, age: 0 })
        }

        // Age all trail dots
        for (const dot of trailDots) {
          dot.age += dt
        }

        gfx.clear()

        // Draw trail dots (fading)
        for (const dot of trailDots) {
          const fade = clamp01(1 - dot.age / 0.4)
          if (fade > 0) {
            gfx.circle(dot.x, dot.y, 2)
            gfx.fill({ color, alpha: fade * 0.6 })
          }
        }

        // Draw main projectile while still moving
        if (tMove < 1) {
          gfx.circle(px, py, 4)
          gfx.fill({ color, alpha: 1 })
        }

        // Keep alive until trail fades
        const allFaded = trailDots.every((d) => d.age > 0.4)
        return tMove < 1 || !allFaded
      }
    })
  }

  function spawnSpellBurst(event: CombatAnimationEvent): void {
    const color = event.color ?? 0x9933ff
    const count = 8 + Math.floor(Math.random() * 5) // 8-12
    const duration = 0.5
    const cx = event.toX
    const cy = event.toY

    for (let i = 0; i < count; i++) {
      const gfx = new Graphics()
      const angle = (Math.PI * 2 * i) / count + rand(-0.2, 0.2)
      const speed = rand(40, 80)
      const size = rand(2, 4)

      addParticle({
        gfx,
        elapsed: 0,
        duration,
        update(dt, p) {
          p.elapsed += dt
          const t = clamp01(p.elapsed / p.duration)

          const dist = speed * t
          const px = cx + Math.cos(angle) * dist
          const py = cy + Math.sin(angle) * dist
          const alpha = 1 - t

          gfx.clear()
          gfx.circle(px, py, size * (1 - t * 0.5))
          gfx.fill({ color, alpha })

          return t < 1
        }
      })
    }
  }

  function spawnKill(event: CombatAnimationEvent): void {
    const duration = 0.8
    const cx = event.toX
    const cy = event.toY
    const particleCount = 10

    // Red-to-black drifting particles
    for (let i = 0; i < particleCount; i++) {
      const gfx = new Graphics()
      const offsetX = rand(-12, 12)
      const driftX = rand(-8, 8)
      const speed = rand(30, 60)
      const size = rand(2, 4)

      addParticle({
        gfx,
        elapsed: 0,
        duration,
        update(dt, p) {
          p.elapsed += dt
          const t = clamp01(p.elapsed / p.duration)

          const px = cx + offsetX + driftX * t
          const py = cy - speed * t
          const alpha = 1 - t

          // Interpolate red (0xff0000) towards black (0x000000)
          const r = Math.round(lerp(255, 0, t))
          const col = (r << 16) | 0

          gfx.clear()
          gfx.circle(px, py, size)
          gfx.fill({ color: col, alpha })

          return t < 1
        }
      })
    }

    // Skull emoji text (if available)
    const skull = new Text({
      text: '\u2620',
      style: { fontSize: 24, fill: 0xff0000 }
    })
    skull.anchor.set(0.5, 0.5)
    skull.x = cx
    skull.y = cy

    addParticle({
      gfx: skull as unknown as Graphics, // Text shares DisplayObject base
      elapsed: 0,
      duration,
      update(dt, p) {
        p.elapsed += dt
        const t = clamp01(p.elapsed / p.duration)

        skull.y = cy - 30 * t
        skull.alpha = 1 - t

        return t < 1
      }
    })
  }

  function spawnHeal(event: CombatAnimationEvent): void {
    const duration = 0.5
    const cx = event.toX
    const cy = event.toY
    const particleCount = 10

    for (let i = 0; i < particleCount; i++) {
      const gfx = new Graphics()
      const offsetX = rand(-14, 14)
      const driftX = rand(-6, 6)
      const speed = rand(25, 50)
      const size = rand(2, 4)

      addParticle({
        gfx,
        elapsed: 0,
        duration,
        update(dt, p) {
          p.elapsed += dt
          const t = clamp01(p.elapsed / p.duration)

          const px = cx + offsetX + driftX * t
          const py = cy - speed * t
          const alpha = 1 - t

          // Interpolate green (0x00ff00) towards white (0xffffff)
          const r = Math.round(lerp(0, 255, t))
          const g = 255
          const b = Math.round(lerp(0, 255, t))
          const col = (r << 16) | (g << 8) | b

          gfx.clear()
          gfx.circle(px, py, size)
          gfx.fill({ color: col, alpha })

          return t < 1
        }
      })
    }
  }

  function spawnFloatingText(event: CombatAnimationEvent): void {
    const duration = 1.0
    const cx = event.toX
    const cy = event.toY
    const color = event.textColor ?? event.color ?? 0xff4444

    const label = new Text({
      text: event.text ?? '',
      style: {
        fontSize: 18,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: 0x000000, width: 3 }
      }
    })
    label.anchor.set(0.5, 1)
    label.x = cx
    label.y = cy

    addParticle({
      gfx: label as unknown as Graphics,
      elapsed: 0,
      duration,
      update(dt, p) {
        p.elapsed += dt
        const t = clamp01(p.elapsed / p.duration)

        label.y = cy - 40 * t
        label.alpha = 1 - t * 0.8
        const s = 1 + t * 0.15
        label.scale.set(s, s)

        return t < 1
      }
    })
  }

  // --- Event handler -------------------------------------------------------

  function handleEvent(event: CombatAnimationEvent): void {
    switch (event.type) {
      case 'slash':
        spawnSlash(event)
        break
      case 'projectile':
        spawnProjectile(event)
        break
      case 'spell-burst':
        spawnSpellBurst(event)
        break
      case 'kill':
        spawnKill(event)
        break
      case 'heal':
        spawnHeal(event)
        break
      case 'floating-text':
        spawnFloatingText(event)
        break
    }
  }

  // Subscribe to global events
  const unsubscribe = onCombatAnimation(handleEvent)

  // --- Ticker (update loop) ------------------------------------------------

  function tick(): void {
    if (destroyed) return

    // Use a fixed-ish delta; PixiJS ticker provides ms, convert to seconds.
    const dtMs = app.ticker.deltaMS
    const dt = dtMs / 1000

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      const alive = p.update(dt, p)
      if (!alive) {
        container.removeChild(p.gfx)
        p.gfx.destroy()
        particles.splice(i, 1)
      }
    }
  }

  app.ticker.add(tick)

  // --- Cleanup -------------------------------------------------------------

  function destroy(): void {
    destroyed = true
    unsubscribe()
    app.ticker.remove(tick)

    for (const p of particles) {
      p.gfx.destroy()
    }
    particles.length = 0
    container.destroy({ children: true })
  }

  return { container, destroy }
}

// ---- Token status ring ----------------------------------------------------

/**
 * Draw a coloured ring around a token to indicate HP status.
 *
 * @param gfx   A PIXI.Graphics instance (caller is responsible for clearing
 *              if reusing the same object across frames).
 * @param x     Centre x of the token (pixels).
 * @param y     Centre y of the token (pixels).
 * @param size  Diameter of the token (pixels).
 * @param hpPercent  Current HP as a fraction 0-1.
 */
export function drawTokenStatusRing(gfx: Graphics, x: number, y: number, size: number, hpPercent: number): void {
  let color: number

  if (hpPercent <= 0) {
    color = 0x888888 // gray — dead
  } else if (hpPercent <= 0.25) {
    color = 0xff2222 // red — critical
  } else if (hpPercent <= 0.5) {
    color = 0xffcc00 // yellow — bloodied
  } else {
    color = 0x22cc44 // green — healthy
  }

  const radius = size / 2 + 2 // slightly larger than the token
  gfx.setStrokeStyle({ width: 2, color, alpha: 0.9 })
  gfx.circle(x, y, radius)
  gfx.stroke()
}
