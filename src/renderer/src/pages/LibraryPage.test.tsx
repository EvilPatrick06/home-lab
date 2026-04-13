import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/library', () => ({
  CoreBooksGrid: () => null,
  HomebrewCreateModal: () => null,
  LibraryCategoryGrid: () => null,
  LibraryDetailModal: () => null,
  LibraryFilterBar: () => null,
  LibraryItemList: () => null,
  LibrarySidebar: () => null,
  PdfViewer: () => null
}))

describe('LibraryPage', () => {
  it('can be imported', async () => {
    const mod = await import('./LibraryPage')
    expect(mod).toBeDefined()
  })
})
