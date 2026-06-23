import { useCallback, useState } from 'react'
import { useT } from '../../i18n'
import {
  getAmbientVolume,
  getVolume,
  isEnabled as isAudioSystemEnabled,
  isMuted as isAudioSystemMuted,
  setAmbientVolume as setGlobalAmbientVolume,
  setEnabled as setGlobalAudioEnabled,
  setMuted as setGlobalAudioMuted,
  setVolume as setGlobalVolume
} from '../../services/sound-manager'
import { Section } from './SettingsSection'

export function AudioSection(): JSX.Element {
  const { t } = useT()
  const [masterVolume, setMasterVolume] = useState(() => getVolume() * 100)
  const [ambientVolume, setAmbientVolumeState] = useState(() => getAmbientVolume() * 100)
  const [audioMuted, setAudioMuted] = useState(() => isAudioSystemMuted())
  const [audioEnabled, setAudioEnabled] = useState(() => isAudioSystemEnabled())
  const handleMasterVolumeChange = useCallback((val: number) => {
    setMasterVolume(val)
    setGlobalVolume(val / 100)
  }, [])
  const handleAmbientVolumeChange = useCallback((val: number) => {
    setAmbientVolumeState(val)
    setGlobalAmbientVolume(val / 100)
  }, [])
  const handleMutedChange = useCallback((val: boolean) => {
    setAudioMuted(val)
    setGlobalAudioMuted(val)
  }, [])
  const handleEnabledChange = useCallback((val: boolean) => {
    setAudioEnabled(val)
    setGlobalAudioEnabled(val)
  }, [])
  return (
    <Section title={t('pages.settingsPage.audio')}>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => {
            handleMasterVolumeChange(100)
            handleAmbientVolumeChange(30)
            handleMutedChange(false)
            handleEnabledChange(true)
          }}
          className="px-2 py-0.5 text-xs bg-surface border border-gray-600 rounded text-fg hover:text-red-300 cursor-pointer"
        >
          {t('pages.settingsPage.resetAudioDefaults')}
        </button>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">{t('pages.settingsPage.soundSystem')}</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={audioEnabled}
              onChange={(e) => handleEnabledChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600" />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">{t('pages.settingsPage.muteAllSounds')}</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={audioMuted}
              onChange={(e) => handleMutedChange(e.target.checked)}
              disabled={!audioEnabled}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600 peer-disabled:opacity-50" />
          </label>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300 w-32">{t('pages.settingsPage.masterVolume')}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={masterVolume}
            onChange={(e) => handleMasterVolumeChange(Number(e.target.value))}
            disabled={!audioEnabled || audioMuted}
            className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
          />
          <span className="text-xs text-muted w-8 text-right">{Math.round(masterVolume)}%</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300 w-32">{t('pages.settingsPage.ambientMusic')}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={ambientVolume}
            onChange={(e) => handleAmbientVolumeChange(Number(e.target.value))}
            disabled={!audioEnabled || audioMuted}
            className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
          />
          <span className="text-xs text-muted w-8 text-right">{Math.round(ambientVolume)}%</span>
        </div>
      </div>
    </Section>
  )
}
