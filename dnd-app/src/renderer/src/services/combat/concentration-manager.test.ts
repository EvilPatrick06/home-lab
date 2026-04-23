import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { TurnState } from '../../types/game-state'
import {
  checkConcentrationOnDamage,
  onConcentrationLost,
  warnNewConcentration
} from './concentration-manager'

// ── Mock death-mechanics (resolveConcentrationCheck) ──────────────
const mockResolveConcentrationCheck = vi.fn()

vi.mock('./death-mechanics', () => ({
  resolveConcentrationCheck: (...args: unknown[]) => mockResolveConcentrationCheck(...args)
}))

// ── Helpers ───────────────────────────────────────────────────────

function makeTurnState(overrides: Partial<TurnState> = {}): TurnState {
  return {
    entityId: 'e-1',
    movementRemaining: 30,
    movementMax: 30,
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    freeInteractionUsed: false,
    isDashing: false,
    isDisengaging: false,
    isDodging: false,
    isHidden: false,
    ...overrides
  }
}

function makeTurnStates(map: Record<string, Partial<TurnState>>): Record<string, TurnState> {
  const result: Record<string, TurnState> = {}
  for (const [id, overrides] of Object.entries(map)) {
    result[id] = makeTurnState({ entityId: id, ...overrides })
  }
  return result
}

// ── Tests ─────────────────────────────────────────────────────────

describe('checkConcentrationOnDamage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns needsCheck false when entity has no turn state', () => {
    const result = checkConcentrationOnDamage('e-1', 'Gandalf', 10, {}, 3)
    expect(result.needsCheck).toBe(false)
    expect(result.result).toBeUndefined()
    expect(mockResolveConcentrationCheck).not.toHaveBeenCalled()
  })

  it('returns needsCheck false when entity is not concentrating', () => {
    const turnStates = makeTurnStates({ 'e-1': {} })
    const result = checkConcentrationOnDamage('e-1', 'Gandalf', 10, turnStates, 3)
    expect(result.needsCheck).toBe(false)
    expect(result.result).toBeUndefined()
  })

  it('returns needsCheck true and performs check when concentrating', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: 'Hold Person' } })

    mockResolveConcentrationCheck.mockReturnValue({
      maintained: true,
      roll: { total: 15, natural: 15, modifier: 3 },
      dc: 10,
      summary: 'Gandalf maintains concentration on Hold Person. (CON save: 15 vs DC 10)'
    })

    const result = checkConcentrationOnDamage('e-1', 'Gandalf', 10, turnStates, 3)

    expect(result.needsCheck).toBe(true)
    expect(result.result).toBeDefined()
    expect(result.result!.spell).toBe('Hold Person')
    expect(result.result!.maintained).toBe(true)
    expect(result.result!.dc).toBe(10)
    expect(result.result!.roll).toBe(15)
    expect(result.result!.summary).toContain('maintains concentration')
  })

  it('passes correct arguments to resolveConcentrationCheck', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: 'Bless' } })

    mockResolveConcentrationCheck.mockReturnValue({
      maintained: false,
      roll: { total: 7, natural: 5, modifier: 2 },
      dc: 12,
      summary: 'Gandalf loses concentration on Bless!'
    })

    checkConcentrationOnDamage('e-1', 'Gandalf', 24, turnStates, 2, true)

    expect(mockResolveConcentrationCheck).toHaveBeenCalledWith('e-1', 'Gandalf', 24, 2, true)
  })

  it('reports failed concentration check correctly', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: 'Fly' } })

    mockResolveConcentrationCheck.mockReturnValue({
      maintained: false,
      roll: { total: 5, natural: 3, modifier: 2 },
      dc: 10,
      summary: 'Gandalf loses concentration on Fly!'
    })

    const result = checkConcentrationOnDamage('e-1', 'Gandalf', 8, turnStates, 2)

    expect(result.needsCheck).toBe(true)
    expect(result.result!.maintained).toBe(false)
    expect(result.result!.spell).toBe('Fly')
  })

  it('defaults hasWarCaster to false', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: 'Shield of Faith' } })

    mockResolveConcentrationCheck.mockReturnValue({
      maintained: true,
      roll: { total: 12, natural: 10, modifier: 2 },
      dc: 10,
      summary: 'ok'
    })

    checkConcentrationOnDamage('e-1', 'Gandalf', 10, turnStates, 2)

    expect(mockResolveConcentrationCheck).toHaveBeenCalledWith('e-1', 'Gandalf', 10, 2, false)
  })

  it('handles zero damage (entity still concentrating, no check needed if no turn state)', () => {
    // Zero damage with no turn state
    const result = checkConcentrationOnDamage('e-1', 'Gandalf', 0, {}, 3)
    expect(result.needsCheck).toBe(false)
  })

  it('handles zero damage when concentrating (still calls check)', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: 'Haste' } })

    mockResolveConcentrationCheck.mockReturnValue({
      maintained: true,
      roll: { total: 14, natural: 12, modifier: 2 },
      dc: 10,
      summary: 'ok'
    })

    const result = checkConcentrationOnDamage('e-1', 'Gandalf', 0, turnStates, 2)
    expect(result.needsCheck).toBe(true)
    expect(mockResolveConcentrationCheck).toHaveBeenCalledWith('e-1', 'Gandalf', 0, 2, false)
  })

  it('handles missing entity in turnStates', () => {
    const turnStates = makeTurnStates({ 'e-2': { concentratingSpell: 'Bless' } })
    const result = checkConcentrationOnDamage('e-1', 'Gandalf', 10, turnStates, 3)
    expect(result.needsCheck).toBe(false)
  })
})

