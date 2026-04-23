import { useCallback, useEffect, useState } from 'react'
import type { Season, Weather } from './calendar-service'
import { generateWeather } from './calendar-service'
import type { Weather as CalendarTypesWeather, MoonPhase, SunPosition, TimeBreakdown } from './calendar-types'

type _CalendarTypesWeather = CalendarTypesWeather

// Re-export calendar types for external consumers
export type { SunPosition, MoonPhase, TimeBreakdown }

interface UseWeatherState {
  weather: Weather
  loadWeather: (dayOfYear: number, season: Season, seed?: number) => void
}

export function useWeather(dayOfYear: number, season: Season, seed: number = 42): UseWeatherState {
  const [weather, setWeather] = useState<Weather>({
    condition: 'clear',
    temperature: 'Temperate (70°F)',
    windSpeed: 'light',
    description: 'Clear skies stretch from horizon to horizon. The air feels temperate.',
    mechanicalEffects: []
  })

  const loadWeather = useCallback((day: number, s: Season, sd: number = 42) => {
    setWeather(generateWeather(day, s, sd))
  }, [])

  useEffect(() => {
    loadWeather(dayOfYear, season, seed)
  }, [dayOfYear, season, seed, loadWeather])

  return { weather, loadWeather }
}
