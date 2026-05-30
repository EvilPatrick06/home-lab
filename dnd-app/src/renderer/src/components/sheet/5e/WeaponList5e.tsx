import { useMemo, useState } from 'react'
import { getMasteryDescription } from '../../../data/weapon-mastery'
import { useEquipmentData } from '../../../hooks/use-equipment-data'
import { i18n, useT } from '../../../i18n'
import type { WeaponContext } from '../../../services/combat/effect-resolver-5e'
import { resolveEffects } from '../../../services/combat/effect-resolver-5e'
import { load5eEquipment } from '../../../services/data-provider'
import type { Character5e } from '../../../types/character-5e'
import type { WeaponEntry } from '../../../types/character-common'
import { abilityModifier, formatMod } from '../../../types/character-common'

// --- Weapon property abbreviations & tooltips (PHB 2024) ---

const PROPERTY_ABBREVIATIONS: Record<string, string> = {
  'Two-Handed': '2H',
  Versatile: 'Vers',
  Ammunition: 'Ammo'
}

// Phase 34 — property tooltips resolved at render via the active i18n
// instance (keyed by the raw PHB property name).
const PROPERTY_TOOLTIP_KEYS: Record<string, string> = {
  Ammunition: 'sheet.weaponList.propertyTooltips.ammunition',
  Finesse: 'sheet.weaponList.propertyTooltips.finesse',
  Heavy: 'sheet.weaponList.propertyTooltips.heavy',
  Light: 'sheet.weaponList.propertyTooltips.light',
  Loading: 'sheet.weaponList.propertyTooltips.loading',
  Range: 'sheet.weaponList.propertyTooltips.range',
  Reach: 'sheet.weaponList.propertyTooltips.reach',
  Thrown: 'sheet.weaponList.propertyTooltips.thrown',
  'Two-Handed': 'sheet.weaponList.propertyTooltips.twoHanded',
  Versatile: 'sheet.weaponList.propertyTooltips.versatile',
  Nick: 'sheet.weaponList.propertyTooltips.nick',
  Push: 'sheet.weaponList.propertyTooltips.push',
  Sap: 'sheet.weaponList.propertyTooltips.sap',
  Slow: 'sheet.weaponList.propertyTooltips.slow',
  Topple: 'sheet.weaponList.propertyTooltips.topple',
  Vex: 'sheet.weaponList.propertyTooltips.vex',
  Graze: 'sheet.weaponList.propertyTooltips.graze',
  Cleave: 'sheet.weaponList.propertyTooltips.cleave',
  Special: 'sheet.weaponList.propertyTooltips.special'
}

function propertyTooltip(prop: string): string {
  const key = PROPERTY_TOOLTIP_KEYS[prop]
  return key ? i18n.t(key) : prop
}

// --- Weapon data types ---

export interface WeaponData5e {
  name: string
  category: string
  damage: string
  damageType: string
  weight?: number
  properties: string[]
  cost: string
  mastery?: string
}

export function useWeaponDatabase(): WeaponData5e[] {
  return useEquipmentData(() => load5eEquipment().then((d) => (d.weapons as WeaponData5e[]) ?? []), [])
}

export function weaponDataToEntry(item: WeaponData5e, character: Character5e): WeaponEntry {
  const profBonus = Math.ceil(character.level / 4) + 1
  const isFinesse = item.properties.some((p) => p.toLowerCase() === 'finesse')
  const isRanged = item.category.toLowerCase().includes('ranged')
  const usesDex = isFinesse || isRanged
  const abilityScore = usesDex ? character.abilityScores.dexterity : character.abilityScores.strength
  const mod = abilityModifier(abilityScore)
  return {
    id: crypto.randomUUID(),
    // boundary-allow: Phase 15c sweep target — sheet component still consumes inline weapon shape
    name: item.name,
    damage: item.damage,
    damageType: item.damageType,
    attackBonus: mod + profBonus,
    properties: item.properties,
    proficient: true,
    range: isRanged
      ? item.properties.find((p) => p.toLowerCase().startsWith('range'))?.replace(/range\s*/i, '')
      : undefined,
    mastery: item.mastery,
    cost: item.cost
  }
}

interface WeaponRowProps {
  weapon: WeaponEntry
  onRemove?: () => void
  onSell?: () => void
  character: Character5e
  weaponDatabase?: WeaponData5e[]
}

