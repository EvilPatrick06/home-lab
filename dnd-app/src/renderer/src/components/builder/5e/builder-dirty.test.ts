import { describe, expect, it } from 'vitest'
import { builderHasUnsavedContent } from './builder-dirty'

describe('builderHasUnsavedContent (PHASE-48 F1)', () => {
  it('is false for a pristine builder (no name, nothing selected)', () => {
    expect(builderHasUnsavedContent('', [{ selectedId: null }, { selectedId: undefined }])).toBe(false)
    expect(builderHasUnsavedContent('   ', [])).toBe(false)
  })
  it('is true once a name is entered', () => {
    expect(builderHasUnsavedContent('Aria', [])).toBe(true)
  })
  it('is true once any build slot has a selection', () => {
    expect(builderHasUnsavedContent('', [{ selectedId: null }, { selectedId: 'wizard' }])).toBe(true)
  })
})
