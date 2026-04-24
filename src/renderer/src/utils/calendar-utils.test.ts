import { describe, expect, it } from 'vitest'
import type { CalendarConfig } from '../types/campaign'
import {
  formatInGameDate,
  formatInGameTime,
  formatInGameTimeOfDay,
  getDateParts,
  getTimeOfDayPhase,
  totalSecondsFromDateTime
} from './calendar-utils'

// ─── Shared configs ─────────────────────────────────────────

const simpleConfig: CalendarConfig = {
  preset: 'simple-day-counter',
  months: [],
  daysPerYear: 0,
  yearLabel: '',
  startingYear: 1,
  hoursPerDay: 24,
  exactTimeDefault: 'always'
}

const harptosConfig: CalendarConfig = {
  preset: 'harptos',
  months: [
    { name: 'Hammer', days: 30 },
    { name: 'Alturiak', days: 30 },
    { name: 'Ches', days: 30 },
    { name: 'Tarsakh', days: 30 },
    { name: 'Mirtul', days: 30 },
    { name: 'Kythorn', days: 30 },
    { name: 'Flamerule', days: 30 },
    { name: 'Eleasis', days: 30 },
    { name: 'Eleint', days: 30 },
    { name: 'Marpenoth', days: 30 },
    { name: 'Uktar', days: 30 },
    { name: 'Nightal', days: 30 }
  ],
  daysPerYear: 360,
  yearLabel: 'DR',
  startingYear: 1492,
  hoursPerDay: 24,
  exactTimeDefault: 'always'
}

// ─── getTimeOfDayPhase ──────────────────────────────────────

describe('getTimeOfDayPhase', () => {
  it('returns "night" for hours 0-4', () => {
    expect(getTimeOfDayPhase(0)).toBe('night')
    expect(getTimeOfDayPhase(3)).toBe('night')
    expect(getTimeOfDayPhase(4)).toBe('night')
  })

  it('returns "dawn" for hours 5-6', () => {
    expect(getTimeOfDayPhase(5)).toBe('dawn')
    expect(getTimeOfDayPhase(6)).toBe('dawn')
  })

  it('returns "morning" for hours 7-11', () => {
    expect(getTimeOfDayPhase(7)).toBe('morning')
    expect(getTimeOfDayPhase(11)).toBe('morning')
  })

  it('returns "afternoon" for hours 12-17', () => {
    expect(getTimeOfDayPhase(12)).toBe('afternoon')
    expect(getTimeOfDayPhase(17)).toBe('afternoon')
  })

  it('returns "dusk" for hours 18-19', () => {
    expect(getTimeOfDayPhase(18)).toBe('dusk')
    expect(getTimeOfDayPhase(19)).toBe('dusk')
  })

  it('returns "evening" for hours 20-21', () => {
    expect(getTimeOfDayPhase(20)).toBe('evening')
    expect(getTimeOfDayPhase(21)).toBe('evening')
  })

  it('returns "night" for hours 22-23', () => {
    expect(getTimeOfDayPhase(22)).toBe('night')
    expect(getTimeOfDayPhase(23)).toBe('night')
  })
})

// ─── getDateParts ───────────────────────────────────────────

describe('getDateParts', () => {
  describe('simple-day-counter preset', () => {
    it('returns day 1 at totalSeconds 0', () => {
      const parts = getDateParts(0, simpleConfig)
      expect(parts.dayOfMonth).toBe(1)
      expect(parts.hour).toBe(0)
      expect(parts.minute).toBe(0)
      expect(parts.second).toBe(0)
      expect(parts.monthIndex).toBe(-1)
      expect(parts.monthName).toBe('')
    })

    it('increments day after 24 hours', () => {
      const oneDay = 24 * 3600
      const parts = getDateParts(oneDay, simpleConfig)
      expect(parts.dayOfMonth).toBe(2)
    })

    it('correctly extracts hour/minute/second', () => {
      // 2 hours, 30 minutes, 45 seconds into day 1
      const seconds = 2 * 3600 + 30 * 60 + 45
      const parts = getDateParts(seconds, simpleConfig)
      expect(parts.hour).toBe(2)
      expect(parts.minute).toBe(30)
      expect(parts.second).toBe(45)
      expect(parts.dayOfMonth).toBe(1)
    })
  })

  describe('calendar with months (Harptos)', () => {
    it('returns first month and day 1 at totalSeconds 0', () => {
      const parts = getDateParts(0, harptosConfig)
      expect(parts.year).toBe(1492)
      expect(parts.monthIndex).toBe(0)
      expect(parts.monthName).toBe('Hammer')
      expect(parts.dayOfMonth).toBe(1)
    })

    it('advances month after 30 days', () => {
      const thirtyDays = 30 * 24 * 3600
      const parts = getDateParts(thirtyDays, harptosConfig)
      expect(parts.monthIndex).toBe(1)
      expect(parts.monthName).toBe('Alturiak')
      expect(parts.dayOfMonth).toBe(1)
    })

    it('advances year after all 360 days', () => {
      const oneYear = 360 * 24 * 3600
      const parts = getDateParts(oneYear, harptosConfig)
      expect(parts.year).toBe(1493)
      expect(parts.monthIndex).toBe(0)
      expect(parts.monthName).toBe('Hammer')
      expect(parts.dayOfMonth).toBe(1)
    })

    it('correctly handles day 15 of Mirtul', () => {
      // Mirtul is month index 4 (5th month). Days before: 4 * 30 = 120 days.
      // Day 15 of Mirtul = 120 + 14 days = 134 days total
      const totalSeconds = 134 * 24 * 3600 + 10 * 3600 // 10:00 AM
      const parts = getDateParts(totalSeconds, harptosConfig)
      expect(parts.monthName).toBe('Mirtul')
      expect(parts.dayOfMonth).toBe(15)
      expect(parts.hour).toBe(10)
    })
  })
})

