import type { Character5e, InstanceRef } from './character-5e'
import type { EntryRef } from './library'

// Phase 15c.1 — type-shim migration from v3 inline fields to v4 *Refs + state.
//
// 15c.5 will remove the legacy v3 fields from Character5e and this shim
// alongside; until then it lets consumers that have flipped to the v4 shape
// see fresh refs derived from any legacy v3 character that hasn't been
// re-saved yet. The on-disk migration (15a Steps 12-18, now in 15h) calls
// this same shim before the save returns to the renderer.
//
// Idempotent: a Character5e already carrying v4 fields is returned unchanged.

function nextInstanceId(): string {
  // Use crypto.randomUUID where available (browser + Node 19+), fall back to a
  // simple counter for older runtimes. The fallback keeps tests deterministic
  // enough — production always has crypto.
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
  const out = { ...character }

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

  // Derive instance-state maps once the *Refs are in place.
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
      // Source field was on the legacy WeaponEntry shape; not every weapon has it.
      const legacy = out.weapons[i] as unknown as { equipped?: boolean }
      if (legacy.equipped) {
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
      const legacy = out.magicItems[i]
      if (legacy.attuned) {
        flagged[out.magicItemRefs[i].instanceId] = true
      }
    }
    state.magicItemAttuned = flagged
  }

  if (state.magicItemCharges === undefined && out.magicItemRefs && Array.isArray(out.magicItems)) {
    const charged: Record<string, number> = {}
    for (let i = 0; i < out.magicItems.length; i++) {
      const legacy = out.magicItems[i]
      if (legacy.charges?.current !== undefined) {
        charged[out.magicItemRefs[i].instanceId] = legacy.charges.current
      }
    }
    state.magicItemCharges = charged
  }

  if (Object.keys(state).length > 0) {
    out.state = state
  }

  return out
}
