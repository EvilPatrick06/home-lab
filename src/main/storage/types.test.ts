import { describe, expect, it } from 'vitest'
import type { StorageResult } from './types'

describe('types', () => {
  it('should export StorageResult type that supports success with data', () => {
    const result: StorageResult<string> = { success: true, data: 'hello' }
    expect(result.success).toBe(true)
    expect(result.data).toBe('hello')
  })

  it('should export StorageResult type that supports failure with error', () => {
    const result: StorageResult<string> = { success: false, error: 'something went wrong' }
    expect(result.success).toBe(false)
    expect(result.error).toBe('something went wrong')
  })

  it('should export StorageResult type that supports success without data', () => {
    const result: StorageResult<void> = { success: true }
    expect(result.success).toBe(true)
    expect(result.data).toBeUndefined()
  })

  it('should export StorageResult type with complex data types', () => {
    const result: StorageResult<Record<string, unknown>[]> = {
      success: true,
      data: [{ id: '1', name: 'test' }]
    }
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it('should verify the module can be dynamically imported', async () => {
    const mod = await import('./types')
    expect(mod).toBeDefined()
  })
})
