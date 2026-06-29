import { useState } from 'react'
import { useT } from '../../../i18n'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'

interface BackgroundPanel5eProps {
  character: Character5e
  readonly?: boolean
  getLatest: () => Character5e | undefined
  saveAndBroadcast: (updated: Character5e) => void
}

export default function BackgroundPanel5e({
  character,
  readonly,
  getLatest,
  saveAndBroadcast
}: BackgroundPanel5eProps): JSX.Element {
  const { t } = useT()
  const SENSE_DESCRIPTIONS: Record<string, string> = {
    darkvision: t('sheet.backgroundPanel.darkvisionDesc'),
    blindsight: t('sheet.backgroundPanel.blindsightDesc'),
    tremorsense: t('sheet.backgroundPanel.tremorsenseDesc'),
    truesight: t('sheet.backgroundPanel.truesightDesc')
  }
  const [expandedSense, setExpandedSense] = useState<string | null>(null)
  const [showSensePicker, setShowSensePicker] = useState(false)
  const [customSenseInput, setCustomSenseInput] = useState('')

  if (!(character.senses?.length > 0 || !readonly)) {
    return <></>
  }

  return (
    <div className="mb-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.backgroundPanel.senses')}</div>
      {character.senses && character.senses.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {character.senses.map((sense) => {
            const senseKey = sense
              .toLowerCase()
              .replace(/\s*\d+\s*ft\.?/i, '')
              .trim()
            const desc = SENSE_DESCRIPTIONS[senseKey]
            const isSenseExpanded = expandedSense === sense
            return (
              <div key={sense} className="inline-flex flex-col">
                <span
                  className={`inline-flex items-center gap-1 bg-amber-900/30 text-amber-300 border border-amber-700/50 rounded-full px-2.5 py-0.5 text-xs ${desc ? 'cursor-pointer hover:bg-amber-900/50' : ''}`}
                  onClick={() => {
                    if (desc) setExpandedSense(isSenseExpanded ? null : sense)
                  }}
                >
                  {sense}
                  {desc && <span className="text-accent-strong/60 text-xs">{isSenseExpanded ? '\u25BE' : '?'}</span>}
                  {!readonly && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const latest = getLatest()
                        if (!latest) return
                        const updated = {
                          ...latest,
                          senses: (latest.senses ?? []).filter((s) => s !== sense),
                          updatedAt: new Date().toISOString()
                        } as Character
                        saveAndBroadcast(updated as Character5e)
                      }}
                      className="ms-1 text-accent hover:text-red-400 cursor-pointer"
                    >
                      &#x2715;
                    </button>
                  )}
                </span>
                {isSenseExpanded && desc && (
                  <div className="text-xs text-gray-500 bg-surface-2/50 rounded px-2 py-1 mt-1 max-w-xs">{desc}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!readonly && !showSensePicker && (
        <button
          onClick={() => setShowSensePicker(true)}
          className="text-xs text-accent hover:text-amber-300 cursor-pointer"
        >
          {t('sheet.backgroundPanel.addSense')}
        </button>
      )}
      {!readonly && showSensePicker && (
        <div className="bg-surface-2/50 rounded p-3 space-y-2 mt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-accent font-medium">{t('sheet.backgroundPanel.addSenseTitle')}</span>
            <button
              onClick={() => {
                setShowSensePicker(false)
                setCustomSenseInput('')
              }}
              className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
            >
              {t('common.actions.cancel')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              'Darkvision 60 ft.',
              'Darkvision 120 ft.',
              'Blindsight 10 ft.',
              'Blindsight 30 ft.',
              'Tremorsense 30 ft.',
              'Truesight 30 ft.'
            ].map((sense) => (
              <button
                key={sense}
                onClick={() => {
                  const latest = getLatest()
                  if (!latest) return
                  const updated = {
                    ...latest,
                    senses: [...(latest.senses ?? []), sense],
                    updatedAt: new Date().toISOString()
                  } as Character
                  saveAndBroadcast(updated as Character5e)
                  setShowSensePicker(false)
                }}
                className="px-2 py-0.5 text-[11px] rounded border border-amber-700/50 text-amber-300 hover:bg-amber-900/40 cursor-pointer transition-colors"
              >
                {sense}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              aria-label={t('sheet.backgroundPanel.customSensePlaceholder')}
              type="text"
              name="custom-sense"
              placeholder={t('sheet.backgroundPanel.customSensePlaceholder')}
              value={customSenseInput}
              onChange={(e) => setCustomSenseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customSenseInput.trim()) {
                  const latest = getLatest()
                  if (!latest) return
                  const updated = {
                    ...latest,
                    senses: [...(latest.senses ?? []), customSenseInput.trim()],
                    updatedAt: new Date().toISOString()
                  } as Character
                  saveAndBroadcast(updated as Character5e)
                  setCustomSenseInput('')
                  setShowSensePicker(false)
                }
              }}
              className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => {
                if (!customSenseInput.trim()) return
                const latest = getLatest()
                if (!latest) return
                const updated = {
                  ...latest,
                  senses: [...(latest.senses ?? []), customSenseInput.trim()],
                  updatedAt: new Date().toISOString()
                } as Character
                saveAndBroadcast(updated as Character5e)
                setCustomSenseInput('')
                setShowSensePicker(false)
              }}
              disabled={!customSenseInput.trim()}
              className="px-2 py-1 text-xs bg-amber-600 hover:bg-accent-strong disabled:opacity-50 rounded text-white cursor-pointer"
            >
              {t('sheet.backgroundPanel.add')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
