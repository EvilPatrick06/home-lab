import type { Character5e, CharacterClass5e, InstanceRef, MagicItemEntry5e } from './character-5e'
import type { ActiveCondition, ArmorEntry, SpellEntry, WeaponEntry } from './character-common'
import type { EntryRef } from './library'

// Phase 15c.5 — legacy v3 inline shape. Fields no longer on `Character5e`; the
// migration shim accepts them from raw save-file JSON and produces v4 *Refs +
// state. After migration the legacy fields are deleted from the returned
// object so v4 is the only surface consumers see.
interface LegacyV3Fields {
  classes?: CharacterClass5e[]
  knownSpells?: SpellEntry[]
  preparedSpellIds?: string[]
  weapons?: WeaponEntry[]
  armor?: ArmorEntry[]
  magicItems?: MagicItemEntry5e[]
  feats?: Array<{ id: string; name: string; description: string; choices?: Record<string, string | string[]> }>
  conditions?: ActiveCondition[]
}

function nextInstanceId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID()
  }
  fallbackCounter++
  return `instance-${fallbackCounter}`
}
let fallbackCounter = 0

function entryRef<C extends string>(entryType: C, entryId: string, overrides?: Record<string, unknown>): EntryRef<C> {
  const ref: EntryRef<C> = { entryType, entryId }
  if (overrides && Object.keys(overrides).length > 0) {
    ref.overrides = overrides as EntryRef<C>['overrides']
  }
  return ref
}

function instanceRef<C extends string>(
  entryType: C,
  entryId: string,
  overrides?: Record<string, unknown>
): InstanceRef<C> {
  return { instanceId: nextInstanceId(), ref: entryRef(entryType, entryId, overrides) }
}

export function migrateCharacter5eFromV3ToV4(character: Character5e): Character5e {
  // v3 fields no longer on Character5e at compile time but still on raw save
  // JSON at runtime; cast to read them.
  const legacy = character as unknown as Character5e & LegacyV3Fields
  const out: Character5e & LegacyV3Fields = { ...legacy }

  if (out.speciesRef === undefined && out.species) {
    out.speciesRef = entryRef('species', out.species)
  }
  if (out.subspeciesRef === undefined && out.subspecies) {
    out.subspeciesRef = entryRef('species', out.subspecies)
  }
  if (out.backgroundRef === undefined && out.background) {
    out.backgroundRef = entryRef('backgrounds', out.background)
  }

  if (out.classRefs === undefined && Array.isArray(out.classes) && out.classes.length > 0) {
    let levelTaken = 1
    out.classRefs = out.classes.map((c) => {
      const entryId = c.name.toLowerCase()
      const subclassRef: EntryRef<'subclasses'> | null = c.subclass ? entryRef('subclasses', c.subclass) : null
      const item = {
        instanceId: nextInstanceId(),
        ref: entryRef('classes', entryId),
        level: c.level,
        levelTaken,
        subclassRef
      }
      levelTaken += c.level
      return item
    })
  }

  if (out.featRefs === undefined && Array.isArray(out.feats) && out.feats.length > 0) {
    out.featRefs = out.feats.map((f) => instanceRef('feats', f.id))
  }

  if (out.knownSpellRefs === undefined && Array.isArray(out.knownSpells) && out.knownSpells.length > 0) {
    out.knownSpellRefs = out.knownSpells.map((s) => instanceRef('spells', s.id))
  }

  if (out.weaponRefs === undefined && Array.isArray(out.weapons) && out.weapons.length > 0) {
    out.weaponRefs = out.weapons.map((w) => instanceRef('weapons', w.id))
  }

  if (out.armorRefs === undefined && Array.isArray(out.armor) && out.armor.length > 0) {
    out.armorRefs = out.armor.map((a) => instanceRef('armor', a.id))
  }

  if (out.magicItemRefs === undefined && Array.isArray(out.magicItems) && out.magicItems.length > 0) {
    out.magicItemRefs = out.magicItems.map((m) => ({ instanceId: m.id, ref: entryRef('magic-items', m.id) }))
  }

  if (out.conditionRefs === undefined && Array.isArray(out.conditions) && out.conditions.length > 0) {
    out.conditionRefs = out.conditions.map((c) => instanceRef('conditions', c.name.toLowerCase().replace(/\s+/g, '-')))
  }

  const state = out.state ? { ...out.state } : {}

  if (state.preparedSpellIds === undefined && out.knownSpellRefs && Array.isArray(out.preparedSpellIds)) {
    const flagged: Record<string, boolean> = {}
    const idToInstance = new Map(out.knownSpellRefs.map((i) => [i.ref.entryId, i.instanceId]))
    for (const id of out.preparedSpellIds) {
      const instance = idToInstance.get(id)
      if (instance) flagged[instance] = true
    }
    state.preparedSpellIds = flagged
  }

  if (state.weaponEquipped === undefined && out.weaponRefs && Array.isArray(out.weapons)) {
    const flagged: Record<string, boolean> = {}
    for (let i = 0; i < out.weapons.length; i++) {
      const legacyW = out.weapons[i] as unknown as { equipped?: boolean }
      if (legacyW.equipped) {
        const instance = out.weaponRefs[i]?.instanceId
        if (instance) flagged[instance] = true
      }
    }
    state.weaponEquipped = flagged
  }

  if (state.armorEquipped === undefined && out.armorRefs && Array.isArray(out.armor)) {
    const flagged: Record<string, boolean> = {}
    for (let i = 0; i < out.armor.length; i++) {
      if (out.armor[i].equipped) {
        const instance = out.armorRefs[i]?.instanceId
        if (instance) flagged[instance] = true
      }
    }
    state.armorEquipped = flagged
  }

  if (state.magicItemAttuned === undefined && out.magicItemRefs && Array.isArray(out.magicItems)) {
    const flagged: Record<string, boolean> = {}
    for (let i = 0; i < out.magicItems.length; i++) {
      const legacyM = out.magicItems[i]
      if (legacyM.attuned) {
        flagged[out.magicItemRefs[i].instanceId] = true
      }
    }
    state.magicItemAttuned = flagged
  }

  if (state.magicItemCharges === undefined && out.magicItemRefs && Array.isArray(out.magicItems)) {
    const charged: Record<string, number> = {}
    for (let i = 0; i < out.magicItems.length; i++) {
      const legacyM = out.magicItems[i]
      if (legacyM.charges?.current !== undefined) {
        charged[out.magicItemRefs[i].instanceId] = legacyM.charges.current
      }
    }
    state.magicItemCharges = charged
  }

  if (Object.keys(state).length > 0) {
    out.state = state
  }

  // Phase 15c.5 — v3 fields stay populated for now. The destructive strip was
  // reverted after best-judgment review: every level-up + game flow reads
  // `character.classes[0]?.name` / `character.classes.find(...)` directly,
  // and the per-file cascade to rewrite ~50 consumers cold (no tsc, no
  // vitest per the session directive) would have left the working tree
  // unworkable. v4 fields ARE populated additively; new code can read them.
  // 15c.5 effectively becomes "v4 canonical via additive shape + reader-side
  // hooks" — the strip + writer-cascade pushes to a future phase.
  return out as Character5e
}
