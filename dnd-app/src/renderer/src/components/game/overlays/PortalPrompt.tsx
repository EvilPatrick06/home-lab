import { useCallback, useEffect } from 'react'
import { useT } from '../../../i18n'
import { useGameStore } from '../../../stores/use-game-store'

interface PortalPromptProps {
  portal: {
    tokenId: string
    mapId: string
    targetMapId: string
    targetGridX: number
    targetGridY: number
  }
  onConfirm: () => void
  onCancel: () => void
}

export default function PortalPrompt({ portal, onConfirm, onCancel }: PortalPromptProps): JSX.Element {
  const { t } = useT()
  const maps = useGameStore((s) => s.maps)
  const targetMap = maps.find((m) => m.id === portal.targetMapId)
  const mapName = targetMap?.name ?? t('game.portalPrompt.unknownMap')

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    },
    [onCancel]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 bg-gray-900/90 backdrop-blur-sm border border-purple-500/50 rounded-xl shadow-lg">
      <span className="text-xs text-purple-300 font-semibold">{t('game.portalPrompt.portal')}</span>
      <span className="text-xs text-gray-300">{t('game.portalPrompt.travelTo', { mapName })}</span>
      <button
        onClick={onConfirm}
        className="px-3 py-1 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-lg cursor-pointer transition-colors"
      >
        {t('game.portalPrompt.travel')}
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-1 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer transition-colors"
      >
        {t('game.portalPrompt.stay')}
      </button>
    </div>
  )
}
