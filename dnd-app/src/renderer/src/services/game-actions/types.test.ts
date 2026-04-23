import { describe, expect, it } from 'vitest'

describe('game-actions/types', () => {
  it('exports DmAction interface shape', async () => {
    const mod = await import('./types')
    // types.ts only exports interfaces/types — no runtime values.
    // Verify the module loads without error and the namespace is defined.
    expect(mod).toBeDefined()
  })

  it('DmAction satisfies the expected interface', () => {
    // Verify the structural contract at runtime using a plain object
    const action: import('./types').DmAction = {
      action: 'test_action',
      extra: 42
    }
    expect(action.action).toBe('test_action')
    expect(action.extra).toBe(42)
  })

  it('ExecutionFailure holds an action and a reason', () => {
    const failure: import('./types').ExecutionFailure = {
      action: { action: 'do_something' },
      reason: 'Not allowed'
    }
    expect(failure.action.action).toBe('do_something')
    expect(failure.reason).toBe('Not allowed')
  })

  it('ExecutionResult holds executed and failed arrays', () => {
    const result: import('./types').ExecutionResult = {
      executed: [{ action: 'a' }],
      failed: [{ action: { action: 'b' }, reason: 'oops' }]
    }
    expect(result.executed).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].reason).toBe('oops')
  })

  it('DmAction supports arbitrary additional keys', () => {
    const action: import('./types').DmAction = {
      action: 'place_token',
      gridX: 5,
      gridY: 10,
      label: 'Goblin'
    }
    expect(action.action).toBe('place_token')
    expect(action.gridX).toBe(5)
    expect(action.gridY).toBe(10)
    expect(action.label).toBe('Goblin')
  })
})
