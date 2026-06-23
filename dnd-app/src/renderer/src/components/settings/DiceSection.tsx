import { useCallback, useState } from 'react'
import { SETTINGS_KEYS } from '../../constants'
import { useT } from '../../i18n'
import { Section } from './SettingsSection'

export function DiceSection(): JSX.Element {
  const { t } = useT()
  const [diceRollMode, setDiceRollMode] = useState<'3d' | '2d'>(
    () => (localStorage.getItem(SETTINGS_KEYS.DICE_MODE) as '3d' | '2d') ?? '3d'
  )
  const handleDiceModeChange = useCallback((mode: '3d' | '2d') => {
    setDiceRollMode(mode)
    localStorage.setItem(SETTINGS_KEYS.DICE_MODE, mode)
  }, [])
  return (
    <Section title={t('pages.settingsPage.diceRoller')}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">{t('pages.settingsPage.defaultDiceMode')}</span>
        <div className="flex gap-2">
          {(['3d', '2d'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleDiceModeChange(mode)}
              className={`px-4 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
                diceRollMode === mode
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-surface-2 border-border text-muted hover:border-gray-600'
              }`}
            >
              {mode === '3d' ? t('pages.settingsPage.dice3d') : t('pages.settingsPage.dice2d')}
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}
