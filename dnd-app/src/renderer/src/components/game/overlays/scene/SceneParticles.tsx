import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../../../../hooks/use-reduced-motion'
import type { SceneParticleEffect } from '../../../../stores/game/types'
import { PARTICLE_PRESETS, type SceneParticle, spawnParticles, stepParticles } from './scene-particles-engine'

interface SceneParticlesProps {
  effect: SceneParticleEffect
}

/**
 * PHASE-35 35C — a self-contained Canvas-2D particle layer over the scene art. Per-frame state lives
 * in refs (no React re-renders); the rAF loop + ResizeObserver are torn down on unmount/effect-change.
 * `reducedMotion` (Settings + OS pref) suppresses animation entirely — the static art still carries
 * the scene, the recommended reduced-motion fallback.
 */
export default function SceneParticles({ effect }: SceneParticlesProps): JSX.Element | null {
  const reducedMotion = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (effect === 'none' || reducedMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cfg = PARTICLE_PRESETS[effect]
    const dpr = Math.min(window.devicePixelRatio || 1, 2) // cap DPR for fill-rate
    let particles: SceneParticle[] = []
    let raf = 0
    let last = 0

    const resize = (): void => {
      const parent = canvas.parentElement
      const w = parent?.clientWidth || window.innerWidth
      const h = parent?.clientHeight || window.innerHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      particles = spawnParticles(effect, canvas.width, canvas.height)
    }
    resize()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    if (ro && canvas.parentElement) ro.observe(canvas.parentElement)

    const frame = (now: number): void => {
      const dt = last ? Math.min(now - last, 50) : 16 // clamp post-stall jumps
      last = now
      stepParticles(particles, cfg, canvas.width, canvas.height, dt)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.fillStyle = cfg.color
      if (cfg.blur) {
        ctx.shadowBlur = cfg.blur * dpr
        ctx.shadowColor = cfg.color
      }
      for (const p of particles) {
        ctx.globalAlpha = p.alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [effect, reducedMotion])

  if (effect === 'none' || reducedMotion) return null
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
}
