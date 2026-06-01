import { useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { useNetworkStore } from '../../../../stores/network-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'

interface WhisperModalProps {
  isDM?: boolean
  senderName?: string
  onClose: () => void
}

export default function WhisperModal({ isDM = true, senderName, onClose }: WhisperModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  const players = useLobbyStore((s) => s.players)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)
  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const sendMessage = useNetworkStore((s) => s.sendMessage)

  const [targetPeerId, setTargetPeerId] = useState('')
  const [message, setMessage] = useState('')

  // DM sees all non-host players; players see everyone else (including DM)
  const targets = players.filter((p) => p.peerId !== localPeerId)
  const targetPlayer = players.find((p) => p.peerId === targetPeerId)
  const displaySender = senderName || (isDM ? t('game.whisperModal.dm') : t('game.whisperModal.player'))

  const handleSend = (): void => {
    if (!targetPeerId || !message.trim()) return

    if (isDM) {
      sendMessage('dm:whisper-player', {
        targetPeerId,
        targetName: targetPlayer?.displayName || t('game.whisperModal.player'),
        message: message.trim()
      })
    } else {
      sendMessage('chat:whisper', {
        targetPeerId,
        targetName: targetPlayer?.displayName || t('game.whisperModal.player'),
        message: message.trim()
      })
    }

    addChatMessage({
      id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: localPeerId || 'local',
      senderName: displaySender,
      content: t('game.whisperModal.whisperContent', { target: targetPlayer?.displayName, message: message.trim() }),
      timestamp: Date.now(),
      isSystem: false
    })

    onClose()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} role="presentation" />
      <div className="relative bg-surface/95 backdrop-blur-sm border border-border/50 rounded-xl p-4 max-w-sm w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-purple-300">{t('game.whisperModal.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted block mb-1">{t('game.whisperModal.sendTo')}</label>
            <select
              value={targetPeerId}
              onChange={(e) => setTargetPeerId(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-gray-200 text-xs focus:outline-none focus:border-purple-500"
            >
              <option value="">{t('game.whisperModal.chooseRecipient')}</option>
              {targets.map((p) => (
                <option key={p.peerId} value={p.peerId}>
                  {p.displayName}
                  {p.isHost ? t('game.whisperModal.dmSuffix') : ''}
                  {p.characterName ? ` — ${p.characterName}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">{t('game.whisperModal.message')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-fg text-xs focus:outline-none focus:border-purple-500 resize-none"
              rows={3}
              placeholder={t('game.whisperModal.messagePlaceholder')}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted hover:text-gray-200 cursor-pointer">
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={handleSend}
              disabled={!targetPeerId || !message.trim()}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white
                transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('game.whisperModal.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
