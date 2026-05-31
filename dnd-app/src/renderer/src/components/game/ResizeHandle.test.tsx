// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ResizeHandle from './ResizeHandle'

describe('ResizeHandle', () => {
  it('can be imported', async () => {
    const mod = await import('./ResizeHandle')
    expect(mod).toBeDefined()
  })

  it('exposes a focusable separator with the orientation matching its drag axis', () => {
    const { rerender } = render(<ResizeHandle direction="horizontal" onResize={vi.fn()} />)
    const sep = screen.getByRole('separator')
    // A col-resize (horizontal) handle is a VERTICAL separator (divides left/right).
    expect(sep.getAttribute('aria-orientation')).toBe('vertical')
    expect(sep.tabIndex).toBe(0)
    rerender(<ResizeHandle direction="vertical" onResize={vi.fn()} />)
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('resizes via Left/Right arrows on a horizontal (col-resize) handle', () => {
    const onResize = vi.fn()
    render(<ResizeHandle direction="horizontal" onResize={onResize} />)
    const sep = screen.getByRole('separator')
    fireEvent.keyDown(sep, { key: 'ArrowRight' })
    expect(onResize).toHaveBeenLastCalledWith(16)
    fireEvent.keyDown(sep, { key: 'ArrowLeft' })
    expect(onResize).toHaveBeenLastCalledWith(-16)
    fireEvent.keyDown(sep, { key: 'ArrowRight', shiftKey: true })
    expect(onResize).toHaveBeenLastCalledWith(48)
    // Up/Down are inert on a horizontal handle.
    fireEvent.keyDown(sep, { key: 'ArrowUp' })
    expect(onResize).toHaveBeenCalledTimes(3)
  })

  it('resizes via Up/Down arrows on a vertical (row-resize) handle', () => {
    const onResize = vi.fn()
    render(<ResizeHandle direction="vertical" onResize={onResize} />)
    const sep = screen.getByRole('separator')
    fireEvent.keyDown(sep, { key: 'ArrowDown' })
    expect(onResize).toHaveBeenLastCalledWith(16)
    fireEvent.keyDown(sep, { key: 'ArrowUp' })
    expect(onResize).toHaveBeenLastCalledWith(-16)
    // Left/Right are inert on a vertical handle.
    fireEvent.keyDown(sep, { key: 'ArrowLeft' })
    expect(onResize).toHaveBeenCalledTimes(2)
  })
})
