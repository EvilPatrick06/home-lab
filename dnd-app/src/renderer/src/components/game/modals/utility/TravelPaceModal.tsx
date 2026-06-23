import { useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
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
    effects: ['Disadvantage on Wisdom (Perception or Survival) and Dexterity (Stealth) checks'],
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
    effects: ['Disadvantage on Dexterity (Stealth) checks'],
    color: 'text-accent',
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
    effects: ['Advantage on Wisdom (Perception or Survival) checks'],
    color: 'text-green-400',
    borderColor: 'border-green-500/40',
    bgColor: 'bg-green-900/20'
  }
]

export default function TravelPaceModal({ onClose }: TravelPaceModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  const travelPace = useGameStore((s) => s.travelPace)
  const setTravelPace = useGameStore((s) => s.setTravelPace)
  const [distance, setDistance] = useState('')

  const distNum = parseFloat(distance) || 0

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-surface border border-border rounded-xl p-5 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">{t('game.travelPaceModal.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
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
                className={`p-3 rounded-lg border ${isActive ? `${pace.borderColor} ${pace.bgColor}` : 'border-border bg-surface-2/50'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-semibold ${pace.color}`}>
                    {t(`game.travelPaceModal.paces.${pace.value}.name`)}
                  </span>
                  <button
                    onClick={() => setTravelPace(isActive ? null : pace.value)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-amber-600 text-white hover:bg-accent-strong'
                    }`}
                  >
                    {isActive ? t('game.travelPaceModal.clear') : t('game.travelPaceModal.setActive')}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted mb-1.5">
                  <span>{t('game.travelPaceModal.perMinute', { value: pace.perMinute })}</span>
                  <span>{t('game.travelPaceModal.perHour', { value: pace.perHour })}</span>
                  <span>{t('game.travelPaceModal.perDay', { value: pace.perDay })}</span>
                </div>
                <div className="space-y-0.5">
                  {pace.effects.map((_effect, i) => (
                    <div key={i} className="text-xs text-gray-500">
                      {t(`game.travelPaceModal.paces.${pace.value}.effect${i}`)}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Distance calculator */}
        <div className="border-t border-border pt-3">
          <div className="text-xs text-muted mb-2">{t('game.travelPaceModal.distanceCalculator')}</div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              name="travel-distance"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              placeholder={t('game.travelPaceModal.distancePlaceholder')}
              min="0"
              step="0.5"
              className="w-24 px-2 py-1.5 bg-surface-2 border border-border rounded-lg text-sm text-gray-200 focus:outline-none focus:border-amber-500"
            />
            <span className="text-xs text-muted">{t('game.travelPaceModal.miles')}</span>
          </div>
          {distNum > 0 && (
            <div className="space-y-1">
              {PACES.map((pace) => {
                const hours = distNum / pace.milesPerHour
                const hoursWhole = Math.floor(hours)
                const minutes = Math.round((hours - hoursWhole) * 60)
                return (
                  <div key={pace.value} className="flex items-center justify-between text-xs">
                    <span className={pace.color}>
                      {t('game.travelPaceModal.paceLabel', {
                        name: t(`game.travelPaceModal.paces.${pace.value}.name`)
                      })}
                    </span>
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
