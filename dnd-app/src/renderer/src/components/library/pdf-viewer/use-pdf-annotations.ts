import { useCallback, useState } from 'react'
import { useT } from '../../../i18n'
import { generateId } from './pdf-utils'
import type { AnnotationEntry, BookmarkEntry } from './types'

export interface UsePdfAnnotationsOptions {
  bookId: string
  currentPage: number
}

/**
 * Bookmarks + page annotations for the PDF viewer: the lists, the bookmark/
 * annotation panel + input UI state, and the add/remove handlers. Extracted
 * from `PdfViewer` (god-file decomposition). The lists and their setters are
 * returned because the viewer persists + reloads them (book data store); the
 * panel/input flags and the management handlers are owned here.
 */
export function usePdfAnnotations({ bookId, currentPage }: UsePdfAnnotationsOptions) {
  const { t } = useT()
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([])
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [annotationText, setAnnotationText] = useState('')
  const [showAnnotationInput, setShowAnnotationInput] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: addBookmark uses t only for the bookmark label string. Listing fresh-each-render t recreates the callback every render.
  const addBookmark = useCallback(() => {
    const bookmark: BookmarkEntry = {
      id: generateId(),
      bookId,
      page: currentPage,
      label: t('library.pdfViewer.pageLabel', { page: currentPage }),
      createdAt: new Date().toISOString()
    }
    setBookmarks((prev) => [...prev, bookmark])
  }, [bookId, currentPage])

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const isPageBookmarked = bookmarks.some((b) => b.page === currentPage)

  const addAnnotation = useCallback(() => {
    if (!annotationText.trim()) return
    const annotation: AnnotationEntry = {
      id: generateId(),
      bookId,
      page: currentPage,
      text: annotationText.trim(),
      createdAt: new Date().toISOString()
    }
    setAnnotations((prev) => [...prev, annotation])
    setAnnotationText('')
    setShowAnnotationInput(false)
  }, [bookId, currentPage, annotationText])

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return {
    bookmarks,
    setBookmarks,
    annotations,
    setAnnotations,
    showBookmarks,
    setShowBookmarks,
    annotationText,
    setAnnotationText,
    showAnnotationInput,
    setShowAnnotationInput,
    addBookmark,
    removeBookmark,
    addAnnotation,
    removeAnnotation,
    isPageBookmarked
  }
}
