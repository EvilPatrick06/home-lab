import { useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'

import { CONDITION_IMMUNITIES, DAMAGE_TYPE_DESCRIPTIONS, DAMAGE_TYPES, getConditionDescriptions } from './defense-utils'

interface ResistancePanel5eProps {
  character: Character5e
  readonly?: boolean
}

export default function ResistancePanel5e({ character, readonly }: ResistancePanel5eProps): JSX.Element {
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const [showDefenseAdder, setShowDefenseAdder] = useState<null | 'resistance' | 'immunity' | 'vulnerability'>(null)
  const [customDefenseInput, setCustomDefenseInput] = useState('')
  const [expandedDefense, setExpandedDefense] = useState<string | null>(null)

  const CONDITION_DESCRIPTIONS = getConditionDescriptions()

  return (
    <>
      {/* Resistances, Immunities & Vulnerabilities */}
      {(character.resistances?.length > 0 ||
        character.immunities?.length > 0 ||
        character.vulnerabilities?.length > 0) && (
        <div className="mb-3 space-y-2">
          {(character.resistances ?? []).length > 0 && (
            <div>
              <div className="text-[10px] text-blue-400 uppercase tracking-wide mb-1">Resistances</div>
              <div className="flex flex-wrap gap-1.5">
                {(character.resistances ?? []).map((r) => {
                  const key = `res-${r}`
                  const desc = DAMAGE_TYPE_DESCRIPTIONS[r.toLowerCase()] || CONDITION_DESCRIPTIONS[r.toLowerCase()]
                  const isExpanded = expandedDefense === key
                  return (
                    <div key={key} className="inline-flex flex-col">
                      <button
                        onClick={() => desc && setExpandedDefense(isExpanded ? null : key)}
                        className={`inline-flex items-center bg-blue-900/40 text-blue-300 border border-blue-700/50 rounded-full px-2 py-0.5 text-xs ${desc ? 'cursor-pointer hover:bg-blue-900/60' : ''}`}
                      >
                        {r}
                        {desc && <span className="ml-1 text-blue-500 text-[10px]">{isExpanded ? '\u25B4' : '?'}</span>}
                        {!readonly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const latest = getLatest()
                              if (!latest) return
                              const updated = {
                                ...latest,
                                resistances: (latest.resistances ?? []).filter((x) => x !== r),
                                updatedAt: new Date().toISOString()
                              } as Character
                              saveAndBroadcast(updated)
                            }}
                            className="ml-1 text-blue-400 hover:text-red-400 cursor-pointer"
                          >
                            &#x2715;
                          </button>
                        )}
                      </button>
                      {isExpanded && desc && (
                        <div className="text-xs text-gray-400 bg-gray-800/50 rounded px-2 py-1 mt-1 max-w-xs">
                          {desc}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {(character.immunities ?? []).length > 0 && (
            <div>
              <div className="text-[10px] text-green-400 uppercase tracking-wide mb-1">Immunities</div>
              <div className="flex flex-wrap gap-1.5">
                {(character.immunities ?? []).map((im) => {
                  const key = `imm-${im}`
                  const desc = DAMAGE_TYPE_DESCRIPTIONS[im.toLowerCase()] || CONDITION_DESCRIPTIONS[im.toLowerCase()]
                  const isExpanded = expandedDefense === key
                  return (
                    <div key={key} className="inline-flex flex-col">
                      <button
                        onClick={() => desc && setExpandedDefense(isExpanded ? null : key)}
                        className={`inline-flex items-center bg-green-900/40 text-green-300 border border-green-700/50 rounded-full px-2 py-0.5 text-xs ${desc ? 'cursor-pointer hover:bg-green-900/60' : ''}`}
                      >
                        {im}
                        {desc && <span className="ml-1 text-green-500 text-[10px]">{isExpanded ? '\u25B4' : '?'}</span>}
                        {!readonly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const latest = getLatest()
                              if (!latest) return
                              const updated = {
                                ...latest,
                                immunities: (latest.immunities ?? []).filter((x) => x !== im),
                                updatedAt: new Date().toISOString()
                              } as Character
                              saveAndBroadcast(updated)
                            }}
                            className="ml-1 text-green-400 hover:text-red-400 cursor-pointer"
                          >
                            &#x2715;
                          </button>
                        )}
                      </button>
                      {isExpanded && desc && (
                        <div className="text-xs text-gray-400 bg-gray-800/50 rounded px-2 py-1 mt-1 max-w-xs">
                          {desc}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {(character.vulnerabilities ?? []).length > 0 && (
            <div>
              <div className="text-[10px] text-red-400 uppercase tracking-wide mb-1">Vulnerabilities</div>
              <div className="flex flex-wrap gap-1.5">
                {(character.vulnerabilities ?? []).map((v) => {
                  const key = `vuln-${v}`
                  const desc = DAMAGE_TYPE_DESCRIPTIONS[v.toLowerCase()] || CONDITION_DESCRIPTIONS[v.toLowerCase()]
                  const isExpanded = expandedDefense === key
                  return (
                    <div key={key} className="inline-flex flex-col">
                      <button
                        onClick={() => desc && setExpandedDefense(isExpanded ? null : key)}
                        className={`inline-flex items-center bg-red-900/40 text-red-300 border border-red-700/50 rounded-full px-2 py-0.5 text-xs ${desc ? 'cursor-pointer hover:bg-red-900/60' : ''}`}
                      >
                        {v}
                        {desc && <span className="ml-1 text-red-500 text-[10px]">{isExpanded ? '\u25B4' : '?'}</span>}
                        {!readonly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const latest = getLatest()
                              if (!latest) return
                              const updated = {
                                ...latest,
                                vulnerabilities: ((latest as Character5e).vulnerabilities ?? []).filter((x) => x !== v),
                                updatedAt: new Date().toISOString()
                              } as Character
                              saveAndBroadcast(updated)
                            }}
                            className="ml-1 text-red-400 hover:text-red-300 cursor-pointer"
                          >
                            &#x2715;
                          </button>
                        )}
                      </button>
                      {isExpanded && desc && (
                        <div className="text-xs text-gray-400 bg-gray-800/50 rounded px-2 py-1 mt-1 max-w-xs">
                          {desc}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Resistance/Immunity/Vulnerability buttons */}
      {!readonly && !showDefenseAdder && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setShowDefenseAdder('resistance')}
            className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
          >
            + Resistance
          </button>
          <button
            onClick={() => setShowDefenseAdder('immunity')}
            className="text-xs text-green-400 hover:text-green-300 cursor-pointer"
          >
            + Immunity
          </button>
          <button
            onClick={() => setShowDefenseAdder('vulnerability')}
            className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
          >
            + Vulnerability
          </button>
        </div>
      )}

      {/* Inline defense adder */}
      {!readonly && showDefenseAdder && (
        <div className="mb-3 bg-gray-800/50 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-medium uppercase tracking-wide ${
                showDefenseAdder === 'resistance'
                  ? 'text-blue-400'
                  : showDefenseAdder === 'immunity'
                    ? 'text-green-400'
                    : 'text-red-400'
              }`}
            >
              Add {showDefenseAdder}
            </span>
            <button
              onClick={() => {
                setShowDefenseAdder(null)
                setCustomDefenseInput('')
              }}
              className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>
          <div className="text-[10px] text-gray-500 mb-1">Damage Types</div>
          <div className="flex flex-wrap gap-1">
            {DAMAGE_TYPES.map((dt) => (
              <button
                key={dt}
                onClick={() => {
                  const latest = getLatest()
                  if (!latest) return
                  const field =
                    showDefenseAdder === 'resistance'
                      ? 'resistances'
                      : showDefenseAdder === 'immunity'
                        ? 'immunities'
                        : 'vulnerabilities'
                  const current =
                    showDefenseAdder === 'vulnerability'
                      ? ((latest as Character5e).vulnerabilities ?? [])
                      : (latest[field as 'resistances' | 'immunities'] ?? [])
                  if (current.includes(dt)) return
                  const updated = {
                    ...latest,
                    [field]: [...current, dt],
                    updatedAt: new Date().toISOString()
                  } as Character
                  saveAndBroadcast(updated)
                  setShowDefenseAdder(null)
                  setCustomDefenseInput('')
                }}
                className={`px-2 py-0.5 text-[11px] rounded border cursor-pointer transition-colors ${
                  showDefenseAdder === 'resistance'
                    ? 'border-blue-700/50 text-blue-300 hover:bg-blue-900/40'
                    : showDefenseAdder === 'immunity'
                      ? 'border-green-700/50 text-green-300 hover:bg-green-900/40'
                      : 'border-red-700/50 text-red-300 hover:bg-red-900/40'
                }`}
              >
                {dt}
              </button>
            ))}
          </div>
          {showDefenseAdder === 'immunity' && (
            <>
              <div className="text-[10px] text-gray-500 mt-2 mb-1">Condition Immunities</div>
              <div className="flex flex-wrap gap-1">
                {CONDITION_IMMUNITIES.map((cond) => (
                  <button
                    key={cond}
                    onClick={() => {
                      const latest = getLatest()
                      if (!latest) return
                      const current = latest.immunities ?? []
                      if (current.includes(cond)) return
                      const updated = {
                        ...latest,
                        immunities: [...current, cond],
                        updatedAt: new Date().toISOString()
                      } as Character
                      saveAndBroadcast(updated)
                      setShowDefenseAdder(null)
                      setCustomDefenseInput('')
                    }}
                    className="px-2 py-0.5 text-[11px] rounded border border-green-700/50 text-green-300 hover:bg-green-900/40 cursor-pointer transition-colors"
                  >
                    {cond}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              placeholder="Custom..."
              value={customDefenseInput}
              onChange={(e) => setCustomDefenseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customDefenseInput.trim()) {
                  const latest = getLatest()
                  if (!latest) return
                  const field =
                    showDefenseAdder === 'resistance'
                      ? 'resistances'
                      : showDefenseAdder === 'immunity'
                        ? 'immunities'
                        : 'vulnerabilities'
                  const current =
                    showDefenseAdder === 'vulnerability'
                      ? ((latest as Character5e).vulnerabilities ?? [])
                      : (latest[field as 'resistances' | 'immunities'] ?? [])
                  const updated = {
                    ...latest,
                    [field]: [...current, customDefenseInput.trim()],
                    updatedAt: new Date().toISOString()
                  } as Character
                  saveAndBroadcast(updated)
                  setShowDefenseAdder(null)
                  setCustomDefenseInput('')
                }
              }}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => {
                if (!customDefenseInput.trim()) return
                const latest = getLatest()
                if (!latest) return
                const field =
                  showDefenseAdder === 'resistance'
                    ? 'resistances'
                    : showDefenseAdder === 'immunity'
                      ? 'immunities'
                      : 'vulnerabilities'
                const current =
                  showDefenseAdder === 'vulnerability'
                    ? ((latest as Character5e).vulnerabilities ?? [])
                    : (latest[field as 'resistances' | 'immunities'] ?? [])
                const updated = {
                  ...latest,
                  [field]: [...current, customDefenseInput.trim()],
                  updatedAt: new Date().toISOString()
                } as Character
                saveAndBroadcast(updated)
                setShowDefenseAdder(null)
                setCustomDefenseInput('')
              }}
              disabled={!customDefenseInput.trim()}
              className="px-2 py-1 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </>
  )
}
