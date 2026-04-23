import { useState } from 'react'
import CalendarStep from '../../components/campaign/CalendarStep'
import { Button, Card, Modal } from '../../components/ui'
import { getSeason, type SunPosition, type TimeBreakdown, type WeatherOverride } from '../../services/calendar-service'
import { type MoonPhase, useWeather } from '../../services/calendar-weather'

type _SunPosition = SunPosition
type _TimeBreakdown = TimeBreakdown
type _WeatherOverride = WeatherOverride
type _MoonPhase = MoonPhase

import type { CalendarConfig, Campaign } from '../../types/campaign'

interface CalendarCardProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function CalendarCard({ campaign, saveCampaign }: CalendarCardProps): JSX.Element {
  const [showCalendarEdit, setShowCalendarEdit] = useState(false)
  const [editCalendar, setEditCalendar] = useState<CalendarConfig | null>(null)

  // Weather for current day (derived from calendar config)
  const calendarDayOfYear = campaign.calendar
    ? Math.max(1, Math.floor((campaign.calendar.daysPerYear || 365) * 0.25) + 1)
    : 1
  const calendarSeason = campaign.calendar
    ? getSeason(calendarDayOfYear, campaign.calendar.daysPerYear || 365)
    : 'summer'
  const { weather } = useWeather(calendarDayOfYear, calendarSeason)

  const openCalendarEdit = (): void => {
    setEditCalendar(campaign.calendar ?? null)
    setShowCalendarEdit(true)
  }

  const handleSaveCalendar = async (): Promise<void> => {
    await saveCampaign({
      ...campaign,
      calendar: editCalendar ?? undefined,
      updatedAt: new Date().toISOString()
    })
    setShowCalendarEdit(false)
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Calendar</h3>
          <button onClick={openCalendarEdit} className="text-xs text-gray-400 hover:text-amber-400 cursor-pointer">
            Edit
          </button>
        </div>
        {campaign.calendar ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Preset:</span>
              <span className="text-gray-200 capitalize">{campaign.calendar.preset.replace(/-/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Months:</span>
              <span className="text-gray-200">{campaign.calendar.months.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Days per Year:</span>
              <span className="text-gray-200">{campaign.calendar.daysPerYear}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Starting Year:</span>
              <span className="text-gray-200">
                {campaign.calendar.startingYear} {campaign.calendar.yearLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Hours per Day:</span>
              <span className="text-gray-200">{campaign.calendar.hoursPerDay}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Exact Time:</span>
              <span className="text-gray-200 capitalize">{campaign.calendar.exactTimeDefault}</span>
            </div>
            {weather && (
              <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-700/50">
                <span className="text-gray-500">Weather:</span>
                <span className="text-gray-200 capitalize">{weather.condition.replace(/-/g, ' ')}</span>
                <span className="text-gray-400 text-[10px]">({weather.temperature})</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No calendar configured.</p>
        )}
      </Card>

      {/* Calendar Edit Modal */}
      <Modal open={showCalendarEdit} onClose={() => setShowCalendarEdit(false)} title="Edit Calendar">
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <CalendarStep calendar={editCalendar} onChange={setEditCalendar} />
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowCalendarEdit(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveCalendar}>Save</Button>
        </div>
      </Modal>
    </>
  )
}
