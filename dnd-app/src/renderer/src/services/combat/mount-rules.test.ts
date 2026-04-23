import { describe, expect, it } from 'vitest'
import {
  calculateMountedMovement,
  enforceMountedCombatRestrictions,
  forceDismount,
  getMountSpeed,
  isControlledMountAction
} from './mount-rules'
import type { MapToken } from '../../types/map'
import type { TurnState } from '../../types/game-state'

// ─── Helpers ─────────────────────────────────────────────────────

function makeMountToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 'mount-1',
    entityId: 'horse-1',
    x: 0,
    y: 0,
    size: 1,
    layer: 'token',
    label: 'Warhorse',
    ...overrides
  } as MapToken
}

function makeTurnState(overrides: Partial<TurnState> = {}): TurnState {
  return {
    movementUsed: 0,
    movementMax: 30,
    hasAction: true,
    hasBonusAction: true,
    hasReaction: true,
    ...overrides
  } as TurnState
}

// ─── getMountSpeed ───────────────────────────────────────────────

describe('getMountSpeed', () => {
  it('returns walkSpeed when set', () => {
    const mount = makeMountToken({ walkSpeed: 60 })
    expect(getMountSpeed(mount)).toBe(60)
  })

  it('defaults to 40 when walkSpeed is undefined', () => {
    const mount = makeMountToken()
    delete (mount as Record<string, unknown>).walkSpeed
    expect(getMountSpeed(mount)).toBe(40)
  })

  it('returns 0 when walkSpeed is explicitly 0', () => {
    const mount = makeMountToken({ walkSpeed: 0 })
    expect(getMountSpeed(mount)).toBe(0)
  })

  it('handles high walkSpeed values', () => {
    const mount = makeMountToken({ walkSpeed: 120 })
    expect(getMountSpeed(mount)).toBe(120)
  })
})

// ─── isControlledMountAction ─────────────────────────────────────

describe('isControlledMountAction', () => {
  it('allows Dash', () => {
    expect(isControlledMountAction('Dash')).toBe(true)
  })

  it('allows Disengage', () => {
    expect(isControlledMountAction('Disengage')).toBe(true)
  })

  it('allows Dodge', () => {
    expect(isControlledMountAction('Dodge')).toBe(true)
  })

  it('rejects Attack', () => {
    expect(isControlledMountAction('Attack')).toBe(false)
  })

  it('rejects Help', () => {
    expect(isControlledMountAction('Help')).toBe(false)
  })

  it('rejects Cast a Spell', () => {
    expect(isControlledMountAction('Cast a Spell')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isControlledMountAction('')).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(isControlledMountAction('dash')).toBe(false)
    expect(isControlledMountAction('DODGE')).toBe(false)
  })
})

// ─── calculateMountedMovement ────────────────────────────────────

describe('calculateMountedMovement', () => {
  it('uses mount speed for controlled mount', () => {
    const rider = makeTurnState({ movementMax: 30 })
    const mount = makeMountToken({ walkSpeed: 60 })
    expect(calculateMountedMovement(rider, mount, 'controlled')).toBe(60)
  })

  it('uses rider speed for independent mount', () => {
    const rider = makeTurnState({ movementMax: 30 })
    const mount = makeMountToken({ walkSpeed: 60 })
    expect(calculateMountedMovement(rider, mount, 'independent')).toBe(30)
  })

  it('defaults mount speed to 40 for controlled mount with no walkSpeed', () => {
    const rider = makeTurnState({ movementMax: 30 })
    const mount = makeMountToken()
    delete (mount as Record<string, unknown>).walkSpeed
    expect(calculateMountedMovement(rider, mount, 'controlled')).toBe(40)
  })

  it('returns 0 for controlled mount with 0 walkSpeed', () => {
    const rider = makeTurnState({ movementMax: 30 })
    const mount = makeMountToken({ walkSpeed: 0 })
    expect(calculateMountedMovement(rider, mount, 'controlled')).toBe(0)
  })

  it('returns rider movementMax of 0 for independent mount', () => {
    const rider = makeTurnState({ movementMax: 0 })
    const mount = makeMountToken({ walkSpeed: 60 })
    expect(calculateMountedMovement(rider, mount, 'independent')).toBe(0)
  })
})

