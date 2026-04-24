import { useState } from 'react'
import { BUFFS_5E, type ConditionDef, getConditionsForSystem } from '../../../data/conditions'
import { useCharacterStore } from '../../../stores/use-character-store'
import type { Character5e } from '../../../types/character-5e'
import type { ActiveCondition } from '../../../types/character-common'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'

interface ConditionsSection5eProps {
  character: Character5e
  readonly?: boolean
}

export default function ConditionsSection5e({ character, readonly }: ConditionsSection5eProps): JSX.Element {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerTab, setPickerTab] = useState<'conditions' | 'buffs' | 'custom'>('conditions')
  const [customName, setCustomName] = useState('')
  const [customType, setCustomType] = useState<'condition' | 'buff'>('condition')
  const [customValue, setCustomValue] = useState('')

  const addCondition = useCharacterStore((s) => s.addCondition)
  const removeCondition = useCharacterStore((s) => s.removeCondition)
  const updateConditionValue = useCharacterStore((s) => s.updateConditionValue)

  const activeConditions = character.conditions ?? []
  const allConditions = getConditionsForSystem()
  const allBuffs = BUFFS_5E

  const getConditionDef = (name: string): ConditionDef | undefined => {
    return [...allConditions, ...allBuffs].find((c) => c.name === name)
  }

  const handleAddCondition = (def: ConditionDef, type: 'condition' | 'buff'): void => {
    const condition: ActiveCondition = {
      name: def.name,
      type,
      isCustom: false,
      value: def.hasValue ? 1 : undefined
    }
    addCondition(character.id, condition)
  }

  const handleAddCustomCondition = (): void => {
    const name = customName.trim()
    if (!name) return
    const condition: ActiveCondition = {
      name,
      type: customType,
      isCustom: true,
      value: customValue ? parseInt(customValue, 10) || undefined : undefined
    }
    addCondition(character.id, condition)
    setCustomName('')
    setCustomValue('')
  }

  const handleRemoveCondition = (conditionName: string): void => {
    removeCondition(character.id, conditionName)
  }

  return (
    <SheetSectionWrapper title="Status Effects" defaultOpen={activeConditions.length > 0}>
      {activeConditions.length === 0 && !showPicker && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">No active conditions.</p>
          {!readonly && (
            <button
              onClick={() => setShowPicker(true)}
              className="text-sm text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5 cursor-pointer transition-colors"
            >
              + Add Condition, Buff, or Custom Effect
            </button>
          )}
        </div>
      )}

      {activeConditions.length > 0 && (
        <div className="space-y-2">
          {activeConditions.map((cond, i) => {
            const def = getConditionDef(cond.name)
            return (
              <div key={i} className="bg-gray-800/50 rounded p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cond.type === 'buff' ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-sm font-medium text-gray-200">{cond.name}</span>
                    {cond.value != null && (
                      <span className="flex items-center gap-1">
                        {!readonly && (
                          <button
                            onClick={() => updateConditionValue(character.id, cond.name, cond.value! - 1)}
                            className="w-4 h-4 flex items-center justify-center text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer transition-colors"
                            title="Decrease"
                          >
                            -
                          </button>
                        )}
                        <span className="text-xs bg-gray-700 px-1.5 rounded text-gray-300">{cond.value}</span>
                        {!readonly && (
                          <button
                            onClick={() => updateConditionValue(character.id, cond.name, cond.value! + 1)}
                            disabled={(() => {
                              const d = getConditionDef(cond.name)
                              return d?.maxValue != null && cond.value! >= d.maxValue
                            })()}
                            className="w-4 h-4 flex items-center justify-center text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 rounded cursor-pointer transition-colors"
                            title="Increase"
                          >
                            +
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  {!readonly && (
                    <button
                      onClick={() => handleRemoveCondition(cond.name)}
                      className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                      title={`Remove ${cond.name}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {def && <p className="text-xs text-gray-400 mt-1">{def.description}</p>}
                {cond.name === 'Exhaustion' && cond.value != null && cond.value > 0 && (
                  <div className="text-[10px] text-amber-400 mt-1 bg-amber-900/20 rounded px-2 py-1">
                    d20 Tests: {cond.value * -2} | Speed: -{cond.value * 5} ft
                    {cond.value >= 6 && <span className="text-red-400 font-bold ml-2">DEATH</span>}
                  </div>
                )}
              </div>
            )
          })}

          {!readonly && (
            <button
              onClick={() => setShowPicker(true)}
              className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              + Add Condition
            </button>
          )}
        </div>
      )}

      {showPicker && (
        <div className="mt-2 border border-gray-700 rounded-lg bg-gray-900 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-2">
              <button
                onClick={() => setPickerTab('conditions')}
                className={`text-xs px-2 py-1 rounded cursor-pointer ${
                  pickerTab === 'conditions' ? 'bg-red-900/50 text-red-300' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Conditions
              </button>
              <button
                onClick={() => setPickerTab('buffs')}
                className={`text-xs px-2 py-1 rounded cursor-pointer ${
                  pickerTab === 'buffs' ? 'bg-green-900/50 text-green-300' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Buffs
              </button>
              <button
                onClick={() => setPickerTab('custom')}
                className={`text-xs px-2 py-1 rounded cursor-pointer ${
                  pickerTab === 'custom' ? 'bg-amber-900/50 text-amber-300' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Custom
              </button>
            </div>
            <button
              onClick={() => setShowPicker(false)}
              className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer"
            >
              Close
            </button>
          </div>

          {pickerTab === 'custom' ? (
            <div className="space-y-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Condition name..."
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setCustomType('condition')}
                    className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                      customType === 'condition' ? 'bg-red-900/50 text-red-300' : 'text-gray-500'
                    }`}
                  >
                    Condition
                  </button>
                  <button
                    onClick={() => setCustomType('buff')}
                    className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                      customType === 'buff' ? 'bg-green-900/50 text-green-300' : 'text-gray-500'
                    }`}
                  >
                    Buff
                  </button>
                </div>
                <input
                  type="number"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  placeholder="Value"
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={handleAddCustomCondition}
                  disabled={!customName.trim()}
                  className="text-xs px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 disabled:cursor-not-allowed rounded cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {(pickerTab === 'conditions' ? allConditions : allBuffs).map((def) => {
                const isActive = activeConditions.some((c) => c.name === def.name)
                return (
                  <button
                    key={def.name}
                    disabled={isActive}
                    onClick={() => handleAddCondition(def, pickerTab === 'buffs' ? 'buff' : 'condition')}
                    className={`w-full text-left p-2 rounded text-sm transition-colors cursor-pointer ${
                      isActive ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'hover:bg-gray-800 text-gray-300'
                    }`}
                    title={def.description}
                  >
                    <div className="font-medium">{def.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{def.description}</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </SheetSectionWrapper>
  )
}
