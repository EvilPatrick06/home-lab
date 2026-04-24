import { getSpeciesSpellProgression } from '../../services/character/auto-populate-5e'
import { load5eSpecies, load5eSpells, load5eSubclasses } from '../../services/data-provider'
import type { Character5e } from '../../types/character-5e'
import type { SpellEntry } from '../../types/character-common'

/** Convert a raw spell record from the data provider into a SpellEntry */
export function toSpellEntry(
  raw: {
    id: string
    name: string
    level: number
    description: string
    castingTime?: string
    range?: string
    duration?: string
    components?: string
    school?: string
    concentration?: boolean
    ritual?: boolean
    classes?: string[]
  },
  extra?: { source?: 'species' | 'class' | 'feat'; prepared?: boolean }
): SpellEntry {
  return {
    id: raw.id,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    castingTime: raw.castingTime || ((raw as unknown as Record<string, unknown>).castTime as string) || '',
    range: raw.range || '',
    duration: raw.duration || '',
    components: typeof raw.components === 'string' ? raw.components : '',
    school: raw.school,
    concentration: raw.concentration,
    ritual: raw.ritual,
    classes: raw.classes,
    ...(extra?.source ? { source: extra.source } : {}),
    ...(extra?.prepared ? { prepared: true } : {})
  }
}

/** Resolve new spells for a level-up: selected spells, fighting style cantrips, species progression, subclass always-prepared */
export async function resolveLevelUpSpells(
  character: Character5e,
  targetLevel: number,
  newSpellIds: string[],
  fightingStyleSelection: { id: string; name: string; description: string } | null,
  blessedWarriorCantrips: string[],
  druidicWarriorCantrips: string[]
): Promise<SpellEntry[]> {
  const newSpells: SpellEntry[] = []

  // 7. Load selected new spells
  if (newSpellIds.length > 0) {
    try {
      const spellData = await load5eSpells()
      for (const id of newSpellIds) {
        const raw = spellData.find((s) => s.id === id)
        if (raw && !character.knownSpells.some((ks) => ks.id === raw.id)) {
          newSpells.push(toSpellEntry(raw))
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 7b. Add Blessed Warrior cantrips
  if (fightingStyleSelection?.id === 'fighting-style-blessed-warrior' && blessedWarriorCantrips.length > 0) {
    try {
      const spellData = await load5eSpells()
      for (const cantripId of blessedWarriorCantrips) {
        if (!character.knownSpells.some((ks) => ks.id === cantripId) && !newSpells.some((ns) => ns.id === cantripId)) {
          const raw = spellData.find((s) => s.id === cantripId)
          if (raw) {
            newSpells.push(toSpellEntry(raw, { source: 'feat' }))
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 7b2. Add Druidic Warrior cantrips
  if (fightingStyleSelection?.id === 'druidic-warrior' && druidicWarriorCantrips.length > 0) {
    try {
      const spellData = await load5eSpells()
      for (const cantripId of druidicWarriorCantrips) {
        if (!character.knownSpells.some((ks) => ks.id === cantripId) && !newSpells.some((ns) => ns.id === cantripId)) {
          const raw = spellData.find((s) => s.id === cantripId)
          if (raw) {
            newSpells.push(toSpellEntry(raw, { source: 'feat' }))
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 7c. Inject species spell progression (level 3/5 spells from subrace)
  if (character.buildChoices.subspeciesId) {
    try {
      const speciesDataArr = await load5eSpecies()
      const speciesData = speciesDataArr.find((s) => s.id === character.buildChoices.speciesId)
      if (speciesData) {
        const lineageTrait = speciesData.traits.find((t) => t.lineageChoices)
        const lineageOption = lineageTrait?.lineageChoices?.options.find(
          (o) => o.name.toLowerCase().replace(/\s+/g, '-') === character.buildChoices.subspeciesId
        )
        if (lineageOption?.leveledSpells) {
          const spellProg = lineageOption.leveledSpells.map((ls) => ({
            spellId: ls.spell,
            grantedAtLevel: ls.requiredCharacterLevel,
            innateUses: ls.oncePerLongRestWithoutSlot ? 1 : -1
          }))
          const progressionSpells = getSpeciesSpellProgression(spellProg, targetLevel, speciesData.name)
          for (const spell of progressionSpells) {
            if (
              !character.knownSpells.some((ks) => ks.id === spell.id) &&
              !newSpells.some((ns) => ns.id === spell.id)
            ) {
              newSpells.push(spell)
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 7d. Add subclass always-prepared spells
  const primarySubclassId = character.classes[0]?.subclass?.toLowerCase().replace(/\s+/g, '-') ?? ''
  if (primarySubclassId) {
    try {
      const subclasses = await load5eSubclasses()
      const sc = subclasses.find((s) => s.id === primarySubclassId)
      if (sc?.alwaysPreparedSpells) {
        const spellData = await load5eSpells()
        for (const [lvlStr, spellNames] of Object.entries(sc.alwaysPreparedSpells)) {
          if (targetLevel >= Number(lvlStr)) {
            for (const name of spellNames) {
              if (
                !character.knownSpells.some((ks) => ks.name.toLowerCase() === name.toLowerCase()) &&
                !newSpells.some((ns) => ns.name.toLowerCase() === name.toLowerCase())
              ) {
                const raw = spellData.find((s) => s.name.toLowerCase() === name.toLowerCase())
                if (raw) {
                  newSpells.push(toSpellEntry(raw, { prepared: true }))
                }
              }
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return newSpells
}
