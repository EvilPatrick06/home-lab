// Type/interface definitions for the PDF viewer. Extracted from PdfViewer.tsx
// (behavior-preserving decomposition). Re-exported from PdfViewer.tsx so any
// existing import path continues to resolve.

export interface BookmarkEntry {
  id: string
  bookId: string
  page: number
  label: string
  color?: string
  createdAt: string
}

export interface AnnotationEntry {
  id: string
  bookId: string
  page: number
  text: string
  highlight?: { x: number; y: number; width: number; height: number }
  createdAt: string
}

export interface PdfViewerProps {
  bookId: string
  filePath: string
  title: string
  onClose: () => void
  onOpenBook?: (bookId: string, page: number) => void
}

export type SearchHighlight = { x: number; y: number; width: number; height: number }

export interface TocEntry {
  title: string
  page: number
  level: number // 0 = top-level, 1 = sub-section, 2 = sub-sub
  crossRef?: { bookId: string; page: number } // optional cross-book reference
}
