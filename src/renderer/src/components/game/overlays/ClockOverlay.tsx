import { useEffect, useRef, useState } from 'react'
import { LIGHT_SOURCE_LABELS } from '../../../data/light-sources'
import { useGameStore } from '../../../stores/use-game-store'
import type { CalendarConfig } from '../../../types/campaign'
import type { TimeOfDayPhase } from '../../../utils/calendar-utils'
import {
  formatInGameDate,
  formatInGameTime,
  formatInGameTimeOfDay,
  getDateParts,
  getTimeOfDayPhase
} from '../../../utils/calendar-utils'

interface ClockOverlayProps {
  calendar: CalendarConfig
  isDM: boolean
  onEditTime: () => void
  onShortRest?: () => void
  onLongRest?: () => void
  onLightSource?: () => void
  onPhaseChange?: (phase: TimeOfDayPhase, suggestedLight: 'bright' | 'dim' | 'darkness') => void
}

const PHASE_ICONS: Record<TimeOfDayPhase, string> = {
  dawn: '\u2600', // sun
  morning: '\u2600', // sun
  afternoon: '\u2600', // sun
  dusk: '\uD83C\uDF19', // crescent moon
  evening: '\uD83C\uDF19', // crescent moon
  night: '\u2B50' // star
}

function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return 'expired'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.ceil((seconds % 3600) / 60)
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`
}

export default function ClockOverlay({
  calendar,
  isDM,
  onEditTime,
  onShortRest,
  onLongRest,
  onLightSource,
  onPhaseChange
}: ClockOverlayProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const inGameTime = useGameStore((s) => s.inGameTime)
  const activeLightSources = useGameStore((s) => s.activeLightSources)
  const advanceTimeSeconds = useGameStore((s) => s.advanceTimeSeconds)
  const previousPhaseRef = useRef<TimeOfDayPhase | null>(null)
  const initialLoadRef = useRef(true)

  // Phase change detection — must be before any early return to preserve hook order
  useEffect(() => {
    if (!inGameTime) return
    const p = getDateParts(inGameTime.totalSeconds, calendar)
    const currentPhase = getTimeOfDayPhase(p.hour)

    if (initialLoadRef.current) {
      initialLoadRef.current = false
      previousPhaseRef.current = currentPhase
      return
    }

    if (previousPhaseRef.current && previousPhaseRef.current !== currentPhase && onPhaseChange) {
      const suggestedLight: 'bright' | 'dim' | 'darkness' =
        currentPhase === 'dawn' || currentPhase === 'dusk' ? 'dim' : currentPhase === 'night' ? 'darkness' : 'bright'
      onPhaseChange(currentPhase, suggestedLight)
    }
    previousPhaseRef.current = currentPhase
  }, [inGameTime?.totalSeconds, inGameTime, calendar, onPhaseChange])

  if (!inGameTime) return <></>

  const parts = getDateParts(inGameTime.totalSeconds, calendar)
  const phase = getTimeOfDayPhase(parts.hour)
  const icon = PHASE_ICONS[phase]
  const formattedTime = formatInGameTime(inGameTime.totalSeconds, calendar)

  const handleQuickAdvance = (seconds: number): void => {
    advanceTimeSeconds(seconds)
  }

  // Active light sources with remaining time
  const lightSourcesWithTime = activeLightSources
    .map((ls) => ({
      ...ls,
      remaining:
        ls.durationSeconds === Infinity
          ? Infinity
          : ls.durationSeconds - (inGameTime.totalSeconds - ls.startedAtSeconds)
    }))
    .filter((ls) => ls.remaining === Infinity || ls.remaining > 0)

  return (
    <div className="relative">
      {/* Collapsed pill */}
      {!expanded ? (
        <button
          onClick={() => (isDM ? setExpanded(true) : undefined)}
          className={`flex items-center gap-1.5 px-3 py-1.5 bg-gray-900/70 backdrop-blur-sm border border-gray-700/50
            rounded-xl text-xs transition-colors ${isDM ? 'cursor-pointer hover:bg-gray-800/70' : 'cursor-default'}`}
          title={isDM ? 'Click to expand clock controls' : formattedTime}
        >
          <span>{icon}</span>
          <span className="text-gray-200 font-medium">{formatInGameTimeOfDay(inGameTime.totalSeconds, calendar)}</span>
          <span className="text-gray-500 text-[10px]">{formatInGameDate(inGameTime.totalSeconds, calendar)}</span>
        </button>
      ) : (
        /* Expanded DM view */
        <div className="w-64 bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-amber-300">
                {icon} {formattedTime}
              </div>
              <div className="text-[10px] text-gray-500 capitalize">{phase}</div>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer"
            >
              x
            </button>
          </div>

          {/* Quick advance buttons */}
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-[10px] text-gray-500 mb-1.5">Quick Advance</div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => handleQuickAdvance(6)}
                className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 rounded text-gray-300 cursor-pointer"
              >
                +6s
              </button>
              <button
                onClick={() => handleQuickAdvance(60)}
                className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 rounded text-gray-300 cursor-pointer"
              >
                +1 min
              </button>
              <button
                onClick={() => handleQuickAdvance(600)}
                className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 rounded text-gray-300 cursor-pointer"
              >
                +10 min
              </button>
              <button
                onClick={() => handleQuickAdvance(3600)}
                className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 rounded text-gray-300 cursor-pointer"
              >
                +1 hr
              </button>
            </div>
          </div>

          {/* Rest buttons */}
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-[10px] text-gray-500 mb-1.5">Rest</div>
            <div className="flex gap-1">
              <button
                onClick={onShortRest}
                className="flex-1 px-2 py-1 text-[10px] bg-blue-900/30 hover:bg-blue-800/40 rounded text-blue-300 cursor-pointer"
              >
                Short Rest (1 hr)
              </button>
              <button
                onClick={onLongRest}
                className="flex-1 px-2 py-1 text-[10px] bg-purple-900/30 hover:bg-purple-800/40 rounded text-purple-300 cursor-pointer"
              >
                Long Rest (8 hr)
              </button>
            </div>
          </div>

          {/* Active light sources */}
          {lightSourcesWithTime.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-800">
              <div className="text-[10px] text-gray-500 mb-1.5">Light Sources</div>
              <div className="space-y-1">
                {lightSourcesWithTime.map((ls) => (
                  <div key={ls.id} className="flex items-center justify-between text-[10px]">
                    <span className="text-amber-400">
                      {LIGHT_SOURCE_LABELS[ls.sourceName] ?? ls.sourceName} ({ls.entityName})
                    </span>
                    <span className="text-gray-400">
                      {ls.remaining === Infinity ? 'permanent' : formatRemainingTime(ls.remaining)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Light source button */}
          <div className="px-3 py-2 border-b border-gray-800">
            <button
              onClick={onLightSource}
              className="w-full px-2 py-1.5 text-[10px] bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 rounded text-yellow-300 cursor-pointer"
            >
              Light a Source...
            </button>
          </div>

          {/* Edit time */}
          <div className="px-3 py-2">
            <button
              onClick={onEditTime}
              className="w-full px-2 py-1.5 text-[10px] bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded text-amber-300 cursor-pointer"
            >
              Advance Days / Edit Time...
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
