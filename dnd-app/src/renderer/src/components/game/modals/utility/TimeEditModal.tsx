import { useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { useBastionStore } from '../../../../stores/use-bastion-store'
import { useGameStore } from '../../../../stores/use-game-store'
import type { CalendarConfig } from '../../../../types/campaign'
import { formatInGameTime, getDateParts, totalSecondsFromDateTime } from '../../../../utils/calendar-utils'

interface TimeEditModalProps {
  calendar: CalendarConfig
  campaignId: string
  onClose: () => void
  onBroadcastTimeSync?: (totalSeconds: number) => void
}

export default function TimeEditModal({
  calendar,
  campaignId,
  onClose,
  onBroadcastTimeSync
}: TimeEditModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  const inGameTime = useGameStore((s) => s.inGameTime)
  const advanceTimeDays = useGameStore((s) => s.advanceTimeDays)
  const setInGameTime = useGameStore((s) => s.setInGameTime)
  const bastions = useBastionStore((s) => s.bastions)
  const advanceBastionTime = useBastionStore((s) => s.advanceTime)

  const [mode, setMode] = useState<'advance' | 'set'>('advance')
  const [daysToAdvance, setDaysToAdvance] = useState(1)
  const [bastionMessages, setBastionMessages] = useState<string[]>([])
  const [backwardWarning, setBackwardWarning] = useState(false)

  // Set mode state
  const currentParts = inGameTime ? getDateParts(inGameTime.totalSeconds, calendar) : null
  const [setYear, setSetYear] = useState(currentParts?.year ?? calendar.startingYear)
  const [setMonthIndex, setSetMonthIndex] = useState(currentParts?.monthIndex ?? 0)
  const [setDay, setSetDay] = useState(currentParts?.dayOfMonth ?? 1)
  const [setHour, setSetHour] = useState(currentParts?.hour ?? 8)
  const [setMinute, setSetMinute] = useState(currentParts?.minute ?? 0)

  if (!inGameTime) return <></>

  const handleAdvanceDays = (): void => {
    if (daysToAdvance <= 0) return

    advanceTimeDays(daysToAdvance)

    // Advance bastions linked to this campaign
    const msgs: string[] = []
    const linkedBastions = bastions.filter((b) => b.campaignId === campaignId)
    for (const bastion of linkedBastions) {
      if (advanceBastionTime) {
        advanceBastionTime(bastion.id, daysToAdvance)
        msgs.push(t('game.timeEditModal.bastionAdvanced', { name: bastion.name, days: daysToAdvance }))
      }
    }
    setBastionMessages(msgs)

    // Broadcast sync
    const newTime = useGameStore.getState().inGameTime
    if (newTime && onBroadcastTimeSync) {
      onBroadcastTimeSync(newTime.totalSeconds)
    }
  }

  const handleSetTime = (): void => {
    const newTotalSeconds = totalSecondsFromDateTime(
      setYear,
      calendar.preset === 'simple-day-counter' ? 0 : setMonthIndex,
      setDay,
      setHour,
      setMinute,
      0,
      calendar
    )

    if (newTotalSeconds < inGameTime.totalSeconds) {
      setBackwardWarning(true)
      return
    }

    applySetTime(newTotalSeconds)
  }

  const applySetTime = (newTotalSeconds: number): void => {
    setInGameTime({ totalSeconds: newTotalSeconds })
    setBackwardWarning(false)

    if (onBroadcastTimeSync) {
      onBroadcastTimeSync(newTotalSeconds)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-surface border border-border rounded-xl p-5 w-[420px] shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-accent">{t('game.timeEditModal.title')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer">
            x
          </button>
        </div>

        {/* Current time display */}
        <div className="bg-surface-2/50 rounded-lg px-3 py-2 mb-4 text-xs">
          <span className="text-muted">{t('game.timeEditModal.current')}</span>
          <span className="text-amber-300">{formatInGameTime(inGameTime.totalSeconds, calendar)}</span>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setMode('advance')}
            className={`flex-1 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
              mode === 'advance'
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                : 'bg-surface-2 text-muted border border-border/50'
            }`}
          >
            {t('game.timeEditModal.advanceDaysTab')}
          </button>
          <button
            onClick={() => setMode('set')}
            className={`flex-1 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
              mode === 'set'
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                : 'bg-surface-2 text-muted border border-border/50'
            }`}
          >
            {t('game.timeEditModal.setExactTab')}
          </button>
        </div>

        {mode === 'advance' ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted block mb-1">{t('game.timeEditModal.daysToAdvance')}</label>
              <div className="flex gap-2 items-center">
                <input
                  name="days-to-advance"
                  type="number"
                  value={daysToAdvance}
                  min={1}
                  onChange={(e) => setDaysToAdvance(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-24 bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-200"
                />
                <button
                  onClick={handleAdvanceDays}
                  className="px-4 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-accent-strong text-white rounded-lg cursor-pointer"
                >
                  {t('game.timeEditModal.advance')}
                </button>
              </div>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap gap-1">
              {[1, 3, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDaysToAdvance(d)}
                  className={`px-2 py-1 text-xs rounded cursor-pointer ${
                    daysToAdvance === d ? 'bg-amber-600/30 text-amber-300' : 'bg-surface-2 text-muted hover:bg-gray-700'
                  }`}
                >
                  {t('game.timeEditModal.dayPreset', { count: d })}
                </button>
              ))}
            </div>

            {/* Bastion progress messages */}
            {bastionMessages.length > 0 && (
              <div className="bg-green-900/20 border border-green-800/30 rounded-lg px-3 py-2 text-xs text-green-300 space-y-1">
                {bastionMessages.map((msg, i) => (
                  <div key={i}>{msg}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {calendar.preset !== 'simple-day-counter' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{t('game.timeEditModal.year')}</label>
                  <input
                    name="set-year"
                    type="number"
                    value={setYear}
                    onChange={(e) => setSetYear(parseInt(e.target.value, 10) || 1)}
                    className="w-20 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                  />
                </div>
              )}
              {calendar.months.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{t('game.timeEditModal.month')}</label>
                  <select
                    name="set-month"
                    value={setMonthIndex}
                    onChange={(e) => setSetMonthIndex(parseInt(e.target.value, 10))}
                    className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                  >
                    {calendar.months.map((m, i) => (
                      <option key={i} value={i}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('game.timeEditModal.day')}</label>
                <input
                  name="set-day"
                  type="number"
                  value={setDay}
                  min={1}
                  max={calendar.months[setMonthIndex]?.days ?? 365}
                  onChange={(e) => setSetDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-14 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('game.timeEditModal.hour')}</label>
                <input
                  name="set-hour"
                  type="number"
                  value={setHour}
                  min={0}
                  max={23}
                  onChange={(e) => setSetHour(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)))}
                  className="w-14 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('game.timeEditModal.min')}</label>
                <input
                  name="set-minute"
                  type="number"
                  value={setMinute}
                  min={0}
                  max={59}
                  onChange={(e) => setSetMinute(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                  className="w-14 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                />
              </div>
            </div>

            {/* Preview */}
            {(() => {
              const previewSeconds = totalSecondsFromDateTime(
                setYear,
                calendar.preset === 'simple-day-counter' ? 0 : setMonthIndex,
                setDay,
                setHour,
                setMinute,
                0,
                calendar
              )
              return (
                <div className="text-xs text-muted">
                  {t('game.timeEditModal.preview')}{' '}
                  <span className="text-amber-300">{formatInGameTime(previewSeconds, calendar)}</span>
                </div>
              )
            })()}

            {/* Backward warning */}
            {backwardWarning && (
              <div className="bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2 text-xs text-red-300">
                <div className="font-semibold mb-1">{t('game.timeEditModal.warningTitle')}</div>
                <p className="mb-2">{t('game.timeEditModal.warningBody')}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const newTotalSeconds = totalSecondsFromDateTime(
                        setYear,
                        calendar.preset === 'simple-day-counter' ? 0 : setMonthIndex,
                        setDay,
                        setHour,
                        setMinute,
                        0,
                        calendar
                      )
                      applySetTime(newTotalSeconds)
                    }}
                    className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded cursor-pointer"
                  >
                    {t('game.timeEditModal.setAnyway')}
                  </button>
                  <button
                    onClick={() => setBackwardWarning(false)}
                    className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                  >
                    {t('common.actions.cancel')}
                  </button>
                </div>
              </div>
            )}

            {!backwardWarning && (
              <button
                onClick={handleSetTime}
                className="px-4 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-accent-strong text-white rounded-lg cursor-pointer"
              >
                {t('game.timeEditModal.setTime')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
