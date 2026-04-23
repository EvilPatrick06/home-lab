import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(readSync(resolvePath(__dirname, '../../public/data/5e/world/calendar-presets.json'), 'utf-8'))
})

vi.mock('../services/data-provider', () => ({
  load5eCalendarPresets: vi.fn(() => Promise.resolve(dataJson))
}))

import { buildCalendarConfig, CALENDAR_PRESETS, PRESET_LABELS } from './calendar-presets'

describe('CALENDAR_PRESETS — initial structure', () => {
  it('has all four preset keys', () => {
    expect(CALENDAR_PRESETS).toHaveProperty('gregorian')
    expect(CALENDAR_PRESETS).toHaveProperty('harptos')
    expect(CALENDAR_PRESETS).toHaveProperty('simple-day-counter')
    expect(CALENDAR_PRESETS).toHaveProperty('custom')
  })

  it('each preset has months, daysPerYear, yearLabel, and hoursPerDay', () => {
    for (const key of Object.keys(CALENDAR_PRESETS)) {
      const preset = CALENDAR_PRESETS[key as keyof typeof CALENDAR_PRESETS]
      expect(Array.isArray(preset.months)).toBe(true)
      expect(typeof preset.daysPerYear).toBe('number')
      expect(typeof preset.yearLabel).toBe('string')
      expect(typeof preset.hoursPerDay).toBe('number')
      expect(preset.hoursPerDay).toBe(24)
    }
  })
})

describe('PRESET_LABELS', () => {
  it('has labels for all four presets', () => {
    expect(PRESET_LABELS.gregorian).toBe('Gregorian')
    expect(PRESET_LABELS.harptos).toBe('Calendar of Harptos')
    expect(PRESET_LABELS['simple-day-counter']).toBe('Simple Day Counter')
    expect(PRESET_LABELS.custom).toBe('Custom')
  })
})

describe('Calendar presets JSON — D&D accuracy', () => {
  it('Gregorian calendar has 12 months totaling 365 days', () => {
    const gregorian = dataJson.presets.gregorian
    expect(gregorian.months).toHaveLength(12)
    const total = gregorian.months.reduce((sum: number, m: { days: number }) => sum + m.days, 0)
    expect(total).toBe(365)
    expect(gregorian.yearLabel).toBe('AD')
  })

  it('Gregorian months have correct names and days', () => {
    const months = dataJson.presets.gregorian.months as { name: string; days: number }[]
    const expected = [
      { name: 'January', days: 31 },
      { name: 'February', days: 28 },
      { name: 'March', days: 31 },
      { name: 'April', days: 30 },
      { name: 'May', days: 31 },
      { name: 'June', days: 30 },
      { name: 'July', days: 31 },
      { name: 'August', days: 31 },
      { name: 'September', days: 30 },
      { name: 'October', days: 31 },
      { name: 'November', days: 30 },
      { name: 'December', days: 31 }
    ]
    expect(months).toEqual(expected)
  })

  it('Harptos calendar has 365 days with 12 months and 5 festivals (FR canonical)', () => {
    const harptos = dataJson.presets.harptos
    expect(harptos.yearLabel).toBe('DR')
    const total = harptos.months.reduce((sum: number, m: { days: number }) => sum + m.days, 0)
    expect(total).toBe(365)
    // 12 standard months of 30 days (360) + 5 festival days of 1 day (5) = 365
    const regularMonths = harptos.months.filter((m: { days: number }) => m.days === 30)
    const festivals = harptos.months.filter((m: { days: number }) => m.days === 1)
    expect(regularMonths).toHaveLength(12)
    expect(festivals).toHaveLength(5)
  })

  it('Harptos includes Forgotten Realms month names', () => {
    const monthNames = dataJson.presets.harptos.months.map((m: { name: string }) => m.name)
    expect(monthNames).toContain('Hammer')
    expect(monthNames).toContain('Alturiak')
    expect(monthNames).toContain('Mirtul')
    expect(monthNames).toContain('Kythorn')
    expect(monthNames).toContain('Flamerule')
    expect(monthNames).toContain('Eleasis')
    expect(monthNames).toContain('Eleint')
    expect(monthNames).toContain('Marpenoth')
    expect(monthNames).toContain('Uktar')
    expect(monthNames).toContain('Nightal')
    // Festival days
    expect(monthNames).toContain('Midwinter')
    expect(monthNames).toContain('Greengrass')
    expect(monthNames).toContain('Midsummer')
    expect(monthNames).toContain('Highharvestide')
    expect(monthNames).toContain('Feast of the Moon')
  })

  it('Simple Day Counter has no months and 0 daysPerYear', () => {
    const simple = dataJson.presets['simple-day-counter']
    expect(simple.months).toEqual([])
    expect(simple.daysPerYear).toBe(0)
    expect(simple.yearLabel).toBe('Day')
  })
})

describe('buildCalendarConfig', () => {
  it('builds a gregorian config with correct fields', () => {
    const config = buildCalendarConfig('gregorian', 2024)
    expect(config.preset).toBe('gregorian')
    expect(config.startingYear).toBe(2024)
    expect(config.hoursPerDay).toBe(24)
    expect(config.exactTimeDefault).toBe('contextual')
    expect(config.yearLabel).toBe('AD')
  })

  it('simple-day-counter has 0 daysPerYear', () => {
    const config = buildCalendarConfig('simple-day-counter', 1)
    expect(config.daysPerYear).toBe(0)
  })

  it('custom preset uses provided customMonths', () => {
    const customMonths = [
      { name: 'Alpha', days: 20 },
      { name: 'Beta', days: 25 }
    ]
    const config = buildCalendarConfig('custom', 1, 'always', customMonths, 'Era')
    expect(config.months).toEqual(customMonths)
    expect(config.daysPerYear).toBe(45)
    expect(config.yearLabel).toBe('Era')
    expect(config.exactTimeDefault).toBe('always')
  })

  it('custom preset without customMonths uses default months', () => {
    const config = buildCalendarConfig('custom', 1)
    expect(config.months).toEqual(CALENDAR_PRESETS.custom.months)
  })
})
