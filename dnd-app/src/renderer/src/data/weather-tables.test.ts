import { beforeAll, describe, expect, it, vi } from 'vitest'

// Mock data-provider — module uses fallback defaults if JSON not loaded
vi.mock('../services/data-provider', () => ({
  load5eWeatherGeneration: vi.fn(() => Promise.resolve({}))
}))

import type { Climate, Season, WeatherConditions } from './weather-tables'
import { CLIMATES, generateWeather, SEASONS, weatherToOverride } from './weather-tables'

describe('weather-tables', () => {
  // Allow the fire-and-forget promise in the module to settle
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  describe('CLIMATES', () => {
    it('exports CLIMATES as an array', () => {
      expect(Array.isArray(CLIMATES)).toBe(true)
      expect(CLIMATES.length).toBeGreaterThan(0)
    })

    it('contains all 5 DMG climate types', () => {
      const values = CLIMATES.map((c) => c.value)
      expect(values).toContain('arctic')
      expect(values).toContain('temperate')
      expect(values).toContain('tropical')
      expect(values).toContain('desert')
      expect(values).toContain('coastal')
    })

    it('each climate has value and label strings', () => {
      for (const climate of CLIMATES) {
        expect(typeof climate.value).toBe('string')
        expect(typeof climate.label).toBe('string')
        expect(climate.label.length).toBeGreaterThan(0)
      }
    })
  })

  describe('SEASONS', () => {
    it('exports SEASONS as an array', () => {
      expect(Array.isArray(SEASONS)).toBe(true)
      expect(SEASONS.length).toBe(4)
    })

    it('contains all 4 seasons', () => {
      const values = SEASONS.map((s) => s.value)
      expect(values).toContain('spring')
      expect(values).toContain('summer')
      expect(values).toContain('autumn')
      expect(values).toContain('winter')
    })

    it('each season has value and label strings', () => {
      for (const season of SEASONS) {
        expect(typeof season.value).toBe('string')
        expect(typeof season.label).toBe('string')
        expect(season.label.length).toBeGreaterThan(0)
      }
    })
  })

  describe('generateWeather', () => {
    it('returns a valid WeatherConditions object', () => {
      const weather = generateWeather('temperate', 'summer')
      expect(weather).toHaveProperty('temperature')
      expect(weather).toHaveProperty('temperatureFahrenheit')
      expect(weather).toHaveProperty('wind')
      expect(weather).toHaveProperty('precipitation')
      expect(weather).toHaveProperty('description')
      expect(weather).toHaveProperty('mechanicalEffects')
      expect(weather).toHaveProperty('preset')
    })

    it('temperature is a valid TemperatureLevel', () => {
      const validTemps = ['freezing', 'cold', 'mild', 'warm', 'hot', 'extreme-heat']
      const weather = generateWeather('temperate', 'summer')
      expect(validTemps).toContain(weather.temperature)
    })

    it('wind is a valid WindLevel', () => {
      const validWinds = ['calm', 'light', 'moderate', 'strong', 'severe']
      const weather = generateWeather('temperate', 'summer')
      expect(validWinds).toContain(weather.wind)
    })

    it('precipitation is a valid PrecipitationLevel', () => {
      const validPrecip = ['none', 'light', 'heavy']
      const weather = generateWeather('temperate', 'summer')
      expect(validPrecip).toContain(weather.precipitation)
    })

    it('temperatureFahrenheit is a number', () => {
      const weather = generateWeather('arctic', 'winter')
      expect(typeof weather.temperatureFahrenheit).toBe('number')
    })

    it('description is a non-empty string', () => {
      const weather = generateWeather('desert', 'summer')
      expect(typeof weather.description).toBe('string')
      expect(weather.description.length).toBeGreaterThan(0)
    })

    it('mechanicalEffects is an array of strings', () => {
      const weather = generateWeather('tropical', 'spring')
      expect(Array.isArray(weather.mechanicalEffects)).toBe(true)
      for (const effect of weather.mechanicalEffects) {
        expect(typeof effect).toBe('string')
      }
    })

    it('preset is a valid map preset string', () => {
      const validPresets = ['clear', 'rain', 'snow', 'storm', 'blizzard']
      const weather = generateWeather('temperate', 'autumn')
      expect(validPresets).toContain(weather.preset)
    })

    it('works for all climate-season combinations without throwing', () => {
      const climates: Climate[] = ['arctic', 'temperate', 'tropical', 'desert', 'coastal']
      const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter']
      for (const climate of climates) {
        for (const season of seasons) {
          expect(() => generateWeather(climate, season)).not.toThrow()
        }
      }
    })

    it('description contains temperature in Fahrenheit', () => {
      const weather = generateWeather('temperate', 'summer')
      expect(weather.description).toContain('°F')
    })
  })

  describe('weatherToOverride', () => {
    it('converts WeatherConditions to game store override format', () => {
      const weather: WeatherConditions = {
        temperature: 'mild',
        temperatureFahrenheit: 60,
        wind: 'light',
        precipitation: 'none',
        description: 'Mild (60°F) with a light breeze and clear skies.',
        mechanicalEffects: [],
        preset: 'clear'
      }

      const override = weatherToOverride(weather)

      expect(override.description).toBe(weather.description)
      expect(override.temperature).toBe(60)
      expect(override.temperatureUnit).toBe('F')
      expect(override.windSpeed).toBe('light')
      expect(override.mechanicalEffects).toEqual([])
      expect(override.preset).toBe('clear')
    })

    it('preserves mechanical effects array', () => {
      const weather: WeatherConditions = {
        temperature: 'freezing',
        temperatureFahrenheit: 0,
        wind: 'severe',
        precipitation: 'heavy',
        description: 'Freezing with severe winds and heavy blizzard.',
        mechanicalEffects: [
          'Extreme Cold: DC 10 CON save each hour or gain 1 level of Exhaustion.',
          'Severe Wind: Ranged weapon attacks beyond normal range are impossible.'
        ],
        preset: 'blizzard'
      }

      const override = weatherToOverride(weather)
      expect(override.mechanicalEffects).toHaveLength(2)
      expect(override.mechanicalEffects[0]).toContain('Extreme Cold')
    })

    it('temperatureUnit is always F (Fahrenheit)', () => {
      const weather: WeatherConditions = {
        temperature: 'hot',
        temperatureFahrenheit: 95,
        wind: 'calm',
        precipitation: 'none',
        description: 'Hot (95°F)',
        mechanicalEffects: [],
        preset: 'clear'
      }
      expect(weatherToOverride(weather).temperatureUnit).toBe('F')
    })
  })
})
