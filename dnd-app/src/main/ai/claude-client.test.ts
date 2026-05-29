import { beforeEach, describe, expect, it, vi } from 'vitest'

// Capture the args passed to the SDK so we can assert on caching + max_tokens.
const streamArgs: unknown[] = []
const createArgs: unknown[] = []

function makeStream() {
  return {
    on: () => {},
    finalMessage: async () => ({
      content: [{ type: 'text', text: 'hello' }],
      usage: { cache_creation_input_tokens: 10, cache_read_input_tokens: 0 }
    })
  }
}

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = {
        stream: (args: unknown) => {
          streamArgs.push(args)
          return makeStream()
        },
        create: async (args: unknown) => {
          createArgs.push(args)
          return { content: [{ type: 'text', text: 'one-shot' }], usage: {} }
        }
      }
    }
  }
})

import { defaultMaxTokensForModel } from './llm-provider'

describe('defaultMaxTokensForModel (Phase 28b.4)', () => {
  it('gives Opus a larger budget than Sonnet/Haiku', () => {
    expect(defaultMaxTokensForModel('claude-opus-4-7')).toBe(16384)
    expect(defaultMaxTokensForModel('claude-sonnet-4-6')).toBe(8192)
    expect(defaultMaxTokensForModel('claude-haiku-4-5-20251001')).toBe(8192)
  })
})

describe('claudeProvider (Phase 28b)', () => {
  beforeEach(() => {
    streamArgs.length = 0
    createArgs.length = 0
  })

  it('lists the current 4.x models first', async () => {
    const { claudeProvider } = await import('./claude-client')
    const models = await claudeProvider.listModels()
    expect(models.slice(0, 3)).toEqual(['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'])
  })

  it('streamChat sends system as a cacheable content block + model-aware max_tokens', async () => {
    const { claudeProvider, setClaudeApiKey } = await import('./claude-client')
    setClaudeApiKey('sk-test')
    await claudeProvider.streamChat(
      'SYS',
      [{ role: 'user', content: 'hi' }],
      {
        onText: () => {},
        onDone: () => {},
        onError: () => {}
      },
      'claude-opus-4-7'
    )
    const arg = streamArgs[0] as { system: Array<{ type: string; cache_control?: unknown }>; max_tokens: number }
    expect(Array.isArray(arg.system)).toBe(true)
    expect(arg.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(arg.max_tokens).toBe(16384)
  })

  it('chatOnce honors a caller-supplied maxTokens', async () => {
    const { claudeProvider, setClaudeApiKey } = await import('./claude-client')
    setClaudeApiKey('sk-test')
    await claudeProvider.chatOnce('SYS', [{ role: 'user', content: 'hi' }], 'claude-sonnet-4-6', 2048)
    const arg = createArgs[0] as { max_tokens: number; system: unknown[] }
    expect(arg.max_tokens).toBe(2048)
    expect(Array.isArray(arg.system)).toBe(true)
  })
})
