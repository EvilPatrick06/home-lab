import { useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import { useEquipmentData } from '../../../hooks/use-equipment-data'
import { load5eCrafting, load5eEquipment } from '../../../services/data-provider'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { ArmorEntry, WeaponEntry } from '../../../types/character-common'
import { abilityModifier } from '../../../types/character-common'
import { deductWithConversion, totalInCopper } from '../../../utils/currency'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'
import CraftingProgress5e from './CraftingProgress5e'
import CraftingRecipeList5e from './CraftingRecipeList5e'

// --- Types ---

interface CraftableItem {
  name: string
  rawMaterialCost: string
  craftingTimeDays: number
  category: 'weapon' | 'armor' | 'gear'
}

interface CraftingToolEntry {
  tool: string
  items: CraftableItem[]
}

// --- Weapon/Armor data from equipment.json for creating proper entries ---

interface WeaponData5e {
  name: string
  category: string
  damage: string
  damageType: string
  weight?: number
  properties: string[]
  cost: string
  mastery?: string
}

interface ArmorData5e {
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

interface EquipmentDatabase {
  weapons: WeaponData5e[]
  armor: ArmorData5e[]
}

// --- Multi-denomination cost parser ---

function parseCostToCopper(costStr: string): number {
  let total = 0
  const parts = costStr.match(/(\d+)\s*(PP|GP|EP|SP|CP)/gi)
  if (!parts) return 0
  const rates: Record<string, number> = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }
  for (const part of parts) {
    const m = part.match(/(\d+)\s*(PP|GP|EP|SP|CP)/i)
    if (m) {
      total += parseInt(m[1], 10) * (rates[m[2].toLowerCase()] ?? 0)
    }
  }
  return total
}

// --- Hooks ---

function useCraftingData(): CraftingToolEntry[] {
  return useEquipmentData(() => load5eCrafting().then((d) => d as unknown as CraftingToolEntry[]), [])
}

function useEquipmentDatabase(): EquipmentDatabase {
  return useEquipmentData(
    () =>
      load5eEquipment().then((d) => ({
        weapons: (d.weapons as unknown as WeaponData5e[]) ?? [],
        armor: (d.armor as unknown as ArmorData5e[]) ?? []
      })),
    { weapons: [], armor: [] }
  )
}

// --- Helpers ---

function weaponDataToEntry(item: WeaponData5e, character: Character5e): WeaponEntry {
  const profBonus = Math.ceil(character.level / 4) + 1
  const isFinesse = item.properties.some((p) => p.toLowerCase() === 'finesse')
  const isRanged = item.category.toLowerCase().includes('ranged')
  const usesDex = isFinesse || isRanged
  const abilityScore = usesDex ? character.abilityScores.dexterity : character.abilityScores.strength
  const mod = abilityModifier(abilityScore)
  return {
    id: crypto.randomUUID(),
    name: item.name,
    damage: item.damage,
    damageType: item.damageType,
    attackBonus: mod + profBonus,
    properties: item.properties,
    proficient: true,
    range: isRanged
      ? item.properties.find((p) => p.toLowerCase().startsWith('range'))?.replace(/range\s*/i, '')
      : undefined,
    mastery: item.mastery
  }
}

function armorDataToEntry(a: ArmorData5e): ArmorEntry {
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
    strength: a.strengthRequirement
  }
}

// --- Spell scroll cost/time table per PHB 2024 ---

const SCROLL_COSTS: Record<number, { cost: number; days: number }> = {
  0: { cost: 15, days: 1 },
  1: { cost: 25, days: 1 },
  2: { cost: 100, days: 3 },
  3: { cost: 150, days: 5 },
  4: { cost: 1000, days: 10 },
  5: { cost: 1500, days: 25 },
  6: { cost: 10000, days: 40 },
  7: { cost: 12500, days: 50 },
  8: { cost: 15000, days: 60 },
  9: { cost: 50000, days: 120 }
}

// --- Main Component ---

interface CraftingSection5eProps {
  character: Character5e
  readonly?: boolean
}

