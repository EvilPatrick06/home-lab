import { useState } from 'react'
import {
  getMoonPhaseWithOverride,
  getSeason,
  getSunPosition,
  getWeatherWithOverride,
  type Season,
  type Weather
} from '../../../../services/calendar-service'
import type { MoonPhase, SunPosition, TimeBreakdown } from '../../../../services/calendar-weather'

type _SunPosition = SunPosition
type _TimeBreakdown = TimeBreakdown

import { useGameStore } from '../../../../stores/use-game-store'
import type { CalendarConfig } from '../../../../types/campaign'
import {
  type DateParts,
  formatInGameDate,
  formatInGameTime,
  getDateParts,
  getTimeOfDayPhase
} from '../../../../utils/calendar-utils'

type _DateParts = DateParts

import { presetToWeatherType } from '../../map/weather-overlay'
import MoonOverridePanel from './MoonOverridePanel'
import WeatherOverridePanel from './WeatherOverridePanel'

interface InGameCalendarModalProps {
  calendar: CalendarConfig
  onClose: () => void
  isDM?: boolean
}

const SEASON_COLORS: Record<Season, string> = {
  spring: 'text-green-400',
  summer: 'text-yellow-400',
  autumn: 'text-orange-400',
  winter: 'text-blue-400'
}

const WEATHER_ICONS: Record<string, string> = {
  clear: '\u2600\uFE0F',
  clouds: '\u26C5',
  overcast: '\u2601\uFE0F',
  rain: '\uD83C\uDF27\uFE0F',
  'heavy-rain': '\u26C8\uFE0F',
  thunderstorm: '\u26A1',
  snow: '\u2744\uFE0F',
  blizzard: '\uD83C\uDF28\uFE0F',
  fog: '\uD83C\uDF2B\uFE0F',
  wind: '\uD83D\uDCA8'
}

function formatHour(decimalHour: number): string {
  const h = Math.floor(decimalHour)
  const m = Math.round((decimalHour - h) * 60)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return m > 0 ? `${hour12}:${m.toString().padStart(2, '0')} ${ampm}` : `${hour12} ${ampm}`
}

export default function InGameCalendarModal({ calendar, onClose, isDM }: InGameCalendarModalProps): JSX.Element {
  const inGameTime = useGameStore((s) => s.inGameTime)
  const advanceTimeSeconds = useGameStore((s) => s.advanceTimeSeconds)
  const weatherOverride = useGameStore((s) => s.weatherOverride)
  const moonOverride = useGameStore((s) => s.moonOverride)
  const showWeatherOverlay = useGameStore((s) => s.showWeatherOverlay)
  const setShowWeatherOverlay = useGameStore((s) => s.setShowWeatherOverlay)

  const [advanceDays, setAdvanceDays] = useState(1)

  if (!inGameTime) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-400 text-sm">No in-game time configured</p>
          <button onClick={onClose} className="mt-3 px-4 py-1 text-sm bg-gray-700 rounded cursor-pointer">
            Close
          </button>
        </div>
      </div>
    )
  }

  const parts = getDateParts(inGameTime.totalSeconds, calendar)
  const phase = getTimeOfDayPhase(parts.hour)
  const daysPerYear = calendar.months.reduce((sum: number, m: { days: number }) => sum + m.days, 0)
  const dayOfYear =
    parts.dayOfMonth +
    calendar.months.slice(0, parts.monthIndex).reduce((sum: number, m: { days: number }) => sum + m.days, 0)

  const season: Season = getSeason(dayOfYear, daysPerYear)
  const sunPos = getSunPosition(dayOfYear, parts.hour, daysPerYear)
  const totalDays = Math.floor(inGameTime.totalSeconds / (calendar.hoursPerDay * 3600))
  const moon: MoonPhase = getMoonPhaseWithOverride(moonOverride, totalDays)
  const weather: Weather = getWeatherWithOverride(weatherOverride, dayOfYear, season, totalDays)

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">In-Game Calendar</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Current Time & Date */}
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-300">
              {formatInGameTime(inGameTime.totalSeconds, calendar)}
            </div>
            <div className="text-sm text-gray-400 mt-1">{formatInGameDate(inGameTime.totalSeconds, calendar)}</div>
            <div className="text-xs text-gray-500 capitalize mt-0.5">{phase}</div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Season */}
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Season</div>
              <div className={`text-sm font-semibold capitalize ${SEASON_COLORS[season]}`}>{season}</div>
            </div>

            {/* Moon Phase */}
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
                Moon{moonOverride ? ' (Override)' : ''}
              </div>
              <div className="text-sm font-semibold text-gray-200">
                {moon.emoji} {moon.name}
              </div>
              <div className="text-[10px] text-gray-500">{Math.round(moon.illumination * 100)}% illumination</div>
            </div>

            {/* Sunrise / Sunset */}
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Sun</div>
              <div className="text-xs text-gray-300">Rise: {formatHour(sunPos.sunrise)}</div>
              <div className="text-xs text-gray-300">Set: {formatHour(sunPos.sunset)}</div>
              <div className={`text-[10px] mt-0.5 ${sunPos.isDaytime ? 'text-yellow-400' : 'text-blue-400'}`}>
                {sunPos.isDaytime ? 'Daytime' : 'Nighttime'} ({sunPos.lightLevel})
              </div>
            </div>

            {/* Weather */}
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
                Weather{weatherOverride ? ' (Override)' : ''}
              </div>
              <div className="text-sm font-semibold text-gray-200">
                {WEATHER_ICONS[weather.condition] ?? ''} {weather.condition.replace('-', ' ')}
              </div>
              <div className="text-[10px] text-gray-400">{weather.temperature}</div>
              {weather.mechanicalEffects.length > 0 && (
                <div className="text-[10px] text-gray-500">{weather.mechanicalEffects[0]}</div>
              )}
            </div>
          </div>

          {/* Show Weather on Map toggle */}
          {presetToWeatherType(weatherOverride?.preset) !== null && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showWeatherOverlay}
                onChange={(e) => setShowWeatherOverlay(e.target.checked)}
                className="accent-amber-500 w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-300">Show Weather on Map</span>
            </label>
          )}

          {/* Quick Advance */}
          <div className="border-t border-gray-800 pt-3">
            <div className="text-xs text-gray-400 mb-2">Advance Time</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                { label: '+10 min', seconds: 600 },
                { label: '+1 hour', seconds: 3600 },
                { label: '+4 hours', seconds: 14400 },
                { label: '+8 hours', seconds: 28800 }
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => advanceTimeSeconds(btn.seconds)}
                  className="px-2.5 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-300 cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                value={advanceDays}
                onChange={(e) => setAdvanceDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200"
              />
              <button
                onClick={() => advanceTimeSeconds(advanceDays * calendar.hoursPerDay * 3600)}
                className="px-3 py-1 text-xs bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded text-amber-300 cursor-pointer"
              >
                Advance {advanceDays} day{advanceDays > 1 ? 's' : ''}
              </button>
            </div>
          </div>

          {/* DM-Only: Weather Override Section */}
          {isDM && <WeatherOverridePanel />}

          {/* DM-Only: Moon Phase Override Section */}
          {isDM && <MoonOverridePanel />}
        </div>
      </div>
    </div>
  )
}
