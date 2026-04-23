// DMG 2024 inspired weather generation — random weather by climate and season
// with mechanical effects per DMG environmental hazards.

import { addToast } from '../hooks/use-toast'
import { load5eWeatherGeneration } from '../services/data-provider'
import { logger } from '../utils/logger'

export type Climate = 'arctic' | 'temperate' | 'tropical' | 'desert' | 'coastal'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type TemperatureLevel = 'freezing' | 'cold' | 'mild' | 'warm' | 'hot' | 'extreme-heat'
export type WindLevel = 'calm' | 'light' | 'moderate' | 'strong' | 'severe'
export type PrecipitationLevel = 'none' | 'light' | 'heavy'

export interface WeatherConditions {
  temperature: TemperatureLevel
  temperatureFahrenheit: number
  wind: WindLevel
  precipitation: PrecipitationLevel
  description: string
  mechanicalEffects: string[]
  preset: string
}

// Module-level caches
type TempWeight = [TemperatureLevel, number][]
type WindWeight = [WindLevel, number][]
type PrecipWeight = [PrecipitationLevel, number][]

let TEMP_RANGES: Record<TemperatureLevel, { min: number; max: number }> = {
  freezing: { min: -20, max: 20 },
  cold: { min: 20, max: 40 },
  mild: { min: 40, max: 65 },
  warm: { min: 65, max: 85 },
  hot: { min: 85, max: 100 },
  'extreme-heat': { min: 100, max: 120 }
}

let CLIMATE_SEASON_TEMPS: Record<Climate, Record<Season, TempWeight>> = {} as Record<
  Climate,
  Record<Season, TempWeight>
>
let CLIMATE_SEASON_WIND: Record<Climate, Record<Season, WindWeight>> = {} as Record<Climate, Record<Season, WindWeight>>
let CLIMATE_SEASON_PRECIP: Record<Climate, Record<Season, PrecipWeight>> = {} as Record<
  Climate,
  Record<Season, PrecipWeight>
>

let TEMP_DESCRIPTIONS: Record<TemperatureLevel, string> = {
  freezing: 'Freezing',
  cold: 'Cold',
  mild: 'Mild',
  warm: 'Warm',
  hot: 'Hot',
  'extreme-heat': 'Extremely hot'
}
let WIND_DESCRIPTIONS: Record<WindLevel, string> = {
  calm: 'calm winds',
  light: 'a light breeze',
  moderate: 'moderate winds',
  strong: 'strong winds',
  severe: 'severe gale-force winds'
}
let PRECIP_DESCRIPTIONS: Record<PrecipitationLevel, Record<'rain' | 'snow', string>> = {
  none: { rain: 'clear skies', snow: 'clear skies' },
  light: { rain: 'light rain', snow: 'light snowfall' },
  heavy: { rain: 'heavy downpour', snow: 'heavy blizzard' }
}

export let CLIMATES: { value: Climate; label: string }[] = [
  { value: 'arctic', label: 'Arctic' },
  { value: 'temperate', label: 'Temperate' },
  { value: 'tropical', label: 'Tropical' },
  { value: 'desert', label: 'Desert' },
  { value: 'coastal', label: 'Coastal' }
]
export let SEASONS: { value: Season; label: string }[] = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'winter', label: 'Winter' }
]

load5eWeatherGeneration()
  .then((raw) => {
    const data = raw as Record<string, unknown>
    if (data.temperatureRanges) TEMP_RANGES = data.temperatureRanges as typeof TEMP_RANGES
    if (data.climateSeasonTemps) CLIMATE_SEASON_TEMPS = data.climateSeasonTemps as typeof CLIMATE_SEASON_TEMPS
    if (data.climateSeasonWind) CLIMATE_SEASON_WIND = data.climateSeasonWind as typeof CLIMATE_SEASON_WIND
    if (data.climateSeasonPrecip) CLIMATE_SEASON_PRECIP = data.climateSeasonPrecip as typeof CLIMATE_SEASON_PRECIP
    if (data.temperatureDescriptions) TEMP_DESCRIPTIONS = data.temperatureDescriptions as typeof TEMP_DESCRIPTIONS
    if (data.windDescriptions) WIND_DESCRIPTIONS = data.windDescriptions as typeof WIND_DESCRIPTIONS
    if (data.precipitationDescriptions)
      PRECIP_DESCRIPTIONS = data.precipitationDescriptions as typeof PRECIP_DESCRIPTIONS
    if (data.climates) CLIMATES = data.climates as typeof CLIMATES
    if (data.seasons) SEASONS = data.seasons as typeof SEASONS
  })
  .catch((err) => {
    logger.error('Failed to load weather data', err)
    addToast('Failed to load weather data', 'error')
  })

