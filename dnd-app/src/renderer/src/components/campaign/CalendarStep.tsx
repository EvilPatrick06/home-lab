import { useMemo, useState } from 'react'
import { buildCalendarConfig, CALENDAR_PRESETS, PRESET_LABELS } from '../../data/calendar-presets'
import type { CalendarConfig, CalendarMonth, CalendarPresetId } from '../../types/campaign'
import { formatInGameTime, totalSecondsFromDateTime } from '../../utils/calendar-utils'

interface CalendarStepProps {
  calendar: CalendarConfig | null
  onChange: (calendar: CalendarConfig | null) => void
}

export default function CalendarStep({ calendar, onChange }: CalendarStepProps): JSX.Element {
  const [enabled, setEnabled] = useState(calendar !== null)
  const [preset, setPreset] = useState<CalendarPresetId>(calendar?.preset ?? 'harptos')
  const [startingYear, setStartingYear] = useState(calendar?.startingYear ?? 1492)
  const [startMonth, setStartMonth] = useState(0)
  const [startDay, setStartDay] = useState(1)
  const [startHour, setStartHour] = useState(8)
  const [exactTimeDefault, setExactTimeDefault] = useState<CalendarConfig['exactTimeDefault']>(
    calendar?.exactTimeDefault ?? 'contextual'
  )

  // Custom calendar state
  const [customMonths, setCustomMonths] = useState<CalendarMonth[]>(
    calendar?.preset === 'custom' ? calendar.months : [{ name: 'Month 1', days: 30 }]
  )
  const [customYearLabel, setCustomYearLabel] = useState(calendar?.preset === 'custom' ? calendar.yearLabel : 'Year')

  const months = preset === 'custom' ? customMonths : (CALENDAR_PRESETS[preset]?.months ?? [])

  const config = useMemo(() => {
    if (!enabled) return null
    return buildCalendarConfig(preset, startingYear, exactTimeDefault, customMonths, customYearLabel)
  }, [enabled, preset, startingYear, exactTimeDefault, customMonths, customYearLabel])

  const previewTime = useMemo(() => {
    if (!config) return ''
    const seconds = totalSecondsFromDateTime(startingYear, startMonth, startDay, startHour, 0, 0, config)
    return formatInGameTime(seconds, config)
  }, [config, startingYear, startMonth, startDay, startHour])

  const emitChange = (
    p: CalendarPresetId = preset,
    yr: number = startingYear,
    etd: CalendarConfig['exactTimeDefault'] = exactTimeDefault,
    cm: CalendarMonth[] = customMonths,
    cyl: string = customYearLabel
  ): void => {
    const cfg = buildCalendarConfig(p, yr, etd, cm, cyl)
    const startingTime = totalSecondsFromDateTime(yr, startMonth, startDay, startHour, 0, 0, cfg)
    onChange({ ...cfg, startingYear: yr, startingTime })
  }

  const handleEnable = (on: boolean): void => {
    setEnabled(on)
    if (on) {
      emitChange()
    } else {
      onChange(null)
    }
  }

  const handlePresetChange = (p: CalendarPresetId): void => {
    setPreset(p)
    setStartMonth(0)
    setStartDay(1)
    if (p === 'harptos' && startingYear === 1) setStartingYear(1492)
    if (p === 'gregorian' && startingYear === 1492) setStartingYear(1)
    emitChange(p)
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Calendar & Time</h2>
      <p className="text-gray-400 text-sm mb-6">Track in-game time during sessions. This is optional.</p>

      <div className="max-w-2xl space-y-4">
        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleEnable(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
          <span className="text-sm text-gray-200">Enable in-game time tracking</span>
        </label>

        {enabled && (
          <>
            {/* Preset cards */}
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-2 block">Calendar System</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PRESET_LABELS) as CalendarPresetId[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => handlePresetChange(id)}
                    className={`px-3 py-2.5 text-left text-sm rounded-lg border transition-colors cursor-pointer ${
                      preset === id
                        ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                        : 'bg-gray-800/60 border-gray-700/50 text-gray-300 hover:bg-gray-700/60'
                    }`}
                  >
                    <div className="font-semibold">{PRESET_LABELS[id]}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {id === 'gregorian' && '12 months, 365 days'}
                      {id === 'harptos' && 'Forgotten Realms, 12+5 festival days'}
                      {id === 'simple-day-counter' && 'No months, just "Day N"'}
                      {id === 'custom' && 'Define your own months'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom months editor */}
            {preset === 'custom' && (
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-2 block">Custom Months</label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {customMonths.map((m, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        value={m.name}
                        onChange={(e) => {
                          const updated = [...customMonths]
                          updated[i] = { ...m, name: e.target.value }
                          setCustomMonths(updated)
                          emitChange(undefined, undefined, undefined, updated)
                        }}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                        placeholder="Month name"
                      />
                      <input
                        type="number"
                        value={m.days}
                        min={1}
                        onChange={(e) => {
                          const updated = [...customMonths]
                          updated[i] = { ...m, days: Math.max(1, parseInt(e.target.value, 10) || 1) }
                          setCustomMonths(updated)
                          emitChange(undefined, undefined, undefined, updated)
                        }}
                        className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                      />
                      <span className="text-[10px] text-gray-500">days</span>
                      {customMonths.length > 1 && (
                        <button
                          onClick={() => {
                            const updated = customMonths.filter((_, j) => j !== i)
                            setCustomMonths(updated)
                            emitChange(undefined, undefined, undefined, updated)
                          }}
                          className="text-red-400 hover:text-red-300 text-xs cursor-pointer"
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const updated = [...customMonths, { name: `Month ${customMonths.length + 1}`, days: 30 }]
                    setCustomMonths(updated)
                    emitChange(undefined, undefined, undefined, updated)
                  }}
                  className="mt-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  + Add Month
                </button>
                <div className="mt-2">
                  <label className="text-[10px] text-gray-500 block mb-1">Year Label</label>
                  <input
                    value={customYearLabel}
                    onChange={(e) => {
                      setCustomYearLabel(e.target.value)
                      emitChange(undefined, undefined, undefined, undefined, e.target.value)
                    }}
                    className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                    placeholder="Year"
                  />
                </div>
              </div>
            )}

            {/* Starting date/time */}
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-2 block">Starting Date & Time</label>
              <div className="flex gap-3 items-end flex-wrap">
                {preset !== 'simple-day-counter' && (
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Year</label>
                    <input
                      type="number"
                      value={startingYear}
                      onChange={(e) => {
                        const yr = parseInt(e.target.value, 10) || 1
                        setStartingYear(yr)
                        emitChange(undefined, yr)
                      }}
                      className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                    />
                  </div>
                )}
                {months.length > 0 && (
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Month</label>
                    <select
                      value={startMonth}
                      onChange={(e) => {
                        setStartMonth(parseInt(e.target.value, 10))
                        setStartDay(1)
                      }}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                    >
                      {months.map((m, i) => (
                        <option key={i} value={i}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">
                    {preset === 'simple-day-counter' ? 'Starting Day' : 'Day'}
                  </label>
                  <input
                    type="number"
                    value={startDay}
                    min={1}
                    max={months[startMonth]?.days ?? 365}
                    onChange={(e) => setStartDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Hour</label>
                  <select
                    value={startHour}
                    onChange={(e) => setStartHour(parseInt(e.target.value, 10))}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                  >
                    {Array.from({ length: 24 }, (_, i) => {
                      const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i
                      const ampm = i < 12 ? 'AM' : 'PM'
                      return (
                        <option key={i} value={i}>
                          {h12}:00 {ampm}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>
            </div>

            {/* Exact time mode */}
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-2 block">Time Display Mode</label>
              <select
                value={exactTimeDefault}
                onChange={(e) => {
                  const v = e.target.value as CalendarConfig['exactTimeDefault']
                  setExactTimeDefault(v)
                  emitChange(undefined, undefined, v)
                }}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
              >
                <option value="always">Always show exact time</option>
                <option value="contextual">Contextual (AI decides)</option>
                <option value="never">Never show exact time (narrative only)</option>
              </select>
              <p className="text-[10px] text-gray-500 mt-1">
                Controls when the AI DM includes numeric time in responses.
              </p>
            </div>

            {/* Preview */}
            {previewTime && (
              <div className="bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700/30">
                <div className="text-[10px] text-gray-500 mb-1">Preview</div>
                <div className="text-sm text-amber-300 font-medium">{previewTime}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
