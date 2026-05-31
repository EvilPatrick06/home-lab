// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEquipmentData } from './use-equipment-data'

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

// Mirrors the real caller pattern (defense-utils / WeaponList5e / equipment-utils /
// CraftingSection5e): a fresh inline loader is created INSIDE the component's
// render on every render. The hook must still load exactly once.
function Probe({ onLoad }: { onLoad: () => void }): JSX.Element {
  const data = useEquipmentData<string[]>(() => {
    onLoad()
    return Promise.resolve(['sword', 'axe'])
  }, [])
  return <div data-testid="count">{data.length}</div>
}

describe('useEquipmentData', () => {
  it('exports a function', () => {
    expect(typeof useEquipmentData).toBe('function')
  })

  // Regression: previously the effect depended on `[loader]`. Because every
  // render builds a NEW inline loader, the effect re-fired → setData → re-render
  // → new loader → effect again: an unbounded async render loop that froze the
  // Character Sheet (no console error — the setState is async so React's
  // update-depth guard never trips). Guard: the loader must run ONCE even though
  // its identity changes on the setData-triggered re-render.
  it('runs the loader exactly once despite a fresh inline loader each render', async () => {
    const onLoad = vi.fn()
    render(<Probe onLoad={onLoad} />)
    // Wait for the load + the setData-triggered re-render to settle.
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'))
    // A few extra ticks: if the effect were keyed on the unstable loader it would
    // keep re-firing here.
    await new Promise((r) => setTimeout(r, 30))
    expect(onLoad).toHaveBeenCalledTimes(1)
  })

  it('returns the initial value before the loader resolves', () => {
    render(<Probe onLoad={() => undefined} />)
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})
