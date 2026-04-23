import { useEffect, useState } from 'react'
import { play } from '../../../services/sound-manager'

interface TurnNotificationBannerProps {
  entityName: string
  onDismiss: () => void
}

export default function TurnNotificationBanner({ entityName, onDismiss }: TurnNotificationBannerProps): JSX.Element {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    play('turn-notify')
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300)
    }, 3000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      className={`fixed top-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-all duration-300 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
    >
      <div className="px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-500 border border-amber-400/50 rounded-xl shadow-lg shadow-amber-500/20">
        <p className="text-sm font-bold text-white text-center">Your Turn, {entityName}!</p>
      </div>
    </div>
  )
}
