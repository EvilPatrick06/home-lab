import { describe, expect, it } from 'vitest'
import { isValidUUID } from './uuid'

describe('isValidUUID', () => {
  it('should accept a valid lowercase UUID', () => {
    expect(isValidUUID('12345678-1234-1234-1234-123456789abc')).toBe(true)
  })

  it('should accept a valid uppercase UUID', () => {
    expect(isValidUUID('12345678-1234-1234-1234-123456789ABC')).toBe(true)
  })

  it('should accept a valid mixed-case UUID', () => {
    expect(isValidUUID('12345678-ABCD-1234-abcd-123456789abc')).toBe(true)
  })

  it('should reject empty string', () => {
    expect(isValidUUID('')).toBe(false)
  })

  it('should reject random string', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false)
  })

  it('should reject UUID without dashes', () => {
    expect(isValidUUID('12345678123412341234123456789abc')).toBe(false)
  })

  it('should reject UUID with wrong segment lengths', () => {
    expect(isValidUUID('1234567-1234-1234-1234-123456789abc')).toBe(false)
  })

  it('should reject UUID with extra characters', () => {
    expect(isValidUUID('12345678-1234-1234-1234-123456789abcd')).toBe(false)
  })

  it('should reject UUID with non-hex characters', () => {
    expect(isValidUUID('12345678-1234-1234-1234-123456789xyz')).toBe(false)
  })

  it('should reject UUID with leading/trailing spaces', () => {
    expect(isValidUUID(' 12345678-1234-1234-1234-123456789abc ')).toBe(false)
  })

  it('should reject UUID with braces', () => {
    expect(isValidUUID('{12345678-1234-1234-1234-123456789abc}')).toBe(false)
  })
})
