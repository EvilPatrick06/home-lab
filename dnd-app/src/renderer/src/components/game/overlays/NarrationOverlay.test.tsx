// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NarrationOverlay from './NarrationOverlay'

afterEach(() => vi.useRealTimers())

describe('NarrationOverlay dialog semantics (PHASE-10 10I)', () => {
  it('renders a labelled modal dialog', () => {
    render(<NarrationOverlay text="The cavern echoes." onDismiss={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBeTruthy()
  })

  it('moves focus to the close button on open', () => {
    render(<NarrationOverlay text="x" onDismiss={vi.fn()} />)
    const closeBtn = screen.getByTitle('Dismiss')
    expect(document.activeElement).toBe(closeBtn)
  })

  it('wraps the narration in a bounded, scrollable, focusable region', () => {
    render(<NarrationOverlay text="A very long scene…" onDismiss={vi.fn()} />)
    const para = screen.getByText('A very long scene…')
    const wrapper = para.parentElement as HTMLElement
    expect(wrapper.className).toContain('max-h-[60vh]')
    expect(wrapper.className).toContain('overflow-y-auto')
    expect(wrapper.getAttribute('tabindex')).toBe('0')
  })

  it('Escape dismisses after the fade delay', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<NarrationOverlay text="x" onDismiss={onDismiss} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
