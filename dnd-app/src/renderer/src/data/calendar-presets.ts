import { addToast } from '../hooks/use-toast'
import { load5eCalendarPresets } from '../services/data-provider'
import type { CalendarConfig, CalendarMonth, CalendarPresetId } from '../types/campaign'
import { logger } from '../utils/logger'

interface CalendarPresetData {
  months: CalendarMonth[]
  daysPerYear: number
  yearLabel: string
  hoursPerDay: number
}

export const CALENDAR_PRESETS: Record<CalendarPresetId, CalendarPresetData> = {
  gregorian: { months: [], daysPerYear: 365, yearLabel: 'AD', hoursPerDay: 24 },
  harptos: { months: [], daysPerYear: 365, yearLabel: 'DR', hoursPerDay: 24 },
  'simple-day-counter': { months: [], daysPerYear: 0, yearLabel: 'Day', hoursPerDay: 24 },
  custom: { months: [{ name: 'Month 1', days: 30 }], daysPerYear: 30, yearLabel: 'Year', hoursPerDay: 24 }
}

export const PRESET_LABELS: Record<CalendarPresetId, string> = {
  gregorian: 'Gregorian',
  harptos: 'Calendar of Harptos',
  'simple-day-counter': 'Simple Day Counter',
  custom: 'Custom'
}

load5eCalendarPresets()
  .then((raw) => {
    const data = raw as { presets: Record<string, CalendarPresetData>; labels: Record<string, string> }
    if (data.presets) {
      for (const [key, value] of Object.entries(data.presets)) {
        if (CALENDAR_PRESETS[key as CalendarPresetId]) {
          Object.assign(CALENDAR_PRESETS[key as CalendarPresetId], value)
        }
      }
    }
    if (data.labels) {
      Object.assign(PRESET_LABELS, data.labels)
    }
  })
  .catch((err) => {
    logger.error('Failed to load calendar presets', err)
    addToast('Failed to load calendar presets', 'error')
  })

export function buildCalendarConfig(
  preset: CalendarPresetId,
  startingYear: number,
  exactTimeDefault: CalendarConfig['exactTimeDefault'] = 'contextual',
  customMonths?: CalendarMonth[],
  customYearLabel?: string
): CalendarConfig {
  const data = CALENDAR_PRESETS[preset]
  const months = preset === 'custom' && customMonths ? customMonths : data.months
  const daysPerYear = preset === 'simple-day-counter' ? 0 : months.reduce((sum, m) => sum + m.days, 0)

  return {
    preset,
    months,
    daysPerYear,
    yearLabel: customYearLabel ?? data.yearLabel,
    startingYear,
    hoursPerDay: data.hoursPerDay,
    exactTimeDefault
  }
}
