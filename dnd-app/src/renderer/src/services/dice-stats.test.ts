import { describe, expect, it } from 'vitest'
import type { DiceRollRecord } from '../types/game-state'
import { computeDiceStats, countD20Dice, d20FacesFromRoll, luckSummaryLine } from './dice-stats'

function roll(partial: Partial<DiceRollRecord>): DiceRollRecord {
  return {
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    rollerName: 'Gavin',
    formula: '1d20',
    rolls: [10],
    total: 10,
    isCritical: false,
    isFumble: false,
    ...partial
  }
}

describe('countD20Dice', () => {
  it('counts single and multiple d20 dice', () => {
    expect(countD20Dice('1d20')).toBe(1)
    expect(countD20Dice('d20+5')).toBe(1)
    expect(countD20Dice('2d20kh1')).toBe(2)
  })
  it('ignores non-d20 dice', () => {
    expect(countD20Dice('1d8+3')).toBe(0)
    expect(countD20Dice('3d6')).toBe(0)
  })
})

describe('d20FacesFromRoll', () => {
  it('harvests faces from a pure d20 roll', () => {
    expect(d20FacesFromRoll(roll({ formula: '1d20+5', rolls: [18] }))).toEqual([18])
    expect(d20FacesFromRoll(roll({ formula: '2d20kh1', rolls: [3, 19] }))).toEqual([3, 19])
  })
  it('skips mixed formulas it cannot attribute', () => {
    expect(d20FacesFromRoll(roll({ formula: '1d20+2d6', rolls: [15, 4, 2] }))).toEqual([])
  })
  it('returns nothing for non-d20 rolls', () => {
    expect(d20FacesFromRoll(roll({ formula: '1d8', rolls: [7] }))).toEqual([])
  })
})

describe('computeDiceStats', () => {
  it('tallies per-player d20 histograms, nat-20s and nat-1s', () => {
    const history = [
      roll({ rollerName: 'Gavin', formula: '1d20', rolls: [20], isCritical: true }),
      roll({ rollerName: 'Gavin', formula: '1d20', rolls: [1], isFumble: true }),
      roll({ rollerName: 'Gavin', formula: '1d20', rolls: [10] }),
      roll({ rollerName: 'Priya', formula: '1d20', rolls: [8] })
    ]
    const stats = computeDiceStats(history)
    expect(stats.totalRolls).toBe(4)
    expect(stats.totalD20).toBe(4)
    expect(stats.totalNat20).toBe(1)
    expect(stats.totalNat1).toBe(1)

    const gavin = stats.perPlayer.find((p) => p.rollerName === 'Gavin')!
    expect(gavin.d20Count).toBe(3)
    expect(gavin.nat20).toBe(1)
    expect(gavin.nat1).toBe(1)
    expect(gavin.d20Histogram[20]).toBe(1)
    expect(gavin.d20Histogram[10]).toBe(1)
    // avg of 20,1,10 = 10.333…
    expect(gavin.d20Average).toBeCloseTo(31 / 3, 5)
  })

  it('identifies luckiest and unluckiest players', () => {
    const history = [
      roll({ rollerName: 'Lucky', formula: '1d20', rolls: [19] }),
      roll({ rollerName: 'Lucky', formula: '1d20', rolls: [17] }),
      roll({ rollerName: 'Cursed', formula: '1d20', rolls: [3] }),
      roll({ rollerName: 'Cursed', formula: '1d20', rolls: [5] })
    ]
    const stats = computeDiceStats(history)
    expect(stats.luckiest?.rollerName).toBe('Lucky')
    expect(stats.unluckiest?.rollerName).toBe('Cursed')
    expect(stats.luckiest!.luck).toBeGreaterThan(0)
    expect(stats.unluckiest!.luck).toBeLessThan(0)
  })

  it('returns null luckiest with no d20 data', () => {
    const stats = computeDiceStats([roll({ formula: '1d8', rolls: [4] })])
    expect(stats.totalD20).toBe(0)
    expect(stats.luckiest).toBeNull()
  })
})

describe('luckSummaryLine', () => {
  it('summarizes a hot and cold roller', () => {
    const stats = computeDiceStats([
      roll({ rollerName: 'Gavin', formula: '1d20', rolls: [20], isCritical: true }),
      roll({ rollerName: 'Gavin', formula: '1d20', rolls: [18] }),
      roll({ rollerName: 'Priya', formula: '1d20', rolls: [4] })
    ])
    const line = luckSummaryLine(stats)
    expect(line).toContain('Gavin')
    expect(line).toContain('nat-20')
    expect(line).toContain('Priya')
  })
  it('is empty with no d20 data', () => {
    expect(luckSummaryLine(computeDiceStats([]))).toBe('')
  })
})
