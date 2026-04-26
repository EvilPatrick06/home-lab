import { describe, expect, it, beforeEach } from 'vitest'
import { _resetSaveQueueForTest, withSaveLock } from './save-queue'

describe('withSaveLock', () => {
  beforeEach(() => {
    _resetSaveQueueForTest()
  })

  it('runs a single fn to completion', async () => {
    let ran = false
    const result = await withSaveLock('test', 'a', async () => {
      ran = true
      return 42
    })
    expect(ran).toBe(true)
    expect(result).toBe(42)
  })

  it('serializes concurrent calls with the same (scope, id)', async () => {
    const order: string[] = []
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const a = withSaveLock('character', 'id-1', async () => {
      order.push('A:start')
      await sleep(20)
      order.push('A:end')
    })
    const b = withSaveLock('character', 'id-1', async () => {
      order.push('B:start')
      await sleep(5)
      order.push('B:end')
    })

    await Promise.all([a, b])

    // B must wait for A to finish before starting
    expect(order).toEqual(['A:start', 'A:end', 'B:start', 'B:end'])
  })

  it('runs concurrently for different ids in the same scope', async () => {
    const order: string[] = []
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const a = withSaveLock('character', 'id-1', async () => {
      order.push('A:start')
      await sleep(20)
      order.push('A:end')
    })
    const b = withSaveLock('character', 'id-2', async () => {
      order.push('B:start')
      await sleep(5)
      order.push('B:end')
    })

    await Promise.all([a, b])

    // Different ids can interleave; B (shorter) finishes first
    expect(order[0]).toBe('A:start')
    expect(order[1]).toBe('B:start')
    expect(order[2]).toBe('B:end')
    expect(order[3]).toBe('A:end')
  })

  it('runs concurrently for different scopes with the same id', async () => {
    const order: string[] = []
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const a = withSaveLock('character', 'shared-id', async () => {
      order.push('A:start')
      await sleep(20)
      order.push('A:end')
    })
    const b = withSaveLock('campaign', 'shared-id', async () => {
      order.push('B:start')
      await sleep(5)
      order.push('B:end')
    })

    await Promise.all([a, b])

    expect(order[0]).toBe('A:start')
    expect(order[1]).toBe('B:start')
    expect(order[2]).toBe('B:end')
    expect(order[3]).toBe('A:end')
  })

  it("propagates fn errors but doesn't poison the lock", async () => {
    await expect(
      withSaveLock('test', 'b', async () => {
        throw new Error('oops')
      })
    ).rejects.toThrow('oops')

    // Subsequent caller for the same key works normally
    const result = await withSaveLock('test', 'b', async () => 'recovered')
    expect(result).toBe('recovered')
  })

  it('runs the next caller even when the previous one threw', async () => {
    const order: string[] = []
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const a = withSaveLock('test', 'c', async () => {
      order.push('A:start')
      await sleep(10)
      order.push('A:throw')
      throw new Error('A failed')
    }).catch((e) => order.push(`A:caught:${(e as Error).message}`))

    const b = withSaveLock('test', 'c', async () => {
      order.push('B:start')
      return 'ok'
    })

    await Promise.all([a, b])

    // A starts and throws first; the queue chain kicks B off as soon as A
    // settles, and microtask ordering interleaves B's first sync push between
    // A's throw and the user's `.catch` callback. The important property is
    // that B *did* run after A — not poisoned by A's error.
    expect(order[0]).toBe('A:start')
    expect(order[1]).toBe('A:throw')
    expect(order).toContain('A:caught:A failed')
    expect(order).toContain('B:start')
    // A's body finishes (last "A:" entry) strictly before B's body starts
    const lastA = order.lastIndexOf('A:throw')
    const firstB = order.indexOf('B:start')
    expect(firstB).toBeGreaterThan(lastA)
  })
})
