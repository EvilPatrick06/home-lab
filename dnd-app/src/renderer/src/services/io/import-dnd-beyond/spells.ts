/**
 * Spell extraction for the D&D Beyond import.
 * Flattens class + innate spell sources into deduped SpellEntry records and
 * tracks which spell ids are prepared/always-prepared.
 */

import type { SpellEntry } from '../../../types/character-common'
import { stripHtmlToFixedPoint } from '../strip-html'

export function extractSpells(data: Record<string, unknown>): {
  knownSpells: SpellEntry[]
  preparedSpellIds: string[]
} {
  const knownSpells: SpellEntry[] = []
  const preparedSpellIds: string[] = []

  const schoolMap: Record<string, string> = {
    Abjuration: 'Abjuration',
    Conjuration: 'Conjuration',
    Divination: 'Divination',
    Enchantment: 'Enchantment',
    Evocation: 'Evocation',
    Illusion: 'Illusion',
    Necromancy: 'Necromancy',
    Transmutation: 'Transmutation'
  }

  const spellSources = [
    ...(Array.isArray(data.classSpells) ? data.classSpells : []),
    ...(Array.isArray(data.spells) ? [{ spells: data.spells }] : [])
  ]

  const seenIds = new Set<string>()

  for (const source of spellSources) {
    const spells = Array.isArray(source.spells) ? source.spells : []
    for (const s of spells) {
      const def = s.definition ?? s
      if (!def?.name) continue

      const id = def.id ? String(def.id) : crypto.randomUUID()
      if (seenIds.has(id)) continue
      seenIds.add(id)

      const spell: SpellEntry = {
        id,
        // boundary-allow: external format adapter — maps D&D Beyond data into library shape
        name: def.name,
        level: def.level ?? 0,
        description: stripHtmlToFixedPoint(def.description ?? '').slice(0, 500),
        castingTime: def.castingTime?.castingTimeInterval
          ? `${def.castingTime.castingTimeInterval} ${def.castingTime.castingTimeType ?? 'action'}`
          : '1 action',
        range: def.range?.origin ? `${def.range.rangeValue ?? 0} ft` : 'Self',
        duration: def.duration?.durationInterval
          ? `${def.duration.durationInterval} ${def.duration.durationType ?? 'round'}`
          : 'Instantaneous',
        components:
          [
            def.components?.includes(1) ? 'V' : '',
            def.components?.includes(2) ? 'S' : '',
            def.components?.includes(3) ? `M${def.componentsDescription ? ` (${def.componentsDescription})` : ''}` : ''
          ]
            .filter(Boolean)
            .join(', ') || 'None',
        school: schoolMap[def.school ?? ''] ?? undefined,
        concentration: def.concentration ?? false,
        ritual: def.ritual ?? false,
        classes: Array.isArray(def.classes)
          ? def.classes.map((c: { name?: string }) => c.name).filter(Boolean)
          : undefined
      }

      knownSpells.push(spell)

      if (s.prepared || s.alwaysPrepared) {
        preparedSpellIds.push(id)
      }
    }
  }

  return { knownSpells, preparedSpellIds }
}
