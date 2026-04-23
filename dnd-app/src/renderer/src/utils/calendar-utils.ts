import type { CalendarConfig } from '../types/campaign'

export type TimeOfDayPhase = 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'evening' | 'night'

export interface DateParts {
  year: number
  monthIndex: number
  monthName: string
  dayOfMonth: number
  hour: number
  minute: number
  second: number
}

/**
 * Get the time-of-day phase from an hour (0-23).
 */
export function getTimeOfDayPhase(hour: number): TimeOfDayPhase {
  if (hour >= 5 && hour < 7) return 'dawn'
  if (hour >= 7 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 20) return 'dusk'
  if (hour >= 20 && hour < 22) return 'evening'
  return 'night'
}

/**
 * Decompose totalSeconds into year/month/day/hour/minute/second.
 * For simple-day-counter: monthIndex = -1, monthName = ''
 */
export function getDateParts(totalSeconds: number, config: CalendarConfig): DateParts {
  const hoursPerDay = config.hoursPerDay || 24
  const secondsPerDay = hoursPerDay * 3600

  const totalDays = Math.floor(totalSeconds / secondsPerDay)
  const dayRemainder = totalSeconds - totalDays * secondsPerDay
  const hour = Math.floor(dayRemainder / 3600)
  const minute = Math.floor((dayRemainder % 3600) / 60)
  const second = dayRemainder % 60

  // Simple day counter: no months/years
  if (config.preset === 'simple-day-counter' || config.months.length === 0) {
    return {
      year: config.startingYear,
      monthIndex: -1,
      monthName: '',
      dayOfMonth: totalDays + 1, // 1-based
      hour,
      minute,
      second
    }
  }

  // Calendar with months
  const daysPerYear = config.daysPerYear || config.months.reduce((s, m) => s + m.days, 0)
  let remainingDays = totalDays
  let year = config.startingYear

  // Count years
  if (daysPerYear > 0) {
    const fullYears = Math.floor(remainingDays / daysPerYear)
    year += fullYears
    remainingDays -= fullYears * daysPerYear
  }

  // Find month
  let monthIndex = 0
  for (let i = 0; i < config.months.length; i++) {
    if (remainingDays < config.months[i].days) {
      monthIndex = i
      break
    }
    remainingDays -= config.months[i].days
    if (i === config.months.length - 1) {
      monthIndex = config.months.length - 1
      break
    }
  }

  return {
    year,
    monthIndex,
    monthName: config.months[monthIndex]?.name ?? '',
    dayOfMonth: remainingDays + 1, // 1-based
    hour,
    minute,
    second
  }
}

/**
 * Format time of day: "2:30 PM"
 */
export function formatInGameTimeOfDay(totalSeconds: number, config: CalendarConfig): string {
  const parts = getDateParts(totalSeconds, config)
  const h12 = parts.hour === 0 ? 12 : parts.hour > 12 ? parts.hour - 12 : parts.hour
  const ampm = parts.hour < 12 ? 'AM' : 'PM'
  const min = parts.minute.toString().padStart(2, '0')
  return `${h12}:${min} ${ampm}`
}

/**
 * Format date: "15 Mirtul 1492 DR" or "Day 42"
 */
export function formatInGameDate(totalSeconds: number, config: CalendarConfig): string {
  const parts = getDateParts(totalSeconds, config)

  if (config.preset === 'simple-day-counter' || config.months.length === 0) {
    return `Day ${parts.dayOfMonth}`
  }

  return `${parts.dayOfMonth} ${parts.monthName} ${parts.year} ${config.yearLabel}`
}

/**
 * Format full datetime: "15 Mirtul 1492 DR, 2:30 PM" or "Day 42, 2:30 PM"
 */
export function formatInGameTime(totalSeconds: number, config: CalendarConfig): string {
  return `${formatInGameDate(totalSeconds, config)}, ${formatInGameTimeOfDay(totalSeconds, config)}`
}

/**
 * Convert date/time components to totalSeconds.
 */
export function totalSecondsFromDateTime(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  config: CalendarConfig
): number {
  const hoursPerDay = config.hoursPerDay || 24
  const secondsPerDay = hoursPerDay * 3600

  if (config.preset === 'simple-day-counter' || config.months.length === 0) {
    // day is 1-based "Day N"
    return (day - 1) * secondsPerDay + hour * 3600 + minute * 60 + second
  }

  const daysPerYear = config.daysPerYear || config.months.reduce((s, m) => s + m.days, 0)
  let totalDays = (year - config.startingYear) * daysPerYear

  // Add days from months before monthIndex
  for (let i = 0; i < monthIndex && i < config.months.length; i++) {
    totalDays += config.months[i].days
  }

  // Add day-of-month (1-based → 0-based offset)
  totalDays += day - 1

  return totalDays * secondsPerDay + hour * 3600 + minute * 60 + second
}
