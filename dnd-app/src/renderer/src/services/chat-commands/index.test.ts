import { describe, expect, it } from 'vitest'
import { allCommands } from './index'
import type { ChatCommand } from './types'

// Standing collision guard (PHASE-09 09C). The registry resolves commands with a
// first-match linear scan (`index.ts` executeCommand), so a duplicate name or a
// colliding alias silently shadows a real command. These assertions fail CI the
// moment any module reintroduces a collision — the failure mode that let 41 dead
// registrations accumulate before this phase.

const VALID_CATEGORIES = new Set(['player', 'dm', 'ai'])

// Mimic the runtime resolver (`index.ts:171`) so the regression checks below
// resolve a name exactly the way executeCommand would at runtime.
function resolve(name: string): ChatCommand | undefined {
  return allCommands.find((c) => c.name === name || c.aliases.includes(name))
}

describe('chat-command registry', () => {
  it('registers at least one command', () => {
    expect(allCommands.length).toBeGreaterThan(0)
  })

  it('has no duplicate command names', () => {
    const seen = new Map<string, number>()
    for (const c of allCommands) seen.set(c.name, (seen.get(c.name) ?? 0) + 1)
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([name, n]) => `${name} ×${n}`)
    expect(dupes, `duplicate command names: ${dupes.join(', ')}`).toEqual([])
  })

  it('has no alias registered more than once', () => {
    const seen = new Map<string, string[]>()
    for (const c of allCommands) {
      for (const a of c.aliases) {
        seen.set(a, [...(seen.get(a) ?? []), c.name])
      }
    }
    const dupes = [...seen.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([a, owners]) => `${a} → ${owners.join(', ')}`)
    expect(dupes, `aliases registered on multiple commands: ${dupes.join('; ')}`).toEqual([])
  })

  it('has no alias that collides with a command name', () => {
    const names = new Set(allCommands.map((c) => c.name))
    const collisions: string[] = []
    for (const c of allCommands) {
      for (const a of c.aliases) {
        if (names.has(a)) collisions.push(`${a} (alias of ${c.name}, also a command name)`)
      }
    }
    expect(collisions, `alias/name collisions: ${collisions.join('; ')}`).toEqual([])
  })

  it('every command has a well-formed shape', () => {
    for (const c of allCommands) {
      expect(typeof c.name, `name on ${JSON.stringify(c.name)}`).toBe('string')
      expect(c.name.length, `non-empty name`).toBeGreaterThan(0)
      expect(typeof c.description, `description on /${c.name}`).toBe('string')
      expect(c.description.length, `non-empty description on /${c.name}`).toBeGreaterThan(0)
      expect(typeof c.usage, `usage on /${c.name}`).toBe('string')
      expect(c.usage.length, `non-empty usage on /${c.name}`).toBeGreaterThan(0)
      expect(Array.isArray(c.aliases), `aliases array on /${c.name}`).toBe(true)
      expect(typeof c.dmOnly, `dmOnly boolean on /${c.name}`).toBe('boolean')
      expect(VALID_CATEGORIES.has(c.category), `known category on /${c.name} (got ${c.category})`).toBe(true)
      expect(typeof c.execute, `execute fn on /${c.name}`).toBe('function')
    }
  })

  // Regression guards for the two alias-shadowing bugs + the /attack stub fixed in 09B.
  it('resolves /stabilize to the player Medicine-check command (not the DM revive)', () => {
    const cmd = resolve('stabilize')
    expect(cmd?.name).toBe('stabilize')
    expect(cmd?.dmOnly).toBe(false)
  })

  it('resolves /attack to the full attack pipeline (not the deleted stub)', () => {
    const cmd = resolve('attack')
    expect(cmd?.name).toBe('attack')
    expect(cmd?.usage).toBe('/attack <weapon> <target>')
  })

  it('resolves /light to the DM map-light command (not the player torch)', () => {
    const cmd = resolve('light')
    expect(cmd?.name).toBe('light')
    expect(cmd?.dmOnly).toBe(true)
  })
})
