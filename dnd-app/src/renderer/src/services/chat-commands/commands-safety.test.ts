import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandContext } from './types'

const state = {
  campaign: { id: 'c1', aiDm: { enabled: true }, sessionZero: { xCardEnabled: true } } as Record<
    string,
    unknown
  > | null,
  role: 'none' as string
}
const invokeXCard = vi.fn()
const sendMessage = vi.fn()

vi.mock('../../i18n', () => ({ i18n: { t: (k: string) => k } }))
vi.mock('../../stores/use-campaign-store', () => ({
  useCampaignStore: { getState: () => ({ getActiveCampaign: () => state.campaign }) }
}))
vi.mock('../../stores/network-store', () => ({
  useNetworkStore: { getState: () => ({ role: state.role, sendMessage }) }
}))
vi.mock('../../stores/use-ai-dm-store', () => ({ useAiDmStore: { getState: () => ({ invokeXCard }) } }))

import { commands, tapXCard } from './commands-safety'

const xcard = commands[0]
function makeCtx(): CommandContext {
  return {
    isDM: false,
    playerName: 'Bob',
    character: null,
    localPeerId: 'p1',
    addSystemMessage: vi.fn(),
    broadcastSystemMessage: vi.fn(),
    addErrorMessage: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.campaign = { id: 'c1', aiDm: { enabled: true }, sessionZero: { xCardEnabled: true } }
  state.role = 'none'
})

describe('commands-safety /xcard (PHASE-32 32E)', () => {
  it('is a non-DM player command named xcard with alias x', () => {
    expect(xcard.name).toBe('xcard')
    expect(xcard.aliases).toContain('x')
    expect(xcard.dmOnly).toBe(false)
  })

  it('blocks when the campaign has no AI DM', () => {
    state.campaign = { id: 'c1', aiDm: { enabled: false }, sessionZero: { xCardEnabled: true } }
    const ctx = makeCtx()
    xcard.execute('spiders', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith('game.xCard.noAiDm')
    expect(invokeXCard).not.toHaveBeenCalled()
  })

  it('blocks when X-Card is not enabled', () => {
    state.campaign = { id: 'c1', aiDm: { enabled: true }, sessionZero: { xCardEnabled: false } }
    const ctx = makeCtx()
    xcard.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith('game.xCard.notEnabled')
    expect(invokeXCard).not.toHaveBeenCalled()
  })

  it('solo/host: invokes the X-card with the parsed topic and posts an ANONYMOUS notice', () => {
    const ctx = makeCtx()
    xcard.execute('spiders', ctx)
    expect(invokeXCard).toHaveBeenCalledWith('c1', 'spiders')
    expect(sendMessage).not.toHaveBeenCalled()
    // The broadcast notice must be the neutral key — never the topic or the tapper name.
    const notice = (ctx.broadcastSystemMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(notice).toBe('game.xCard.tapped')
    expect(notice).not.toContain('spiders')
    expect(notice).not.toContain('Bob')
  })

  it('client: relays via player:x-card instead of driving the AI directly', () => {
    state.role = 'client'
    const ctx = makeCtx()
    xcard.execute('gore', ctx)
    expect(sendMessage).toHaveBeenCalledWith('player:x-card', { topic: 'gore' })
    expect(invokeXCard).not.toHaveBeenCalled()
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith('game.xCard.tapped')
  })

  it('tapXCard returns the block reason without invoking', () => {
    state.campaign = null
    expect(tapXCard()).toEqual({ ok: false, reason: 'no-ai-dm' })
    expect(invokeXCard).not.toHaveBeenCalled()
  })
})
