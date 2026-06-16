// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/chat-commands', () => ({
  executeCommand: () => null
}))

// Avoid the readiness probe touching window.api during render (PHASE-14 14D render test).
vi.mock('../../../hooks/use-ai-readiness', () => ({
  useAiReadiness: () => ({
    usable: true,
    provider: 'ollama',
    probeFailed: false,
    conversationBudget: null,
    recheck: vi.fn()
  })
}))

import { useAiDmStore } from '../../../stores/use-ai-dm-store'
import ChatPanel from './ChatPanel'

describe('ChatPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./ChatPanel')
    expect(mod).toBeDefined()
  })
})

describe('ChatPanel file-read typing indicator (PHASE-14 14D)', () => {
  afterEach(() => {
    act(() => useAiDmStore.getState().reset())
  })

  it('names the file (basename) while a file read is in progress, generic label otherwise', () => {
    act(() => {
      useAiDmStore.setState({
        enabled: true,
        isTyping: true,
        streamStatus: null,
        fileReadStatus: { path: '/campaigns/x/notes/intro.md', status: 'reading' }
      })
    })
    render(<ChatPanel isDM playerName="DM" />)
    expect(screen.getByText(/reading intro\.md/i)).toBeTruthy()

    // Flip to 'done' → the generic typing label returns.
    act(() => {
      useAiDmStore.setState({ fileReadStatus: { path: '/campaigns/x/notes/intro.md', status: 'done' } })
    })
    expect(screen.getByText('AI DM is typing...')).toBeTruthy()
    expect(screen.queryByText(/reading intro\.md/i)).toBeNull()
  })
})
