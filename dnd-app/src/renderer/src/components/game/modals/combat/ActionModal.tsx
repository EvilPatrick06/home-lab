import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { ActionBar } from '../../player'

interface ActionModalProps {
  isMyTurn: boolean
  playerName: string
  onAction: (action: string) => void
  onClose: () => void
}

export default function ActionModal({
  isMyTurn,
  playerName: _playerName,
  onAction,
  onClose
}: ActionModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center pb-20">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} role="presentation" />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-2xl w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">{t('game.actionModal.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>
        <ActionBar
          isMyTurn={isMyTurn}
          onAction={(action) => {
            onAction(action)
          }}
        />
      </div>
    </div>
  )
}
