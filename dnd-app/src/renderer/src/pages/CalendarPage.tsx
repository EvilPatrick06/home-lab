import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

interface AvailabilityResponse {
  userId: string
  displayName: string
  available: 'yes' | 'no' | 'maybe'
}

interface SessionSchedule {
  id: string
  campaignId: string
  proposedDate: string // ISO date string
  proposedBy: string
  responses: AvailabilityResponse[]
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function formatMonthYear(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  })
}

function toDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

const AVAILABILITY_COLORS: Record<AvailabilityResponse['available'], string> = {
  yes: 'bg-green-600/30 border-green-500/50',
  no: 'bg-red-600/30 border-red-500/50',
  maybe: 'bg-amber-600/30 border-amber-500/50'
}

const AVAILABILITY_LABELS: Record<AvailabilityResponse['available'], string> = {
  yes: 'Available',
  no: 'Unavailable',
  maybe: 'Maybe'
}

export default function CalendarPage(): JSX.Element {
  const navigate = useNavigate()
  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSchedule[]>([])
  const [myAvailability, setMyAvailability] = useState<Record<string, AvailabilityResponse['available']>>({})

  const daysInMonth = useMemo(() => getDaysInMonth(currentYear, currentMonth), [currentYear, currentMonth])
  const firstDay = useMemo(() => getFirstDayOfMonth(currentYear, currentMonth), [currentYear, currentMonth])

  function goToPreviousMonth(): void {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear((y) => y - 1)
    } else {
      setCurrentMonth((m) => m - 1)
    }
    setSelectedDay(null)
  }

  function goToNextMonth(): void {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear((y) => y + 1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
    setSelectedDay(null)
  }

  function handleDayClick(day: number): void {
    const key = toDateKey(currentYear, currentMonth, day)
    setSelectedDay(key)
  }

  function proposeSession(): void {
    if (!selectedDay) return

    const existing = sessions.find((s) => s.proposedDate === selectedDay)
    if (existing) return

    const newSession: SessionSchedule = {
      id: crypto.randomUUID(),
      campaignId: 'local',
      proposedDate: selectedDay,
      proposedBy: 'DM',
      responses: []
    }
    setSessions((prev) => [...prev, newSession])
  }

  function markAvailability(dateKey: string, value: AvailabilityResponse['available']): void {
    setMyAvailability((prev) => ({ ...prev, [dateKey]: value }))

    setSessions((prev) =>
      prev.map((s) => {
        if (s.proposedDate !== dateKey) return s
        const filtered = s.responses.filter((r) => r.userId !== 'local-user')
        return {
          ...s,
          responses: [...filtered, { userId: 'local-user', displayName: 'You', available: value }]
        }
      })
    )
  }

  function removeSession(dateKey: string): void {
    setSessions((prev) => prev.filter((s) => s.proposedDate !== dateKey))
    setMyAvailability((prev) => {
      const next = { ...prev }
      delete next[dateKey]
      return next
    })
  }

  const sessionDates = useMemo(() => new Set(sessions.map((s) => s.proposedDate)), [sessions])

  const selectedSession = sessions.find((s) => s.proposedDate === selectedDay)

  const isToday = (day: number): boolean => {
    return currentYear === today.getFullYear() && currentMonth === today.getMonth() && day === today.getDate()
  }

  return (
    <div className="p-8 h-screen overflow-y-auto">
      <button
        onClick={() => navigate('/')}
        className="text-amber-400 hover:text-amber-300 hover:underline mb-6 block cursor-pointer"
      >
        &larr; Back to Menu
      </button>

      <h1 className="text-3xl font-bold mb-6">Session Calendar</h1>

      <div className="flex gap-8 max-w-4xl">
        {/* Calendar grid */}
        <div className="flex-1">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goToPreviousMonth}
              className="px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 text-gray-300 cursor-pointer transition-colors"
            >
              &larr;
            </button>
            <h2 className="text-xl font-semibold text-gray-100">{formatMonthYear(currentYear, currentMonth)}</h2>
            <button
              onClick={goToNextMonth}
              className="px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 text-gray-300 cursor-pointer transition-colors"
            >
              &rarr;
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS_OF_WEEK.map((dow) => (
              <div key={dow} className="text-center text-xs text-gray-500 font-medium py-1">
                {dow}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const key = toDateKey(currentYear, currentMonth, day)
              const hasSession = sessionDates.has(key)
              const isSelected = selectedDay === key
              const todayHighlight = isToday(day)
              const myStatus = myAvailability[key]

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`
                    aspect-square flex flex-col items-center justify-center rounded-lg
                    text-sm font-medium cursor-pointer transition-all border
                    ${
                      isSelected
                        ? 'border-amber-500 bg-amber-600/20 text-amber-300'
                        : hasSession && myStatus
                          ? `${AVAILABILITY_COLORS[myStatus]} text-gray-200`
                          : hasSession
                            ? 'border-amber-500/30 bg-amber-600/10 text-gray-200'
                            : 'border-gray-800 hover:border-gray-600 hover:bg-gray-800/50 text-gray-300'
                    }
                    ${todayHighlight ? 'ring-1 ring-amber-400' : ''}
                  `}
                >
                  <span>{day}</span>
                  {hasSession && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-0.5" />}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Proposed session
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full ring-1 ring-amber-400" />
              Today
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <div className="w-72">
          {selectedDay ? (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
              <h3 className="text-lg font-semibold mb-3 text-gray-100">
                {new Date(`${selectedDay}T00:00:00`).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric'
                })}
              </h3>

              {selectedSession ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    Proposed by <span className="text-amber-400">{selectedSession.proposedBy}</span>
                  </p>

                  {/* Availability buttons */}
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Your availability:</p>
                    <div className="flex gap-2">
                      {(['yes', 'no', 'maybe'] as AvailabilityResponse['available'][]).map((value) => (
                        <button
                          key={value}
                          onClick={() => markAvailability(selectedDay, value)}
                          className={`
                            flex-1 px-2 py-1.5 rounded text-xs font-medium cursor-pointer
                            transition-colors border
                            ${
                              myAvailability[selectedDay] === value
                                ? `${AVAILABILITY_COLORS[value]} text-white`
                                : 'border-gray-700 text-gray-400 hover:bg-gray-800'
                            }
                          `}
                        >
                          {AVAILABILITY_LABELS[value]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Responses */}
                  {selectedSession.responses.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-400 mb-2">Responses:</p>
                      <div className="space-y-1.5">
                        {selectedSession.responses.map((r) => (
                          <div key={r.userId} className="flex items-center justify-between text-sm">
                            <span className="text-gray-300">{r.displayName}</span>
                            <span
                              className={
                                r.available === 'yes'
                                  ? 'text-green-400'
                                  : r.available === 'no'
                                    ? 'text-red-400'
                                    : 'text-amber-400'
                              }
                            >
                              {AVAILABILITY_LABELS[r.available]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => removeSession(selectedDay)}
                    className="w-full px-3 py-1.5 rounded-lg text-sm text-red-400 border border-red-800 hover:bg-red-900/30 cursor-pointer transition-colors mt-2"
                  >
                    Remove Session
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">No session proposed for this date.</p>
                  <button
                    onClick={proposeSession}
                    className="w-full px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm cursor-pointer transition-colors"
                  >
                    Propose Session
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
              <p className="text-sm text-gray-500">Select a day to propose a session or mark your availability.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
