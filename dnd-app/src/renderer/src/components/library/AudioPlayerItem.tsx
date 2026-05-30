import { useCallback, useEffect, useRef, useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { logger } from '../../utils/logger'

interface AudioPlayerItemProps {
  item: {
    id: string
    name: string
    data: Record<string, unknown>
  }
  onClick?: () => void
  isFavorite?: boolean
  onToggleFavorite?: (id: string) => void
}

export default function AudioPlayerItem({
  item,
  onClick,
  isFavorite,
  onToggleFavorite
}: AudioPlayerItemProps): JSX.Element {
  const { t } = useT()
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  // Phase 17n — surface a friendly "no source" badge instead of failing
  // silently when the audio entry has no usable path (the common shape
  // of a half-finished homebrew custom-audio entry).
  const [missingSource, setMissingSource] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animRef = useRef<number>(0)

  const subcategory = (item.data.subcategory as string) ?? ''
  const path = (item.data.path as string) ?? ''
  const hasPath = typeof path === 'string' && path.trim().length > 0

  const updateProgress = useCallback((): void => {
    const audio = audioRef.current
    if (audio && !audio.paused) {
      setProgress(audio.currentTime)
      animRef.current = requestAnimationFrame(updateProgress)
    }
  }, [])

  // Phase 22b — own the <audio> element + its listeners in an effect keyed on
  // `path` so they're torn down on unmount / path change (the old code created
  // the element inside the click handler and never removed listeners or cancelled
  // the RAF, leaking on unmount-mid-play).
  useEffect(() => {
    if (!hasPath) return
    const audio = new Audio(path)
    audioRef.current = audio
    const onMeta = (): void => setDuration(audio.duration)
    const onError = (): void => {
      logger.warn('[AudioPlayerItem] Failed to load audio:', path)
      addToast(t('library.audioPlayerItem.loadFailed', { name: item.name }), 'error')
      setPlaying(false)
    }
    const onEnded = (): void => {
      setPlaying(false)
      setProgress(0)
      cancelAnimationFrame(animRef.current)
    }
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('error', onError)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('ended', onEnded)
      cancelAnimationFrame(animRef.current)
      audioRef.current = null
    }
  }, [path, hasPath, item.name])

  const handleToggle = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      // Phase 17n — guard against missing/empty audio path. Older
      // homebrew custom-audio entries shipped without a path field,
      // which would silently `new Audio('')` and fail. Surface it as a
      // toast + inline badge instead.
      if (!hasPath || !audioRef.current) {
        if (!missingSource) setMissingSource(true)
        addToast(t('library.audioPlayerItem.noSourceFor', { name: item.name }), 'error')
        return
      }

      const audio = audioRef.current
      if (playing) {
        audio.pause()
        setPlaying(false)
        cancelAnimationFrame(animRef.current)
      } else {
        // Phase 17n — `audio.play()` returns a Promise that rejects when
        // the user-gesture / network / decode fails. Without `.catch()`
        // the rejection became an unhandled-promise console error and
        // the UI lied about being "playing". Show the user what
        // happened.
        const result = audio.play()
        if (result && typeof result.then === 'function') {
          result.catch((err: unknown) => {
            logger.warn('[AudioPlayerItem] audio.play() failed:', err)
            addToast(t('library.audioPlayerItem.couldNotPlay', { name: item.name }), 'error')
            setPlaying(false)
            cancelAnimationFrame(animRef.current)
          })
        }
        setPlaying(true)
        animRef.current = requestAnimationFrame(updateProgress)
      }
    },
    [playing, hasPath, updateProgress, item.name, missingSource]
  )

  const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      {/* Play/Pause button */}
      <button
        onClick={handleToggle}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700/60 hover:bg-amber-600/40 text-gray-300 hover:text-amber-400 transition-colors flex-shrink-0 cursor-pointer"
      >
        {playing ? '⏸' : '▶'}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-100 group-hover:text-amber-400 transition-colors truncate">
            {item.name}
          </span>
          <span className="text-xs bg-gray-700/60 text-gray-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
            {subcategory.replace(/\//g, ' › ')}
          </span>
          {(!hasPath || missingSource) && (
            <span
              className="text-xs bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded-full flex-shrink-0"
              title={t('library.audioPlayerItem.noSourceTitle')}
            >
              {t('library.audioPlayerItem.noSource')}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-100"
              style={{ width: duration > 0 ? `${(progress / duration) * 100}%` : '0%' }}
            />
          </div>
          {duration > 0 && (
            <span className="text-xs text-gray-500 flex-shrink-0">
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          )}
        </div>
      </div>

      {/* Favorite star */}
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite(item.id)
          }}
          className={`text-lg flex-shrink-0 transition-colors cursor-pointer ${
            isFavorite ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'
          }`}
          title={isFavorite ? t('library.audioPlayerItem.removeFavorite') : t('library.audioPlayerItem.addFavorite')}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}
