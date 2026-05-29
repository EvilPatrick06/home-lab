import type { DetailField, SelectableOption } from '../../types/character-common'
import type { BackgroundData, ClassData, FeatData, SpeciesData, SubclassData } from '../../types/data'

// === 5e Transformers ===
//
// Pure mapping helpers that convert raw 5e library shapes into the
// `SelectableOption` view-model consumed by the character builder. These are
// the imperative façade per `services/library/README.md`; the inline
// `// boundary-allow:` comments suppress the library-boundary literal-shape
// guard, which would otherwise flag the `name/description/traits` keys in each
// return object.

/** Normalize source to a display string (handles string, object {book}, or undefined) */
export function normalizeSource(source: unknown): string {
  if (typeof source === 'string') return source
  if (source && typeof source === 'object' && 'book' in source) return (source as { book: string }).book
  return 'SRD'
}

export function formatPrerequisites(prereqs: FeatData['prerequisites']): string[] {
  const parts: string[] = []
  if (prereqs.level) parts.push(`Level ${prereqs.level}`)
  if (prereqs.abilityScores) {
    for (const req of prereqs.abilityScores) {
      parts.push(`${req.abilities.join(' or ')} ${req.minimum}+`)
    }
  }
  return parts
}

export function speciesToOption(species: SpeciesData): SelectableOption {
  const size = species.size
  const sizeStr =
    typeof size === 'string' ? size : size.type === 'choice' ? (size.options ?? []).join(' or ') : (size.value ?? '')

  const speed = typeof species.speed === 'number' ? species.speed : parseInt(String(species.speed), 10) || 30

  const details: DetailField[] = [
    { label: 'Speed', value: `${speed} ft.` },
    { label: 'Size', value: sizeStr },
    { label: 'Creature Type', value: species.creatureType }
  ]

  if (species.darkvision) {
    details.push({ label: 'Darkvision', value: `${species.darkvision} ft.` })
  }

  for (const trait of species.traits) {
    // boundary-allow: loader return-type — data-provider is the imperative façade per services/library/README.md
    details.push({ label: trait.name, value: typeof trait.description === 'string' ? trait.description : '' })
  }

  return {
    id: species.id,
    name: species.name,
    rarity: 'common',
    description: `${species.creatureType} - Speed: ${speed} ft.`,
    traits: species.traits.map((t) => t.name),
    source: normalizeSource(species.source),
    detailFields: details
  }
}

export function classToOption(cls: ClassData): SelectableOption {
  const ct = cls.coreTraits
  const details: DetailField[] = [
    { label: 'Hit Point Die', value: ct.hitPointDie },
    { label: 'Primary Ability', value: ct.primaryAbility.join(', ') },
    { label: 'Saving Throws', value: ct.savingThrowProficiencies.join(', ') },
    { label: 'Armor Training', value: ct.armorTraining.join(', ') || 'None' },
    {
      label: 'Weapon Proficiencies',
      value:
        ct.weaponProficiencies
          .map((w) => w.category ?? '')
          .filter(Boolean)
          .join(', ') || 'None'
    },
    {
      label: 'Skills',
      value: `Choose ${ct.skillProficiencies.count} from: ${Array.isArray(ct.skillProficiencies.from) ? ct.skillProficiencies.from.join(', ') : ct.skillProficiencies.from}`
    }
  ]

  if (ct.startingEquipment.length > 0) {
    details.push({
      label: 'Starting Equipment',
      value: ct.startingEquipment.map((e) => `${e.label}: ${e.items.join(', ')} (${e.gp} gp)`).join(' | ')
    })
  }

  return {
    id: cls.id ?? cls.name.toLowerCase(),
    // boundary-allow: loader return-type — data-provider is the imperative façade per services/library/README.md
    name: cls.name,
    rarity: 'common',
    description: `${ct.hitPointDie} | Primary: ${ct.primaryAbility.join(', ')}`,
    traits: [],
    source: 'SRD',
    detailFields: details
  }
}

export function backgroundToOption(bg: BackgroundData): SelectableOption {
  const toolProf =
    typeof bg.toolProficiency === 'string'
      ? bg.toolProficiency
      : ((bg.toolProficiency as { type?: string })?.type ?? 'None')
  const details: DetailField[] = [
    {
      label: 'Skill Proficiencies',
      value: Array.isArray(bg.skillProficiencies)
        ? bg.skillProficiencies.join(', ')
        : String(bg.skillProficiencies ?? '')
    },
    { label: 'Tool Proficiency', value: toolProf || 'None' },
    { label: 'Feat', value: bg.feat },
    {
      label: 'Ability Scores',
      value: Array.isArray(bg.abilityScores) ? bg.abilityScores.join(', ') : String(bg.abilityScores ?? '')
    }
  ]

  const equipment = Array.isArray(bg.equipment) ? bg.equipment : []
  if (equipment.length > 0) {
    const eqValue =
      typeof equipment[0] === 'string'
        ? (equipment as unknown as string[]).join(', ')
        : equipment.map((e) => `Option ${e.option}: ${e.items.join(', ')}`).join(' | ')
    details.push({ label: 'Equipment', value: eqValue })
  }

  return {
    id: bg.id,
    // boundary-allow: loader return-type — data-provider is the imperative façade per services/library/README.md
    name: bg.name,
    rarity: 'common',
    description: bg.description || `Skills: ${bg.skillProficiencies.join(', ')}`,
    traits: [],
    source: normalizeSource(bg.source),
    detailFields: details
  }
}

// === Feat/Subclass Transformers ===

export function feat5eToOption(feat: FeatData): SelectableOption {
  const details: DetailField[] = [
    { label: 'Category', value: feat.category },
    { label: 'Level', value: `${feat.prerequisites.level ?? 'None'}` }
  ]
  const prereqParts: string[] = []
  if (feat.prerequisites.level) prereqParts.push(`Level ${feat.prerequisites.level}`)
  if (feat.prerequisites.abilityScores) {
    for (const req of feat.prerequisites.abilityScores) {
      prereqParts.push(`${req.abilities.join(' or ')} ${req.minimum}+`)
    }
  }
  if (prereqParts.length > 0) {
    details.push({ label: 'Prerequisites', value: prereqParts.join(', ') })
  }
  if (feat.abilityScoreIncrease) {
    const asi = feat.abilityScoreIncrease
    const value = asi.options.map((o) => `+${o.amount} ${o.abilities.join(' or ')}`).join('; ')
    details.push({ label: 'Ability Score Increase', value })
  }
  if (feat.repeatable) {
    details.push({ label: 'Repeatable', value: feat.repeatable.restriction ?? 'Yes' })
  }
  const description = feat.benefits.map((b) => b.description).join(' ')
  return {
    id: feat.id,
    // boundary-allow: loader return-type — data-provider is the imperative façade per services/library/README.md
    name: feat.name,
    rarity: 'common',
    description,
    traits: [feat.category],
    source: normalizeSource(feat.source),
    detailFields: details
  }
}

export function subclassToOption(sc: SubclassData): SelectableOption {
  const details: DetailField[] = [
    { label: 'Class', value: sc.className ?? '' },
    { label: 'Level', value: `${sc.level ?? ''}` }
  ]
  for (const feat of sc.features) {
    details.push({ label: feat.name, value: feat.description })
  }
  return {
    id: sc.id ?? sc.name.toLowerCase().replace(/\s+/g, '-'),
    name: sc.name,
    rarity: 'common',
    description: sc.description,
    traits: [],
    source: 'SRD',
    detailFields: details
  }
}
