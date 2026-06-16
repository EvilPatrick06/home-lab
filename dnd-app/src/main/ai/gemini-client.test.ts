import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PHASE-13 13P — migrated to @google/genai; re-asserts the PHASE-03 streaming contract.

const createParams: Array<{ config?: { systemInstruction?: string } }> = []
const sendStreamConfigs: Array<{ abortSignal?: AbortSignal } | undefined> = []
const generateConfigs: Array<{ abortSignal?: AbortSignal } | undefined> = []
let hangUntilAbort = false

async function* hangingStream(signal?: AbortSignal): AsyncGenerator<{ text: string }> {
  await new Promise<void>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('aborted')))
  })
  yield { text: '' }
}
async function* okStream(): AsyncGenerator<{ text: string }> {
  yield { text: 'Hel' }
  yield { text: 'lo' }
}

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = {
      create: (params: { config?: { systemInstruction?: string } }) => {
        createParams.push(params)
        return {
          sendMessageStream: async (req: { message: string; config?: { abortSignal?: AbortSignal } }) => {
            sendStreamConfigs.push(req.config)
            return hangUntilAbort ? hangingStream(req.config?.abortSignal) : okStream()
          }
        }
      }
    }
    models = {
      generateContent: async (req: { config?: { abortSignal?: AbortSignal } }) => {
        generateConfigs.push(req.config)
        return { text: 'one-shot' }
      }
    }
  }
}))

describe('geminiProvider (@google/genai — PHASE-13 13P / PHASE-03 contract)', () => {
  beforeEach(() => {
    createParams.length = 0
    sendStreamConfigs.length = 0
    generateConfigs.length = 0
    hangUntilAbort = false
  })
  afterEach(() => vi.useRealTimers())

  it('streaming passes a per-request abortSignal (the inactivity guard, not a wall-clock timeout)', async () => {
    const { geminiProvider, setGeminiApiKey } = await import('./gemini-client')
    setGeminiApiKey('k')
    const onDone = vi.fn()
    await geminiProvider.streamChat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      { onText: vi.fn(), onDone, onError: vi.fn() },
      'gemini-2.0-flash'
    )
    expect(createParams[0]?.config?.systemInstruction).toBe('sys')
    expect(sendStreamConfigs[0]?.abortSignal).toBeInstanceOf(AbortSignal)
    expect(onDone).toHaveBeenCalledWith('Hello')
  })

  it('chatOnce sends a bounded abortSignal', async () => {
    const { geminiProvider, setGeminiApiKey } = await import('./gemini-client')
    setGeminiApiKey('k')
    const out = await geminiProvider.chatOnce('sys', [{ role: 'user', content: 'hi' }], 'gemini-2.0-flash')
    expect(out).toBe('one-shot')
    expect(generateConfigs[0]?.abortSignal).toBeInstanceOf(AbortSignal)
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
