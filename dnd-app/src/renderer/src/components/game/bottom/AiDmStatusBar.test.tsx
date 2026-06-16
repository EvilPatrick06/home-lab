// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AiDmStatusBar } from './AiDmStatusBar'

type Props = Parameters<typeof AiDmStatusBar>[0]
function defaults(over: Partial<Props> = {}): Props {
  return {
    isTyping: false,
    paused: false,
    usable: true,
    probeFailed: false,
    provider: 'ollama',
    usedTokens: 100,
    maxTokens: null,
    onRecheck: vi.fn(),
    ...over
  }
}

describe('AiDmStatusBar precedence (PHASE-10 10B)', () => {
  it('typing beats everything', () => {
    render(<AiDmStatusBar {...defaults({ isTyping: true, paused: true, usable: false })} />)
    expect(screen.getByText('AI DM responding')).toBeTruthy()
  })

  it('paused beats unknown', () => {
    render(<AiDmStatusBar {...defaults({ paused: true, usable: null })} />)
    expect(screen.getByText('AI DM paused')).toBeTruthy()
  })

  it('unknown (still checking) is not ready', () => {
    render(<AiDmStatusBar {...defaults({ usable: null, probeFailed: false })} />)
    expect(screen.getByText('Checking AI DM status...')).toBeTruthy()
    expect(screen.queryByText('AI DM ready')).toBeNull()
  })

  it('ollama not-ready shows the no-model copy', () => {
    render(<AiDmStatusBar {...defaults({ usable: false, provider: 'ollama' })} />)
    expect(screen.getByText(/No model installed/)).toBeTruthy()
  })

  it('cloud not-ready shows the provider-unreachable copy', () => {
    render(<AiDmStatusBar {...defaults({ usable: false, provider: 'gemini' })} />)
    expect(screen.getByText(/provider unreachable/)).toBeTruthy()
  })

  it('a failed probe is treated as not-ready', () => {
    render(<AiDmStatusBar {...defaults({ usable: null, probeFailed: true, provider: 'claude' })} />)
    expect(screen.getByText(/provider unreachable/)).toBeTruthy()
  })

  it('affirmative usable renders ready', () => {
    render(<AiDmStatusBar {...defaults({ usable: true })} />)
    expect(screen.getByText('AI DM ready')).toBeTruthy()
  })

  it('clicking the status row triggers a recheck', () => {
    const onRecheck = vi.fn()
    render(<AiDmStatusBar {...defaults({ onRecheck })} />)
    fireEvent.click(screen.getByTitle('Click to re-check AI status'))
    expect(onRecheck).toHaveBeenCalled()
  })

  it('renders the used-only token form when maxTokens is null', () => {
    render(<AiDmStatusBar {...defaults({ usedTokens: 1234, maxTokens: null })} />)
    expect(screen.getByText(/~1,234 tokens/)).toBeTruthy()
  })

  it('tints the meter amber when over budget', () => {
    render(<AiDmStatusBar {...defaults({ usedTokens: 5000, maxTokens: 4000 })} />)
    const meter = screen.getByText(/5,000 \/ 4,000/)
    expect(meter.className).toContain('text-amber-500')
  })
})

describe('AiDmStatusBar connection chip (PHASE-14 14B)', () => {
  it('renders the degraded label inside a status region', () => {
    render(<AiDmStatusBar {...defaults({ connection: 'degraded' })} />)
    const chip = screen.getByText(/AI connection unstable/)
    expect(chip).toBeTruthy()
    expect(chip.closest('[role="status"]')).toBeTruthy()
  })

  it('renders the disconnected label', () => {
    render(<AiDmStatusBar {...defaults({ connection: 'disconnected' })} />)
    expect(screen.getByText(/AI unreachable/)).toBeTruthy()
  })

  it('renders no connection chip when connected/null', () => {
    render(<AiDmStatusBar {...defaults({ connection: 'connected' })} />)
    expect(screen.queryByText(/AI connection unstable|AI unreachable/)).toBeNull()
  })
})

describe('AiDmStatusBar context-trimmed chip (PHASE-14 14C)', () => {
  it('renders the trimmed chip when contextTruncated', () => {
    render(<AiDmStatusBar {...defaults({ contextTruncated: true })} />)
    expect(screen.getByText(/Context trimmed last turn/)).toBeTruthy()
  })

  it('renders no trimmed chip by default', () => {
    render(<AiDmStatusBar {...defaults({ contextTruncated: false })} />)
    expect(screen.queryByText(/Context trimmed last turn/)).toBeNull()
  })
})
