import { useCallback, useRef, useState } from 'react'
import { addToast } from '../../hooks/use-toast'
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

  const handleToggle = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      // Phase 17n — guard against missing/empty audio path. Older
      // homebrew custom-audio entries shipped without a path field,
      // which would silently `new Audio('')` and fail. Surface it as a
      // toast + inline badge instead.
      if (!hasPath) {
        if (!missingSource) setMissingSource(true)
        addToast(`No audio source for "${item.name}"`, 'error')
        return
      }
      if (!audioRef.current) {
        const audio = new Audio(path)
        audioRef.current = audio
        audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
        audio.addEventListener('error', () => {
          logger.warn('[AudioPlayerItem] Failed to load audio:', path)
          addToast(`Failed to load audio: ${item.name}`, 'error')
          setPlaying(false)
        })
        audio.addEventListener('ended', () => {
          setPlaying(false)
          setProgress(0)
          cancelAnimationFrame(animRef.current)
        })
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
            addToast(`Could not play "${item.name}"`, 'error')
            setPlaying(false)
            cancelAnimationFrame(animRef.current)
          })
        }
        setPlaying(true)
        animRef.current = requestAnimationFrame(updateProgress)
      }
    },
    [playing, path, hasPath, updateProgress, item.name, missingSource]
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
          <span className="text-[10px] bg-gray-700/60 text-gray-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
            {subcategory.replace(/\//g, ' › ')}
          </span>
          {(!hasPath || missingSource) && (
            <span
              className="text-[10px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded-full flex-shrink-0"
              title="No audio source path was provided for this entry"
            >
              No source
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
            <span className="text-[10px] text-gray-500 flex-shrink-0">
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
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}
