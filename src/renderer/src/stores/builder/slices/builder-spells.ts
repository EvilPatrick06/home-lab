import { getSpeciesSpellProgression, getSpellsFromTraits } from '../../../services/character/auto-populate-5e'
import { load5eSpells, load5eSubclasses } from '../../../services/data-provider'
import type { SpellEntry } from '../../../types/character-common'
import type { SpeciesData } from '../../../types/data'
import { logger } from '../../../utils/logger'

/** Convert a raw spell record from the data provider into a SpellEntry */
function toSpellEntry(
  raw: {
    id: string
    name: string
    level: number
    description: string
    castingTime?: string
    castTime?: string
    range?: string
    duration?: string
    components?: string
    school?: string
    concentration?: boolean
    ritual?: boolean
    classes?: string[]
    traditions?: string[]
    traits?: string[]
    heightened?: Record<string, string>
    higherLevels?: string
  },
  extra?: { source?: 'species' | 'class' | 'feat'; prepared?: boolean }
): SpellEntry {
  return {
    id: raw.id,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    castingTime: raw.castingTime || raw.castTime || '',
    range: raw.range || '',
    duration: raw.duration || '',
    components: typeof raw.components === 'string' ? raw.components : '',
    school: raw.school,
    concentration: raw.concentration,
    ritual: raw.ritual,
    traditions: raw.traditions,
    traits: raw.traits,
    heightened: raw.heightened,
    higherLevels: raw.higherLevels,
    classes: raw.classes,
    ...(extra?.source ? { source: extra.source } : {}),
    ...(extra?.prepared ? { prepared: true } : {})
  }
}

export interface BuilderSpellsInput {
  classId: string
  subclassId: string | undefined
  targetLevel: number
  selectedSpellIds: string[]
  blessedWarriorCantrips: string[]
  druidicWarriorCantrips: string[]
  speciesData: SpeciesData | null
  derivedSpeciesTraits: Array<{
    name: string
    description: string
    spellGranted?: string | { list: string; count: number }
  }>
  heritageId: string | null
}

export async function resolveBuilderSpells(input: BuilderSpellsInput): Promise<SpellEntry[]> {
  const {
    classId,
    subclassId,
    targetLevel,
    selectedSpellIds,
    blessedWarriorCantrips,
    druidicWarriorCantrips,
    speciesData,
    derivedSpeciesTraits,
    heritageId
  } = input

  // Use derived traits (with heritage modifications) for spell extraction
  const traitsForSpells = derivedSpeciesTraits.length > 0 ? derivedSpeciesTraits : (speciesData?.traits ?? [])
  const racialSpells = speciesData ? getSpellsFromTraits(traitsForSpells, speciesData.name) : []

  // Add species spell progression (level 3/5 spells from heritage/subrace)
  let progressionSpells: SpellEntry[] = []
  if (speciesData && heritageId) {
    const lineageTrait = speciesData.traits.find((t) => t.lineageChoices)
    const lineageOption = lineageTrait?.lineageChoices?.options.find(
      (o) => o.name.toLowerCase().replace(/\s+/g, '-') === heritageId
    )
    if (lineageOption?.leveledSpells) {
      const spellProg = lineageOption.leveledSpells.map((ls) => ({
        spellId: ls.spell,
        grantedAtLevel: ls.requiredCharacterLevel,
        innateUses: ls.oncePerLongRestWithoutSlot ? 1 : -1
      }))
      progressionSpells = getSpeciesSpellProgression(spellProg, targetLevel, speciesData.name)
    }
  }

  try {
    const spellData = await load5eSpells()

    const selectedSpells: SpellEntry[] = []
    for (const id of selectedSpellIds) {
      const raw = spellData.find((s) => s.id === id)
      if (raw && !racialSpells.some((rs) => rs.name === raw.name)) {
        selectedSpells.push(toSpellEntry(raw))
      }
    }
    const spells = [...racialSpells, ...progressionSpells, ...selectedSpells]

    // Druid: always prepare Speak with Animals
    if (classId === 'druid' && !spells.some((s) => s.name === 'Speak with Animals')) {
      const swa = spellData.find((s) => s.name === 'Speak with Animals')
      if (swa) spells.push(toSpellEntry(swa, { prepared: true }))
    }
    // Ranger: always prepare Hunter's Mark
    if (classId === 'ranger' && !spells.some((s) => s.name === "Hunter's Mark")) {
      const hm = spellData.find((s) => s.name === "Hunter's Mark")
      if (hm) spells.push(toSpellEntry(hm, { prepared: true }))
    }

    // Add Blessed Warrior cantrips
    for (const cantripId of blessedWarriorCantrips) {
      const raw = spellData.find((s) => s.id === cantripId)
      if (raw && !spells.some((s) => s.id === raw.id)) {
        spells.push(toSpellEntry(raw, { source: 'feat' }))
      }
    }
    // Add Druidic Warrior cantrips
    for (const cantripId of druidicWarriorCantrips) {
      const raw = spellData.find((s) => s.id === cantripId)
      if (raw && !spells.some((s) => s.id === raw.id)) {
        spells.push(toSpellEntry(raw, { source: 'feat' }))
      }
    }

    // Add subclass always-prepared spells
    if (subclassId) {
      try {
        const subclasses = await load5eSubclasses()
        const sc = subclasses.find((s) => s.id === subclassId)
        if (sc?.alwaysPreparedSpells) {
          for (const [lvlStr, spellNames] of Object.entries(sc.alwaysPreparedSpells)) {
            if (targetLevel >= Number(lvlStr)) {
              for (const name of spellNames) {
                if (!spells.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
                  const raw = spellData.find((s) => s.name.toLowerCase() === name.toLowerCase())
                  if (raw) spells.push(toSpellEntry(raw, { prepared: true }))
                }
              }
            }
          }
        }
      } catch (error) {
        logger.error('[SaveSlice5e] Failed to load subclass spells:', error)
      }
    }
    return spells
  } catch (error) {
    logger.error('[SaveSlice5e] Failed to resolve spell list:', error)
    return [...racialSpells, ...progressionSpells]
  }
}
