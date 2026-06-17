import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commands } from './commands-dm-oracle'
import type { CommandContext, CommandMessage } from './types'

const oracleFateCheck = vi.fn()
const oracleSetChaos = vi.fn()

vi.stubGlobal('window', { api: { ai: { oracleFateCheck, oracleSetChaos } } })

const [oracle] = commands

function makeCtx(over: Partial<CommandContext> = {}): CommandContext {
  return {
    isDM: true,
    playerName: 'DM',
    character: null,
    localPeerId: 'local',
    addSystemMessage: vi.fn(),
    broadcastSystemMessage: vi.fn(),
    addErrorMessage: vi.fn(),
    oracleEnabled: true,
    campaignId: 'c1',
    ...over
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  oracleFateCheck.mockResolvedValue({
    success: true,
    result: { question: 'Is the door locked?', likelihood: 'even', chaos: 5, roll: 78, threshold: 50, answer: 'no' }
  })
  oracleSetChaos.mockResolvedValue({ success: true, chaos: 6 })
})

describe('/oracle command', () => {
  it('is dmOnly with the fate alias', () => {
    expect(oracle.name).toBe('oracle')
    expect(oracle.aliases).toContain('fate')
    expect(oracle.dmOnly).toBe(true)
  })

  it('errors when the oracle flag is off (the renderer gate)', async () => {
    const res = (await oracle.execute('Does it work?', makeCtx({ oracleEnabled: false }))) as CommandMessage
    expect(res.type).toBe('error')
    expect(oracleFateCheck).not.toHaveBeenCalled()
  })

  it('errors when no question is given', async () => {
    const res = (await oracle.execute('', makeCtx())) as CommandMessage
    expect(res.type).toBe('error')
  })

  it('defaults to even odds and posts the full roll math', async () => {
    const res = (await oracle.execute('Is the door locked?', makeCtx())) as CommandMessage
    expect(oracleFateCheck).toHaveBeenCalledWith('c1', { question: 'Is the door locked?', likelihood: 'even' })
    expect(res.type).toBe('system')
    expect(res.content).toContain('→ NO')
    expect(res.content).toContain('d100=78 vs target 50')
    expect(res.content).toContain('even odds, chaos 5')
  })

  it('parses a leading likelihood token', async () => {
    await oracle.execute('likely Is the door locked?', makeCtx())
    expect(oracleFateCheck).toHaveBeenCalledWith('c1', { question: 'Is the door locked?', likelihood: 'likely' })
  })

  it('renders the random-event line when present', async () => {
    oracleFateCheck.mockResolvedValueOnce({
      success: true,
      result: {
        question: 'q',
        likelihood: 'even',
        chaos: 5,
        roll: 22,
        threshold: 50,
        answer: 'yes',
        randomEvent: { focus: 'faction-moves', meaning: ['betray', 'ally'] }
      }
    })
    const res = (await oracle.execute('q', makeCtx())) as CommandMessage
    expect(res.content).toContain('Random event: faction-moves — betray / ally')
  })

  it('chaos subcommand sends a delta for +N and a value for N', async () => {
    await oracle.execute('chaos +1', makeCtx())
    expect(oracleSetChaos).toHaveBeenCalledWith('c1', { delta: 1 })
    await oracle.execute('chaos 7', makeCtx())
    expect(oracleSetChaos).toHaveBeenCalledWith('c1', { value: 7 })
  })
})