// ─── formatInGameTimeOfDay ──────────────────────────────────

describe('formatInGameTimeOfDay', () => {
  it('formats midnight as "12:00 AM"', () => {
    expect(formatInGameTimeOfDay(0, simpleConfig)).toBe('12:00 AM')
  })

  it('formats 1 AM correctly', () => {
    expect(formatInGameTimeOfDay(3600, simpleConfig)).toBe('1:00 AM')
  })

  it('formats noon as "12:00 PM"', () => {
    expect(formatInGameTimeOfDay(12 * 3600, simpleConfig)).toBe('12:00 PM')
  })

  it('formats 2:30 PM correctly', () => {
    const seconds = 14 * 3600 + 30 * 60
    expect(formatInGameTimeOfDay(seconds, simpleConfig)).toBe('2:30 PM')
  })

  it('formats 11:59 PM correctly', () => {
    const seconds = 23 * 3600 + 59 * 60
    expect(formatInGameTimeOfDay(seconds, simpleConfig)).toBe('11:59 PM')
  })

  it('pads minutes to 2 digits', () => {
    const seconds = 9 * 3600 + 5 * 60
    expect(formatInGameTimeOfDay(seconds, simpleConfig)).toBe('9:05 AM')
  })
})

// ─── formatInGameDate ───────────────────────────────────────

describe('formatInGameDate', () => {
  it('formats simple day counter as "Day N"', () => {
    expect(formatInGameDate(0, simpleConfig)).toBe('Day 1')
    expect(formatInGameDate(24 * 3600, simpleConfig)).toBe('Day 2')
  })

  it('formats Harptos date with month and year', () => {
    expect(formatInGameDate(0, harptosConfig)).toBe('1 Hammer 1492 DR')
  })

  it('includes yearLabel in calendar format', () => {
    const result = formatInGameDate(0, harptosConfig)
    expect(result).toContain('DR')
  })
})

// ─── formatInGameTime ───────────────────────────────────────

describe('formatInGameTime', () => {
  it('combines date and time for simple counter', () => {
    const result = formatInGameTime(0, simpleConfig)
    expect(result).toBe('Day 1, 12:00 AM')
  })

  it('combines date and time for Harptos calendar', () => {
    const result = formatInGameTime(0, harptosConfig)
    expect(result).toBe('1 Hammer 1492 DR, 12:00 AM')
  })
})

// ─── totalSecondsFromDateTime ───────────────────────────────

describe('totalSecondsFromDateTime', () => {
  it('returns 0 for day 1, 00:00:00 in simple mode', () => {
    expect(totalSecondsFromDateTime(1, -1, 1, 0, 0, 0, simpleConfig)).toBe(0)
  })

  it('returns correct seconds for a specific time in simple mode', () => {
    // Day 5, 14:30:15
    const expected = 4 * 24 * 3600 + 14 * 3600 + 30 * 60 + 15
    expect(totalSecondsFromDateTime(1, -1, 5, 14, 30, 15, simpleConfig)).toBe(expected)
  })

  it('returns 0 for the start of Harptos calendar', () => {
    expect(totalSecondsFromDateTime(1492, 0, 1, 0, 0, 0, harptosConfig)).toBe(0)
  })

  it('correctly calculates seconds for the start of the second month', () => {
    // 1 Alturiak 1492 = 30 days into the year
    const expected = 30 * 24 * 3600
    expect(totalSecondsFromDateTime(1492, 1, 1, 0, 0, 0, harptosConfig)).toBe(expected)
  })

  it('correctly calculates seconds for year 1493', () => {
    // 1 Hammer 1493 = 360 days from start
    const expected = 360 * 24 * 3600
    expect(totalSecondsFromDateTime(1493, 0, 1, 0, 0, 0, harptosConfig)).toBe(expected)
  })

  it('round-trips with getDateParts', () => {
    // Pick a specific datetime, convert to seconds, then back
    const seconds = totalSecondsFromDateTime(1492, 4, 15, 10, 30, 0, harptosConfig)
    const parts = getDateParts(seconds, harptosConfig)

    expect(parts.year).toBe(1492)
    expect(parts.monthIndex).toBe(4)
    expect(parts.dayOfMonth).toBe(15)
    expect(parts.hour).toBe(10)
    expect(parts.minute).toBe(30)
    expect(parts.second).toBe(0)
  })

  it('adds hour, minute, second correctly', () => {
    const baseSeconds = totalSecondsFromDateTime(1492, 0, 1, 0, 0, 0, harptosConfig)
    const withTime = totalSecondsFromDateTime(1492, 0, 1, 3, 15, 30, harptosConfig)

    expect(withTime - baseSeconds).toBe(3 * 3600 + 15 * 60 + 30)
  })
})
