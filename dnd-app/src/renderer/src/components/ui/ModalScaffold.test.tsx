// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ModalScaffold } from './ModalScaffold'

describe('ModalScaffold (PHASE-13 13L)', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ModalScaffold open={false} onClose={vi.fn()}>
        <p>hi</p>
      </ModalScaffold>
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a labelled modal dialog when open', () => {
    render(
      <ModalScaffold open onClose={vi.fn()} ariaLabel="Test Dialog">
        <button type="button">Inside</button>
      </ModalScaffold>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Test Dialog')
  })

  it('Escape calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ModalScaffold open onClose={onClose}>
        <button type="button">Inside</button>
      </ModalScaffold>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ModalScaffold open onClose={onClose}>
        <button type="button">Inside</button>
      </ModalScaffold>
    )
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('focuses initialFocusRef on open when provided', async () => {
    function Harness(): JSX.Element {
      const ref = useRef<HTMLButtonElement>(null)
      return (
        <ModalScaffold open onClose={vi.fn()} initialFocusRef={ref}>
          <button type="button">First</button>
          <button type="button" ref={ref}>
            Target
          </button>
        </ModalScaffold>
      )
    }
    render(<Harness />)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(document.activeElement).toBe(screen.getByText('Target'))
  })
})
