import { loadCharacter as loadCharacterFromStorage } from '../storage/character-storage'

interface AbilityScores {
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

/**
 * Load a character by ID from storage and return the raw object.
 */
export async function loadCharacterById(id: string): Promise<Record<string, unknown> | null> {
  const result = await loadCharacterFromStorage(id)
  if (result.success && result.data) {
    return result.data as unknown as Record<string, unknown>
  }
  return null
}

/**
 * Format a character object for AI context injection.
 */
export function formatCharacterForContext(char: Record<string, unknown>): string {
  return formatCharacter5e(char)
}

/**
 * Abbreviated character format — name, AC, HP, conditions only.
 * Used for non-acting characters to save token budget.
 */
export function formatCharacterAbbreviated(char: Record<string, unknown>): string {
  const hp = char.hitPoints as { current: number; maximum: number; temporary: number }
  const conditions = (char.conditions as Array<{ name: string; value?: number }>) || []
  const condStr =
    conditions.length > 0
      ? ` | Conditions: ${conditions.map((c) => (c.value ? `${c.name} ${c.value}` : c.name)).join(', ')}`
      : ''
  return `${char.name}: HP ${hp.current}/${hp.maximum} AC ${char.armorClass}${condStr}`
}

function formatCharacter5e(c: Record<string, unknown>): string {
  const lines: string[] = []
  const classes = c.classes as Array<{ name: string; subclass?: string; level: number }>
  const className = classes.map((cl) => `${cl.name}${cl.subclass ? ` (${cl.subclass})` : ''} ${cl.level}`).join(' / ')
  const subspecies = c.subspecies as string | undefined
  lines.push(
    `**${c.name}** — Level ${c.level} ${c.species}${subspecies ? ` (${subspecies})` : ''} ${className} (5e 2024)`
  )

  const hp = c.hitPoints as { current: number; maximum: number; temporary: number }
  lines.push(`HP: ${hp.current}/${hp.maximum}${hp.temporary > 0 ? ` +${hp.temporary} temp` : ''} | AC: ${c.armorClass}`)

  const abs = c.abilityScores as AbilityScores
  const scores = [
    `STR ${abs.strength} (${formatMod(abilityModifier(abs.strength))})`,
    `DEX ${abs.dexterity} (${formatMod(abilityModifier(abs.dexterity))})`,
    `CON ${abs.constitution} (${formatMod(abilityModifier(abs.constitution))})`,
    `INT ${abs.intelligence} (${formatMod(abilityModifier(abs.intelligence))})`,
    `WIS ${abs.wisdom} (${formatMod(abilityModifier(abs.wisdom))})`,
    `CHA ${abs.charisma} (${formatMod(abilityModifier(abs.charisma))})`
  ]
  lines.push(`Abilities: ${scores.join(' | ')}`)

  const speed = c.speed as number
  const speeds = c.speeds as { fly: number; swim: number; climb: number; burrow: number }
  const speedParts = [`${speed} ft`]
  if (speeds?.fly > 0) speedParts.push(`fly ${speeds.fly} ft`)
  if (speeds?.swim > 0) speedParts.push(`swim ${speeds.swim} ft`)
  if (speeds?.climb > 0) speedParts.push(`climb ${speeds.climb} ft`)
  if (speeds?.burrow > 0) speedParts.push(`burrow ${speeds.burrow} ft`)
  lines.push(`Speed: ${speedParts.join(', ')} | Initiative: ${formatMod(c.initiative as number)}`)

  const profs = c.proficiencies as {
    savingThrows: string[]
    weapons: string[]
    armor: string[]
    tools: string[]
    languages: string[]
  }
  if (profs?.savingThrows?.length > 0) lines.push(`Saving Throw Proficiencies: ${profs.savingThrows.join(', ')}`)

  const skills = c.skills as Array<{ name: string; proficient: boolean; expertise?: boolean }>
  const proficientSkills = skills?.filter((s) => s.proficient) || []
  if (proficientSkills.length > 0) {
    const skillList = proficientSkills.map((s) => `${s.name}${s.expertise ? ' (expertise)' : ''}`).join(', ')
    lines.push(`Skill Proficiencies: ${skillList}`)
  }

  if (profs?.weapons?.length > 0) lines.push(`Weapon Proficiencies: ${profs.weapons.join(', ')}`)
  if (profs?.armor?.length > 0) lines.push(`Armor Proficiencies: ${profs.armor.join(', ')}`)
  if (profs?.tools?.length > 0) lines.push(`Tool Proficiencies: ${profs.tools.join(', ')}`)
  if (profs?.languages?.length > 0) lines.push(`Languages: ${profs.languages.join(', ')}`)

  const spellcasting = c.spellcasting as {
    spellSaveDC: number
    spellAttackBonus: number
    ability: string
  } | null
  if (spellcasting) {
    lines.push(
      `Spellcasting: Save DC ${spellcasting.spellSaveDC} | Attack ${formatMod(spellcasting.spellAttackBonus)} | Ability: ${spellcasting.ability}`
    )

    const spellSlotLevels = c.spellSlotLevels as Record<number, { current: number; max: number }>
    const slotParts: string[] = []
    for (let lvl = 1; lvl <= 9; lvl++) {
      const slot = spellSlotLevels?.[lvl]
      if (slot && slot.max > 0) {
        slotParts.push(`${lvl}: ${slot.current}/${slot.max}`)
      }
    }
    if (slotParts.length > 0) lines.push(`Spell Slots: ${slotParts.join(' | ')}`)

    const pactSlots = c.pactMagicSlotLevels as Record<string, { current: number; max: number }> | undefined
    if (pactSlots) {
      const pactParts: string[] = []
      for (const [lvl, slot] of Object.entries(pactSlots)) {
        if (slot.max > 0) pactParts.push(`${lvl}: ${slot.current}/${slot.max}`)
      }
      if (pactParts.length > 0) lines.push(`Pact Magic Slots: ${pactParts.join(' | ')}`)
    }

    const preparedSpellIds = (c.preparedSpellIds as string[]) || []
    const knownSpells = (c.knownSpells as Array<{ id: string; name: string }>) || []
    if (preparedSpellIds.length > 0) {
      const preparedNames = knownSpells.filter((s) => preparedSpellIds.includes(s.id)).map((s) => s.name)
      if (preparedNames.length > 0) lines.push(`Prepared Spells: ${preparedNames.join(', ')}`)
    } else if (knownSpells.length > 0) {
      lines.push(`Known Spells: ${knownSpells.map((s) => s.name).join(', ')}`)
    }
  }

  const classResources = c.classResources as Array<{ name: string; current: number; max: number }> | undefined
  if (classResources && classResources.length > 0) {
    const resParts = classResources.map((r) => `${r.name}: ${r.current}/${r.max}`)
    lines.push(`Class Resources: ${resParts.join(' | ')}`)
  }

  const wildShapeUses = c.wildShapeUses as { current: number; max: number } | undefined
  if (wildShapeUses && wildShapeUses.max > 0) {
    lines.push(`Wild Shape Uses: ${wildShapeUses.current}/${wildShapeUses.max}`)
  }

  const hitDice = c.hitDice as Array<{ current: number; maximum: number; dieType: number }> | undefined
  if (hitDice && hitDice.length > 0) {
    const hdRemaining = hitDice.reduce((s, h) => s + h.current, 0)
    const hdMax = hitDice.reduce((s, h) => s + h.maximum, 0)
    const hdDetail = hitDice.map((h) => `${h.current}/${h.maximum}d${h.dieType}`).join(' + ')
    lines.push(`Hit Dice Remaining: ${hdRemaining}/${hdMax} (${hdDetail})`)
  } else {
    lines.push(`Hit Dice Remaining: ${c.level}/${c.level}`)
  }

  const armor = (c.armor as Array<{ name: string; acBonus: number; equipped: boolean }>) || []
  const equippedArmor = armor.filter((a) => a.equipped)
  if (equippedArmor.length > 0) {
    lines.push(`Equipped Armor: ${equippedArmor.map((a) => `${a.name} (AC +${a.acBonus})`).join(', ')}`)
  }

  const weapons = (c.weapons as Array<{ name: string; damage: string; damageType: string; attackBonus: number }>) || []
  if (weapons.length > 0) {
    lines.push(
      `Weapons: ${weapons.map((w) => `${w.name} (${w.damage} ${w.damageType}, ${formatMod(w.attackBonus)} to hit)`).join(', ')}`
    )
  }

  const treasure = c.treasure as Record<string, number>
  if (treasure) {
    const currency: string[] = []
    if (treasure.pp > 0) currency.push(`${treasure.pp} pp`)
    if (treasure.gp > 0) currency.push(`${treasure.gp} gp`)
    if (treasure.ep > 0) currency.push(`${treasure.ep} ep`)
    if (treasure.sp > 0) currency.push(`${treasure.sp} sp`)
    if (treasure.cp > 0) currency.push(`${treasure.cp} cp`)
    if (currency.length > 0) lines.push(`Currency: ${currency.join(', ')}`)
  }

  const features = (c.features as Array<{ name: string; source: string; description: string }>) || []
  if (features.length > 0) {
    // Split species traits from other features
    const speciesName = c.species as string
    const speciesTraits = features.filter((f) => f.source === speciesName)
    const otherFeatures = features.filter((f) => f.source !== speciesName)

    if (speciesTraits.length > 0) {
      const traitSummaries = speciesTraits.map((t) => {
        // Build a concise summary from the description
        const desc = t.description ?? ''
        const brief = desc.length > 80 ? `${desc.slice(0, 80).replace(/\s+\S*$/, '')}...` : desc
        return brief ? `${t.name} (${brief})` : t.name
      })
      lines.push(`Species Traits: ${traitSummaries.join(', ')}`)
    }
    if (otherFeatures.length > 0) {
      lines.push(`Features: ${otherFeatures.map((f) => f.name).join(', ')}`)
    }
  }

  const feats = c.feats as Array<{ id: string; name: string; description: string }> | undefined
  if (feats && feats.length > 0) {
    lines.push(`Feats: ${feats.map((f) => f.name).join(', ')}`)
  }

  const speciesResources = c.speciesResources as Array<{ name: string; current: number; max: number }> | undefined
  if (speciesResources && speciesResources.length > 0) {
    const resParts = speciesResources.map((r) => `${r.name}: ${r.current}/${r.max}`)
    lines.push(`Species Resources: ${resParts.join(' | ')}`)
  }

  const conditions = (c.conditions as Array<{ name: string; value?: number }>) || []
  if (conditions.length > 0) {
    lines.push(
      `Active Conditions: ${conditions.map((cond) => (cond.value ? `${cond.name} ${cond.value}` : cond.name)).join(', ')}`
    )
  }

  if (hp.current === 0) {
    const deathSaves = c.deathSaves as { successes: number; failures: number }
    lines.push(`Death Saves: ${deathSaves.successes} successes / ${deathSaves.failures} failures`)
  }

  if (c.heroicInspiration) lines.push(`Heroic Inspiration: Yes`)

  const resistances = (c.resistances as string[]) || []
  const immunities = (c.immunities as string[]) || []
  const vulnerabilities = (c.vulnerabilities as string[]) || []
  if (resistances.length > 0) lines.push(`Resistances: ${resistances.join(', ')}`)
  if (immunities.length > 0) lines.push(`Immunities: ${immunities.join(', ')}`)
  if (vulnerabilities.length > 0) lines.push(`Vulnerabilities: ${vulnerabilities.join(', ')}`)

  return lines.join('\n')
}
