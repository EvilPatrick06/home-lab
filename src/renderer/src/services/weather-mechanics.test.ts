import { describe, expect, it } from 'vitest'
import { getVisibilityRadius, getWeatherEffects, getWeatherTypes } from './weather-mechanics'

describe('weather-mechanics', () => {
  it('returns unlimited visibility for clear weather', () => {
    expect(getVisibilityRadius('clear')).toBe(-1)
  })

  it('returns reduced visibility for fog', () => {
    const radius = getVisibilityRadius('fog')
    expect(radius).toBeGreaterThan(0)
    expect(radius).toBeLessThan(10)
  })

  it('returns reduced visibility for blizzard', () => {
    expect(getVisibilityRadius('blizzard')).toBe(4)
  })

  it('clear weather has no disadvantages', () => {
    const effects = getWeatherEffects('clear')
    expect(effects.disadvantageRanged).toBe(false)
    expect(effects.disadvantagePerception).toBe(false)
    expect(effects.speedModifier).toBe(1)
  })

  it('heavy rain gives disadvantage on ranged', () => {
    const effects = getWeatherEffects('heavy-rain')
    expect(effects.disadvantageRanged).toBe(true)
  })

  it('snow halves speed', () => {
    const effects = getWeatherEffects('snow')
    expect(effects.speedModifier).toBe(0.5)
  })

  it('blizzard has all penalties', () => {
    const effects = getWeatherEffects('blizzard')
    expect(effects.disadvantageRanged).toBe(true)
    expect(effects.disadvantagePerception).toBe(true)
    expect(effects.speedModifier).toBe(0.5)
    expect(effects.visibilityRadius).toBe(4)
  })

  it('sandstorm has all penalties', () => {
    const effects = getWeatherEffects('sandstorm')
    expect(effects.disadvantageRanged).toBe(true)
    expect(effects.speedModifier).toBe(0.5)
  })

  it('getWeatherTypes returns all types', () => {
    const types = getWeatherTypes()
    expect(types).toContain('clear')
    expect(types).toContain('fog')
    expect(types).toContain('blizzard')
    expect(types.length).toBe(7)
  })

  it('all weather effects have descriptions', () => {
    for (const type of getWeatherTypes()) {
      const effects = getWeatherEffects(type)
      expect(effects.description).toBeTruthy()
    }
  })
})
