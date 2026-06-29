import { useEffect, useState } from 'react'
import { useT } from '../../../../i18n'
import { useGameStore } from '../../../../stores/use-game-store'
import SceneParticles from './SceneParticles'

interface SceneModeOverlayProps {
  isDM: boolean
  onExit: () => void
}

/**
 * PHASE-35 35D — the player-facing cinematic scene: full-bleed art (or gradient), vignette + letterbox,
 * particles, caption, and a DM-only Exit affordance. Driven entirely by `gameStore.sceneMode`; renders
 * nothing on the tactical grid. Interactive (blocks map clicks beneath) — a DM-driven view, like a shared
 * handout: players get no dismiss control.
 */
export default function SceneModeOverlay({ isDM, onExit }: SceneModeOverlayProps): JSX.Element | null {
  const scene = useGameStore((s) => s.sceneMode)
  const { t } = useT()
  const [shown, setShown] = useState(false)

  // Fade in on mount and on each scene identity change (keyed by enteredAt below).
  useEffect(() => {
    setShown(false)
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  if (!scene) return null

  return (
    <div
      key={scene.enteredAt}
      className={`absolute inset-0 z-[2] overflow-hidden bg-base transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
      role="img"
      aria-label={scene.caption ?? t('game.sceneMode.sceneActive')}
    >
      {/* Art / gradient fallback */}
      {scene.imageData ? (
        <img src={scene.imageData} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-slate-800 to-black" />
      )}

      {/* Particles above the art */}
      <SceneParticles effect={scene.particleEffect} />

      {/* Vignette + cinematic letterbox bars */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 18vmin 6vmin rgba(0,0,0,0.7)' }}
      />
      <div className="absolute top-0 inset-x-0 h-[7vh] bg-black/80 pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 h-[7vh] bg-black/80 pointer-events-none" />

      {/* Caption (visible to all players) */}
      {scene.caption && (
        <div className="absolute bottom-[7vh] inset-x-0 flex justify-center px-6 pb-4 pointer-events-none">
          <p
            className="font-serif text-lg leading-relaxed text-gray-100 text-center max-w-3xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
            aria-live="polite"
          >
            {scene.caption}
          </p>
        </div>
      )}

      {/* DM-only exit */}
      {isDM && (
        <button
          type="button"
          onClick={onExit}
          className="absolute top-[8vh] start-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-gray-100 text-sm font-semibold border border-white/20 cursor-pointer"
        >
          {t('game.sceneMode.exitScene')}
        </button>
      )}
    </div>
  )
}