export default function CraftingSection5e({ character, readonly }: CraftingSection5eProps): JSX.Element {
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const craftingData = useCraftingData()
  const equipmentDb = useEquipmentDatabase()

  const [craftWarning, setCraftWarning] = useState<string | null>(null)
  const [craftSuccess, setCraftSuccess] = useState<string | null>(null)

  const toolProficiencies = character.proficiencies.tools ?? []
  const skills = character.skills ?? []
  const hasArcanaProficiency = skills.some((s) => s.name === 'Arcana' && s.proficient)
  const hasCalligrapherProficiency = toolProficiencies.some((t) => t.toLowerCase().includes('calligrapher'))
  const canCraftScrolls = hasArcanaProficiency || hasCalligrapherProficiency

  const normalizeToolName = (name: string): string =>
    name
      .replace(/\s*\(one of your choice\)|\s*\(any\)|\s*\(your choice\)/gi, '')
      .trim()
      .toLowerCase()

  const matchingTools = craftingData.filter((entry) =>
    toolProficiencies.some(
      (prof) =>
        normalizeToolName(prof) === entry.tool.toLowerCase() ||
        entry.tool.toLowerCase().startsWith(normalizeToolName(prof))
    )
  )

  const preparedSpells = character.knownSpells ?? []

  const handleCraftScroll = (spell: { id: string; name: string; level: number }): void => {
    const latest = getLatest() || character

    const scrollInfo = SCROLL_COSTS[spell.level]
    if (!scrollInfo) return

    const costInCopper = scrollInfo.cost * 100
    const currentCurrency = {
      pp: latest.treasure.pp,
      gp: latest.treasure.gp,
      sp: latest.treasure.sp,
      cp: latest.treasure.cp
    }
    const totalAvailable = totalInCopper(currentCurrency)

    if (totalAvailable < costInCopper) {
      setCraftWarning(`Not enough funds for Spell Scroll of ${spell.name} (${scrollInfo.cost} GP)`)
      setTimeout(() => setCraftWarning(null), 4000)
      return
    }

    const newCurrency = deductWithConversion(currentCurrency, { amount: scrollInfo.cost, currency: 'gp' })
    if (!newCurrency) {
      setCraftWarning(`Not enough funds for Spell Scroll of ${spell.name}`)
      setTimeout(() => setCraftWarning(null), 4000)
      return
    }

    const scrollName =
      spell.level === 0
        ? `Spell Scroll of ${spell.name} (Cantrip)`
        : `Spell Scroll of ${spell.name} (Level ${spell.level})`

    const updated = {
      ...latest,
      equipment: [...latest.equipment, { name: scrollName, quantity: 1 }],
      treasure: { ...latest.treasure, ...newCurrency },
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)

    setCraftWarning(null)
    setCraftSuccess(`Crafted ${scrollName} successfully`)
    setTimeout(() => setCraftSuccess(null), 3000)
  }

  const handleCraft = (item: CraftableItem): void => {
    const latest = getLatest() || character

    const costInCopper = parseCostToCopper(item.rawMaterialCost)
    const currentCurrency = {
      pp: latest.treasure.pp,
      gp: latest.treasure.gp,
      sp: latest.treasure.sp,
      cp: latest.treasure.cp
    }
    const totalAvailable = totalInCopper(currentCurrency)

    if (totalAvailable < costInCopper) {
      setCraftWarning(`Not enough funds for ${item.name} raw materials`)
      setTimeout(() => setCraftWarning(null), 4000)
      return
    }

    let deductDenom: 'gp' | 'sp' | 'cp' = 'cp'
    let deductAmount = costInCopper
    if (costInCopper >= 100 && costInCopper % 100 === 0) {
      deductDenom = 'gp'
      deductAmount = costInCopper / 100
    } else if (costInCopper >= 10 && costInCopper % 10 === 0) {
      deductDenom = 'sp'
      deductAmount = costInCopper / 10
    }

    const newCurrency = deductWithConversion(currentCurrency, {
      amount: deductAmount,
      currency: deductDenom
    })
    if (!newCurrency) {
      setCraftWarning(`Not enough funds for ${item.name} raw materials`)
      setTimeout(() => setCraftWarning(null), 4000)
      return
    }

    const updatedTreasure = { ...latest.treasure, ...newCurrency }

    if (item.category === 'weapon') {
      const weaponData = equipmentDb.weapons.find((w) => w.name.toLowerCase() === item.name.toLowerCase())
      if (weaponData) {
        const newWeapon = weaponDataToEntry(weaponData, latest as Character5e)
        const currentWeapons: WeaponEntry[] = latest.weapons ?? []
        const updated = {
          ...latest,
          weapons: [...currentWeapons, newWeapon],
          treasure: updatedTreasure,
          updatedAt: new Date().toISOString()
        } as Character
        saveAndBroadcast(updated)
      } else {
        const newWeapon: WeaponEntry = {
          id: crypto.randomUUID(),
          name: item.name,
          damage: '0',
          damageType: 'none',
          attackBonus: 0,
          properties: [],
          proficient: true
        }
        const currentWeapons: WeaponEntry[] = latest.weapons ?? []
        const updated = {
          ...latest,
          weapons: [...currentWeapons, newWeapon],
          treasure: updatedTreasure,
          updatedAt: new Date().toISOString()
        } as Character
        saveAndBroadcast(updated)
      }
    } else if (item.category === 'armor') {
      const armorData = equipmentDb.armor.find((a) => a.name.toLowerCase() === item.name.toLowerCase())
      if (armorData) {
        const newArmor = armorDataToEntry(armorData)
        const currentArmor: ArmorEntry[] = latest.armor ?? []
        const updated = {
          ...latest,
          armor: [...currentArmor, newArmor],
          treasure: updatedTreasure,
          updatedAt: new Date().toISOString()
        } as Character
        saveAndBroadcast(updated)
      } else {
        const newArmor: ArmorEntry = {
          id: crypto.randomUUID(),
          name: item.name,
          acBonus: 0,
          equipped: false,
          type: 'armor'
        }
        const currentArmor: ArmorEntry[] = latest.armor ?? []
        const updated = {
          ...latest,
          armor: [...currentArmor, newArmor],
          treasure: updatedTreasure,
          updatedAt: new Date().toISOString()
        } as Character
        saveAndBroadcast(updated)
      }
    } else {
      const newItem = { name: item.name, quantity: 1 }
      const updated = {
        ...latest,
        equipment: [...latest.equipment, newItem],
        treasure: updatedTreasure,
        updatedAt: new Date().toISOString()
      } as Character
      saveAndBroadcast(updated)
    }

    setCraftWarning(null)
    setCraftSuccess(`Crafted ${item.name} successfully`)
    setTimeout(() => setCraftSuccess(null), 3000)
  }

  if (matchingTools.length === 0 && !canCraftScrolls) {
    return (
      <SheetSectionWrapper title="Crafting" defaultOpen={false}>
        <p className="text-sm text-gray-500">
          No tool proficiencies. Learn a tool proficiency to unlock crafting recipes.
        </p>
      </SheetSectionWrapper>
    )
  }

  return (
    <SheetSectionWrapper title="Crafting" defaultOpen={false}>
      {/* Notifications */}
      {craftWarning && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1 mb-2">
          {craftWarning}
        </div>
      )}
      {craftSuccess && (
        <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded px-2 py-1 mb-2">
          {craftSuccess}
        </div>
      )}

      <CraftingRecipeList5e matchingTools={matchingTools} readonly={readonly} onCraft={handleCraft} />

      {/* Spell Scroll Crafting */}
      {canCraftScrolls && (
        <CraftingProgress5e
          preparedSpells={preparedSpells}
          scrollCosts={SCROLL_COSTS}
          readonly={readonly}
          onCraftScroll={handleCraftScroll}
        />
      )}
    </SheetSectionWrapper>
  )
}
