import { describe, expect, it, vi } from 'vitest'
import AttackModal from './AttackModal'

vi.mock('./AttackModalSteps', () => ({
  AttackResultStep: () => null,
  AttackRollStep: () => null,
  DamageResultStep: () => null,
  TargetSelectionStep: () => null,
  UnarmedModeStep: () => null,
  WeaponSelectionStep: () => null
}))

describe('AttackModal', () => {
  it('can be imported', () => {
    expect(AttackModal).toBeDefined()
  })
})
