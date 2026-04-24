import { useEffect } from 'react'
import { useGameStore } from '../../../stores/use-game-store'

export default function TimerOverlay(): JSX.Element {
  const timerSeconds = useGameStore((s) => s.timerSeconds)
  const timerRunning = useGameStore((s) => s.timerRunning)
  const timerTargetName = useGameStore((s) => s.timerTargetName)
  const tickTimer = useGameStore((s) => s.tickTimer)
  const stopTimer = useGameStore((s) => s.stopTimer)

  useEffect(() => {
    if (!timerRunning) return
    const interval = setInterval(tickTimer, 1000)
    return () => clearInterval(interval)
  }, [timerRunning, tickTimer])

  if (!timerRunning && timerSeconds <= 0) return <></>

  const minutes = Math.floor(timerSeconds / 60)
  const seconds = timerSeconds % 60
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <div className="absolute top-3 right-16 z-10">
      <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-700/50 rounded-xl px-4 py-2 min-w-[140px]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] text-gray-400 truncate max-w-[80px]">{timerTargetName}</div>
            <div
              className={`text-lg font-mono font-bold ${
                timerSeconds <= 10 ? 'text-red-400' : timerSeconds <= 30 ? 'text-amber-400' : 'text-gray-100'
              }`}
            >
              {display}
            </div>
          </div>
          <button
            onClick={stopTimer}
            className="text-gray-500 hover:text-red-400 text-xs cursor-pointer"
            title="Stop Timer"
          >
            &#10005;
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 rounded-full ${
              timerSeconds <= 10 ? 'bg-red-500' : timerSeconds <= 30 ? 'bg-amber-500' : 'bg-amber-400'
            }`}
            style={{ width: `${Math.max(0, (timerSeconds / 120) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
