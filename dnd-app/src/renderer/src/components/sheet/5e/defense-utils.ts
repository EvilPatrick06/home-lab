/**
 * Defense Section Utilities — D&D 5e 2024
 *
 * Armor data hooks, conversion helpers, and defense-related constants.
 * Extracted from DefenseSection5e for modularity.
 */

import { DAMAGE_TYPE_LABELS } from '../../../constants'
import { CONDITIONS_5E } from '../../../data/conditions'
import { useEquipmentData } from '../../../hooks/use-equipment-data'
import { load5eEquipment } from '../../../services/data-provider'
import type { ArmorEntry } from '../../../types/character-common'

// ─── Armor data types matching equipment.json ──────────────────

export interface ArmorData5e {
  name: string
  category: string
  baseAC: number
  dexBonus: boolean
  dexBonusMax: number | null
  weight?: number
  stealthDisadvantage: boolean
  cost: string
  strengthRequirement?: number
}

export function useArmorDatabase(): ArmorData5e[] {
  return useEquipmentData(() => load5eEquipment().then((d) => (d.armor as unknown as ArmorData5e[]) ?? []), [])
}

export function armorDataToEntry(a: ArmorData5e): ArmorEntry {
  const isShield = a.category.toLowerCase() === 'shield'
  return {
    id: crypto.randomUUID(),
    name: a.name,
    acBonus: a.baseAC,
    equipped: false,
    type: isShield ? 'shield' : 'armor',
    category: a.category.replace(' Armor', '').toLowerCase(),
    dexCap: a.dexBonus ? (a.dexBonusMax ?? null) : 0,
    stealthDisadvantage: a.stealthDisadvantage,
    strength: a.strengthRequirement,
    cost: a.cost
  }
}

export function getArmorDetail(a: ArmorData5e): string {
  const isShield = a.category.toLowerCase() === 'shield'
  const acStr = isShield
    ? `+${a.baseAC} AC`
    : a.dexBonus
      ? a.dexBonusMax !== null
        ? `AC ${a.baseAC} + DEX (max ${a.dexBonusMax})`
        : `AC ${a.baseAC} + DEX`
      : `AC ${a.baseAC}`
  const parts = [acStr, a.category]
  if (a.stealthDisadvantage) parts.push('Stealth disadv.')
  if (a.strengthRequirement) parts.push(`Str ${a.strengthRequirement}`)
  return parts.join(' | ')
}

// ─── Damage types and conditions for inline pickers ───────────

export const DAMAGE_TYPES = DAMAGE_TYPE_LABELS

export const CONDITION_IMMUNITIES = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious'
]

export const DAMAGE_TYPE_DESCRIPTIONS: Record<string, string> = {
  acid: 'Corrosive substances dissolve flesh and materials. Dealt by spells like Acid Splash and black dragon breath.',
  cold: 'Frigid chill of ice and arctic environments. Dealt by spells like Cone of Cold and white dragon breath.',
  fire: 'Flames and intense heat. Dealt by spells like Fireball and red dragon breath.',
  force:
    'Pure magical energy. Dealt by spells like Eldritch Blast and Magic Missile. Few creatures resist force damage.',
  lightning: 'Electrical energy. Dealt by spells like Lightning Bolt and blue dragon breath.',
  necrotic: 'Life-draining energy. Dealt by spells like Blight and certain undead attacks.',
  poison:
    'Venomous and toxic substances. Dealt by spells like Poison Spray and green dragon breath. Many creatures are resistant or immune.',
  psychic:
    'Mental assault that disrupts the mind. Dealt by spells like Psychic Lance, often bypassing physical defenses.',
  radiant: 'Searing light and divine energy. Dealt by spells like Guiding Bolt and Sacred Flame.',
  thunder: 'Concussive bursts of sound. Dealt by spells like Thunderwave and Shatter.',
  bludgeoning:
    'Blunt-force impacts from hammers, falling, and constriction. Resistance often specifies nonmagical attacks only.',
  piercing: 'Puncturing attacks from arrows, fangs, and spears. Resistance often specifies nonmagical attacks only.',
  slashing: 'Cutting attacks from swords, axes, and claws. Resistance often specifies nonmagical attacks only.'
}

export function getConditionDescriptions(): Record<string, string> {
  return Object.fromEntries(CONDITIONS_5E.map((c) => [c.name.toLowerCase(), c.description]))
}

// ─── Tool description hook ────────────────────────────────────

export interface ToolData {
  name: string
  description?: string
  ability?: string
}

export function useToolDescriptions(): ToolData[] {
  return useEquipmentData(
    () =>
      load5eEquipment().then(
        (data) =>
          ((data.gear ?? []) as unknown as Array<{ category?: string } & ToolData>).filter(
            (g) => g.category === 'Tool'
          ) as ToolData[]
      ),
    []
  )
}

// ─── Generic tool variant helpers ──────────────────────────────

export const GENERIC_TOOL_VARIANTS: Record<string, string[]> = {
  'gaming set': [
    'Gaming Set (Dice)',
    'Gaming Set (Dragonchess)',
    'Gaming Set (Playing Cards)',
    'Gaming Set (Three-Dragon Ante)'
  ],
  'musical instrument': ['Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn', 'Lute', 'Lyre', 'Pan Flute', 'Shawm', 'Viol']
}

export function isGenericTool(name: string): boolean {
  const lower = name.toLowerCase().replace(/\s*\(.*\)/, '')
  return Object.keys(GENERIC_TOOL_VARIANTS).some((k) => lower.includes(k))
}

export function getGenericToolBase(name: string): string | null {
  const lower = name.toLowerCase().replace(/\s*\(.*\)/, '')
  for (const key of Object.keys(GENERIC_TOOL_VARIANTS)) {
    if (lower.includes(key)) return key
  }
  return null
}
