import { useEffect, useRef, useState } from 'react'
import { SETTINGS_KEYS } from '../../../../constants/settings-keys'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { prepareSceneImage } from '../../../../services/game/scene-image'
import { enterSceneMode, exitSceneMode } from '../../../../services/game/scene-mode-controller'
import { type AmbientSound, getAllAmbientSounds } from '../../../../services/sound-manager'
import type { SceneParticleEffect } from '../../../../stores/game/types'
import { useGameStore } from '../../../../stores/use-game-store'

interface SceneModeModalProps {
  onClose: () => void
}

type ImageSource = 'none' | 'upload' | 'library' | 'current-map'
type AmbientChoice = 'keep' | 'stop' | AmbientSound

const PARTICLE_OPTIONS: SceneParticleEffect[] = ['none', 'embers', 'fireflies', 'snow', 'rain', 'fog', 'motes']
const PARTICLE_LABEL: Record<SceneParticleEffect, string> = {
  none: 'particleNone',
  embers: 'particleEmbers',
  fireflies: 'particleFireflies',
  snow: 'particleSnow',
  rain: 'particleRain',
  fog: 'particleFog',
  motes: 'particleMotes'
}

interface ScenePrefs {
  particleEffect: SceneParticleEffect
  ambientChoice: AmbientChoice
  autoExitOnCombat: boolean
}

function loadPrefs(): ScenePrefs {
  const fallback: ScenePrefs = { particleEffect: 'none', ambientChoice: 'keep', autoExitOnCombat: true }
  try {
    const raw = localStorage.getItem(SETTINGS_KEYS.SCENE_MODE_PREFS)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<ScenePrefs>) }
  } catch {
    return fallback
  }
}

/**
 * PHASE-35 35E — the DM's scene composer: pick art (none / upload / library / current map), caption,
 * particles, and ambient, then enter / update / exit through the controller. Prefs persist locally.
 */
