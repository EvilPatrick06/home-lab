import type { LibraryCategory } from '../../types/library'

export type LibraryDragPayload =
  | { type: 'library-monster'; itemId: string; itemName: string }
  | { type: 'library-spell'; itemId: string; itemName: string }
  | { type: 'library-item'; itemId: string; itemName: string; category: LibraryCategory }

const MIME = 'application/x-dndvtt-drag'

export function setDragPayload(e: React.DragEvent, payload: LibraryDragPayload): void {
  e.dataTransfer.setData(MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'copy'
}

export function getDragPayload(e: DragEvent | React.DragEvent): LibraryDragPayload | null {
  try {
    const raw = e.dataTransfer?.getData(MIME)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function hasLibraryDrag(e: DragEvent | React.DragEvent): boolean {
  return e.dataTransfer?.types?.includes(MIME) ?? false
}
