import { describe, expect, it } from 'vitest'
import shortcuts from '../../public/data/ui/keyboard-shortcuts.json'

type Sc = { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; action: string }
const combo = (s: Sc) => `${s.key.toLowerCase()}|${!!s.ctrl}|${!!s.shift}|${!!s.alt}`

describe('keyboard-shortcuts.json defaults (PHASE-48 F3/F5)', () => {
  const defs = shortcuts as Sc[]

  it('binds toggle-journal and open-dice to distinct in-use keys (j / t) — so a rebind to "t" conflicts', () => {
    const journal = defs.find((s) => s.action === 'toggle-journal')
    const dice = defs.find((s) => s.action === 'open-dice')
    expect(journal?.key).toBe('j')
    expect(dice?.key).toBe('t')
    // hasConflict('toggle-journal', {key:'t'}) would match open-dice → swap modal fires.
    expect(combo(journal as Sc)).not.toBe(combo(dice as Sc))
  })

  it('has no two defaults on an identical key+modifier combo (F5: c vs Shift+C are distinct)', () => {
    const seen = new Map<string, string>()
    for (const s of defs) {
      const id = combo(s)
      expect(seen.has(id), `duplicate default combo ${id}: ${seen.get(id)} vs ${s.action}`).toBe(false)
      seen.set(id, s.action)
    }
    // sanity: the two "c" entries are c (focus-chat) and Shift+C (center-on-me)
    const cEntries = defs.filter((s) => s.key.toLowerCase() === 'c')
    expect(cEntries.map((s) => combo(s)).sort()).toEqual(['c|false|false|false', 'c|false|true|false'])
  })
})
