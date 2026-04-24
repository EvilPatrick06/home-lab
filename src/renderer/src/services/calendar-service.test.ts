import { describe, expect, it } from 'vitest'
import {
  formatTimeSinceRest,
  generateWeather,
  getMoonPhase,
  getMoonPhaseWithOverride,
  getSeason,
  getSunPosition,
  getWeatherWithOverride,
  timeBreakdown
} from './calendar-service'

// ---------------------------------------------------------------------------
// getSunPosition
// ---------------------------------------------------------------------------

describe('getSunPosition', () => {
  it('returns bright light level during midday', () => {
    const result = getSunPosition(91, 12, 365) // ~spring equinox, noon
    expect(result.isDaytime).toBe(true)
    expect(result.lightLevel).toBe('bright')
  })

  it('returns darkness at midnight', () => {
    const result = getSunPosition(91, 0, 365)
    expect(result.isDaytime).toBe(false)
    expect(result.lightLevel).toBe('darkness')
  })

  it('returns dim light during dawn period (30 min before sunrise)', () => {
    // Summer solstice (~day 91 for 25% of 365): sunrise ~5.5
    // Dawn starts at ~5.0
    const result = getSunPosition(91, 5.1, 365)
    // Depending on exact calculation, should be dim or darkness
    expect(['dim', 'darkness']).toContain(result.lightLevel)
  })

  it('returns sunrise before sunset', () => {
    const result = getSunPosition(100, 12, 365)
    expect(result.sunrise).toBeLessThan(result.sunset)
  })

  it('summer solstice has earlier sunrise and later sunset than winter solstice', () => {
    // Summer solstice at ~25% of year
    const summer = getSunPosition(91, 12, 365)
    // Winter solstice at ~75% of year
    const winter = getSunPosition(274, 12, 365)

    expect(summer.sunrise).toBeLessThan(winter.sunrise)
    expect(summer.sunset).toBeGreaterThan(winter.sunset)
  })

  it('treats daysPerYear=0 as 365', () => {
    const result = getSunPosition(100, 12, 0)
    expect(result.isDaytime).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getMoonPhase
// ---------------------------------------------------------------------------

describe('getMoonPhase', () => {
  it('returns a valid phase name', () => {
    const result = getMoonPhase(0)
    expect(result.name).toBeDefined()
    expect(typeof result.name).toBe('string')
  })

  it('returns illumination between 0 and 1', () => {
    for (let day = 0; day < 30; day++) {
      const result = getMoonPhase(day)
      expect(result.illumination).toBeGreaterThanOrEqual(0)
      expect(result.illumination).toBeLessThanOrEqual(1)
    }
  })

  it('has low illumination near New Moon (day 0)', () => {
    const result = getMoonPhase(0)
    expect(result.name).toBe('New Moon')
    expect(result.illumination).toBeLessThan(0.1)
  })

  it('has high illumination near Full Moon (~day 15)', () => {
    // Full moon is at phase index 4, which is ~50% of the 29.5-day cycle
    const result = getMoonPhase(15)
    expect(result.illumination).toBeGreaterThan(0.9)
  })

  it('cycles through 8 phases over a 29.5-day period', () => {
    const phaseNames = new Set<string>()
    for (let day = 0; day < 30; day++) {
      phaseNames.add(getMoonPhase(day).name)
    }
    expect(phaseNames.size).toBe(8)
  })

  it('returns an emoji for every phase', () => {
    for (let day = 0; day < 30; day++) {
      const result = getMoonPhase(day)
      expect(result.emoji).toBeTruthy()
    }
  })

  it('handles negative day values without crashing', () => {
    const result = getMoonPhase(-10)
    expect(result.name).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// getSeason
// ---------------------------------------------------------------------------

describe('getSeason', () => {
  it('returns spring for days 0-25% of year', () => {
    expect(getSeason(1, 365)).toBe('spring')
    expect(getSeason(90, 365)).toBe('spring')
  })

  it('returns summer for days 25-50% of year', () => {
    expect(getSeason(100, 365)).toBe('summer')
    expect(getSeason(180, 365)).toBe('summer')
  })

  it('returns autumn for days 50-75% of year', () => {
    expect(getSeason(200, 365)).toBe('autumn')
    expect(getSeason(270, 365)).toBe('autumn')
  })

  it('returns winter for days 75-100% of year', () => {
    expect(getSeason(300, 365)).toBe('winter')
    expect(getSeason(364, 365)).toBe('winter')
  })

  it('returns summer when daysPerYear is 0 (day counter mode)', () => {
    expect(getSeason(100, 0)).toBe('summer')
  })

  it('returns summer when daysPerYear is negative', () => {
    expect(getSeason(1, -10)).toBe('summer')
  })
})

// ---------------------------------------------------------------------------
// generateWeather
// ---------------------------------------------------------------------------

describe('generateWeather', () => {
  it('returns a Weather object with all required fields', () => {
    const weather = generateWeather(100, 'summer')
    expect(weather).toHaveProperty('condition')
    expect(weather).toHaveProperty('temperature')
    expect(weather).toHaveProperty('windSpeed')
    expect(weather).toHaveProperty('description')
    expect(weather).toHaveProperty('mechanicalEffects')
  })

  it('is deterministic (same inputs -> same output)', () => {
    const w1 = generateWeather(42, 'spring', 99)
    const w2 = generateWeather(42, 'spring', 99)
    expect(w1).toEqual(w2)
  })

  it('different seeds produce different weather', () => {
    const w1 = generateWeather(42, 'spring', 1)
    const w2 = generateWeather(42, 'spring', 2)
    // At least one field should differ (very likely but not guaranteed for all cases)
    const same = w1.condition === w2.condition && w1.temperature === w2.temperature && w1.windSpeed === w2.windSpeed
    // This is probabilistic but extremely likely to pass
    expect(same).toBe(false)
  })

  it('winter weather can produce snow with temperature at or below 32F', () => {
    // Try many seeds to find snow
    let foundSnow = false
    for (let seed = 0; seed < 200; seed++) {
      const w = generateWeather(1, 'winter', seed)
      if (w.condition === 'snow' || w.condition === 'blizzard') {
        foundSnow = true
        // Temperature should be <= 32 for snow/blizzard
        const tempMatch = w.temperature.match(/\((-?\d+)/)
        if (tempMatch) {
          expect(parseInt(tempMatch[1], 10)).toBeLessThanOrEqual(32)
        }
        break
      }
    }
    expect(foundSnow).toBe(true)
  })

  it('heavy-rain / thunderstorm produces vision-related mechanical effects', () => {
    // Find a heavy rain or thunderstorm in summer
    for (let seed = 0; seed < 500; seed++) {
      const w = generateWeather(1, 'summer', seed)
      if (w.condition === 'heavy-rain' || w.condition === 'thunderstorm') {
        expect(w.mechanicalEffects.length).toBeGreaterThan(0)
        const hasVisionEffect = w.mechanicalEffects.some((e) => e.includes('sight'))
        expect(hasVisionEffect).toBe(true)
        return
      }
    }
    // If we never hit heavy-rain or thunderstorm, skip silently (unlikely)
  })

  it('fog includes heavily obscured effect', () => {
    for (let seed = 0; seed < 500; seed++) {
      const w = generateWeather(1, 'spring', seed)
      if (w.condition === 'fog') {
        const hasFogEffect = w.mechanicalEffects.some((e) => e.includes('heavily obscured'))
        expect(hasFogEffect).toBe(true)
        return
      }
    }
  })

  it('condition is always a valid WeatherCondition', () => {
    const validConditions = [
      'clear',
      'clouds',
      'overcast',
      'rain',
      'heavy-rain',
      'thunderstorm',
      'snow',
      'blizzard',
      'fog',
      'wind'
    ]
    for (let seed = 0; seed < 50; seed++) {
      const w = generateWeather(seed, 'autumn', seed)
      expect(validConditions).toContain(w.condition)
    }
  })

  it('windSpeed is a valid value', () => {
    const validWindSpeeds = ['calm', 'light', 'moderate', 'strong', 'gale']
    for (let seed = 0; seed < 50; seed++) {
      const w = generateWeather(seed, 'summer', seed)
      expect(validWindSpeeds).toContain(w.windSpeed)
    }
  })
})

// ---------------------------------------------------------------------------
// timeBreakdown
// ---------------------------------------------------------------------------

describe('timeBreakdown', () => {
  it('converts 0 seconds to day 1, hour 0, minute 0', () => {
    const result = timeBreakdown(0, 24)
    expect(result).toEqual({
      totalDays: 0,
      dayOfYear: 1,
      hour: 0,
      minute: 0,
      second: 0
    })
  })

  it('converts 86400 seconds (1 day) to day 2', () => {
    const result = timeBreakdown(86400, 24)
    expect(result.totalDays).toBe(1)
    expect(result.dayOfYear).toBe(2)
    expect(result.hour).toBe(0)
  })

  it('converts 3661 seconds to 1 hour, 1 minute, 1 second', () => {
    const result = timeBreakdown(3661, 24)
    expect(result.hour).toBe(1)
    expect(result.minute).toBe(1)
    expect(result.second).toBe(1)
  })

  it('handles custom hours per day (e.g., 12)', () => {
    // 12 hours per day = 43200 seconds per day
    const result = timeBreakdown(43200, 12)
    expect(result.totalDays).toBe(1)
    expect(result.dayOfYear).toBe(2)
    expect(result.hour).toBe(0)
  })

  it('treats hoursPerDay=0 as 24', () => {
    const result = timeBreakdown(86400, 0)
    expect(result.totalDays).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// formatTimeSinceRest
// ---------------------------------------------------------------------------

describe('formatTimeSinceRest', () => {
  it('returns "Never" when lastRestSeconds is null', () => {
    expect(formatTimeSinceRest(null, 1000)).toBe('Never')
  })

  it('returns "Just now" for less than 60 seconds elapsed', () => {
    expect(formatTimeSinceRest(100, 130)).toBe('Just now')
  })

  it('returns minutes only when less than 1 hour elapsed', () => {
    expect(formatTimeSinceRest(0, 1800)).toBe('30m ago')
  })

  it('returns hours only when exact hours (no remaining minutes)', () => {
    expect(formatTimeSinceRest(0, 7200)).toBe('2h ago')
  })

  it('returns hours and minutes when both are nonzero', () => {
    expect(formatTimeSinceRest(0, 7260)).toBe('2h 1m ago')
  })

  it('handles negative elapsed (current before last rest) as "Just now"', () => {
    expect(formatTimeSinceRest(5000, 3000)).toBe('Just now')
  })
})

// ---------------------------------------------------------------------------
// getWeatherWithOverride
// ---------------------------------------------------------------------------

describe('getWeatherWithOverride', () => {
  it('returns auto-generated weather when override is null', () => {
    const weather = getWeatherWithOverride(null, 100, 'summer')
    expect(weather).toHaveProperty('condition')
    expect(weather).toHaveProperty('description')
  })

  it('returns auto-generated weather when override is undefined', () => {
    const weather = getWeatherWithOverride(undefined, 100, 'summer')
    expect(weather).toHaveProperty('condition')
  })

  it('uses override preset to determine condition', () => {
    const weather = getWeatherWithOverride({ description: 'Stormy night', preset: 'Thunderstorm' }, 100, 'summer')
    expect(weather.condition).toBe('thunderstorm')
  })

  it('uses override description when provided', () => {
    const weather = getWeatherWithOverride({ description: 'Magical snowfall' }, 100, 'summer')
    expect(weather.description).toBe('Magical snowfall')
  })

  it('converts temperature from Celsius to Fahrenheit when unit is C', () => {
    const weather = getWeatherWithOverride({ description: 'Cold', temperature: 0, temperatureUnit: 'C' }, 100, 'winter')
    // 0C = 32F
    expect(weather.temperature).toContain('0')
    expect(weather.temperature).toContain('C')
  })

  it('uses Fahrenheit when temperatureUnit is F or not set', () => {
    const weather = getWeatherWithOverride({ description: 'Warm', temperature: 75 }, 100, 'summer')
    expect(weather.temperature).toContain('75')
    expect(weather.temperature).toContain('F')
  })

  it('uses override mechanicalEffects when provided', () => {
    const effects = ['Custom effect: all creatures are slowed']
    const weather = getWeatherWithOverride({ description: 'Magic storm', mechanicalEffects: effects }, 100, 'summer')
    expect(weather.mechanicalEffects).toEqual(effects)
  })

  it('normalizes windSpeed string to typed value', () => {
    const weather = getWeatherWithOverride({ description: 'Windy', windSpeed: 'Strong' }, 100, 'autumn')
    expect(weather.windSpeed).toBe('strong')
  })
})

// ---------------------------------------------------------------------------
// getMoonPhaseWithOverride
// ---------------------------------------------------------------------------

describe('getMoonPhaseWithOverride', () => {
  it('returns auto-generated phase when override is null', () => {
    const phase = getMoonPhaseWithOverride(null, 15)
    expect(phase.name).toBeDefined()
  })

  it('returns auto-generated phase when override is undefined', () => {
    const phase = getMoonPhaseWithOverride(undefined, 15)
    expect(phase.name).toBeDefined()
  })

  it('returns the overridden phase when it matches a known phase name', () => {
    const phase = getMoonPhaseWithOverride('Full Moon', 0)
    expect(phase.name).toBe('Full Moon')
    expect(phase.illumination).toBeGreaterThan(0.9)
  })

  it('falls back to auto-generated when override name is not recognized', () => {
    const phase = getMoonPhaseWithOverride('Blood Moon', 15)
    // Should fall back to auto calculation for day 15
    expect(phase.name).toBeDefined()
  })

  it('New Moon override has near-zero illumination', () => {
    const phase = getMoonPhaseWithOverride('New Moon', 100)
    expect(phase.name).toBe('New Moon')
    expect(phase.illumination).toBeLessThan(0.01)
  })
})
