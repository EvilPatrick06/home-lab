import { Settings } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

export default function GlobalSettingsButton(): JSX.Element | null {
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
                 bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-amber-400
                 hover:border-amber-600/50 transition-colors cursor-pointer"
      aria-label={onSettings ? 'Close settings' : 'Open settings'}
      title={onSettings ? 'Close settings' : 'Settings'}
    >
      <Settings className="w-4 h-4" aria-hidden="true" />
    </button>
  )
}
