import { useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { i18n, useT } from '../../../../i18n'
import { useGameStore } from '../../../../stores/use-game-store'
import type { CustomEffect, EffectType, MechanicalEffect } from '../../../../types/effects'
import type { MapToken } from '../../../../types/map'

interface CustomEffectModalProps {
  tokens: MapToken[]
  onClose: () => void
  onBroadcast?: (message: string) => void
}

const EFFECT_TYPE_OPTIONS: Array<{ value: EffectType; label: string }> = [
  { value: 'ac_bonus', label: i18n.t('game.customEffectModal.effectAcBonus') },
  { value: 'attack_bonus', label: i18n.t('game.customEffectModal.effectAttackBonus') },
  { value: 'damage_bonus', label: i18n.t('game.customEffectModal.effectDamageBonus') },
  { value: 'save_bonus', label: i18n.t('game.customEffectModal.effectSaveBonus') },
  { value: 'speed_bonus', label: i18n.t('game.customEffectModal.effectSpeedBonus') },
  { value: 'resistance', label: i18n.t('game.customEffectModal.effectResistance') },
  { value: 'immunity', label: i18n.t('game.customEffectModal.effectImmunity') },
  { value: 'vulnerability', label: i18n.t('game.customEffectModal.effectVulnerability') },
  { value: 'damage_reduction', label: i18n.t('game.customEffectModal.effectDamageReduction') },
  { value: 'advantage_on', label: i18n.t('game.customEffectModal.effectAdvantageOn') },
  { value: 'temp_hp', label: i18n.t('game.customEffectModal.effectTempHp') },
  { value: 'spell_dc_bonus', label: i18n.t('game.customEffectModal.effectSpellDcBonus') },
  { value: 'spell_attack_bonus', label: i18n.t('game.customEffectModal.effectSpellAttackBonus') }
]

const DURATION_OPTIONS = [
  { value: '', label: i18n.t('game.customEffectModal.durationPermanent') },
  { value: 'rounds', label: i18n.t('game.customEffectModal.durationRounds') },
  { value: 'minutes', label: i18n.t('game.customEffectModal.durationMinutes') },
  { value: 'hours', label: i18n.t('game.customEffectModal.durationHours') }
]

export default function CustomEffectModal({ tokens, onClose, onBroadcast }: CustomEffectModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  const [name, setName] = useState('')
  const [targetId, setTargetId] = useState('')
  const [effectType, setEffectType] = useState<EffectType>('ac_bonus')
  const [value, setValue] = useState('1')
  const [stringValue, setStringValue] = useState('')
  const [durationType, setDurationType] = useState('')
  const [durationValue, setDurationValue] = useState('1')
  const [effectsList, setEffectsList] = useState<MechanicalEffect[]>([])

  const round = useGameStore((s) => s.round)
  const inGameTime = useGameStore((s) => s.inGameTime)
  const addCustomEffect = useGameStore((s) => s.addCustomEffect)
  const customEffects = useGameStore((s) => s.customEffects)
  const removeCustomEffect = useGameStore((s) => s.removeCustomEffect)

  const needsStringValue = ['resistance', 'immunity', 'vulnerability', 'advantage_on'].includes(effectType)
  const needsNumericValue = !needsStringValue

  const handleAddEffect = (): void => {
    const effect: MechanicalEffect = {
      type: effectType,
      ...(needsNumericValue ? { value: parseInt(value, 10) || 0 } : {}),
      ...(needsStringValue && stringValue ? { stringValue } : {}),
      scope: 'all'
    }
    setEffectsList([...effectsList, effect])
  }

  const handleRemoveEffect = (index: number): void => {
    setEffectsList(effectsList.filter((_, i) => i !== index))
  }

  const handleApply = (): void => {
    if (!name.trim() || !targetId || effectsList.length === 0) return

    const target = tokens.find((t) => t.id === targetId)
    if (!target) return

    const duration = durationType
      ? {
          type: durationType as 'rounds' | 'minutes' | 'hours',
          value: parseInt(durationValue, 10) || 1,
          startRound: durationType === 'rounds' ? round : undefined,
          startSeconds: durationType === 'minutes' || durationType === 'hours' ? inGameTime?.totalSeconds : undefined
        }
      : undefined

    const customEffect: CustomEffect = {
      id: `effect-${Date.now()}`,
      name: name.trim(),
      targetEntityId: target.entityId,
      targetEntityName: target.label,
      effects: effectsList,
      appliedBy: 'DM',
      duration
    }

    addCustomEffect(customEffect)

    const durationStr = duration
      ? t('game.customEffectModal.durationFor', { value: duration.value, type: duration.type })
      : t('game.customEffectModal.durationPermanentTag')

    if (onBroadcast) {
      onBroadcast(
        t('game.customEffectModal.applyBroadcast', { name: name.trim(), target: target.label, duration: durationStr })
      )
    }

    onClose()
  }

  const effectLabel = (e: MechanicalEffect): string => {
    const typeLabel = EFFECT_TYPE_OPTIONS.find((o) => o.value === e.type)?.label ?? e.type
    if (e.value != null) return `${typeLabel}: ${e.value >= 0 ? '+' : ''}${e.value}`
    if (e.stringValue) return `${typeLabel}: ${e.stringValue}`
    return typeLabel
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-surface border border-border rounded-xl p-5 w-[460px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">{t('game.customEffectModal.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        <div className="space-y-3">
          {/* Effect Name */}
          <div>
            <label className="text-xs text-muted block mb-1">{t('game.customEffectModal.effectName')}</label>
            <input
              type="text"
              name="effect-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('game.customEffectModal.effectNamePlaceholder')}
              className="w-full bg-surface-2 border border-border rounded px-3 py-1.5 text-sm text-fg focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Target */}
          <div>
            <label className="text-xs text-muted block mb-1">{t('game.customEffectModal.target')}</label>
            <select
              name="target-id"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-3 py-1.5 text-sm text-fg focus:outline-none focus:border-amber-500"
            >
              <option value="">{t('game.customEffectModal.selectTarget')}</option>
              {tokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.entityType})
                </option>
              ))}
            </select>
          </div>

          {/* Effect Builder */}
          <div className="bg-surface-2/50 rounded-lg p-3">
            <div className="text-xs text-muted mb-2">{t('game.customEffectModal.addEffect')}</div>
            <div className="flex gap-2 flex-wrap">
              <select
                name="effect-type"
                value={effectType}
                onChange={(e) => setEffectType(e.target.value as EffectType)}
                className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-amber-500"
              >
                {EFFECT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {needsNumericValue && (
                <input
                  type="number"
                  name="effect-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-16 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg text-center focus:outline-none focus:border-amber-500"
                />
              )}
              {needsStringValue && (
                <input
                  type="text"
                  name="effect-string-value"
                  value={stringValue}
                  onChange={(e) => setStringValue(e.target.value)}
                  placeholder={t('game.customEffectModal.stringValuePlaceholder')}
                  className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-amber-500"
                />
              )}
              <button
                onClick={handleAddEffect}
                className="px-2 py-1 text-xs bg-amber-600 hover:bg-accent-strong rounded text-white cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Effects list */}
            {effectsList.length > 0 && (
              <div className="mt-2 space-y-1">
                {effectsList.map((e, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-700/50 rounded px-2 py-1">
                    <span className="text-xs text-gray-300">{effectLabel(e)}</span>
                    <button
                      onClick={() => handleRemoveEffect(i)}
                      className="text-gray-500 hover:text-red-400 text-xs cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs text-muted block mb-1">{t('game.customEffectModal.duration')}</label>
            <div className="flex gap-2">
              <select
                name="duration-type"
                value={durationType}
                onChange={(e) => setDurationType(e.target.value)}
                className="bg-surface-2 border border-border rounded px-3 py-1.5 text-sm text-fg focus:outline-none focus:border-amber-500"
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {durationType && (
                <input
                  type="number"
                  name="duration-value"
                  min={1}
                  value={durationValue}
                  onChange={(e) => setDurationValue(e.target.value)}
                  className="w-20 bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-fg text-center focus:outline-none focus:border-amber-500"
                />
              )}
            </div>
          </div>

          {/* Apply */}
          <button
            onClick={handleApply}
            disabled={!name.trim() || !targetId || effectsList.length === 0}
            className="w-full px-4 py-2.5 bg-amber-600 hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg cursor-pointer text-sm"
          >
            {t('game.customEffectModal.applyEffect')}
          </button>
        </div>

        {/* Active Custom Effects */}
        {customEffects.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-xs text-muted uppercase tracking-wide mb-2">
              {t('game.customEffectModal.activeCustomEffects')}
            </div>
            <div className="space-y-1">
              {customEffects.map((ce) => (
                <div key={ce.id} className="flex items-center justify-between bg-surface-2/50 rounded px-2 py-1.5">
                  <div>
                    <span className="text-xs text-purple-300 font-medium">{ce.name}</span>
                    <span className="text-xs text-gray-500 ms-2">
                      {t('game.customEffectModal.onTarget', { target: ce.targetEntityName })}
                    </span>
                    {ce.duration && (
                      <span className="text-xs text-gray-600 ms-1">
                        ({ce.duration.value} {ce.duration.type})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      removeCustomEffect(ce.id)
                      if (onBroadcast)
                        onBroadcast(
                          t('game.customEffectModal.removedBroadcast', { name: ce.name, target: ce.targetEntityName })
                        )
                    }}
                    className="text-gray-600 hover:text-red-400 text-xs cursor-pointer"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