export function WeaponRow({ weapon, onRemove, onSell, character, weaponDatabase }: WeaponRowProps): JSX.Element {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  // Dynamically compute attack bonus and damage modifier from character stats
  const profBonus = Math.ceil(character.level / 4) + 1
  const isFinesse = weapon.properties.some((p) => p.toLowerCase() === 'finesse')
  const isRanged = weapon.properties.some((p) => p.toLowerCase().startsWith('range')) || weapon.range != null
  const isHeavy = weapon.properties.some((p) => p.toLowerCase() === 'heavy')
  const isThrown = weapon.properties.some((p) => p.toLowerCase() === 'thrown')
  const isCrossbow = weapon.name.toLowerCase().includes('crossbow')
  const strMod = abilityModifier(character.abilityScores.strength)
  const dexMod = abilityModifier(character.abilityScores.dexterity)

  let abilityMod: number
  if (isFinesse) {
    abilityMod = Math.max(strMod, dexMod)
  } else if (isRanged) {
    abilityMod = dexMod
  } else {
    abilityMod = strMod
  }

  const proficient = weapon.proficient !== false
  const baseAttackBonus = abilityMod + (proficient ? profBonus : 0)

  // Resolve effects for tooltip breakdown
  const resolved = useMemo(() => resolveEffects(character), [character])
  const weaponCtx: WeaponContext = {
    isMelee: !isRanged,
    isRanged,
    isHeavy,
    isThrown,
    isCrossbow,
    isSpell: false,
    damageType: weapon.damageType
  }
  const effectAttackBonus = resolved.attackBonus(weaponCtx)
  const effectDamageBonus = resolved.damageBonus(weaponCtx)
  const dynamicAttackBonus = baseAttackBonus + effectAttackBonus
  const totalDamageMod = abilityMod + effectDamageBonus

  // Build damage string with ability modifier + effect bonus
  const damageDisplay =
    totalDamageMod !== 0 ? `${weapon.damage}${totalDamageMod >= 0 ? '+' : ''}${totalDamageMod}` : weapon.damage

  // Attack tooltip breakdown
  const attackTooltipParts = [
    `${isFinesse ? 'DEX/STR' : isRanged ? 'DEX' : 'STR'} ${formatMod(abilityMod)}`,
    proficient ? `Prof ${formatMod(profBonus)}` : ''
  ]
  if (effectAttackBonus !== 0) {
    const atkSources = resolved.sources
      .filter((s) => s.effects.some((e) => e.type === 'attack_bonus'))
      .map((s) => {
        const bonus = s.effects.filter((e) => e.type === 'attack_bonus').reduce((sum, e) => sum + (e.value ?? 0), 0)
        return `${s.sourceName} ${formatMod(bonus)}`
      })
    attackTooltipParts.push(...atkSources)
  }
  const attackTooltip = `${attackTooltipParts.filter(Boolean).join('\n')}\n= ${formatMod(dynamicAttackBonus)}`

  // Damage tooltip breakdown
  const damageTooltipParts = [
    `${weapon.damage} + ${isFinesse ? 'DEX/STR' : isRanged ? 'DEX' : 'STR'} ${formatMod(abilityMod)}`
  ]
  if (effectDamageBonus !== 0) {
    const dmgSources = resolved.sources
      .filter((s) => s.effects.some((e) => e.type === 'damage_bonus'))
      .map((s) => {
        const bonus = s.effects.filter((e) => e.type === 'damage_bonus').reduce((sum, e) => sum + (e.value ?? 0), 0)
        return `${s.sourceName} ${formatMod(bonus)}`
      })
    damageTooltipParts.push(...dmgSources)
  }
  const extraDice = resolved.getExtraDamageDice(weaponCtx)
  if (extraDice.length > 0) {
    for (const ed of extraDice) damageTooltipParts.push(`+${ed.dice} ${ed.damageType}`)
  }

  // Look up weapon data for description
  const dbWeapon = weaponDatabase?.find((w) => w.name.toLowerCase() === weapon.name.toLowerCase())

  return (
    <div>
      <div className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0 text-sm">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/30 rounded px-1 -mx-1 transition-colors"
        >
          <span className="text-gray-200 font-medium">{weapon.name}</span>
          <span className="text-gray-600 text-xs">{expanded ? '\u25BE' : '\u25B8'}</span>
          {weapon.mastery && (
            <span
              className="text-xs px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700"
              title={getMasteryDescription(weapon.mastery)}
            >
              {weapon.mastery}
            </span>
          )}
          {weapon.properties.map((prop) => (
            <span
              key={prop}
              className="text-xs px-1 py-0.5 rounded bg-gray-700/50 text-gray-400 border border-gray-600"
              title={propertyTooltip(prop)}
            >
              {PROPERTY_ABBREVIATIONS[prop] ?? prop}
            </span>
          ))}
        </button>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-amber-400 font-mono" title={attackTooltip}>
            {formatMod(dynamicAttackBonus)}
          </span>
          <span className="text-red-400 font-medium" title={damageTooltipParts.join('\n')}>
            {damageDisplay} {weapon.damageType}
          </span>
          {weapon.range && <span className="text-gray-500">{weapon.range}</span>}
          {onSell && (
            <button
              onClick={onSell}
              className="text-gray-600 hover:text-green-400 cursor-pointer ml-1"
              title={t('sheet.weaponList.sellHalfPrice')}
            >
              &#x24;
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-gray-600 hover:text-red-400 cursor-pointer ml-1"
              title={t('sheet.weaponList.removeWeapon')}
            >
              &#x2715;
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="text-xs text-gray-500 py-1 pl-2 space-y-0.5">
          {weapon.properties.length > 0 && (
            <div>
              <span className="text-gray-600">{t('sheet.weaponList.properties')}</span> {weapon.properties.join(', ')}
            </div>
          )}
          {(weapon.cost || dbWeapon?.cost) && (
            <div>
              <span className="text-gray-600">{t('sheet.weaponList.cost')}</span> {weapon.cost || dbWeapon?.cost}
            </div>
          )}
          {dbWeapon?.weight != null && (
            <div>
              <span className="text-gray-600">{t('sheet.weaponList.weight')}</span>{' '}
              {t('sheet.weaponList.weightValue', { weight: dbWeapon.weight })}
            </div>
          )}
          {weapon.description || dbWeapon ? (
            <div>
              {weapon.description ||
                t('sheet.weaponList.descriptionFallback', {
                  category: dbWeapon?.category ?? '',
                  damage: dbWeapon?.damage,
                  damageType: dbWeapon?.damageType
                })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
