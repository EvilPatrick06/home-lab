import { describe, expect, it } from 'vitest'
import { generateInviteCode } from './invite-code'

describe('generateInviteCode', () => {
  it('returns a string', () => {
    const code = generateInviteCode()
    expect(typeof code).toBe('string')
  })

  it('returns a code of length 6 (INVITE_CODE_LENGTH)', () => {
    const code = generateInviteCode()
    expect(code).toHaveLength(6)
  })

  it('only contains allowed characters (no ambiguous chars like 0, O, I, 1)', () => {
    const allowed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode()
      for (const char of code) {
        expect(allowed).toContain(char)
      }
    }
  })

  it('does not contain ambiguous characters O, I, 0, 1', () => {
    // Generate many codes to have high confidence
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode()
      expect(code).not.toMatch(/[OI01]/)
    }
  })

  it('generates different codes on successive calls (statistical)', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 50; i++) {
      codes.add(generateInviteCode())
    }
    // With 30^6 possibilities, 50 codes should all be unique
    expect(codes.size).toBe(50)
  })

  it('returns only uppercase letters and digits', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateInviteCode()
      expect(code).toMatch(/^[A-Z0-9]+$/)
    }
  })
})
