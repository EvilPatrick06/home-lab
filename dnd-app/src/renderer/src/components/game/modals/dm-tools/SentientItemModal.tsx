import { useState } from 'react'
import { CONFLICT_DEMANDS, generateSentientItem, type SentientItemProperties } from '../../../../data/sentient-items'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'

interface SentientItemModalProps {
  onClose: () => void
}

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export default function SentientItemModal({ onClose }: SentientItemModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  const [item, setItem] = useState<SentientItemProperties | null>(null)

  const handleGenerate = (): void => {
    setItem(generateSentientItem())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} role="presentation" />
      <div className="relative bg-surface border border-border rounded-xl w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-accent">{t('game.sentientItemModal.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4">
          <button
            onClick={handleGenerate}
            className="w-full px-4 py-2.5 bg-amber-600 hover:bg-accent-strong text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            {item ? t('game.sentientItemModal.reroll') : t('game.sentientItemModal.generate')}
          </button>

          {item && (
            <div className="space-y-3">
              <div className="bg-surface-2/60 border border-border/50 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-muted uppercase mb-1">
                  {t('game.sentientItemModal.alignment')}
                </h3>
                <p className="text-sm text-gray-200">{item.alignment}</p>
              </div>

              <div className="bg-surface-2/60 border border-border/50 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-muted uppercase mb-1">
                  {t('game.sentientItemModal.communication')}
                </h3>
                <p className="text-sm text-gray-200 capitalize">{item.communication.method}</p>
                {item.communication.description && (
                  <p className="text-xs text-muted mt-1">{item.communication.description}</p>
                )}
              </div>

              <div className="bg-surface-2/60 border border-border/50 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-muted uppercase mb-1">
                  {t('game.sentientItemModal.senses')}
                </h3>
                <p className="text-sm text-gray-200">{item.senses}</p>
              </div>

              <div className="bg-surface-2/60 border border-border/50 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-muted uppercase mb-1">
                  {t('game.sentientItemModal.mentalScores')}
                </h3>
                <div className="flex gap-4 text-sm text-gray-200">
                  <span>
                    {t('game.sentientItemModal.int', {
                      score: item.mentalScores.intelligence,
                      mod: abilityMod(item.mentalScores.intelligence)
                    })}
                  </span>
                  <span>
                    {t('game.sentientItemModal.wis', {
                      score: item.mentalScores.wisdom,
                      mod: abilityMod(item.mentalScores.wisdom)
                    })}
                  </span>
                  <span>
                    {t('game.sentientItemModal.cha', {
                      score: item.mentalScores.charisma,
                      mod: abilityMod(item.mentalScores.charisma)
                    })}
                  </span>
                </div>
              </div>

              <div className="bg-surface-2/60 border border-border/50 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-muted uppercase mb-1">
                  {t('game.sentientItemModal.specialPurpose')}
                </h3>
                <p className="text-sm text-amber-300 font-medium">{item.specialPurpose.name}</p>
                {item.specialPurpose.description && (
                  <p className="text-xs text-muted mt-1">{item.specialPurpose.description}</p>
                )}
              </div>

              {CONFLICT_DEMANDS.length > 0 && (
                <div className="bg-surface-2/60 border border-border/50 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-muted uppercase mb-1">
                    {t('game.sentientItemModal.conflictDemands')}
                  </h3>
                  <div className="space-y-1">
                    {CONFLICT_DEMANDS.map((d) => (
                      <p key={d.name} className="text-xs text-gray-300">
                        <span className="text-fg font-medium">{d.name}:</span> {d.description}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
