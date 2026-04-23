import { useCallback, useRef, useState } from 'react'

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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animRef = useRef<number>(0)

  const subcategory = (item.data.subcategory as string) ?? ''
  const path = (item.data.path as string) ?? ''

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
      if (!audioRef.current) {
        const audio = new Audio(path)
        audioRef.current = audio
        audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
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
        audio.play()
        setPlaying(true)
        animRef.current = requestAnimationFrame(updateProgress)
      }
    },
    [playing, path, updateProgress]
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
