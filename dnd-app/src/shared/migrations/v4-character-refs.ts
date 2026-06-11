/**
 * Phase 15 — shared v3→v4 Character5e migration core (pure).
 *
 * Converts the legacy v3 inline-array Character5e shape (`classes`, `knownSpells`,
 * `preparedSpellIds`, `weapons`, `armor`, `magicItems`, `feats`, `conditions`) into the
 * canonical v4 shape (`*Ref(s)` + `state` siblings keyed by stable `instanceId`), then strips
 * the v3 inline arrays so they never reach the persisted shape.
 *
 * This is the single source of truth for the conversion, shared by:
 *  - the renderer runtime shim `migrateCharacter5eFromV3ToV4` (`types/character-5e-migration.ts`),
 *    which delegates here (its tests guard this logic),
 *  - main-process `MIGRATIONS[4]` (`main/storage/migrations.ts`), and
 *  - renderer `BACKUP_MIGRATIONS[4]` (`services/io/import-export.ts`).
 *
 * It is intentionally typed on plain records so it can run in the main process (Node) without
 * importing renderer types. It uses only `globalThis.crypto` + plain object ops — no I/O.
 *
 * Dormant until the v3.0.0 release: `CURRENT_SCHEMA_VERSION` stays 3 so `MIGRATIONS[4]` is not
 * reached at load. The renderer shim remains the active conversion path meanwhile.
 */

type Rec = Record<string, unknown>

let fallbackCounter = 0
function nextInstanceId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID()
  }
  fallbackCounter++
  return `instance-${fallbackCounter}`
}

function entryRef(entryType: string, entryId: string, overrides?: Rec): Rec {
  const ref: Rec = { entryType, entryId }
  if (overrides && Object.keys(overrides).length > 0) ref.overrides = overrides
  return ref
}

function instanceRef(entryType: string, entryId: string, overrides?: Rec): Rec {
  return { instanceId: nextInstanceId(), ref: entryRef(entryType, entryId, overrides) }
}

function asArray(v: unknown): Rec[] {
  return Array.isArray(v) ? (v as Rec[]) : []
}

/**
 * Pure v3→v4 conversion. Idempotent: if the v4 `*Ref(s)` field already exists it is left
 * untouched; the v3 inline arrays are always stripped from the output.
 */
