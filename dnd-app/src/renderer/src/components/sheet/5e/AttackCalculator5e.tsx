import { useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import { computeSpellcastingInfo } from '../../../services/character/spell-data'
import type { Character5e } from '../../../types/character-5e'
import { formatMod } from '../../../types/character-common'

import type { WeaponData5e } from './WeaponList5e'

interface AttackCalculator5eProps {
  character: Character5e
  readonly?: boolean
  weaponDatabase: WeaponData5e[]
}

export default function AttackCalculator5e({
  character,
  readonly,
  weaponDatabase
}: AttackCalculator5eProps): JSX.Element {
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const [showAddWeaponProf, setShowAddWeaponProf] = useState(false)
  const [customWeaponProf, setCustomWeaponProf] = useState('')
  const [expandedWeaponProf, setExpandedWeaponProf] = useState<string | null>(null)

  // Spellcasting info -- dynamically computed
  const spellAttack = (() => {
    const scInfo = computeSpellcastingInfo(
      character.classes.map((c) => ({
        classId: c.name.toLowerCase(),
        subclassId: c.subclass?.toLowerCase(),
        level: c.level
      })),
      character.abilityScores,
      character.level,
      character.buildChoices.classId,
      character.buildChoices.subclassId
    )
    if (!scInfo) return null
    return {
      label: 'Spell Attack',
      bonus: scInfo.spellAttackBonus,
      dc: scInfo.spellSaveDC
    }
  })()

  return (
    <>
      {/* Spell attack for 5e */}
      {spellAttack && (
        <div className="border-t border-gray-800 pt-2 mt-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Spellcasting</div>
          <div className="flex gap-4 text-sm">
            <span className="text-gray-400">
              Attack: <span className="text-amber-400 font-mono">{formatMod(spellAttack.bonus)}</span>
            </span>
            <span className="text-gray-400">
              Save DC: <span className="text-amber-400 font-mono">{spellAttack.dc}</span>
            </span>
          </div>
        </div>
      )}

      {/* Weapon Proficiencies */}
      {(character.proficiencies.weapons.length > 0 || !readonly) && (
        <div className="border-t border-gray-800 pt-2 mt-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Weapon Proficiencies</div>
          <div className="flex flex-wrap gap-1.5">
            {character.proficiencies.weapons.map((prof) => {
              const weaponProfDescriptions: Record<string, string> = {
                'simple weapons':
                  'Includes clubs, daggers, greatclubs, handaxes, javelins, light hammers, maces, quarterstaffs, sickles, and spears.',
                'martial weapons':
                  'Includes battleaxes, flails, glaives, greataxes, greatswords, halberds, lances, longswords, mauls, morningstars, pikes, rapiers, scimitars, shortswords, tridents, war picks, and warhammers.'
              }
              const desc =
                weaponProfDescriptions[prof.toLowerCase()] ||
                (() => {
                  const w = weaponDatabase.find((wd) => wd.name.toLowerCase() === prof.toLowerCase())
                  return w
                    ? `${w.category} weapon. ${w.damage} ${w.damageType}. ${w.properties.length > 0 ? `Properties: ${w.properties.join(', ')}.` : ''}`
                    : undefined
                })()
              const isExpanded = expandedWeaponProf === prof
              return (
                <div key={prof} className="inline-flex flex-col">
                  <span
                    className={`inline-flex items-center bg-gray-800/50 text-gray-400 border border-gray-700 rounded-full px-2 py-0.5 text-xs ${desc ? 'cursor-pointer hover:bg-gray-800 hover:text-gray-300' : ''}`}
                    onClick={() => {
                      if (desc) setExpandedWeaponProf(isExpanded ? null : prof)
                    }}
                  >
                    {prof}
                    {desc && <span className="text-gray-600 text-[10px] ml-1">{isExpanded ? '\u25BE' : '?'}</span>}
                  </span>
                  {isExpanded && desc && (
                    <div className="text-[10px] text-gray-500 bg-gray-800/50 rounded px-2 py-1 mt-1 max-w-xs">
                      {desc}
                    </div>
                  )}
                </div>
              )
            })}
            {!readonly && !showAddWeaponProf && (
              <button
                onClick={() => setShowAddWeaponProf(true)}
                className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                + Add
              </button>
            )}
          </div>
          {!readonly && showAddWeaponProf && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {['Simple weapons', 'Martial weapons']
                .filter((p) => !character.proficiencies.weapons.some((w) => w.toLowerCase() === p.toLowerCase()))
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      const latest = getLatest()
                      if (!latest || latest.gameSystem !== 'dnd5e') return
                      const l = latest as Character5e
                      const updated = {
                        ...l,
                        proficiencies: { ...l.proficiencies, weapons: [...l.proficiencies.weapons, p] },
                        updatedAt: new Date().toISOString()
                      }
                      saveAndBroadcast(updated)
                      setShowAddWeaponProf(false)
                    }}
                    className="px-2 py-0.5 text-[11px] rounded border border-amber-700/50 text-amber-300 hover:bg-amber-900/40 cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              <input
                type="text"
                placeholder="Custom..."
                value={customWeaponProf}
                onChange={(e) => setCustomWeaponProf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customWeaponProf.trim()) {
                    const latest = getLatest()
                    if (!latest || latest.gameSystem !== 'dnd5e') return
                    const l = latest as Character5e
                    const updated = {
                      ...l,
                      proficiencies: {
                        ...l.proficiencies,
                        weapons: [...l.proficiencies.weapons, customWeaponProf.trim()]
                      },
                      updatedAt: new Date().toISOString()
                    }
                    saveAndBroadcast(updated)
                    setCustomWeaponProf('')
                    setShowAddWeaponProf(false)
                  }
                }}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-100 w-28 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => {
                  setShowAddWeaponProf(false)
                  setCustomWeaponProf('')
                }}
                className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Damage Cantrips */}
      {(() => {
        const damageCantrips = (character.knownSpells ?? []).filter(
          (s) => s.level === 0 && /\d+d\d+/.test(s.description)
        )
        if (damageCantrips.length === 0) return null
        return (
          <div className="border-t border-gray-800 pt-2 mt-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Damage Cantrips</div>
            {damageCantrips.map((spell) => {
              const damageMatch = spell.description.match(/(\d+d\d+)\s+(\w+)\s+damage/)
              const damageStr = damageMatch ? `${damageMatch[1]} ${damageMatch[2]}` : ''
              const isSaveSpell = /saving throw/i.test(spell.description)
              return (
                <div
                  key={spell.id}
                  className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-200 font-medium">{spell.name}</span>
                    {spell.concentration && (
                      <span className="text-[10px] text-yellow-500 border border-yellow-700 rounded px-1">C</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {spellAttack && (
                      <span className="text-amber-400 font-mono">
                        {isSaveSpell ? `DC ${spellAttack.dc}` : formatMod(spellAttack.bonus)}
                      </span>
                    )}
                    {damageStr && <span className="text-red-400 font-medium">{damageStr}</span>}
                    <span className="text-gray-500">{spell.range}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
    </>
  )
}
