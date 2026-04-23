import { describe, expect, it, vi } from 'vitest'
import type { WeatherType } from './weather-overlay'
import { presetToWeatherType, WeatherOverlayLayer } from './weather-overlay'

// ─── PixiJS mock ───────────────────────────────────────────────

const mockGfx = {
  clear: vi.fn(),
  circle: vi.fn().mockReturnThis(),
  fill: vi.fn().mockReturnThis(),
  destroy: vi.fn()
}

const mockContainer = {
  label: '',
  parent: null as { removeChild: ReturnType<typeof vi.fn> } | null,
  addChild: vi.fn(),
  removeChild: vi.fn(),
  destroy: vi.fn()
}

const mockTicker = {
  add: vi.fn(),
  remove: vi.fn()
}

const mockApp = {
  screen: { width: 800, height: 600 },
  stage: { addChild: vi.fn() },
  ticker: mockTicker
}

vi.mock('pixi.js', () => ({
  Container: vi.fn(function () {
    return {
      ...mockContainer,
      addChild: vi.fn(),
      removeChild: vi.fn(),
      destroy: vi.fn(),
      parent: null
    }
  }),
  Graphics: vi.fn(function () {
    return { ...mockGfx }
  })
}))

// ─── presetToWeatherType ───────────────────────────────────────

describe('presetToWeatherType', () => {
  it('returns null for undefined input', () => {
    expect(presetToWeatherType(undefined)).toBeNull()
  })

  it('returns null for null input', () => {
    expect(presetToWeatherType(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(presetToWeatherType('')).toBeNull()
  })

  it('returns null for non-matching preset', () => {
    expect(presetToWeatherType('sunny')).toBeNull()
    expect(presetToWeatherType('clear skies')).toBeNull()
  })

  it('returns "rain" for "rain" preset', () => {
    expect(presetToWeatherType('rain')).toBe('rain')
  })

  it('returns "rain" for "thunderstorm" preset', () => {
    expect(presetToWeatherType('thunderstorm')).toBe('rain')
  })

  it('returns "rain" for presets containing "rain" (case-insensitive)', () => {
    expect(presetToWeatherType('Heavy Rain')).toBe('rain')
    expect(presetToWeatherType('RAINFALL')).toBe('rain')
  })

  it('returns "snow" for "snow" preset', () => {
    expect(presetToWeatherType('snow')).toBe('snow')
  })

  it('returns "snow" for "blizzard" preset', () => {
    expect(presetToWeatherType('blizzard')).toBe('snow')
  })

  it('returns "snow" for presets containing "snow" (case-insensitive)', () => {
    expect(presetToWeatherType('SNOWSTORM')).toBe('snow')
  })

  it('returns "sandstorm" for "sandstorm" preset', () => {
    expect(presetToWeatherType('sandstorm')).toBe('sandstorm')
  })

  it('returns "ash" for "ash" preset', () => {
    expect(presetToWeatherType('ash')).toBe('ash')
  })

  it('returns "ash" for "volcanic ash" preset', () => {
    expect(presetToWeatherType('volcanic ash')).toBe('ash')
  })

  it('returns "ash" for presets containing "ash" (case-insensitive)', () => {
    expect(presetToWeatherType('ASHFALL')).toBe('ash')
  })

  it('returns "hail" for "hail" preset', () => {
    expect(presetToWeatherType('hail')).toBe('hail')
  })

  it('is case-insensitive', () => {
    expect(presetToWeatherType('RAIN')).toBe('rain')
    expect(presetToWeatherType('Snow')).toBe('snow')
    expect(presetToWeatherType('HAIL')).toBe('hail')
  })
})

// ─── WeatherOverlayLayer ───────────────────────────────────────

describe('WeatherOverlayLayer', () => {
  it('constructs without throwing', () => {
    expect(() => new WeatherOverlayLayer(mockApp as never)).not.toThrow()
  })

  it('adds the container to the stage on construction', () => {
    mockApp.stage.addChild.mockClear()
    new WeatherOverlayLayer(mockApp as never)
    expect(mockApp.stage.addChild).toHaveBeenCalled()
  })

  it('getContainer returns the internal container', () => {
    const layer = new WeatherOverlayLayer(mockApp as never)
    const container = layer.getContainer()
    expect(container).toBeDefined()
  })

  it('setWeather starts the ticker when a type is set', () => {
    mockTicker.add.mockClear()
    const layer = new WeatherOverlayLayer(mockApp as never)
    layer.setWeather('rain')
    expect(mockTicker.add).toHaveBeenCalled()
  })

  it('setWeather does not restart ticker if same type is set twice', () => {
    mockTicker.add.mockClear()
    const layer = new WeatherOverlayLayer(mockApp as never)
    layer.setWeather('rain')
    const callCount = mockTicker.add.mock.calls.length
    layer.setWeather('rain')
    expect(mockTicker.add.mock.calls.length).toBe(callCount) // no additional add call
  })

  it('setWeather stops the ticker when null is passed', () => {
    mockTicker.remove.mockClear()
    const layer = new WeatherOverlayLayer(mockApp as never)
    layer.setWeather('rain')
    layer.setWeather(null)
    expect(mockTicker.remove).toHaveBeenCalled()
  })

  it('setWeather switches to a different type', () => {
    mockTicker.add.mockClear()
    mockTicker.remove.mockClear()
    const layer = new WeatherOverlayLayer(mockApp as never)
    layer.setWeather('rain')
    layer.setWeather('snow')
    // The ticker should have been stopped and restarted
    expect(mockTicker.remove).toHaveBeenCalled()
    expect(mockTicker.add).toHaveBeenCalledTimes(2)
  })

  it('destroy stops ticker and cleans up', () => {
    mockTicker.remove.mockClear()
    const layer = new WeatherOverlayLayer(mockApp as never)
    layer.setWeather('snow')
    layer.destroy()
    expect(mockTicker.remove).toHaveBeenCalled()
  })

  const weatherTypes: WeatherType[] = ['rain', 'snow', 'ash', 'hail', 'sandstorm']
  for (const type of weatherTypes) {
    it(`initializes particles correctly for weather type "${type}"`, () => {
      mockTicker.add.mockClear()
      const layer = new WeatherOverlayLayer(mockApp as never)
      expect(() => layer.setWeather(type)).not.toThrow()
      expect(mockTicker.add).toHaveBeenCalled()
    })
  }
})