export function migrateCharacter5eToRefs<T extends Rec>(character: T): T {
  const out: Rec = { ...character }

  if (out.speciesRef === undefined && typeof out.species === 'string') {
    out.speciesRef = entryRef('species', out.species)
  }
  if (out.subspeciesRef === undefined && typeof out.subspecies === 'string') {
    out.subspeciesRef = entryRef('species', out.subspecies)
  }
  if (out.backgroundRef === undefined && typeof out.background === 'string') {
    out.backgroundRef = entryRef('backgrounds', out.background)
  }

  const classes = asArray(out.classes)
  if (out.classRefs === undefined && classes.length > 0) {
    let levelTaken = 1
    out.classRefs = classes.map((c) => {
      const entryId = String(c.name ?? '').toLowerCase()
      const subclassRef = c.subclass ? entryRef('subclasses', String(c.subclass)) : null
      const item: Rec = {
        instanceId: nextInstanceId(),
        ref: entryRef('classes', entryId),
        level: c.level,
        levelTaken,
        subclassRef
      }
      levelTaken += Number(c.level ?? 0)
      return item
    })
  }

  const feats = asArray(out.feats)
  if (out.featRefs === undefined && feats.length > 0) {
    out.featRefs = feats.map((f) => instanceRef('feats', String(f.id)))
  }

  const knownSpells = asArray(out.knownSpells)
  if (out.knownSpellRefs === undefined && knownSpells.length > 0) {
    out.knownSpellRefs = knownSpells.map((s) => instanceRef('spells', String(s.id)))
  }

  const weapons = asArray(out.weapons)
  if (out.weaponRefs === undefined && weapons.length > 0) {
    // BUG-2 — builder/import weapons carry a random-UUID `id` (not a library
    // entryId), so the ref must carry the whole inline object as `overrides`.
    // Without it, hydrate (effective-character) finds neither a library entry NOR
    // overrides and DROPS the weapon: a freshly-built character's starting weapons
    // (Greataxe, Daggers) and weapon-form foci ("Arcane Focus (Quarterstaff)")
    // vanished from the sheet ("No weapons equipped"). Carrying overrides hydrates
    // them via hydrate's orphan/custom-entry branch.
    out.weaponRefs = weapons.map((w) => instanceRef('weapons', String(w.id), w))
  }

  const armor = asArray(out.armor)
  if (out.armorRefs === undefined && armor.length > 0) {
    // Same as weapons above — armor entries are inline objects with UUID ids, not
    // library refs, so they must travel as overrides or hydrate drops them.
    out.armorRefs = armor.map((a) => instanceRef('armor', String(a.id), a))
  }

  const magicItems = asArray(out.magicItems)
  if (out.magicItemRefs === undefined && magicItems.length > 0) {
    out.magicItemRefs = magicItems.map((m) => ({
      instanceId: String(m.id),
      ref: entryRef('magic-items', String(m.id))
    }))
  }

  const conditions = asArray(out.conditions)
  if (out.conditionRefs === undefined && conditions.length > 0) {
    out.conditionRefs = conditions.map((c) => {
      const slug = String(c.name ?? '')
        .toLowerCase()
        .replace(/\s+/g, '-')
      // Carry the condition's metadata as ref overrides so it survives migration,
      // hydration (incl. the orphan branch when no library entry exists), and the
      // renderer's rebuild-from-scratch condition edits — value/duration have no
      // other v4 home (PHASE-02 02A).
      return instanceRef('conditions', slug, {
        name: String(c.name ?? ''),
        type: c.type ?? 'condition',
        isCustom: c.isCustom ?? false,
        ...(c.value !== undefined ? { value: c.value } : {}),
        ...(c.duration !== undefined ? { duration: c.duration } : {})
      })
    })
  }

  const state: Rec = out.state ? { ...(out.state as Rec) } : {}
  const knownSpellRefs = asArray(out.knownSpellRefs)
  const weaponRefs = asArray(out.weaponRefs)
  const armorRefs = asArray(out.armorRefs)
  const magicItemRefs = asArray(out.magicItemRefs)

  if (state.preparedSpellIds === undefined && knownSpellRefs.length > 0 && Array.isArray(out.preparedSpellIds)) {
    const flagged: Record<string, boolean> = {}
    const idToInstance = new Map(knownSpellRefs.map((i) => [(i.ref as Rec).entryId, i.instanceId]))
    for (const id of out.preparedSpellIds as unknown[]) {
      const instance = idToInstance.get(id as string)
      if (instance) flagged[instance as string] = true
    }
    state.preparedSpellIds = flagged
  }

  if (state.weaponEquipped === undefined && weaponRefs.length > 0 && weapons.length > 0) {
    const flagged: Record<string, boolean> = {}
    for (let i = 0; i < weapons.length; i++) {
      if ((weapons[i] as { equipped?: boolean }).equipped) {
        const instance = weaponRefs[i]?.instanceId
        if (instance) flagged[instance as string] = true
      }
    }
    state.weaponEquipped = flagged
  }

  if (state.armorEquipped === undefined && armorRefs.length > 0 && armor.length > 0) {
    const flagged: Record<string, boolean> = {}
    for (let i = 0; i < armor.length; i++) {
      if ((armor[i] as { equipped?: boolean }).equipped) {
        const instance = armorRefs[i]?.instanceId
        if (instance) flagged[instance as string] = true
      }
    }
    state.armorEquipped = flagged
  }

  if (state.magicItemAttuned === undefined && magicItemRefs.length > 0 && magicItems.length > 0) {
    const flagged: Record<string, boolean> = {}
    for (let i = 0; i < magicItems.length; i++) {
      if ((magicItems[i] as { attuned?: boolean }).attuned) {
        flagged[magicItemRefs[i].instanceId as string] = true
      }
    }
    state.magicItemAttuned = flagged
  }

  if (state.magicItemCharges === undefined && magicItemRefs.length > 0 && magicItems.length > 0) {
    const charged: Record<string, number> = {}
    for (let i = 0; i < magicItems.length; i++) {
      const charges = (magicItems[i] as { charges?: { current?: number } }).charges
      if (charges?.current !== undefined) {
        charged[magicItemRefs[i].instanceId as string] = charges.current
      }
    }
    state.magicItemCharges = charged
  }

  if (Object.keys(state).length > 0) out.state = state

  // Strip the legacy v3 inline arrays now that v4 (refs + state) is derived.
  delete out.classes
  delete out.knownSpells
  delete out.preparedSpellIds
  delete out.weapons
  delete out.armor
  delete out.magicItems
  delete out.feats
  delete out.conditions

  return out as T
}
