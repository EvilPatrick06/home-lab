import type { LibraryCategory, LibraryItem } from '../../types/library'

export interface ContentReference {
  category: LibraryCategory
  id: string
  name: string
}

let nameIndex: Map<string, ContentReference> = new Map()

export function buildContentIndex(items: LibraryItem[]): void {
  nameIndex = new Map()
  for (const item of items) {
    nameIndex.set(item.name.toLowerCase(), { category: item.category, id: item.id, name: item.name })
  }
}

export function lookupContent(name: string): ContentReference | null {
  return nameIndex.get(name.toLowerCase()) ?? null
}

export function isContentIndexBuilt(): boolean {
  return nameIndex.size > 0
}
