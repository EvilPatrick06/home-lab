import { useT } from '../../../../i18n'

interface Participant {
  id: string
  name: string
  position: number
  speed: number
  dashesUsed: number
  conModifier: number
  isQuarry: boolean
}

interface ChaseMapProps {
  participants: Participant[]
  maxZones: number
}

export default function ChaseMap({ participants, maxZones }: ChaseMapProps): JSX.Element {
  const { t } = useT()
  return (
    <div>
      <label className="block text-xs text-muted mb-2">{t('game.chaseMap.distanceTrack')}</label>
      <div className="relative bg-surface-2 rounded-lg border border-border p-3">
        {/* Zone markers */}
        <div className="flex">
          {Array.from({ length: maxZones + 1 }, (_, i) => (
            <div key={i} className="flex-1 text-center">
              <div className="text-xs text-gray-500 mb-1">{i}</div>
              <div className="h-4 border-s border-gray-600 mx-auto w-0" />
            </div>
          ))}
        </div>
        {/* Participant markers */}
        <div className="relative h-8 mt-1">
          {participants.map((p, idx) => {
            const leftPct = (p.position / maxZones) * 100
            return (
              <div
                key={p.id}
                className="absolute -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${leftPct}%`, top: `${idx % 2 === 0 ? 0 : 14}px` }}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold ${
                    p.isQuarry ? 'bg-red-600 border-red-400 text-white' : 'bg-blue-600 border-blue-400 text-white'
                  }`}
                  title={p.name}
                >
                  {p.name[0]}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
