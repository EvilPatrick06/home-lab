import { useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'
import { useNetworkStore } from '../../../../stores/use-network-store'

interface TimerModalProps {
  onClose: () => void
}

export default function TimerModal({ onClose }: TimerModalProps): JSX.Element {
  const [seconds, setSeconds] = useState(60)
  const [targetName, setTargetName] = useState('')
  const startTimer = useGameStore((s) => s.startTimer)
  const sendMessage = useNetworkStore((s) => s.sendMessage)

  const PRESETS = [
    { label: '30s', value: 30 },
    { label: '1m', value: 60 },
    { label: '2m', value: 120 },
    { label: '5m', value: 300 }
  ]

  const handleStart = (): void => {
    startTimer(seconds, targetName || 'Turn Timer')
    sendMessage('dm:timer-start', { seconds, targetName: targetName || 'Turn Timer' })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-xs w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">Turn Timer</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Target</label>
            <input
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="e.g. Player's turn"
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Duration</label>
            <div className="flex gap-1 mb-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setSeconds(p.value)}
                  className={`flex-1 py-1 text-xs rounded transition-colors cursor-pointer ${
                    seconds === p.value
                      ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={seconds}
              onChange={(e) => setSeconds(Math.max(1, parseInt(e.target.value, 10) || 0))}
              min={1}
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-xs focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-gray-500">seconds</span>
          </div>

          <button
            onClick={handleStart}
            className="w-full py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white
              transition-colors cursor-pointer"
          >
            Start Timer
          </button>
        </div>
      </div>
    </div>
  )
}
