import { useT } from '../../i18n'
import { type ColorblindMode, useAccessibilityStore } from '../../stores/use-accessibility-store'
import { Section } from './SettingsSection'

const COLORBLIND_OPTIONS: { mode: ColorblindMode; labelKey: string; descriptionKey: string }[] = [
  {
    mode: 'none',
    labelKey: 'pages.settingsPage.colorblindNone',
    descriptionKey: 'pages.settingsPage.colorblindNoneDesc'
  },
  {
    mode: 'deuteranopia',
    labelKey: 'pages.settingsPage.colorblindDeuteranopia',
    descriptionKey: 'pages.settingsPage.colorblindDeuteranopiaDesc'
  },
  {
    mode: 'protanopia',
    labelKey: 'pages.settingsPage.colorblindProtanopia',
    descriptionKey: 'pages.settingsPage.colorblindProtanopiaDesc'
  },
  {
    mode: 'tritanopia',
    labelKey: 'pages.settingsPage.colorblindTritanopia',
    descriptionKey: 'pages.settingsPage.colorblindTritanopiaDesc'
  }
]

export function AccessibilitySection(): JSX.Element {
  const { t } = useT()
  const uiScale = useAccessibilityStore((s) => s.uiScale)
  const setUiScale = useAccessibilityStore((s) => s.setUiScale)
  const colorblindMode = useAccessibilityStore((s) => s.colorblindMode)
  const setColorblindMode = useAccessibilityStore((s) => s.setColorblindMode)
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion)
  const setReducedMotion = useAccessibilityStore((s) => s.setReducedMotion)
  const screenReaderMode = useAccessibilityStore((s) => s.screenReaderMode)
  const setScreenReaderMode = useAccessibilityStore((s) => s.setScreenReaderMode)
  const tooltipsEnabled = useAccessibilityStore((s) => s.tooltipsEnabled)
  const setTooltipsEnabled = useAccessibilityStore((s) => s.setTooltipsEnabled)
  const fontStyle = useAccessibilityStore((s) => s.fontStyle)
  const setFontStyle = useAccessibilityStore((s) => s.setFontStyle)

  return (
    <Section title={t('pages.settingsPage.accessibility')}>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => {
            setUiScale(100)
            setColorblindMode('none')
            setReducedMotion(false)
            setScreenReaderMode(false)
            setTooltipsEnabled(true)
            setFontStyle('system')
          }}
          className="px-2 py-0.5 text-xs bg-surface border border-gray-600 rounded text-fg hover:text-red-300 cursor-pointer"
        >
          {t('pages.settingsPage.resetAccessibilityDefaults')}
        </button>
      </div>
      <div className="space-y-5">
        {/* UI Scale */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">{t('pages.settingsPage.uiScale')}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted w-10 text-end">{uiScale}%</span>
              {uiScale !== 100 && (
                <button
                  onClick={() => setUiScale(100)}
                  className="px-2 py-0.5 text-xs bg-gray-700 border border-gray-600 rounded text-muted hover:text-gray-200 cursor-pointer"
                >
                  {t('pages.settingsPage.reset')}
                </button>
              )}
            </div>
          </div>
          <input
            type="range"
            name="ui-scale"
            min={75}
            max={150}
            step={5}
            value={uiScale}
            onChange={(e) => setUiScale(Number(e.target.value))}
            className="w-full h-1 accent-amber-500 cursor-pointer"
            aria-label={t('pages.settingsPage.uiScale')}
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>75%</span>
            <span>100%</span>
            <span>150%</span>
          </div>
        </div>

        {/* Colorblind Mode */}
        <div>
          <span className="text-sm text-gray-300 block mb-2">{t('pages.settingsPage.colorblindMode')}</span>
          <div className="grid grid-cols-2 gap-2">
            {COLORBLIND_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => setColorblindMode(opt.mode)}
                className={`p-2 rounded-lg border text-start transition-colors cursor-pointer ${
                  colorblindMode === opt.mode
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface-2/30 hover:border-gray-600'
                }`}
              >
                <div className="text-xs font-medium text-gray-200">{t(opt.labelKey)}</div>
                <div className="text-xs text-gray-500">{t(opt.descriptionKey)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Font Style (Phase 18i) */}
        <div>
          <span className="text-sm text-gray-300 block mb-2">{t('pages.settingsPage.headingFont')}</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  value: 'system',
                  labelKey: 'pages.settingsPage.fontSystem',
                  descriptionKey: 'pages.settingsPage.fontSystemDesc'
                },
                {
                  value: 'fantasy',
                  labelKey: 'pages.settingsPage.fontFantasy',
                  descriptionKey: 'pages.settingsPage.fontFantasyDesc'
                }
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFontStyle(opt.value)}
                className={`p-2 rounded-lg border text-start transition-colors cursor-pointer ${
                  fontStyle === opt.value
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface-2/30 hover:border-gray-600'
                }`}
              >
                <div className={`text-xs font-medium text-gray-200${opt.value === 'fantasy' ? ' fantasy-font' : ''}`}>
                  <h3 className="text-xs font-medium">{t(opt.labelKey)}</h3>
                </div>
                <div className="text-xs text-gray-500">{t(opt.descriptionKey)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Toggle options */}
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm text-gray-300">{t('pages.settingsPage.reducedMotion')}</span>
              <p className="text-xs text-gray-500">{t('pages.settingsPage.reducedMotionDesc')}</p>
            </div>
            <input
              type="checkbox"
              name="reduced-motion"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm text-gray-300">{t('pages.settingsPage.screenReaderMode')}</span>
              <p className="text-xs text-gray-500">{t('pages.settingsPage.screenReaderModeDesc')}</p>
            </div>
            <input
              type="checkbox"
              name="screen-reader-mode"
              checked={screenReaderMode}
              onChange={(e) => setScreenReaderMode(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm text-gray-300">{t('pages.settingsPage.tooltips')}</span>
              <p className="text-xs text-gray-500">{t('pages.settingsPage.tooltipsDesc')}</p>
            </div>
            <input
              type="checkbox"
              name="tooltips-enabled"
              checked={tooltipsEnabled}
              onChange={(e) => setTooltipsEnabled(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </label>
        </div>
      </div>
    </Section>
  )
}
