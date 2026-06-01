import { useMemo, useState } from 'react'
import { buildCalendarConfig, CALENDAR_PRESETS, PRESET_LABELS } from '../../data/calendar-presets'
import { useT } from '../../i18n'
import type { CalendarConfig, CalendarMonth, CalendarPresetId } from '../../types/campaign'
import { formatInGameTime, totalSecondsFromDateTime } from '../../utils/calendar-utils'

interface CalendarStepProps {
  calendar: CalendarConfig | null
  onChange: (calendar: CalendarConfig | null) => void
}

export default function CalendarStep({ calendar, onChange }: CalendarStepProps): JSX.Element {
  const { t } = useT()
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
      <h2 className="text-xl font-semibold mb-2">{t('campaign.calendarStep.title')}</h2>
      <p className="text-muted text-sm mb-6">{t('campaign.calendarStep.subtitle')}</p>

      <div className="max-w-2xl space-y-4">
        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleEnable(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
          <span className="text-sm text-gray-200">{t('campaign.calendarStep.enableTracking')}</span>
        </label>

        {enabled && (
          <>
            {/* Preset cards */}
            <div>
              <label className="text-xs font-semibold text-muted mb-2 block">
                {t('campaign.calendarStep.calendarSystem')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PRESET_LABELS) as CalendarPresetId[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => handlePresetChange(id)}
                    className={`px-3 py-2.5 text-left text-sm rounded-lg border transition-colors cursor-pointer ${
                      preset === id
                        ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                        : 'bg-surface-2/60 border-border/50 text-gray-300 hover:bg-gray-700/60'
                    }`}
                  >
                    <div className="font-semibold">{PRESET_LABELS[id]}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {id === 'gregorian' && t('campaign.calendarStep.presetDesc.gregorian')}
                      {id === 'harptos' && t('campaign.calendarStep.presetDesc.harptos')}
                      {id === 'simple-day-counter' && t('campaign.calendarStep.presetDesc.simpleDayCounter')}
                      {id === 'custom' && t('campaign.calendarStep.presetDesc.custom')}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom months editor */}
            {preset === 'custom' && (
              <div>
                <label className="text-xs font-semibold text-muted mb-2 block">
                  {t('campaign.calendarStep.customMonths')}
                </label>
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
                        className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                        placeholder={t('campaign.calendarStep.monthNamePlaceholder')}
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
                        className="w-16 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                      />
                      <span className="text-xs text-gray-500">{t('campaign.calendarStep.days')}</span>
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
                  className="mt-1 text-xs text-accent hover:text-amber-300 cursor-pointer"
                >
                  {t('campaign.calendarStep.addMonth')}
                </button>
                <div className="mt-2">
                  <label className="text-xs text-gray-500 block mb-1">{t('campaign.calendarStep.yearLabel')}</label>
                  <input
                    value={customYearLabel}
                    onChange={(e) => {
                      setCustomYearLabel(e.target.value)
                      emitChange(undefined, undefined, undefined, undefined, e.target.value)
                    }}
                    className="w-24 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                    placeholder={t('campaign.calendarStep.yearLabelPlaceholder')}
                  />
                </div>
              </div>
            )}

            {/* Starting date/time */}
            <div>
              <label className="text-xs font-semibold text-muted mb-2 block">
                {t('campaign.calendarStep.startingDateTime')}
              </label>
              <div className="flex gap-3 items-end flex-wrap">
                {preset !== 'simple-day-counter' && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">{t('campaign.calendarStep.year')}</label>
                    <input
                      type="number"
                      value={startingYear}
                      onChange={(e) => {
                        const yr = parseInt(e.target.value, 10) || 1
                        setStartingYear(yr)
                        emitChange(undefined, yr)
                      }}
                      className="w-20 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                    />
                  </div>
                )}
                {months.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">{t('campaign.calendarStep.month')}</label>
                    <select
                      value={startMonth}
                      onChange={(e) => {
                        setStartMonth(parseInt(e.target.value, 10))
                        setStartDay(1)
                      }}
                      className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
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
                  <label className="text-xs text-gray-500 block mb-1">
                    {preset === 'simple-day-counter'
                      ? t('campaign.calendarStep.startingDay')
                      : t('campaign.calendarStep.day')}
                  </label>
                  <input
                    type="number"
                    value={startDay}
                    min={1}
                    max={months[startMonth]?.days ?? 365}
                    onChange={(e) => setStartDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{t('campaign.calendarStep.hour')}</label>
                  <select
                    value={startHour}
                    onChange={(e) => setStartHour(parseInt(e.target.value, 10))}
                    className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
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
              <label className="text-xs font-semibold text-muted mb-2 block">
                {t('campaign.calendarStep.timeDisplayMode')}
              </label>
              <select
                value={exactTimeDefault}
                onChange={(e) => {
                  const v = e.target.value as CalendarConfig['exactTimeDefault']
                  setExactTimeDefault(v)
                  emitChange(undefined, undefined, v)
                }}
                className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
              >
                <option value="always">{t('campaign.calendarStep.timeMode.always')}</option>
                <option value="contextual">{t('campaign.calendarStep.timeMode.contextual')}</option>
                <option value="never">{t('campaign.calendarStep.timeMode.never')}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">{t('campaign.calendarStep.timeModeHint')}</p>
            </div>

            {/* Preview */}
            {previewTime && (
              <div className="bg-surface-2/50 rounded-lg px-4 py-3 border border-border/30">
                <div className="text-xs text-gray-500 mb-1">{t('campaign.calendarStep.preview')}</div>
                <div className="text-sm text-amber-300 font-medium">{previewTime}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
