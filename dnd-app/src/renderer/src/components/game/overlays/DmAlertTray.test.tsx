// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import DmAlertTray, { clearDmAlerts, pushDmAlert } from './DmAlertTray'

describe('DmAlertTray', () => {
  afterEach(() => clearDmAlerts())

  it('can be imported', async () => {
    const mod = await import('./DmAlertTray')
    expect(mod).toBeDefined()
  })

  it('toggles the panel and reflects state in aria-expanded (F13)', () => {
    render(<DmAlertTray />)
    const badge = screen.getByRole('button', { name: /Alerts/i })
    expect(badge.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(badge)
    expect(badge.getAttribute('aria-expanded')).toBe('true')
    expect(badge.getAttribute('aria-controls')).toBeTruthy()
  })

  it('Escape closes the open panel', () => {
    render(<DmAlertTray />)
    const badge = screen.getByRole('button', { name: /Alerts/i })
    fireEvent.click(badge)
    expect(badge.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(badge.getAttribute('aria-expanded')).toBe('false')
  })

  it('outside pointerdown closes the panel; inside does not', () => {
    pushDmAlert('info', 'hello world')
    render(<DmAlertTray />)
    const badge = screen.getByRole('button', { name: /Alerts/i })
    fireEvent.click(badge)
    expect(badge.getAttribute('aria-expanded')).toBe('true')

    // Click inside the panel — stays open.
    fireEvent.pointerDown(screen.getByText('hello world'))
    expect(badge.getAttribute('aria-expanded')).toBe('true')

    // Click outside — closes.
    fireEvent.pointerDown(document.body)
    expect(badge.getAttribute('aria-expanded')).toBe('false')
  })
})
