// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from './index'
import { useT } from './use-translation'

describe('useT', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('resolves keys', () => {
    const { result } = renderHook(() => useT())
    expect(result.current.t('common.actions.save')).toBe('Save')
  })

  // Regression for the LibraryPage React #185 infinite-render crash: `useT()`
  // used to return a brand-new `t` every render, so any `useEffect([..., t])`
  // that also setState looped forever. `t` MUST be referentially stable across
  // re-renders (it only changes on a language change).
  it('returns a referentially stable `t` across re-renders', () => {
    const { result, rerender } = renderHook(() => useT())
    const first = result.current.t
    rerender()
    rerender()
    expect(result.current.t).toBe(first)
  })
})
