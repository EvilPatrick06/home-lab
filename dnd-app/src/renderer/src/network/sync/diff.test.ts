import { describe, expect, it } from 'vitest'
import { applyDelta, deepEqual, structuralDiff } from './diff'

function roundTrip<T>(prev: T, next: T): void {
  const d = structuralDiff(prev, next)
  if (d === null) {
    expect(deepEqual(prev, next)).toBe(true)
    return
  }
  expect(applyDelta(prev, d)).toEqual(next)
}

describe('structuralDiff / applyDelta (Phase 31b)', () => {
  it('returns null for deep-equal values', () => {
    expect(structuralDiff({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBeNull()
    expect(structuralDiff(5, 5)).toBeNull()
  })

  it('replace for primitives + type changes', () => {
    expect(structuralDiff(1, 2)).toEqual({ kind: 'replace', payload: 2, sequence: 0 })
    roundTrip(1, 2)
    roundTrip('a', 'b')
    roundTrip(5 as unknown, { a: 1 } as unknown)
  })

  it('object patch round-trips (set, change, delete keys)', () => {
    roundTrip({ a: 1, b: 2 }, { a: 1, b: 3 })
    roundTrip({ a: 1 }, { a: 1, b: 2 })
    roundTrip({ a: 1, b: 2 }, { a: 1 })
    roundTrip({ nested: { x: 1, y: 2 } }, { nested: { x: 9, y: 2 } })
  })

  it('array-of-records patch round-trips (add, remove, update, reorder)', () => {
    const prev = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 3 }
    ]
    roundTrip(prev, [
      { id: 'b', n: 2 },
      { id: 'a', n: 1 },
      { id: 'c', n: 3 }
    ]) // reorder
    roundTrip(prev, [
      { id: 'a', n: 1 },
      { id: 'b', n: 99 }
    ]) // update + remove c
    roundTrip(prev, [...prev, { id: 'd', n: 4 }]) // add
    roundTrip([], [{ id: 'a', n: 1 }]) // empty → populated
    roundTrip(prev, []) // populated → empty
  })

  it('non-record arrays replace', () => {
    const d = structuralDiff([1, 2, 3], [1, 2, 4])
    expect(d?.kind).toBe('replace')
    roundTrip([1, 2, 3], [1, 2, 4])
  })

  it('round-trips fuzzed nested structures', () => {
    const samples: unknown[] = [
      { hp: { current: 10, max: 20 }, tokens: [{ id: 't1', x: 1 }] },
      {
        hp: { current: 5, max: 20 },
        tokens: [
          { id: 't1', x: 2 },
          { id: 't2', x: 0 }
        ],
        extra: true
      },
      { hp: { current: 5, max: 20 }, tokens: [] },
      { tokens: [{ id: 't2', x: 0 }] }
    ]
    for (let i = 0; i < samples.length; i++) {
      for (let j = 0; j < samples.length; j++) {
        roundTrip(samples[i], samples[j])
      }
    }
  })
})
