import { describe, expect, it } from 'vitest'
import { fateCheck, parseLikelihood, type Rng, renderOracleBlock, sceneTest } from './oracle'

// Scripted RNG: each call returns the next queued [0,1) value (0 after exhaustion).
// rollDie(n) = floor(rng()*n)+1, so 0.77 → d100 78; 0.08 → d100 9; 0.0 → 1.
function rng(...vals: number[]): Rng {
  let i = 0
  return () => vals[i++] ?? 0
}

describe('fateCheck — threshold math', () => {
  it('shifts the even (50) target by ±5 per chaos step, clamped 1..99', () => {
    expect(fateCheck('q', 'even', 5, rng(0.5)).threshold).toBe(50)
    expect(fateCheck('q', 'even', 1, rng(0.5)).threshold).toBe(30) // 50 + (1-5)*5
    expect(fateCheck('q', 'even', 9, rng(0.5)).threshold).toBe(70) // 50 + (9-5)*5
    expect(fateCheck('q', 'likely', 5, rng(0.5)).threshold).toBe(65)
    expect(fateCheck('q', 'impossible', 1, rng(0.5)).threshold).toBe(1) // 5-20 → clamp 1
  })

  it('clamps the chaos factor to 1..9', () => {
    expect(fateCheck('q', 'even', 20, rng(0.5)).chaos).toBe(9)
    expect(fateCheck('q', 'even', 0, rng(0.5)).chaos).toBe(1)
    expect(fateCheck('q', 'even', -3, rng(0.5)).threshold).toBe(30) // clamps to chaos 1
  })
})

describe('fateCheck — yes/no + exceptional bands', () => {
  it('answers no for a roll above the threshold', () => {
    const r = fateCheck('Is the bridge guarded?', 'even', 5, rng(0.77)) // roll 78 vs 50
    expect(r.roll).toBe(78)
    expect(r.answer).toBe('no')
  })

  it('flags exceptional yes at/below ceil(threshold/5)', () => {
    // even chaos 5 → threshold 50, exceptional-yes edge = 10
    expect(fateCheck('q', 'even', 5, rng(0.08)).answer).toBe('exceptional-yes') // roll 9
    expect(fateCheck('q', 'even', 5, rng(0.13)).answer).toBe('yes') // roll 14 (>10, ≤50)
  })

  it('flags exceptional no above threshold + 4/5 of the remainder', () => {
    // even chaos 5 → threshold 50, exceptional-no edge = 50 + 40 = 90
    expect(fateCheck('q', 'even', 5, rng(0.9)).answer).toBe('exceptional-no') // roll 91
    expect(fateCheck('q', 'even', 5, rng(0.89)).answer).toBe('no') // roll 90 (not > 90)
  })
})

describe('fateCheck — random-event (doubles) gating', () => {
  it('does NOT trigger when the double digit exceeds chaos', () => {
    const r = fateCheck('q', 'even', 1, rng(0.21)) // roll 22, digit 2 > chaos 1
    expect(r.roll).toBe(22)
    expect(r.randomEvent).toBeUndefined()
  })

  it('triggers and rolls focus/meaning when the double digit ≤ chaos', () => {
    const r = fateCheck('q', 'even', 5, rng(0.21, 0.4, 0, 0.1)) // roll 22; digit 2 ≤ 5
    expect(r.randomEvent).toBeDefined()
    expect(r.randomEvent?.focus).toBe('faction-moves') // floor(0.4*10)+1 = 5 → index 4
    expect(r.randomEvent?.meaning[0]).toBe('betray') // floor(0*20)+1 = 1 → index 0
    expect(r.randomEvent?.meaning[1]).toBe('rumor') // floor(0.1*20)+1 = 3 → index 2
  })
})

describe('sceneTest', () => {
  it('odd roll ≤ chaos ⇒ altered', () => {
    expect(sceneTest(5, rng(0.0))).toEqual({ roll: 1, result: 'altered' })
  })
  it('even roll ≤ chaos ⇒ interrupt', () => {
    expect(sceneTest(5, rng(0.1))).toEqual({ roll: 2, result: 'interrupt' })
  })
  it('roll > chaos ⇒ as-planned', () => {
    expect(sceneTest(2, rng(0.5))).toEqual({ roll: 6, result: 'as-planned' })
  })
})

describe('parseLikelihood', () => {
  it('accepts canonical tokens and the 50/50 alias', () => {
    expect(parseLikelihood('50/50')).toBe('even')
    expect(parseLikelihood('Very-Likely')).toBe('very-likely')
    expect(parseLikelihood('sure-thing')).toBe('sure-thing')
  })
  it('rejects unknown tokens', () => {
    expect(parseLikelihood('maybe')).toBeNull()
  })
})

describe('renderOracleBlock', () => {
  it('returns empty string with no entries', () => {
    expect(renderOracleBlock([])).toBe('')
  })

  it('renders the full roll math + event line', () => {
    const a = fateCheck('Is the bridge guarded?', 'even', 5, rng(0.77)) // NO, roll 78
    const b = fateCheck('Does the captain notice?', 'even', 5, rng(0.21, 0.4, 0, 0)) // roll 22 + event
    const block = renderOracleBlock([a, b])
    expect(block).toContain('[ORACLE]')
    expect(block).toContain('Q: "Is the bridge guarded?" → NO (rolled 78 vs 50, chaos 5)')
    expect(block).toContain('+ EVENT: faction-moves — betray / ally')
    expect(block).toContain('[/ORACLE]')
  })
})
