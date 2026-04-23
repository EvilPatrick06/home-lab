import { describe, expect, it, vi } from 'vitest'

// Mock React hooks since this file uses useCallback, useEffect, useState
vi.mock('react', () => ({
  useCallback: (fn: Function) => fn,
  useEffect: (fn: Function) => fn(),
  useState: (init: unknown) => [init, vi.fn()]
}))

// Mock calendar-service
vi.mock('./calendar-service', () => ({
  generateWeather: vi.fn(() => ({
    condition: 'rain',
    temperature: 'Cool (55°F)',
    windSpeed: 'moderate',
    description: 'A steady rain falls.',
    mechanicalEffects: ['Lightly obscured']
  }))
}))

describe('calendar-weather', () => {
  it('exports useWeather hook', async () => {
    const mod = await import('./calendar-weather')
    expect(typeof mod.useWeather).toBe('function')
  })

  it('useWeather returns weather state and loadWeather function', async () => {
    const mod = await import('./calendar-weather')
    const result = mod.useWeather(100, 'summer' as never, 42)
    expect(result).toBeDefined()
    expect(result).toHaveProperty('weather')
    expect(result).toHaveProperty('loadWeather')
    expect(typeof result.loadWeather).toBe('function')
  })

  it('useWeather initial weather has expected shape', async () => {
    const mod = await import('./calendar-weather')
    const result = mod.useWeather(1, 'spring' as never)
    expect(result.weather).toHaveProperty('condition')
    expect(result.weather).toHaveProperty('temperature')
    expect(result.weather).toHaveProperty('windSpeed')
    expect(result.weather).toHaveProperty('description')
    expect(result.weather).toHaveProperty('mechanicalEffects')
  })

  it('re-exports calendar type names', async () => {
    // The module re-exports SunPosition, MoonPhase, TimeBreakdown as types
    // We verify the module loads without error
    const mod = await import('./calendar-weather')
    expect(mod).toBeDefined()
  })
})
