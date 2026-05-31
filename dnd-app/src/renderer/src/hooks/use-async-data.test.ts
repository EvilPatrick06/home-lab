// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAsyncData } from './use-async-data'

describe('useAsyncData', () => {
  it('starts loading, then resolves with data', async () => {
    const { result } = renderHook(() => useAsyncData(() => Promise.resolve('hello'), []))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('hello')
    expect(result.current.error).toBeUndefined()
  })

  it('captures a rejection as error and stops loading', async () => {
    const { result } = renderHook(() => useAsyncData(() => Promise.reject(new Error('boom')), []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.message).toBe('boom')
    expect(result.current.data).toBeUndefined()
  })

  it('drops a stale in-flight result when deps change (no overwrite of the newer value)', async () => {
    let resolveFirst: (v: string) => void = () => {}
    const first = new Promise<string>((r) => {
      resolveFirst = r
    })
    const loaders: Array<() => Promise<string>> = [() => first, () => Promise.resolve('second')]
    let i = 0
    const { result, rerender } = renderHook(({ k }) => useAsyncData(() => loaders[i](), [k]), {
      initialProps: { k: 0 }
    })
    // Switch to the second loader before the first resolves.
    i = 1
    rerender({ k: 1 })
    await waitFor(() => expect(result.current.data).toBe('second'))
    // The stale first loader resolves AFTER the swap — must not clobber 'second'.
    resolveFirst('first')
    await Promise.resolve()
    expect(result.current.data).toBe('second')
  })

  it('aborts the previous run signal when deps change', async () => {
    const seen: AbortSignal[] = []
    const { rerender } = renderHook(
      ({ k }) =>
        useAsyncData(
          (signal) => {
            seen.push(signal)
            return Promise.resolve(k)
          },
          [k]
        ),
      { initialProps: { k: 0 } }
    )
    rerender({ k: 1 })
    await waitFor(() => expect(seen.length).toBe(2))
    expect(seen[0].aborted).toBe(true) // first run's signal aborted on dep change
    expect(seen[1].aborted).toBe(false)
  })
})