describe('onConcentrationLost', () => {
  it('returns the spell name when entity is concentrating', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: 'Hold Person' } })
    const spell = onConcentrationLost('e-1', turnStates)
    expect(spell).toBe('Hold Person')
  })

  it('returns null when entity has no turn state', () => {
    const spell = onConcentrationLost('e-1', {})
    expect(spell).toBeNull()
  })

  it('returns null when entity is not concentrating', () => {
    const turnStates = makeTurnStates({ 'e-1': {} })
    const spell = onConcentrationLost('e-1', turnStates)
    expect(spell).toBeNull()
  })

  it('returns null for wrong entity id', () => {
    const turnStates = makeTurnStates({ 'e-2': { concentratingSpell: 'Fly' } })
    const spell = onConcentrationLost('e-1', turnStates)
    expect(spell).toBeNull()
  })

  it('returns the exact spell string including special characters', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: "Tasha's Hideous Laughter" } })
    const spell = onConcentrationLost('e-1', turnStates)
    expect(spell).toBe("Tasha's Hideous Laughter")
  })
})

describe('warnNewConcentration', () => {
  it('returns warning when entity is already concentrating', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: 'Hold Person' } })
    const warning = warnNewConcentration('e-1', 'Gandalf', 'Fly', turnStates)

    expect(warning).not.toBeNull()
    expect(warning).toContain('Gandalf')
    expect(warning).toContain('Hold Person')
    expect(warning).toContain('Fly')
    expect(warning).toContain('already concentrating')
  })

  it('returns null when entity has no turn state', () => {
    const warning = warnNewConcentration('e-1', 'Gandalf', 'Fly', {})
    expect(warning).toBeNull()
  })

  it('returns null when entity is not concentrating', () => {
    const turnStates = makeTurnStates({ 'e-1': {} })
    const warning = warnNewConcentration('e-1', 'Gandalf', 'Fly', turnStates)
    expect(warning).toBeNull()
  })

  it('mentions the old spell will end', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: 'Bless' } })
    const warning = warnNewConcentration('e-1', 'Gandalf', 'Haste', turnStates)

    expect(warning).toContain('end concentration on Bless')
  })

  it('mentions the new spell being cast', () => {
    const turnStates = makeTurnStates({ 'e-1': { concentratingSpell: 'Shield of Faith' } })
    const warning = warnNewConcentration('e-1', 'Gandalf', 'Hex', turnStates)

    expect(warning).toContain('Casting Hex')
  })

  it('returns null for wrong entity id', () => {
    const turnStates = makeTurnStates({ 'e-2': { concentratingSpell: 'Fly' } })
    const warning = warnNewConcentration('e-1', 'Gandalf', 'Haste', turnStates)
    expect(warning).toBeNull()
  })
})
