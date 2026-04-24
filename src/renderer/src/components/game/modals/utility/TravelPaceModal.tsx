import { useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'

interface TravelPaceModalProps {
  onClose: () => void
}

const PACES = [
  {
    name: 'Fast' as const,
    value: 'fast' as const,
    perMinute: '400 ft',
    perHour: '4 miles',
    perDay: '30 miles',
    milesPerHour: 4,
    effects: ['-5 to passive Perception', 'Disadvantage on Perception, Survival, and Stealth checks'],
    color: 'text-red-400',
    borderColor: 'border-red-500/40',
    bgColor: 'bg-red-900/20'
  },
  {
    name: 'Normal' as const,
    value: 'normal' as const,
    perMinute: '300 ft',
    perHour: '3 miles',
    perDay: '24 miles',
    milesPerHour: 3,
    effects: ['Disadvantage on Stealth checks'],
    color: 'text-amber-400',
    borderColor: 'border-amber-500/40',
    bgColor: 'bg-amber-900/20'
  },
  {
    name: 'Slow' as const,
    value: 'slow' as const,
    perMinute: '200 ft',
    perHour: '2 miles',
    perDay: '18 miles',
    milesPerHour: 2,
    effects: ['Advantage on Perception and Survival checks', 'Can use Stealth'],
    color: 'text-green-400',
    borderColor: 'border-green-500/40',
    bgColor: 'bg-green-900/20'
  }
]

export default function TravelPaceModal({ onClose }: TravelPaceModalProps): JSX.Element {
  const travelPace = useGameStore((s) => s.travelPace)
  const setTravelPace = useGameStore((s) => s.setTravelPace)
  const [distance, setDistance] = useState('')

  const distNum = parseFloat(distance) || 0

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">Travel Pace Calculator</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Pace table */}
        <div className="space-y-2 mb-4">
          {PACES.map((pace) => {
            const isActive = travelPace === pace.value
            return (
              <div
                key={pace.value}
                className={`p-3 rounded-lg border ${isActive ? `${pace.borderColor} ${pace.bgColor}` : 'border-gray-700 bg-gray-800/50'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-semibold ${pace.color}`}>{pace.name}</span>
                  <button
                    onClick={() => setTravelPace(isActive ? null : pace.value)}
                    className={`px-2.5 py-1 text-[10px] font-semibold rounded cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-amber-600 text-white hover:bg-amber-500'
                    }`}
                  >
                    {isActive ? 'Clear' : 'Set Active'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-400 mb-1.5">
                  <span>{pace.perMinute}/min</span>
                  <span>{pace.perHour}/hr</span>
                  <span>{pace.perDay}/day</span>
                </div>
                <div className="space-y-0.5">
                  {pace.effects.map((effect, i) => (
                    <div key={i} className="text-[10px] text-gray-500">
                      {effect}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Distance calculator */}
        <div className="border-t border-gray-700 pt-3">
          <div className="text-xs text-gray-400 mb-2">Distance Calculator</div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              placeholder="Distance"
              min="0"
              step="0.5"
              className="w-24 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-amber-500"
            />
            <span className="text-xs text-gray-400">miles</span>
          </div>
          {distNum > 0 && (
            <div className="space-y-1">
              {PACES.map((pace) => {
                const hours = distNum / pace.milesPerHour
                const hoursWhole = Math.floor(hours)
                const minutes = Math.round((hours - hoursWhole) * 60)
                return (
                  <div key={pace.value} className="flex items-center justify-between text-xs">
                    <span className={pace.color}>{pace.name}:</span>
                    <span className="text-gray-300">
                      {hoursWhole > 0 ? `${hoursWhole}h ` : ''}
                      {minutes > 0 ? `${minutes}m` : hoursWhole > 0 ? '' : '0m'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
