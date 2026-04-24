import { useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'
import type { CustomEffect, EffectType, MechanicalEffect } from '../../../../types/effects'
import type { MapToken } from '../../../../types/map'

interface CustomEffectModalProps {
  tokens: MapToken[]
  onClose: () => void
  onBroadcast?: (message: string) => void
}

const EFFECT_TYPE_OPTIONS: Array<{ value: EffectType; label: string }> = [
  { value: 'ac_bonus', label: 'AC Bonus' },
  { value: 'attack_bonus', label: 'Attack Bonus' },
  { value: 'damage_bonus', label: 'Damage Bonus' },
  { value: 'save_bonus', label: 'Save Bonus (all)' },
  { value: 'speed_bonus', label: 'Speed Bonus' },
  { value: 'resistance', label: 'Resistance' },
  { value: 'immunity', label: 'Immunity' },
  { value: 'vulnerability', label: 'Vulnerability' },
  { value: 'damage_reduction', label: 'Damage Reduction' },
  { value: 'advantage_on', label: 'Advantage on...' },
  { value: 'temp_hp', label: 'Temporary HP' },
  { value: 'spell_dc_bonus', label: 'Spell DC Bonus' },
  { value: 'spell_attack_bonus', label: 'Spell Attack Bonus' }
]

const DURATION_OPTIONS = [
  { value: '', label: 'Permanent' },
  { value: 'rounds', label: 'Rounds' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' }
]

export default function CustomEffectModal({ tokens, onClose, onBroadcast }: CustomEffectModalProps): JSX.Element {
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

    const durationStr = duration ? `for ${duration.value} ${duration.type}` : '(permanent)'

    if (onBroadcast) {
      onBroadcast(`DM applies "${name.trim()}" to ${target.label} ${durationStr}`)
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[460px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">Custom Effect</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="space-y-3">
          {/* Effect Name */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Effect Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Bless, Shield of Faith"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Target */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Target</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Select target...</option>
              {tokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.entityType})
                </option>
              ))}
            </select>
          </div>

          {/* Effect Builder */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-2">Add Effect</div>
            <div className="flex gap-2 flex-wrap">
              <select
                value={effectType}
                onChange={(e) => setEffectType(e.target.value as EffectType)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
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
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 text-center focus:outline-none focus:border-amber-500"
                />
              )}
              {needsStringValue && (
                <input
                  type="text"
                  value={stringValue}
                  onChange={(e) => setStringValue(e.target.value)}
                  placeholder="e.g., fire, poison"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
                />
              )}
              <button
                onClick={handleAddEffect}
                className="px-2 py-1 text-xs bg-amber-600 hover:bg-amber-500 rounded text-white cursor-pointer"
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
            <label className="text-xs text-gray-400 block mb-1">Duration</label>
            <div className="flex gap-2">
              <select
                value={durationType}
                onChange={(e) => setDurationType(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
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
                  min={1}
                  value={durationValue}
                  onChange={(e) => setDurationValue(e.target.value)}
                  className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 text-center focus:outline-none focus:border-amber-500"
                />
              )}
            </div>
          </div>

          {/* Apply */}
          <button
            onClick={handleApply}
            disabled={!name.trim() || !targetId || effectsList.length === 0}
            className="w-full px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg cursor-pointer text-sm"
          >
            Apply Effect
          </button>
        </div>

        {/* Active Custom Effects */}
        {customEffects.length > 0 && (
          <div className="mt-4 border-t border-gray-700 pt-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Active Custom Effects</div>
            <div className="space-y-1">
              {customEffects.map((ce) => (
                <div key={ce.id} className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1.5">
                  <div>
                    <span className="text-xs text-purple-300 font-medium">{ce.name}</span>
                    <span className="text-[10px] text-gray-500 ml-2">on {ce.targetEntityName}</span>
                    {ce.duration && (
                      <span className="text-[10px] text-gray-600 ml-1">
                        ({ce.duration.value} {ce.duration.type})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      removeCustomEffect(ce.id)
                      if (onBroadcast) onBroadcast(`"${ce.name}" removed from ${ce.targetEntityName}`)
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
