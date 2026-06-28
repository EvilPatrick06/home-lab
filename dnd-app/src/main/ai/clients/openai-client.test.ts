import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface CreateBody {
  model: string
  messages: Array<{ role: string; content: string }>
  stream?: boolean
  max_completion_tokens?: number
  max_tokens?: number
}
const createBodies: CreateBody[] = []
const createOpts: Array<{ signal?: AbortSignal }> = []
let hangUntilAbort = false

async function* hangingStream(signal?: AbortSignal): AsyncGenerator<unknown> {
  await new Promise<void>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('aborted')))
  })
  yield {}
}
async function* okStream(): AsyncGenerator<{ choices: Array<{ delta: { content?: string } }> }> {
  yield { choices: [{ delta: { content: 'Hello ' } }] }
  yield { choices: [{ delta: { content: 'world' } }] }
}

vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: async (body: CreateBody, opts?: { signal?: AbortSignal }) => {
          createBodies.push(body)
          createOpts.push(opts ?? {})
          if (body.stream) return hangUntilAbort ? hangingStream(opts?.signal) : okStream()
          return { choices: [{ message: { content: 'one-shot' } }] }
        }
      }
    }
    models = {
      list: async () => ({ data: [{ id: 'gpt-4o' }, { id: 'o1-mini' }, { id: 'text-embedding-3' }] })
    }
  }
}))

describe('openaiProvider (PHASE-03 03C)', () => {
  beforeEach(() => {
    createBodies.length = 0
    createOpts.length = 0
    hangUntilAbort = false
  })
  afterEach(() => vi.useRealTimers())

  it('sends max_completion_tokens (never max_tokens) and forwards a caller maxTokens', async () => {
    const { openaiProvider, setOpenAIApiKey } = await import('./openai-client')
    setOpenAIApiKey('k')
    await openaiProvider.streamChat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      'gpt-4o',
      undefined,
      2048
    )
    expect(createBodies[0].max_completion_tokens).toBe(2048)
    expect(createBodies[0].max_tokens).toBeUndefined()
  })

  it('folds the system prompt into the first user message for o1-mini (no system role)', async () => {
    const { openaiProvider, setOpenAIApiKey } = await import('./openai-client')
    setOpenAIApiKey('k')
    await openaiProvider.streamChat(
      'SYSTEM',
      [{ role: 'user', content: 'question' }],
      { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      'o1-mini'
    )
    expect(createBodies[0].messages.some((m) => m.role === 'system')).toBe(false)
    expect(createBodies[0].messages[0]).toEqual({ role: 'user', content: 'SYSTEM\n\nquestion' })
  })

  it('keeps a system-role message for gpt-4o', async () => {
    const { openaiProvider, setOpenAIApiKey } = await import('./openai-client')
    setOpenAIApiKey('k')
    await openaiProvider.streamChat(
      'SYSTEM',
      [{ role: 'user', content: 'q' }],
      { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      'gpt-4o'
    )
    expect(createBodies[0].messages[0]).toEqual({ role: 'system', content: 'SYSTEM' })
  })

  it('passes an AbortSignal in streaming options and streams text', async () => {
    const { openaiProvider, setOpenAIApiKey } = await import('./openai-client')
    setOpenAIApiKey('k')
    const onText = vi.fn()
    const onDone = vi.fn()
    await openaiProvider.streamChat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      { onText, onDone, onError: vi.fn() },
      'gpt-4o'
    )
    expect(createOpts[0].signal).toBeInstanceOf(AbortSignal)
    expect(onDone).toHaveBeenCalledWith('Hello world')
  })

  it('inactivity timeout → "timed out" onError (no-retry contract)', async () => {
    vi.useFakeTimers()
    hangUntilAbort = true
    const { openaiProvider, setOpenAIApiKey } = await import('./openai-client')
    setOpenAIApiKey('k')
    const onError = vi.fn()
    const p = openaiProvider.streamChat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      { onText: vi.fn(), onDone: vi.fn(), onError },
      'gpt-4o'
    )
    await vi.advanceTimersByTimeAsync(91_000)
    await p
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('timed out') }))
  })

  it('listModels keeps gpt-/o-series ids (regression)', async () => {
    const { openaiProvider, setOpenAIApiKey } = await import('./openai-client')
    setOpenAIApiKey('k')
    const models = await openaiProvider.listModels()
    expect(models).toContain('gpt-4o')
    expect(models).toContain('o1-mini')
    expect(models).not.toContain('text-embedding-3')
  })
})
