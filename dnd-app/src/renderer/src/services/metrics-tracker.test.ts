import { describe, expect, it } from 'vitest'
import {
  addPlaytime,
  createEmptyMetrics,
  formatPlaytime,
  incrementEncounter,
  incrementSession,
  trackDamage,
  trackHealing
} from './metrics-tracker'

describe('metrics-tracker', () => {
  it('creates empty metrics with all zeros', () => {
    const m = createEmptyMetrics()
    expect(m.sessionsPlayed).toBe(0)
    expect(m.totalPlaytimeSeconds).toBe(0)
    expect(m.encountersCompleted).toBe(0)
    expect(m.totalDamageDealt).toBe(0)
    expect(m.totalHealingDone).toBe(0)
    expect(m.lastSessionDate).toBeNull()
  })

  it('incrementSession bumps count and sets date', () => {
    const m = incrementSession(createEmptyMetrics())
    expect(m.sessionsPlayed).toBe(1)
    expect(m.lastSessionDate).toBeTruthy()
  })

  it('addPlaytime accumulates seconds', () => {
    let m = createEmptyMetrics()
    m = addPlaytime(m, 3600)
    m = addPlaytime(m, 1800)
    expect(m.totalPlaytimeSeconds).toBe(5400)
  })

  it('addPlaytime ignores negative values', () => {
    const m = addPlaytime(createEmptyMetrics(), -100)
    expect(m.totalPlaytimeSeconds).toBe(0)
  })

  it('incrementEncounter bumps count', () => {
    const m = incrementEncounter(createEmptyMetrics())
    expect(m.encountersCompleted).toBe(1)
  })

  it('trackDamage accumulates', () => {
    let m = createEmptyMetrics()
    m = trackDamage(m, 15)
    m = trackDamage(m, 8)
    expect(m.totalDamageDealt).toBe(23)
  })

  it('trackDamage ignores negative', () => {
    const m = trackDamage(createEmptyMetrics(), -5)
    expect(m.totalDamageDealt).toBe(0)
  })

  it('trackHealing accumulates', () => {
    let m = createEmptyMetrics()
    m = trackHealing(m, 10)
    m = trackHealing(m, 20)
    expect(m.totalHealingDone).toBe(30)
  })

  it('formatPlaytime shows minutes only when under 1 hour', () => {
    expect(formatPlaytime(1800)).toBe('30m')
  })

  it('formatPlaytime shows hours and minutes', () => {
    expect(formatPlaytime(5400)).toBe('1h 30m')
  })

  it('formatPlaytime handles zero', () => {
    expect(formatPlaytime(0)).toBe('0m')
  })

  it('does not mutate original metrics', () => {
    const original = createEmptyMetrics()
    incrementSession(original)
    expect(original.sessionsPlayed).toBe(0)
  })
})
