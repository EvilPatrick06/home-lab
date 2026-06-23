import { useCallback, useEffect, useState } from 'react'
import { DISPLAY_NAME_KEY } from '../../constants'
import { useT } from '../../i18n'
import type { UserProfile } from '../../types/user'
import { Section } from './SettingsSection'

export function ProfileSection(): JSX.Element {
  const { t } = useT()
  const [profileName, setProfileName] = useState('')
  const [profileLoaded, setProfileLoaded] = useState(false)
  useEffect(() => {
    window.api.loadSettings().then((settings) => {
      if (settings.userProfile?.displayName) setProfileName(settings.userProfile.displayName)
      setProfileLoaded(true)
    })
  }, [])
  const saveProfile = useCallback(
    async (name: string) => {
      if (!profileLoaded || !name.trim()) return
      try {
        const settings = await window.api.loadSettings()
        const profile: UserProfile = settings.userProfile ?? {
          id: crypto.randomUUID(),
          displayName: '',
          createdAt: new Date().toISOString()
        }
        profile.displayName = name.trim()
        await window.api.saveSettings({ ...settings, userProfile: profile })
        localStorage.setItem(DISPLAY_NAME_KEY, name.trim())
      } catch {
        // save failed silently
      }
    },
    [profileLoaded]
  )
  return (
    <Section title={t('pages.settingsPage.profile')}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">{t('pages.settingsPage.displayName')}</span>
        <input
          aria-label={t('pages.settingsPage.yourName')}
          type="text"
          maxLength={32}
          placeholder={t('pages.settingsPage.yourName')}
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          onBlur={() => saveProfile(profileName)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveProfile(profileName)
          }}
          className="w-48 px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-gray-200 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
        />
      </div>
      <p className="text-xs text-gray-500 mt-2">{t('pages.settingsPage.displayNameHint')}</p>
    </Section>
  )
}