// ---- Weighted Random Selection ---------------------------------------------

function weightedPick<T>(weights: [T, number][]): T {
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  let r = Math.random() * total
  for (const [value, weight] of weights) {
    r -= weight
    if (r <= 0) return value
  }
  return weights[weights.length - 1][0]
}

function randomInRange(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min))
}

function getMapPreset(precipitation: PrecipitationLevel, temperature: TemperatureLevel): string {
  const isSnow = temperature === 'freezing' || temperature === 'cold'
  if (precipitation === 'heavy') return isSnow ? 'blizzard' : 'storm'
  if (precipitation === 'light') return isSnow ? 'snow' : 'rain'
  return 'clear'
}

// ---- Mechanical Effects (DMG 2024) -----------------------------------------

function getMechanicalEffects(temp: TemperatureLevel, wind: WindLevel, precip: PrecipitationLevel): string[] {
  const effects: string[] = []

  if (temp === 'freezing') {
    effects.push(
      'Extreme Cold: DC 10 CON save each hour or gain 1 level of Exhaustion. Resistance/immunity to Cold damage or natural cold adaptation grants auto-success.'
    )
  }
  if (temp === 'extreme-heat') {
    effects.push(
      'Extreme Heat: DC 5 CON save each hour (+1 per hour) or gain 1 level of Exhaustion. Heavy armor or heavy clothing imposes Disadvantage. Resistance/immunity to Fire damage grants auto-success.'
    )
  }

  if (wind === 'strong' || wind === 'severe') {
    effects.push(
      'Strong Wind: Disadvantage on ranged weapon attack rolls and Wisdom (Perception) checks relying on hearing.'
    )
    if (wind === 'severe') {
      effects.push(
        'Severe Wind: Ranged weapon attacks beyond normal range are impossible. Open flames are extinguished.'
      )
    }
  }

  if (precip === 'heavy') {
    effects.push(
      'Heavy Precipitation: The area is Lightly Obscured. Disadvantage on Wisdom (Perception) checks relying on sight.'
    )
  }

  return effects
}

// ---- Public API ------------------------------------------------------------

/**
 * Generate random weather conditions for a given climate and season.
 * Returns a full WeatherConditions object compatible with the game store's weatherOverride.
 */
export function generateWeather(climate: Climate, season: Season): WeatherConditions {
  const temp = weightedPick(CLIMATE_SEASON_TEMPS[climate]?.[season] ?? [['mild', 100]])
  const wind = weightedPick(CLIMATE_SEASON_WIND[climate]?.[season] ?? [['calm', 100]])
  const precip = weightedPick(CLIMATE_SEASON_PRECIP[climate]?.[season] ?? [['none', 100]])

  const range = TEMP_RANGES[temp]
  const fahrenheit = randomInRange(range.min, range.max)
  const isSnow = temp === 'freezing' || temp === 'cold'
  const precipDesc = PRECIP_DESCRIPTIONS[precip][isSnow ? 'snow' : 'rain']

  const description = `${TEMP_DESCRIPTIONS[temp]} (${fahrenheit}°F) with ${WIND_DESCRIPTIONS[wind]} and ${precipDesc}.`
  const mechanicalEffects = getMechanicalEffects(temp, wind, precip)
  const preset = getMapPreset(precip, temp)

  return {
    temperature: temp,
    temperatureFahrenheit: fahrenheit,
    wind,
    precipitation: precip,
    description,
    mechanicalEffects,
    preset
  }
}

/** Convert weather conditions to the game store's weatherOverride format. */
export function weatherToOverride(weather: WeatherConditions): {
  description: string
  temperature: number
  temperatureUnit: 'F'
  windSpeed: string
  mechanicalEffects: string[]
  preset: string
} {
  return {
    description: weather.description,
    temperature: weather.temperatureFahrenheit,
    temperatureUnit: 'F',
    windSpeed: weather.wind,
    mechanicalEffects: weather.mechanicalEffects,
    preset: weather.preset
  }
}
