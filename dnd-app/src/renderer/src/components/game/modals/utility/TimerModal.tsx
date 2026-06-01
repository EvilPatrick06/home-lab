import { useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { useNetworkStore } from '../../../../stores/network-store'
import { useGameStore } from '../../../../stores/use-game-store'

interface TimerModalProps {
  onClose: () => void
}

export default function TimerModal({ onClose }: TimerModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  const [seconds, setSeconds] = useState(60)
  const [targetName, setTargetName] = useState('')
  const startTimer = useGameStore((s) => s.startTimer)
  const sendMessage = useNetworkStore((s) => s.sendMessage)

  const PRESETS = [
    { label: t('game.timerModal.preset30s'), value: 30 },
    { label: t('game.timerModal.preset1m'), value: 60 },
    { label: t('game.timerModal.preset2m'), value: 120 },
    { label: t('game.timerModal.preset5m'), value: 300 }
  ]

  const handleStart = (): void => {
    const label = targetName || t('game.timerModal.title')
    startTimer(seconds, label)
    sendMessage('dm:timer-start', { seconds, targetName: label })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} role="presentation" />
      <div className="relative bg-surface/95 backdrop-blur-sm border border-border/50 rounded-xl p-4 max-w-xs w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">{t('game.timerModal.title')}</h3>
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
            <label className="text-xs text-muted block mb-1">{t('game.timerModal.target')}</label>
            <input
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder={t('game.timerModal.targetPlaceholder')}
              className="w-full px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-fg text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">{t('game.timerModal.duration')}</label>
            <div className="flex gap-1 mb-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setSeconds(p.value)}
                  className={`flex-1 py-1 text-xs rounded transition-colors cursor-pointer ${
                    seconds === p.value
                      ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                      : 'bg-surface-2 text-muted hover:bg-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={seconds}
              onChange={(e) => setSeconds(Math.max(1, parseInt(e.target.value, 10) || 0))}
              min={1}
              className="w-full px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-fg text-xs focus:outline-none focus:border-amber-500"
            />
            <span className="text-xs text-gray-500">{t('game.timerModal.seconds')}</span>
          </div>

          <button
            onClick={handleStart}
            className="w-full py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-accent-strong text-white
              transition-colors cursor-pointer"
          >
            {t('game.timerModal.start')}
          </button>
        </div>
      </div>
    </div>
  )
}