export default function SceneModeModal({ onClose }: SceneModeModalProps): JSX.Element {
  const { t } = useT()
  const sceneActive = useGameStore((s) => s.sceneMode !== null)
  const activeMap = useGameStore((s) => s.maps.find((m) => m.id === s.activeMapId) ?? null)

  const initial = useRef(loadPrefs()).current
  const [imageSource, setImageSource] = useState<ImageSource>('none')
  const [imageData, setImageData] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [particleEffect, setParticleEffect] = useState<SceneParticleEffect>(initial.particleEffect)
  const [ambientChoice, setAmbientChoice] = useState<AmbientChoice>(initial.ambientChoice)
  const [autoExitOnCombat, setAutoExitOnCombat] = useState(initial.autoExitOnCombat)

  useEscapeKey(onClose)

  // Persist prefs on every change.
  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEYS.SCENE_MODE_PREFS,
        JSON.stringify({ particleEffect, ambientChoice, autoExitOnCombat })
      )
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [particleEffect, ambientChoice, autoExitOnCombat])

  const runPrepare = async (src: string): Promise<void> => {
    setImageBusy(true)
    setImageError(null)
    try {
      setImageData(await prepareSceneImage(src))
    } catch {
      setImageError(t('game.sceneMode.imageError'))
      setImageData(null)
    } finally {
      setImageBusy(false)
    }
  }

  const handleSourceChange = async (src: ImageSource): Promise<void> => {
    setImageSource(src)
    setImageError(null)
    if (src === 'none') {
      setImageData(null)
    } else if (src === 'current-map' && activeMap?.imagePath) {
      await runPrepare(activeMap.imagePath)
    } else {
      setImageData(null) // upload/library wait for an explicit pick
    }
  }

  const handleUpload = (file: File | undefined): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => runPrepare(reader.result as string)
    reader.onerror = () => setImageError(t('game.sceneMode.imageError'))
    reader.readAsDataURL(file)
  }

  const [libraryEntries, setLibraryEntries] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => {
    if (imageSource !== 'library') return
    window.api.imageLibrary.list().then((res) => {
      if (res.success && res.data) setLibraryEntries(res.data.map((e) => ({ id: e.id, name: e.name })))
    })
  }, [imageSource])

  const handleLibraryPick = async (id: string): Promise<void> => {
    if (!id) return
    setImageBusy(true)
    setImageError(null)
    try {
      const res = await window.api.imageLibrary.readData(id)
      if (res.success && res.data) await runPrepare(res.data.dataUrl)
      else setImageError(t('game.sceneMode.imageError'))
    } finally {
      setImageBusy(false)
    }
  }

  const handleEnter = (): void => {
    enterSceneMode({
      imageData,
      caption: caption.trim() || null,
      particleEffect,
      ambient: ambientChoice
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface border border-border rounded-lg shadow-xl w-[560px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-fg">{t('game.sceneMode.title')}</h2>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none cursor-pointer">
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {/* Image source */}
          <div>
            <label className="block text-gray-400 mb-1">{t('game.sceneMode.imageSource')}</label>
            <div className="flex gap-2 flex-wrap">
              {(['none', 'upload', 'library', 'current-map'] as ImageSource[]).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => handleSourceChange(src)}
                  disabled={src === 'current-map' && !activeMap?.imagePath}
                  className={`px-2.5 py-1 rounded border text-xs cursor-pointer disabled:opacity-40 ${imageSource === src ? 'bg-amber-600 border-amber-500 text-white' : 'bg-surface-2 border-border text-gray-300'}`}
                >
                  {t(
                    src === 'none'
                      ? 'game.sceneMode.sourceNone'
                      : src === 'upload'
                        ? 'game.sceneMode.sourceUpload'
                        : src === 'library'
                          ? 'game.sceneMode.sourceLibrary'
                          : 'game.sceneMode.sourceCurrentMap'
                  )}
                </button>
              ))}
            </div>
          </div>

          {imageSource === 'upload' && (
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e.target.files?.[0])}
              className="text-xs text-gray-300"
            />
          )}
          {imageSource === 'library' && (
            <select
              className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-gray-200"
              onChange={(e) => handleLibraryPick(e.target.value)}
              defaultValue=""
              aria-label={t('game.sceneMode.libraryPickLabel')}
            >
              <option value="">
                {libraryEntries.length === 0 ? t('game.sceneMode.libraryEmpty') : t('game.sceneMode.libraryPickLabel')}
              </option>
              {libraryEntries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}

          {imageBusy && <p className="text-xs text-gray-400">{t('game.sceneMode.imageBusy')}</p>}
          {imageError && <p className="text-xs text-red-400">{imageError}</p>}
          {imageData && <img src={imageData} className="max-h-40 rounded border border-border mx-auto" />}

          {/* Caption */}
          <div>
            <label className="block text-gray-400 mb-1">
              {t('game.sceneMode.caption')} <span className="text-gray-600">({t('game.sceneMode.captionHint')})</span>
            </label>
            <input
              type="text"
              maxLength={500}
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 500))}
              placeholder={t('game.sceneMode.captionPlaceholder')}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-gray-200"
            />
          </div>

          {/* Particles */}
          <div className="flex items-center gap-2">
            <label className="text-gray-400">{t('game.sceneMode.particles')}</label>
            <select
              className="bg-surface-2 border border-border rounded px-2 py-1 text-gray-200"
              value={particleEffect}
              onChange={(e) => setParticleEffect(e.target.value as SceneParticleEffect)}
            >
              {PARTICLE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {t(`game.sceneMode.${PARTICLE_LABEL[p]}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          </div>

          {/* Ambient */}
          <div className="flex items-center gap-2">
            <label className="text-gray-400">{t('game.sceneMode.ambient')}</label>
            <select
              className="bg-surface-2 border border-border rounded px-2 py-1 text-gray-200 max-w-[260px]"
              value={ambientChoice}
              onChange={(e) => setAmbientChoice(e.target.value as AmbientChoice)}
            >
              <option value="keep">{t('game.sceneMode.ambientKeep')}</option>
              <option value="stop">{t('game.sceneMode.ambientStop')}</option>
              {getAllAmbientSounds().map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Auto-exit pref */}
          <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
            <input type="checkbox" checked={autoExitOnCombat} onChange={(e) => setAutoExitOnCombat(e.target.checked)} />
            {t('game.sceneMode.autoExitOnCombat')}
          </label>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={handleEnter}
            disabled={imageBusy}
            className="px-3 py-1.5 rounded bg-amber-600 hover:bg-accent-strong text-white font-semibold cursor-pointer disabled:opacity-50"
          >
            {sceneActive ? t('game.sceneMode.updateScene') : t('game.sceneMode.enterScene')}
          </button>
          {sceneActive && (
            <button
              onClick={() => {
                exitSceneMode()
                onClose()
              }}
              className="px-3 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-gray-200 font-semibold cursor-pointer"
            >
              {t('game.sceneMode.exitScene')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
