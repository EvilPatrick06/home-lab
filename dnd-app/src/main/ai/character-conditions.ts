/**
 * v4-aware condition helpers for the AI stat-mutation pipeline (PHASE-02 02B).
 *
 * Persisted characters are v4 (`CURRENT_SCHEMA_VERSION = 4`): the inline v3
 * `conditions` array is stripped on load/save, and condition state lives in
 * `conditionRefs[].ref.overrides` (`{name, type, isCustom, value?, duration?}`).
 * These pure helpers read/write that shape so mutations never touch the dead
 * inline array. No I/O, no Electron imports — runs under plain vitest.
 */
import type { Character5eV3 } from '../../shared/types/character-5e'
import type { ActiveCondition } from '../../shared/types/character-common'

interface ConditionOverrides {
  name?: string
  type?: 'condition' | 'buff'
  isCustom?: boolean
  value?: number
  duration?: number | 'permanent'
}
interface ConditionRefLike {
  instanceId: string
  ref: { entryType: string; entryId: string; overrides?: ConditionOverrides }
}

/** lowercase + spaces→hyphens — must byte-match the migration's slug transform. */
export function conditionSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

/** `'cursed-by-the-witch'` → `'Cursed By The Witch'` (display fallback). */
export function titleCaseSlug(slug: string): string {
  return slug.replace(/(^|[\s_-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

function refs(char: Character5eV3): ConditionRefLike[] {
  return ((char as unknown as { conditionRefs?: ConditionRefLike[] }).conditionRefs ?? []) as ConditionRefLike[]
}
function setRefs(char: Character5eV3, next: ConditionRefLike[]): void {
  ;(char as unknown as { conditionRefs?: ConditionRefLike[] }).conditionRefs = next
}
function legacyInline(char: Character5eV3): ActiveCondition[] {
  return ((char as unknown as { conditions?: ActiveCondition[] }).conditions ?? []) as ActiveCondition[]
}

/** Migrate any leftover inline `conditions` into refs (self-heal for records the
 *  old `add_exhaustion` polluted), then drop the inline field. */
function absorbLegacyInline(char: Character5eV3): void {
  const inline = legacyInline(char)
  const existing = refs(char)
  const present = new Set(existing.map((r) => r.ref.entryId))
  for (const c of inline) {
    const slug = conditionSlug(c.name)
    if (present.has(slug)) continue
    existing.push(makeRef(c.name, { value: c.value, duration: c.duration, type: c.type, isCustom: c.isCustom }))
    present.add(slug)
  }
  setRefs(char, existing)
  // v4 records carry NO inline conditions field — drop it whenever present (even
  // an empty array left by an un-migrated fixture) so nothing reads the dead shape.
  if ((char as unknown as { conditions?: unknown }).conditions !== undefined) {
    delete (char as unknown as { conditions?: unknown }).conditions
  }
}

function makeRef(
  name: string,
  meta: { value?: number; duration?: number | 'permanent'; type?: 'condition' | 'buff'; isCustom?: boolean }
): ConditionRefLike {
  const slug = conditionSlug(name)
  // Prefer a human display name; if the caller passed the bare slug (e.g. the
  // lowercase 'exhaustion' the apply step uses), title-case it.
  const display = name === slug ? titleCaseSlug(slug) : name
  return {
    instanceId: crypto.randomUUID(),
    ref: {
      entryType: 'conditions',
      entryId: slug,
      overrides: {
        name: display,
        type: meta.type ?? 'condition',
        isCustom: meta.isCustom ?? false,
        ...(meta.value !== undefined ? { value: meta.value } : {}),
        ...(meta.duration !== undefined ? { duration: meta.duration } : {})
      }
    }
  }
}

/** All active conditions, folding any legacy inline entries (read-only — does not
 *  mutate the record; the apply path calls the mutating helpers below). */
export function listConditions(char: Character5eV3): ActiveCondition[] {
  const fromRefs = refs(char).map((r) => ({
    name: r.ref.overrides?.name ?? titleCaseSlug(r.ref.entryId),
    type: (r.ref.overrides?.type ?? 'condition') as ActiveCondition['type'],
    isCustom: r.ref.overrides?.isCustom ?? false,
    ...(r.ref.overrides?.value !== undefined ? { value: r.ref.overrides.value } : {}),
    ...(r.ref.overrides?.duration !== undefined ? { duration: r.ref.overrides.duration } : {})
  })) as ActiveCondition[]
  const present = new Set(refs(char).map((r) => r.ref.entryId))
  for (const c of legacyInline(char)) {
    if (!present.has(conditionSlug(c.name))) fromRefs.push(c)
  }
  return fromRefs
}

export function hasCondition(char: Character5eV3, name: string): boolean {
  const slug = conditionSlug(name)
  return (
    refs(char).some((r) => r.ref.entryId === slug) || legacyInline(char).some((c) => conditionSlug(c.name) === slug)
  )
}

export function addConditionInstance(
  char: Character5eV3,
  cond: { name: string; value?: number; duration?: number | 'permanent' }
): void {
  absorbLegacyInline(char)
  const next = refs(char)
  next.push(makeRef(cond.name, { value: cond.value, duration: cond.duration }))
  setRefs(char, next)
}

/** Remove every instance matching `name` (by slug). Returns whether anything was removed. */
export function removeConditionInstance(char: Character5eV3, name: string): boolean {
  const slug = conditionSlug(name)
  const before = refs(char).length + legacyInline(char).length
  setRefs(
    char,
    refs(char).filter((r) => r.ref.entryId !== slug)
  )
  const inline = legacyInline(char).filter((c) => conditionSlug(c.name) !== slug)
  if (inline.length > 0 || (char as unknown as { conditions?: unknown }).conditions !== undefined) {
    ;(char as unknown as { conditions?: ActiveCondition[] }).conditions = inline
  }
  return refs(char).length + inline.length < before
}

/** Exhaustion-style numeric value. A present ref with no value counts as level 1. */
export function getConditionValue(char: Character5eV3, name: string): number | undefined {
  const slug = conditionSlug(name)
  const r = refs(char).find((x) => x.ref.entryId === slug)
  if (r) return r.ref.overrides?.value ?? 1
  const inline = legacyInline(char).find((c) => conditionSlug(c.name) === slug)
  if (inline) return inline.value ?? 1
  return undefined
}

/** Set the numeric value; `value <= 0` removes the instance; creates it if absent. */
export function setConditionValue(char: Character5eV3, name: string, value: number): void {
  if (value <= 0) {
    removeConditionInstance(char, name)
    return
  }
  absorbLegacyInline(char)
  const slug = conditionSlug(name)
  const list = refs(char)
  const existing = list.find((r) => r.ref.entryId === slug)
  if (existing) {
    existing.ref.overrides = { ...(existing.ref.overrides ?? {}), name: existing.ref.overrides?.name ?? name, value }
  } else {
    list.push(makeRef(name, { value }))
  }
  setRefs(char, list)
}