// ─── enforceMountedCombatRestrictions ────────────────────────────

describe('enforceMountedCombatRestrictions', () => {
  it('allows any action for independent mount', () => {
    expect(enforceMountedCombatRestrictions('independent', 'Attack')).toEqual({ allowed: true })
    expect(enforceMountedCombatRestrictions('independent', 'Cast a Spell')).toEqual({ allowed: true })
    expect(enforceMountedCombatRestrictions('independent', 'Dash')).toEqual({ allowed: true })
  })

  it('allows Dash for controlled mount', () => {
    const result = enforceMountedCombatRestrictions('controlled', 'Dash')
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('allows Disengage for controlled mount', () => {
    expect(enforceMountedCombatRestrictions('controlled', 'Disengage').allowed).toBe(true)
  })

  it('allows Dodge for controlled mount', () => {
    expect(enforceMountedCombatRestrictions('controlled', 'Dodge').allowed).toBe(true)
  })

  it('rejects Attack for controlled mount', () => {
    const result = enforceMountedCombatRestrictions('controlled', 'Attack')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Controlled mounts can only Dash, Disengage, or Dodge')
    expect(result.reason).toContain('"Attack"')
  })

  it('rejects Cast a Spell for controlled mount', () => {
    const result = enforceMountedCombatRestrictions('controlled', 'Cast a Spell')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('"Cast a Spell"')
  })

  it('rejects empty string action for controlled mount', () => {
    const result = enforceMountedCombatRestrictions('controlled', '')
    expect(result.allowed).toBe(false)
  })
})

// ─── forceDismount ───────────────────────────────────────────────

describe('forceDismount', () => {
  describe('knocked-prone', () => {
    it('auto-dismounts with prone', () => {
      const result = forceDismount('rider-1', 'knocked-prone')
      expect(result.dismounted).toBe(true)
      expect(result.landedProne).toBe(true)
      expect(result.needsDexSave).toBe(false)
      expect(result.dexSaveDC).toBe(0)
      expect(result.reason).toContain('knocked prone')
    })

    it('ignores dexSaveResult for knocked-prone', () => {
      const result = forceDismount('rider-1', 'knocked-prone', 20)
      expect(result.landedProne).toBe(true)
      expect(result.needsDexSave).toBe(false)
    })
  })

  describe('mount-died', () => {
    it('needs a Dex save with DC 10', () => {
      const result = forceDismount('rider-1', 'mount-died')
      expect(result.dismounted).toBe(true)
      expect(result.needsDexSave).toBe(true)
      expect(result.dexSaveDC).toBe(10)
    })

    it('rider lands prone when no save result provided', () => {
      const result = forceDismount('rider-1', 'mount-died')
      expect(result.landedProne).toBe(true)
      expect(result.reason).toContain('falls prone')
    })

    it('rider lands prone when save result < 10', () => {
      const result = forceDismount('rider-1', 'mount-died', 9)
      expect(result.landedProne).toBe(true)
      expect(result.reason).toContain('falls prone')
    })

    it('rider lands on feet when save result = 10 (meets DC)', () => {
      const result = forceDismount('rider-1', 'mount-died', 10)
      expect(result.landedProne).toBe(false)
      expect(result.reason).toContain('lands on feet')
    })

    it('rider lands on feet when save result > 10', () => {
      const result = forceDismount('rider-1', 'mount-died', 18)
      expect(result.landedProne).toBe(false)
      expect(result.reason).toContain('lands on feet')
    })

    it('rider lands prone on natural 1 (value 1)', () => {
      const result = forceDismount('rider-1', 'mount-died', 1)
      expect(result.landedProne).toBe(true)
    })

    it('handles save result of 0', () => {
      const result = forceDismount('rider-1', 'mount-died', 0)
      expect(result.landedProne).toBe(true)
    })
  })

  describe('other reason', () => {
    it('dismounts without prone or dex save', () => {
      const result = forceDismount('rider-1', 'other')
      expect(result.dismounted).toBe(true)
      expect(result.landedProne).toBe(false)
      expect(result.needsDexSave).toBe(false)
      expect(result.dexSaveDC).toBe(0)
      expect(result.reason).toBe('Forced dismount')
    })
  })
})
