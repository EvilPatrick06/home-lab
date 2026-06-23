import { useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import { useT } from '../../../i18n'
import { getEffectiveClasses, getEffectiveKnownSpells } from '../../../services/character/effective-character-5e'
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
  const { t } = useT()
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const [showAddWeaponProf, setShowAddWeaponProf] = useState(false)
  const [customWeaponProf, setCustomWeaponProf] = useState('')
  const [expandedWeaponProf, setExpandedWeaponProf] = useState<string | null>(null)

  // Phase 15c.5 — derive class list (v3 shape) from v4 classRefs via the truth store.
  const effectiveClasses = getEffectiveClasses(character)

  // Spellcasting info -- dynamically computed
  const spellAttack = (() => {
    const scInfo = computeSpellcastingInfo(
      effectiveClasses.map((c) => ({
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
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {t('sheet.attackCalculator.spellcasting')}
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-muted">
              {t('sheet.attackCalculator.attack')}{' '}
              <span className="text-accent font-mono">{formatMod(spellAttack.bonus)}</span>
            </span>
            <span className="text-muted">
              {t('sheet.attackCalculator.saveDC')} <span className="text-accent font-mono">{spellAttack.dc}</span>
            </span>
          </div>
        </div>
      )}

      {/* Weapon Proficiencies */}
      {(character.proficiencies.weapons.length > 0 || !readonly) && (
        <div className="border-t border-gray-800 pt-2 mt-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {t('sheet.attackCalculator.weaponProficiencies')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {character.proficiencies.weapons.map((prof) => {
              const weaponProfDescriptions: Record<string, string> = {
                'simple weapons': t('sheet.attackCalculator.simpleWeaponsDesc'),
                'martial weapons': t('sheet.attackCalculator.martialWeaponsDesc')
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
                    className={`inline-flex items-center bg-surface-2/50 text-muted border border-border rounded-full px-2 py-0.5 text-xs ${desc ? 'cursor-pointer hover:bg-surface-2 hover:text-gray-300' : ''}`}
                    onClick={() => {
                      if (desc) setExpandedWeaponProf(isExpanded ? null : prof)
                    }}
                  >
                    {prof}
                    {desc && <span className="text-gray-600 text-xs ml-1">{isExpanded ? '\u25BE' : '?'}</span>}
                  </span>
                  {isExpanded && desc && (
                    <div className="text-xs text-gray-500 bg-surface-2/50 rounded px-2 py-1 mt-1 max-w-xs">{desc}</div>
                  )}
                </div>
              )
            })}
            {!readonly && !showAddWeaponProf && (
              <button
                onClick={() => setShowAddWeaponProf(true)}
                className="text-xs text-accent hover:text-amber-300 cursor-pointer"
              >
                {t('sheet.attackCalculator.add')}
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
                      if (latest?.gameSystem !== 'dnd5e') return
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
                aria-label={t('sheet.attackCalculator.customPlaceholder')}
                name="custom-weapon-prof"
                type="text"
                placeholder={t('sheet.attackCalculator.customPlaceholder')}
                value={customWeaponProf}
                onChange={(e) => setCustomWeaponProf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customWeaponProf.trim()) {
                    const latest = getLatest()
                    if (latest?.gameSystem !== 'dnd5e') return
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
                className="bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-fg w-28 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => {
                  setShowAddWeaponProf(false)
                  setCustomWeaponProf('')
                }}
                className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
              >
                {t('common.actions.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Damage Cantrips */}
      {(() => {
        const damageCantrips = getEffectiveKnownSpells(character).filter(
          (s) => s.level === 0 && /\d+d\d+/.test(s.description)
        )
        if (damageCantrips.length === 0) return null
        return (
          <div className="border-t border-gray-800 pt-2 mt-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('sheet.attackCalculator.damageCantrips')}
            </div>
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
                      <span className="text-xs text-yellow-500 border border-yellow-700 rounded px-1">C</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {spellAttack && (
                      <span className="text-accent font-mono">
                        {isSaveSpell
                          ? t('sheet.attackCalculator.dc', { dc: spellAttack.dc })
                          : formatMod(spellAttack.bonus)}
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
