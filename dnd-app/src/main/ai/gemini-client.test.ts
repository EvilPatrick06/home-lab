import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getModelOpts: Array<{ timeout?: number } | undefined> = []
const sendStreamOpts: Array<{ signal?: AbortSignal } | undefined> = []
let hangUntilAbort = false

async function* hangingStream(signal?: AbortSignal): AsyncGenerator<{ text: () => string }> {
  await new Promise<void>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('aborted')))
  })
  yield { text: () => '' }
}
async function* okStream(): AsyncGenerator<{ text: () => string }> {
  yield { text: () => 'Hel' }
  yield { text: () => 'lo' }
}

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(_params: unknown, opts?: { timeout?: number }) {
      getModelOpts.push(opts)
      return {
        startChat: () => ({
          sendMessageStream: async (_content: string, o?: { signal?: AbortSignal }) => {
            sendStreamOpts.push(o)
            return { stream: hangUntilAbort ? hangingStream(o?.signal) : okStream() }
          },
          sendMessage: async () => ({ response: { text: () => 'one-shot' } })
        })
      }
    }
  }
}))

describe('geminiProvider (PHASE-03 03D)', () => {
  beforeEach(() => {
    getModelOpts.length = 0
    sendStreamOpts.length = 0
    hangUntilAbort = false
  })
  afterEach(() => vi.useRealTimers())

  it('streaming uses NO model-level timeout and passes a per-request signal', async () => {
    const { geminiProvider, setGeminiApiKey } = await import('./gemini-client')
    setGeminiApiKey('k')
    const onDone = vi.fn()
    await geminiProvider.streamChat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      { onText: vi.fn(), onDone, onError: vi.fn() },
      'gemini-2.0-flash'
    )
    expect(getModelOpts[0]?.timeout).toBeUndefined()
    expect(sendStreamOpts[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(onDone).toHaveBeenCalledWith('Hello')
  })

  it('chatOnce keeps a model-level timeout', async () => {
    const { geminiProvider, setGeminiApiKey } = await import('./gemini-client')
    setGeminiApiKey('k')
    const out = await geminiProvider.chatOnce('sys', [{ role: 'user', content: 'hi' }], 'gemini-2.0-flash')
    expect(out).toBe('one-shot')
    expect(getModelOpts[0]?.timeout).toBeGreaterThan(0)
  })

  it('inactivity timeout → "timed out" onError (no-retry contract)', async () => {
    vi.useFakeTimers()
    hangUntilAbort = true
    const { geminiProvider, setGeminiApiKey } = await import('./gemini-client')
    setGeminiApiKey('k')
    const onError = vi.fn()
    const p = geminiProvider.streamChat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      { onText: vi.fn(), onDone: vi.fn(), onError },
      'gemini-2.0-flash'
    )
    await vi.advanceTimersByTimeAsync(91_000)
    await p
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('timed out') }))
  })
})
