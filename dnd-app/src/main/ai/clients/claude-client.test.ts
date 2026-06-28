import { beforeEach, describe, expect, it, vi } from 'vitest'

// Capture the args passed to the SDK so we can assert on caching + max_tokens.
const streamArgs: unknown[] = []
const streamOpts: Array<{ signal?: AbortSignal }> = []
const streamListeners: Array<Record<string, Array<(...a: unknown[]) => void>>> = []
const createArgs: unknown[] = []
// When true the mocked stream's finalMessage hangs until its signal aborts, then
// rejects — simulating an unresponsive provider (PHASE-03 03B inactivity timeout).
let hangUntilAbort = false

function makeStream(opts?: { signal?: AbortSignal }) {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {}
  streamListeners.push(listeners)
  return {
    on: (event: string, cb: (...a: unknown[]) => void) => {
      listeners[event] ??= []
      listeners[event].push(cb)
    },
    finalMessage: async () => {
      if (hangUntilAbort) {
        await new Promise<void>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      }
      return {
        content: [{ type: 'text', text: 'hello' }],
        usage: { cache_creation_input_tokens: 10, cache_read_input_tokens: 0 }
      }
    }
  }
}

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = {
        stream: (args: unknown, opts?: { signal?: AbortSignal }) => {
          streamArgs.push(args)
          streamOpts.push(opts ?? {})
          return makeStream(opts)
        },
        create: async (args: unknown) => {
          createArgs.push(args)
          return { content: [{ type: 'text', text: 'one-shot' }], usage: {} }
        }
      }
      models = {
        list: async () => ({
          data: [{ id: 'claude-opus-4-7' }, { id: 'claude-sonnet-4-6' }, { id: 'claude-haiku-4-5-20251001' }]
        })
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
    streamOpts.length = 0
    streamListeners.length = 0
    createArgs.length = 0
    hangUntilAbort = false
  })

  it('PHASE-03 03B: passes an AbortSignal in request options and registers a streamEvent listener', async () => {
    const { claudeProvider, setClaudeApiKey } = await import('./claude-client')
    setClaudeApiKey('test-key')
    await claudeProvider.streamChat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      'claude-sonnet-4-6'
    )
    expect(streamOpts[0].signal).toBeInstanceOf(AbortSignal)
    expect(streamListeners[0].streamEvent?.length ?? 0).toBeGreaterThan(0)
  })

  it('PHASE-03 03B: inactivity timeout surfaces a "timed out" onError (no-retry contract)', async () => {
    vi.useFakeTimers()
    hangUntilAbort = true
    const { claudeProvider, setClaudeApiKey } = await import('./claude-client')
    setClaudeApiKey('test-key')
    const onError = vi.fn()
    const p = claudeProvider.streamChat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      { onText: vi.fn(), onDone: vi.fn(), onError },
      'claude-sonnet-4-6'
    )
    await vi.advanceTimersByTimeAsync(91_000) // past CLOUD_FIRST_TOKEN_TIMEOUT_MS
    await p
    vi.useRealTimers()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('timed out') }))
  })

  it('lists models live from the API (no hardcoded snapshot list)', async () => {
    const { claudeProvider, setClaudeApiKey } = await import('./claude-client')
    setClaudeApiKey('test-key') // listModels now requires a key (then hits the live API)
    const models = await claudeProvider.listModels()
    expect(models).toEqual(['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'])
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
