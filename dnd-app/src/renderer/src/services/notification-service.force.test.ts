// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notify, setEnabled, setEventEnabled, setOnlyWhenBlurred } from './notification-service'

// Minimal Notification stub so isSupported() (typeof Notification !== 'undefined'
// && permission === 'granted') passes and notify() can construct one.
class MockNotification {
  static permission = 'granted'
  onclick: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor(
    public title: string,
    public opts?: unknown
  ) {}
  close(): void {}
}

describe('notify — focus gate + force bypass (taskId-13)', () => {
  beforeEach(() => {
    vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification)
    setEnabled(true)
    setEventEnabled('your-turn', true)
    setOnlyWhenBlurred(true)
    // The Settings "Test Notification" button is always clicked with the window focused.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('suppresses a normal notification while the window is focused (Only When Unfocused)', () => {
    expect(notify('your-turn', 'Your turn')).toBe('suppressed-focus')
  })

  it('fires when force:true even while focused — the Settings test-button path', () => {
    expect(notify('your-turn', 'Your turn', undefined, { force: true })).toBe('shown')
  })

  it('reports disabled (not shown) when notifications are turned off, even with force', () => {
    setEnabled(false)
    expect(notify('your-turn', 'Your turn', undefined, { force: true })).toBe('disabled')
  })
})
