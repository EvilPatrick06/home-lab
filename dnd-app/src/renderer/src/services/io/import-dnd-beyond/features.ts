/**
 * Feat + class/subclass + race feature extraction for the D&D Beyond import.
 */

import type { Feature } from '../../../types/character-5e'
import type { ClassFeatureEntry } from '../../../types/character-common'
import { stripHtmlToFixedPoint } from '../strip-html'

export function extractFeats(data: Record<string, unknown>): Array<{ id: string; name: string; description: string }> {
  if (!Array.isArray(data.feats)) return []

  // boundary-allow: D&D Beyond importer maps external character JSON into feat /
  // class-feature / race-feature entry shapes (id/name/description/level/source) —
  // this is ingest, not inline library data. Carried over from import-dnd-beyond.ts
  // (allowlisted by being the importer) when this section was split out.
  return data.feats.map((f: { definition?: { name?: string; description?: string; id?: number } }) => ({
    id: f.definition?.id ? String(f.definition.id) : crypto.randomUUID(),
    name: f.definition?.name ?? 'Unknown Feat',
    description: stripHtmlToFixedPoint(f.definition?.description ?? '').slice(0, 500)
  }))
}

export function extractClassFeatures(data: Record<string, unknown>): ClassFeatureEntry[] {
  const features: ClassFeatureEntry[] = []
  const classes = Array.isArray(data.classes) ? data.classes : []

  for (const cls of classes) {
    const className = cls.definition?.name ?? 'Unknown'
    const classFeatures = Array.isArray(cls.classFeatures) ? cls.classFeatures : []

    for (const f of classFeatures) {
      const def = f.definition ?? f
      if (!def?.name) continue

      features.push({
        level: def.requiredLevel ?? def.level ?? cls.level ?? 1,
        name: def.name,
        source: className,
        description: stripHtmlToFixedPoint(def.description ?? '').slice(0, 500)
      })
    }

    // Subclass features
    const subFeatures = Array.isArray(cls.subclassDefinition?.classFeatures) ? cls.subclassDefinition.classFeatures : []
    const subName = cls.subclassDefinition?.name ?? className

    for (const f of subFeatures) {
      if (!f?.name) continue
      features.push({
        level: f.requiredLevel ?? f.level ?? 1,
        name: f.name,
        source: subName,
        description: stripHtmlToFixedPoint(f.description ?? '').slice(0, 500)
      })
    }
  }

  return features
}

export function extractRaceFeatures(data: Record<string, unknown>): Feature[] {
  const features: Feature[] = []
  const race = data.race as Record<string, unknown> | undefined

  const racialTraits = Array.isArray(race?.racialTraits) ? race.racialTraits : []
  for (const trait of racialTraits) {
    const def = trait.definition ?? trait
    if (!def?.name) continue
    features.push({
      name: def.name,
      source: (race?.fullName as string) ?? (race?.baseName as string) ?? 'Species',
      description: stripHtmlToFixedPoint(def.description ?? '').slice(0, 500)
    })
  }

  return features
}
