import { useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import * as NotificationService from '../../services/notification-service'
import { Section } from './SettingsSection'

// Notifications settings panel — extracted from SettingsPage.tsx (god-component
// split, suggestions-log 2026-06-22). Owns its own enabled-mirror state; all other
// settings are read/written live through NotificationService.
export function NotificationsSection(): JSX.Element {
  const { t } = useT()
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => NotificationService.getConfig().enabled)
  return (
    <Section title={t('pages.settingsPage.notifications')}>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => {
            setNotificationsEnabled(true)
            NotificationService.setEnabled(true)
            NotificationService.setSoundEnabled(true)
          }}
          className="px-2 py-0.5 text-xs bg-surface border border-gray-600 rounded text-fg hover:text-red-300 cursor-pointer"
        >
          {t('pages.settingsPage.resetNotificationDefaults')}
        </button>
      </div>
      {!NotificationService.isSupported() && (
        <p className="text-xs text-yellow-400 mb-3">{t('pages.settingsPage.notificationsUnavailable')}</p>
      )}
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <span className="text-sm text-gray-300">{t('pages.settingsPage.enableNotifications')}</span>
          <p className="text-xs text-gray-500">{t('pages.settingsPage.enableNotificationsDesc')}</p>
        </div>
        <input
          type="checkbox"
          checked={notificationsEnabled}
          onChange={(e) => {
            const val = e.target.checked
            setNotificationsEnabled(val)
            NotificationService.setEnabled(val)
          }}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
      </label>
      <label className="flex items-center justify-between cursor-pointer mt-3">
        <div>
          <span className="text-sm text-gray-300">{t('pages.settingsPage.notificationSound')}</span>
          <p className="text-xs text-gray-500">{t('pages.settingsPage.notificationSoundDesc')}</p>
        </div>
        <input
          type="checkbox"
          checked={NotificationService.getConfig().soundEnabled}
          onChange={(e) => NotificationService.setSoundEnabled(e.target.checked)}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
      </label>
      <label className="flex items-center justify-between cursor-pointer mt-3">
        <div>
          <span className="text-sm text-gray-300">{t('pages.settingsPage.onlyWhenUnfocused')}</span>
          <p className="text-xs text-gray-500">{t('pages.settingsPage.onlyWhenUnfocusedDesc')}</p>
        </div>
        <input
          type="checkbox"
          checked={NotificationService.getConfig().onlyWhenBlurred}
          onChange={(e) => NotificationService.setOnlyWhenBlurred(e.target.checked)}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
      </label>
      <div className="mt-4 space-y-2">
        <p className="text-xs text-muted font-semibold">{t('pages.settingsPage.eventToggles')}</p>
        {(
          [
            'your-turn',
            'roll-request',
            'whisper',
            'ai-response',
            'timer-expired',
            'combat-start',
            'level-up',
            'damage-taken'
          ] as const
        ).map((event) => (
          <label key={event} className="flex items-center justify-between cursor-pointer">
            <span className="text-xs text-gray-300">
              {event
                .replace(/-/g, ' ')
                .replace(/\bai\b/gi, 'AI')
                .replace(/^./, (c) => c.toUpperCase())
                .replace(/ (.)/g, (_, c) => ` ${c.toUpperCase()}`)}
            </span>
            <input
              type="checkbox"
              checked={NotificationService.getConfig().enabledEvents.has(event)}
              onChange={(e) => NotificationService.setEventEnabled(event, e.target.checked)}
              className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
            />
          </label>
        ))}
      </div>
      <button
        className="mt-3 px-3 py-1 text-xs bg-surface-2 text-gray-300 rounded hover:bg-gray-700 cursor-pointer"
        onClick={() => {
          const result = NotificationService.notify('your-turn', t('pages.settingsPage.testCharacter'), undefined, {
            force: true
          })
          if (result === 'shown') {
            addToast(t('pages.settingsPage.testNotificationSent'), 'success')
          } else if (result === 'unsupported') {
            addToast(t('pages.settingsPage.testNotificationUnsupported'), 'error')
          } else {
            // 'disabled' / 'event-off' — notifications turned off in settings
            addToast(t('pages.settingsPage.testNotificationDisabled'), 'info')
          }
        }}
      >
        {t('pages.settingsPage.testNotification')}
      </button>
    </Section>
  )
}
