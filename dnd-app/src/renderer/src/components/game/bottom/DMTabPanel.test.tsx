// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// AI DM store — selector-based mock returning a stable state object.
const aiDmState = {
  enabled: true,
  paused: false,
  isTyping: false,
  setPaused: vi.fn(),
  cancelStream: vi.fn(),
  dmApprovalRequired: false,
  setDmApprovalRequired: vi.fn()
}
vi.mock('../../../stores/use-ai-dm-store', () => ({
  useAiDmStore: (sel: any) => sel(aiDmState)
}))
const ttsState = { enabled: false, setEnabled: vi.fn(), bargeIn: false, setBargeIn: vi.fn() }
vi.mock('../../../stores/use-narration-tts-store', () => ({
  useNarrationTtsStore: (sel: any) => sel(ttsState)
}))
vi.mock('../../../services/data-provider', () => ({
  load5eDmTabs: vi.fn(async () => [])
}))

import DMTabPanel from './DMTabPanel'

beforeEach(() => {
  vi.stubGlobal('window', {
    api: {
      ai: {
        // PHASE-14 14E — DMTabPanel no longer calls getTokenBudget itself (the lazy
        // ContextInspectorPanel owns the token block now); keep the stubs harmless.
        getTokenBudget: vi.fn(async () => null),
        previewTokenBudget: vi.fn(async () => null),
        getContextInspector: vi.fn(async () => null)
      }
    }
  })
})

function makeCampaign(aiDm: any) {
  return { id: 'c1', name: 'Test', players: [], aiDm } as any
}

describe('DMTabPanel AI DM label (PHASE-10 10A)', () => {
  it('can be imported', async () => {
    const mod = await import('./DMTabPanel')
    expect(mod).toBeDefined()
  })

  it('shows the configured Gemini model, never "Ollama"', () => {
    render(
      <DMTabPanel
        onOpenModal={vi.fn()}
        onEditMap={vi.fn()}
        campaign={makeCampaign({ enabled: true, provider: 'gemini', model: 'gemini-2.0-flash' })}
      />
    )
    // switch to the AI DM tab
    fireEvent.click(screen.getByText('AI DM'))
    expect(screen.getByText(/gemini-2\.0-flash/)).toBeTruthy()
    expect(screen.queryByText(/Ollama/)).toBeNull()
  })

  it('falls back to the provider label when no model is set', () => {
    render(
      <DMTabPanel
        onOpenModal={vi.fn()}
        onEditMap={vi.fn()}
        campaign={makeCampaign({ enabled: true, provider: 'claude' })}
      />
    )
    fireEvent.click(screen.getByText('AI DM'))
    expect(screen.getByText(/Claude/)).toBeTruthy()
  })
})
