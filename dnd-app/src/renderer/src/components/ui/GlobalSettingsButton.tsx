import { Settings } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { useT } from '../../i18n'

export default function GlobalSettingsButton(): JSX.Element | null {
  const { t } = useT()
  const location = useLocation()
  const navigate = useNavigate()

  // The game page has its own settings dropdown
  if (location.pathname.startsWith('/game/')) return null

  // When already on the settings page, the gear toggles back to the page the
  // user came from (mirrors the header's back button) instead of re-navigating
  // to /settings.
  const onSettings = location.pathname === '/settings'

  return (
    <button
      onClick={() => (onSettings ? navigate(-1) : navigate('/settings'))}
      className="fixed top-3 right-3 z-50 w-8 h-8 flex items-center justify-center rounded-full
                 bg-surface/80 border border-border text-muted hover:text-accent
                 hover:border-amber-600/50 transition-colors cursor-pointer"
      aria-label={onSettings ? t('ui.globalSettingsButton.closeSettings') : t('ui.globalSettingsButton.openSettings')}
      title={onSettings ? t('ui.globalSettingsButton.closeSettings') : t('ui.globalSettingsButton.settings')}
    >
      <Settings className="w-4 h-4" aria-hidden="true" />
    </button>
  )
}
