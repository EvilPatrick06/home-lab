import type { PDFDocumentProxy } from 'pdfjs-dist'
import * as pdfjsLib from 'pdfjs-dist'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import type { DrawingStroke, DrawingTool, PageDrawings } from './PdfDrawingOverlay'
import PdfDrawingOverlay, { DrawingToolbar } from './PdfDrawingOverlay'
import { generateId, initPdfWorker } from './pdf-viewer/pdf-helpers'
import { CROSS_BOOK_REFS, FALLBACK_TOC, SUPPLEMENTAL_TOC } from './pdf-viewer/toc-data'
import { sortByPage } from './pdf-viewer/toc-utils'
import type { AnnotationEntry, BookmarkEntry, PdfViewerProps, SearchHighlight, TocEntry } from './pdf-viewer/types'

// Re-export internal types so any existing import of these symbols from this
// module path continues to resolve after the decomposition.
export type { AnnotationEntry, BookmarkEntry, PdfViewerProps, SearchHighlight, TocEntry }

// Fetch the worker script and create a blob URL — works in both dev and production Electron
initPdfWorker()

export default function PdfViewer({ bookId, filePath, title, onClose, onOpenBook }: PdfViewerProps): JSX.Element {
  const { t } = useT()
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageInput, setPageInput] = useState('1')

  // PDF page labels (e.g., "i", "ii", "1", "2") — maps 1-based index to label
  const [pageLabels, setPageLabels] = useState<string[]>([])

  // Table of Contents
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([])
  const [showToc, setShowToc] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set())
  const [userSelectedTocIdx, setUserSelectedTocIdx] = useState<number | null>(null)

  // View mode
  const [twoPageView, setTwoPageView] = useState(false)

  // Track which pages have been rendered and their dimensions
  const [_renderedPages, setRenderedPages] = useState<Set<number>>(new Set())
  const renderedPagesRef = useRef<Set<number>>(new Set())
  const [pageDimensions, setPageDimensions] = useState<Map<number, { width: number; height: number }>>(new Map())

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<Array<{ page: number; matches: number }>>([])
  const [currentSearchIdx, setCurrentSearchIdx] = useState(0)

  // Bookmarks & annotations
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([])
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [annotationText, setAnnotationText] = useState('')
  const [showAnnotationInput, setShowAnnotationInput] = useState(false)

  // Drawing tools
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const [drawingColor, setDrawingColor] = useState('#FACC15')
  const [drawingSize, setDrawingSize] = useState(20)
  const [pageDrawings, setPageDrawings] = useState<PageDrawings>({})
  const [redoStack, setRedoStack] = useState<PageDrawings>({})

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map())
  const canvasRefsMap = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isScrollingToPage = useRef(false)
  const renderingPages = useRef<Set<number>>(new Set())
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage
  const [pendingGoToPage, setPendingGoToPage] = useState<number | null>(null)

  // Load PDF
  useEffect(() => {
    let cancelled = false

    async function loadPdf(): Promise<void> {
      try {
        setLoading(true)
        setError(null)

        const result = await window.api.books.readFile(filePath)

        if (!result.success || !result.data) {
          setError(result.error ?? t('library.pdfViewer.readFailed'))
          setLoading(false)
          return
        }

        const typedArray = new Uint8Array(result.data)
        const loadingTask = pdfjsLib.getDocument({ data: typedArray })
        const doc = await loadingTask.promise

        if (!cancelled) {
          setPdfDoc(doc)
          setTotalPages(doc.numPages)

          // Fetch PDF page labels (roman numerals, custom numbering, etc.)
          try {
            const labels = await doc.getPageLabels()
            if (labels && labels.length > 0) {
              setPageLabels(labels)
              setPageInput(labels[0] ?? '1')
            }
          } catch {
            // No page labels — fall back to sequential numbers
          }

          // Build Table of Contents from PDF outline, fallback, or cross-book refs
          try {
            let entries: TocEntry[] = []

            const outline = await doc.getOutline()
            if (outline && outline.length > 0) {
              async function walkOutline(items: typeof outline, level: number): Promise<void> {
                for (const item of items) {
                  let pageNum = 1
                  if (item.dest) {
                    try {
                      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
                      if (dest?.[0]) {
                        const pageIdx = await doc.getPageIndex(dest[0])
                        pageNum = pageIdx + 1
                      }
                    } catch {
                      /* keep default page 1 */
                    }
                  }
                  entries.push({ title: item.title, page: pageNum, level })
                  if (item.items && item.items.length > 0) {
                    await walkOutline(item.items, level + 1)
                  }
                }
              }
              await walkOutline(outline, 0)
            } else if (FALLBACK_TOC[bookId]) {
              entries = [...FALLBACK_TOC[bookId]]
            }

            // Merge supplemental entries (adds navigation points not in the PDF outline)
            if (SUPPLEMENTAL_TOC[bookId]) {
              const existing = new Set(entries.map((e) => `${e.title}:${e.page}`))
              for (const supp of SUPPLEMENTAL_TOC[bookId]) {
                if (!existing.has(`${supp.title}:${supp.page}`)) {
                  entries.push(supp)
                }
              }
            }

            // Append cross-book references
            if (CROSS_BOOK_REFS[bookId]) {
              entries.push({ title: t('library.pdfViewer.crossReferences'), page: 0, level: 0 })
              entries.push(...CROSS_BOOK_REFS[bookId])
            }

            if (!cancelled && entries.length > 0) {
              // Sort siblings by page number to fix out-of-order entries
              // (skip cross-refs at the end — they have page 0 or foreign pages)
              const mainEntries = entries.filter((e) => !e.crossRef && e.page > 0)
              const crossRefEntries = entries.filter((e) => e.crossRef || e.page === 0)

              const sortedEntries = [...sortByPage(mainEntries), ...crossRefEntries]
              setTocEntries(sortedEntries)
              // Collapse all sections that have children by default
              const collapsed = new Set<number>()
              for (let i = 0; i < sortedEntries.length; i++) {
                if (i < sortedEntries.length - 1 && sortedEntries[i + 1].level > sortedEntries[i].level) {
                  collapsed.add(i)
                }
              }
              setCollapsedSections(collapsed)
            }
          } catch {
            // No outline available — try fallback
            if (FALLBACK_TOC[bookId]) {
              const entries = [...FALLBACK_TOC[bookId]]
              if (CROSS_BOOK_REFS[bookId]) {
                entries.push({ title: t('library.pdfViewer.crossReferences'), page: 0, level: 0 })
                entries.push(...CROSS_BOOK_REFS[bookId])
              }
              setTocEntries(entries)
              const collapsed = new Set<number>()
              for (let i = 0; i < entries.length; i++) {
                if (i < entries.length - 1 && entries[i + 1].level > entries[i].level) {
                  collapsed.add(i)
                }
              }
              setCollapsedSections(collapsed)
            }
          }

          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('library.pdfViewer.loadFailed'))
          setLoading(false)
        }
      }
    }

    loadPdf()
    return () => {
      cancelled = true
    }
  }, [filePath, bookId])

  // Pre-fetch page dimensions so placeholders have the right size
  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false

    async function fetchDimensions(): Promise<void> {
      const dims = new Map<number, { width: number; height: number }>()
      // Fetch first page dimension as a default
      const firstPage = await pdfDoc!.getPage(1)
      const firstVp = firstPage.getViewport({ scale })
      const defaultDim = { width: firstVp.width, height: firstVp.height }

      for (let i = 1; i <= pdfDoc!.numPages; i++) {
        dims.set(i, defaultDim)
      }

      if (!cancelled) {
        setPageDimensions(dims)
      }
    }

    fetchDimensions()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, scale])

  // Render a single page to its canvas
  const renderPageToCanvas = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc) return
      if (renderingPages.current.has(pageNum)) return
      renderingPages.current.add(pageNum)

      try {
        const canvas = canvasRefsMap.current.get(pageNum)
        if (!canvas) {
          renderingPages.current.delete(pageNum)
          return
        }

        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale })
        const context = canvas.getContext('2d')
        if (!context) {
          renderingPages.current.delete(pageNum)
          return
        }

        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({ canvasContext: context, viewport }).promise
        renderedPagesRef.current.add(pageNum)
        setRenderedPages((prev) => new Set(prev).add(pageNum))

        // Update actual dimensions
        setPageDimensions((prev) => {
          const next = new Map(prev)
          next.set(pageNum, { width: viewport.width, height: viewport.height })
          return next
        })
      } catch {
        // Render failure — canvas stays blank
      } finally {
        renderingPages.current.delete(pageNum)
      }
    },
    [pdfDoc, scale]
  )

  // Clear rendered pages when scale changes
  useEffect(() => {
    renderedPagesRef.current = new Set()
    setRenderedPages(new Set())
    renderingPages.current.clear()
  }, [])

  // Get the display label for a page
  const getPageLabel = useCallback(
    (pageNum: number): string => {
      if (pageLabels.length > 0 && pageNum >= 1 && pageNum <= pageLabels.length) {
        return pageLabels[pageNum - 1] ?? String(pageNum)
      }
      return String(pageNum)
    },
    [pageLabels]
  )
  const getPageLabelRef = useRef(getPageLabel)
  getPageLabelRef.current = getPageLabel

  // Resolve a label string to a 1-based page index
  const resolvePageFromInput = useCallback(
    (input: string): number | null => {
      const trimmed = input.trim()

      // Check PDF-embedded labels
      if (pageLabels.length > 0) {
        const lower = trimmed.toLowerCase()
        const idx = pageLabels.findIndex((l) => l?.toLowerCase() === lower)
        if (idx >= 0) return idx + 1
      }

      // Try Arabic number
      const num = parseInt(trimmed, 10)
      if (!Number.isNaN(num) && num >= 1 && num <= totalPages) return num

      return null
    },
    [totalPages, pageLabels]
  )

  // Stable ref for renderPageToCanvas so observer doesn't re-fire on scale change
  const renderPageRef = useRef(renderPageToCanvas)
  renderPageRef.current = renderPageToCanvas

  // IntersectionObserver — only tracks current page + triggers render for unrendered pages
  useEffect(() => {
    if (!pdfDoc || pageDimensions.size === 0) return

    const container = scrollContainerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number(entry.target.getAttribute('data-page'))
          if (!pageNum) continue

          if (entry.isIntersecting) {
            if (!renderedPagesRef.current.has(pageNum) && !renderingPages.current.has(pageNum)) {
              renderPageRef.current(pageNum)
            }
          }
        }

        // Update current page from the most visible page
        if (!isScrollingToPage.current) {
          const visibleEntries = entries.filter((e) => e.isIntersecting)
          if (visibleEntries.length > 0) {
            let bestEntry = visibleEntries[0]
            for (const e of visibleEntries) {
              if (e.intersectionRatio > bestEntry.intersectionRatio) {
                bestEntry = e
              }
            }
            const pageNum = Number(bestEntry.target.getAttribute('data-page'))
            if (pageNum && pageNum !== currentPageRef.current) {
              setCurrentPage(pageNum)
              setPageInput(getPageLabelRef.current(pageNum))
              setUserSelectedTocIdx(null)
            }
          }
        }
      },
      {
        root: container,
        rootMargin: '400px 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1.0]
      }
    )

    // Observe all page placeholders
    for (const [, el] of pageRefsMap.current) {
      observer.observe(el)
    }

    return () => observer.disconnect()
  }, [pdfDoc, pageDimensions])

  // Background pre-render using requestIdleCallback for smooth scrolling
  useEffect(() => {
    if (!pdfDoc || totalPages === 0 || pageDimensions.size === 0) return

    let cancelled = false
    let nextPage = 1

    const renderNext = (deadline?: IdleDeadline) => {
      if (cancelled) return

      // Render pages while we have idle time (or in small batches via setTimeout fallback)
      const timeLimit = deadline ? () => deadline.timeRemaining() > 5 : () => true
      let rendered = 0

      while (nextPage <= totalPages && timeLimit() && rendered < 3) {
        if (
          !renderedPagesRef.current.has(nextPage) &&
          !renderingPages.current.has(nextPage) &&
          canvasRefsMap.current.has(nextPage)
        ) {
          renderPageRef.current(nextPage)
          rendered++
        }
        nextPage++
      }

      if (nextPage <= totalPages && !cancelled) {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(renderNext, { timeout: 2000 })
        } else {
          setTimeout(() => renderNext(), 100)
        }
      }
    }

    // Start after a short delay to let visible pages render first
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(renderNext, { timeout: 2000 })
      } else {
        renderNext()
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pdfDoc, totalPages, pageDimensions])

  // Re-render all pages when view mode changes
  useEffect(() => {
    renderedPagesRef.current = new Set()
    setRenderedPages(new Set())
    renderingPages.current = new Set()
  }, [])

  // Ref that always holds the best-known "last page" — survives React render cycles
  const savedLastPageRef = useRef(1)
  // Refs for latest values so unmount save captures current state
  const bookmarksRef = useRef(bookmarks)
  bookmarksRef.current = bookmarks
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const pageDrawingsRef = useRef(pageDrawings)
  pageDrawingsRef.current = pageDrawings

  // Update savedLastPageRef whenever user scrolls past page 1
  useEffect(() => {
    if (currentPage > 1) {
      savedLastPageRef.current = currentPage
    }
  }, [currentPage])

  // Load bookmarks & annotations & drawings & last page
  useEffect(() => {
    window.api.books.loadData(bookId).then((data) => {
      setBookmarks(data.bookmarks as BookmarkEntry[])
      setAnnotations(data.annotations as AnnotationEntry[])
      if (data.drawings) setPageDrawings(data.drawings as PageDrawings)
      if (data.lastPage && typeof data.lastPage === 'number' && data.lastPage > 1) {
        savedLastPageRef.current = data.lastPage as number
        setPendingGoToPage(data.lastPage as number)
      }
    })
  }, [bookId])

  // Helper to build save payload using ref for lastPage (never overwrites with 1)
  const doSave = useCallback(() => {
    window.api.books.saveData(bookId, {
      bookmarks,
      annotations,
      drawings: pageDrawings,
      lastPage: savedLastPageRef.current
    })
  }, [bookId, bookmarks, annotations, pageDrawings])

  // Save on bookmark/annotation/drawing changes
  const hasSavedInitial = useRef(false)
  useEffect(() => {
    // Skip the very first render (initial empty state)
    if (!hasSavedInitial.current) {
      hasSavedInitial.current = true
      return
    }
    if (bookmarks.length > 0 || annotations.length > 0 || Object.keys(pageDrawings).length > 0) {
      doSave()
    }
  }, [bookmarks, annotations, pageDrawings, doSave])

  // Debounced save for page changes while scrolling
  useEffect(() => {
    if (currentPage <= 1) return
    const timer = setTimeout(() => doSave(), 1000)
    return () => clearTimeout(timer)
  }, [currentPage, doSave])

  // Save on unmount so lastPage is always persisted
  useEffect(() => {
    return () => {
      window.api.books.saveData(bookId, {
        bookmarks: bookmarksRef.current,
        annotations: annotationsRef.current,
        drawings: pageDrawingsRef.current,
        lastPage: savedLastPageRef.current
      })
    }
  }, [bookId])

  // Page navigation — scrolls to the target page
  const goToPage = useCallback(
    (page: number) => {
      const p = Math.max(1, Math.min(page, totalPages))
      setCurrentPage(p)
      setPageInput(getPageLabel(p))

      const el = pageRefsMap.current.get(p)
      if (el) {
        isScrollingToPage.current = true
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setTimeout(() => {
          isScrollingToPage.current = false
        }, 500)
      }
    },
    [totalPages, getPageLabel]
  )

  // Navigate to last-read page once pages are mounted and loading is complete
  useEffect(() => {
    if (loading) return
    if (pendingGoToPage && pageDimensions.size > 0 && totalPages > 0) {
      const target = Math.max(1, Math.min(pendingGoToPage, totalPages))
      setPendingGoToPage(null)

      // Explicitly render the target page and nearby pages first
      const pagesToRender = [target - 2, target - 1, target, target + 1, target + 2].filter(
        (p) => p >= 1 && p <= totalPages
      )
      for (const p of pagesToRender) {
        if (!renderedPagesRef.current.has(p)) {
          renderPageRef.current(p)
        }
      }

      // Wait a frame for DOM to update, then scroll to the exact element
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = pageRefsMap.current.get(target)
          if (el) {
            isScrollingToPage.current = true
            el.scrollIntoView({ behavior: 'instant', block: 'start' })
            setTimeout(() => {
              isScrollingToPage.current = false
            }, 500)
          }
          setCurrentPage(target)
          setPageInput(getPageLabel(target))
        })
      })
    }
  }, [pendingGoToPage, pageDimensions, totalPages, getPageLabel, loading])

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1)
  }, [currentPage, goToPage])

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1)
  }, [currentPage, goToPage])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
        setTimeout(() => searchInputRef.current?.focus(), 100)
        return
      }
      if (e.key === 'Escape') {
        if (searchOpen) {
          setSearchOpen(false)
        } else {
          onClose()
        }
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        nextPage()
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        prevPage()
      }
      if (e.key === '+' && e.ctrlKey) {
        e.preventDefault()
        setScale((s) => Math.min(s + 0.2, 3.0))
      }
      if (e.key === '-' && e.ctrlKey) {
        e.preventDefault()
        setScale((s) => Math.max(s - 0.2, 0.4))
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [searchOpen, onClose, nextPage, prevPage])

  // Listen for cross-book navigation events
  useEffect(() => {
    function handleGoToPage(e: Event): void {
      const detail = (e as CustomEvent).detail
      if (detail?.page) {
        goToPage(detail.page)
      }
    }
    window.addEventListener('pdf-go-to-page', handleGoToPage)
    return () => window.removeEventListener('pdf-go-to-page', handleGoToPage)
  }, [goToPage])

  // Search highlights per page
  const [searchHighlights, setSearchHighlights] = useState<Map<number, SearchHighlight[]>>(new Map())

  // Text search — also extracts highlight rectangles for matching text
  const handleSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) return

    const results: Array<{ page: number; matches: number }> = []
    const highlights = new Map<number, SearchHighlight[]>()
    const query = searchQuery.toLowerCase()

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i)
        const textContent = await page.getTextContent()
        const viewport = page.getViewport({ scale })

        const pageHighlights: SearchHighlight[] = []
        let totalMatches = 0

        for (const item of textContent.items) {
          if (!('str' in item) || !item.str) continue
          const str = item.str.toLowerCase()
          if (!str.includes(query)) continue

          // Count matches in this item
          let pos = str.indexOf(query)
          while (pos !== -1) {
            totalMatches++
            pos = str.indexOf(query, pos + query.length)
          }

          // Extract position from the transform matrix [scaleX, skewX, skewY, scaleY, tx, ty]
          const tx = item.transform[4]
          const ty = item.transform[5]
          const fontSize = Math.abs(item.transform[0]) || 12
          // Convert PDF coordinates to canvas coordinates via viewport
          const [x, y] = viewport.convertToViewportPoint(tx, ty)
          const itemWidth = item.width * viewport.scale
          const itemHeight = fontSize * viewport.scale

          pageHighlights.push({
            x,
            y: y - itemHeight,
            width: itemWidth,
            height: itemHeight
          })
        }

        if (totalMatches > 0) {
          results.push({ page: i, matches: totalMatches })
          highlights.set(i, pageHighlights)
        }
      } catch {
        // Skip page
      }
    }

    setSearchResults(results)
    setSearchHighlights(highlights)
    setCurrentSearchIdx(0)
    if (results.length > 0) {
      goToPage(results[0].page)
    }
  }, [pdfDoc, searchQuery, goToPage, scale])

  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return
    const next = (currentSearchIdx + 1) % searchResults.length
    setCurrentSearchIdx(next)
    goToPage(searchResults[next].page)
  }, [searchResults, currentSearchIdx, goToPage])

  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return
    const prev = (currentSearchIdx - 1 + searchResults.length) % searchResults.length
    setCurrentSearchIdx(prev)
    goToPage(searchResults[prev].page)
  }, [searchResults, currentSearchIdx, goToPage])

  // Bookmark management
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

  // Annotation management
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

  // Drawing callbacks
  const handleStrokeComplete = useCallback((_page: number, stroke: DrawingStroke) => {
    setPageDrawings((prev) => {
      const existing = prev[_page] || []
      return { ...prev, [_page]: [...existing, stroke] }
    })
    setRedoStack((prev) => {
      const next = { ...prev }
      delete next[_page]
      return next
    })
  }, [])

  const handleUndoDrawing = useCallback(() => {
    setPageDrawings((prev) => {
      const existing = prev[currentPage]
      if (!existing || existing.length === 0) return prev
      const removed = existing[existing.length - 1]
      setRedoStack((rs) => ({
        ...rs,
        [currentPage]: [...(rs[currentPage] || []), removed]
      }))
      return { ...prev, [currentPage]: existing.slice(0, -1) }
    })
  }, [currentPage])

  const handleRedoDrawing = useCallback(() => {
    setRedoStack((prev) => {
      const stack = prev[currentPage]
      if (!stack || stack.length === 0) return prev
      const restored = stack[stack.length - 1]
      setPageDrawings((pd) => ({
        ...pd,
        [currentPage]: [...(pd[currentPage] || []), restored]
      }))
      return { ...prev, [currentPage]: stack.slice(0, -1) }
    })
  }, [currentPage])

  const handleClearPageDrawings = useCallback(() => {
    const existing = pageDrawings[currentPage]
    if (!existing || existing.length === 0) return
    // Push all cleared strokes (reversed) onto redo so clear can be undone
    setRedoStack((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), ...existing.slice().reverse()]
    }))
    setPageDrawings((prev) => {
      const next = { ...prev }
      delete next[currentPage]
      return next
    })
  }, [currentPage, pageDrawings])

  const currentPageHasStrokes = (pageDrawings[currentPage]?.length ?? 0) > 0
  const currentPageHasRedo = (redoStack[currentPage]?.length ?? 0) > 0

  const _pageAnnotations = annotations.filter((a) => a.page === currentPage)

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-300 text-lg">{t('library.pdfViewer.loadingTitle', { title })}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-400 text-lg mb-2">{t('library.pdfViewer.loadFailed')}</p>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
          >
            {t('common.actions.close')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <button
          onClick={onClose}
          className="px-2 py-1 text-gray-400 hover:text-gray-200 transition-colors"
          title={t('library.pdfViewer.closeEsc')}
        >
          ✕
        </button>
        <span className="text-gray-200 font-medium truncate max-w-xs">{title}</span>

        <div className="flex-1" />

        {/* Page navigation */}
        <button
          onClick={prevPage}
          disabled={currentPage <= 1}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded disabled:opacity-40 transition-colors"
        >
          ◀
        </button>
        <div className="flex items-center gap-1 text-sm text-gray-300">
          <input
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const resolved = resolvePageFromInput(pageInput)
                if (resolved) goToPage(resolved)
              }
            }}
            onBlur={() => {
              const resolved = resolvePageFromInput(pageInput)
              if (resolved) goToPage(resolved)
              else setPageInput(getPageLabel(currentPage))
            }}
            className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-center text-gray-200 text-sm"
          />
          <span>/ {totalPages}</span>
        </div>
        <button
          onClick={nextPage}
          disabled={currentPage >= totalPages}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded disabled:opacity-40 transition-colors"
        >
          ▶
        </button>

        <div className="w-px h-6 bg-gray-700 mx-1" />
        <button
          onClick={() => setScale((s) => Math.max(s - 0.2, 0.4))}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          title={t('library.pdfViewer.zoomOut')}
        >
          −
        </button>
        <span className="text-sm text-gray-400 w-12 text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale((s) => Math.min(s + 0.2, 3.0))}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          title={t('library.pdfViewer.zoomIn')}
        >
          +
        </button>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Search */}
        <button
          onClick={() => {
            setSearchOpen(!searchOpen)
            setTimeout(() => searchInputRef.current?.focus(), 100)
          }}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            searchOpen ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title={t('library.pdfViewer.searchTitle')}
        >
          🔍
        </button>

        {/* Two-page view toggle */}
        <button
          onClick={() => setTwoPageView(!twoPageView)}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            twoPageView ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title={twoPageView ? t('library.pdfViewer.singlePageView') : t('library.pdfViewer.twoPageView')}
        >
          📖
        </button>

        {/* Table of Contents toggle */}
        <button
          onClick={() => setShowToc(!showToc)}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            showToc ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title={t('library.pdfViewer.tableOfContents')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 inline"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="16" y2="12" />
            <line x1="3" y1="18" x2="18" y2="18" />
          </svg>
        </button>

        {/* Bookmarks toggle */}
        <button
          onClick={() => setShowBookmarks(!showBookmarks)}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            showBookmarks ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title={t('library.pdfViewer.bookmarksAnnotations')}
        >
          📑
        </button>

        {/* Add bookmark */}
        <button
          onClick={addBookmark}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            isPageBookmarked ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title={isPageBookmarked ? t('library.pdfViewer.pageBookmarked') : t('library.pdfViewer.bookmarkPage')}
        >
          {isPageBookmarked ? '🔖' : '📌'}
        </button>

        {/* Add annotation */}
        <button
          onClick={() => setShowAnnotationInput(!showAnnotationInput)}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
          title={t('library.pdfViewer.addAnnotation')}
        >
          📝
        </button>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Drawing tools */}
        <DrawingToolbar
          activeTool={drawingTool}
          color={drawingColor}
          size={drawingSize}
          onToolChange={setDrawingTool}
          onColorChange={setDrawingColor}
          onSizeChange={setDrawingSize}
          onUndo={handleUndoDrawing}
          onRedo={handleRedoDrawing}
          onClearPage={handleClearPageDrawings}
          hasStrokes={currentPageHasStrokes}
          hasRedo={currentPageHasRedo}
        />
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/90 border-b border-gray-800 shrink-0">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (searchResults.length > 0 && searchQuery.trim().length > 0) {
                  nextSearchResult()
                } else {
                  handleSearch()
                }
              }
            }}
            placeholder={t('library.pdfViewer.searchPlaceholder')}
            className="flex-1 max-w-sm bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={handleSearch}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm transition-colors"
          >
            {t('library.pdfViewer.search')}
          </button>
          {searchResults.length > 0 && (
            <>
              <span className="text-sm text-gray-400">
                {t('library.pdfViewer.searchPagesCount', {
                  current: currentSearchIdx + 1,
                  total: searchResults.length
                })}
              </span>
              <button
                onClick={prevSearchResult}
                className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm"
              >
                ▲
              </button>
              <button
                onClick={nextSearchResult}
                className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm"
              >
                ▼
              </button>
            </>
          )}
          {searchResults.length === 0 && searchQuery.trim() && (
            <span className="text-sm text-gray-500">{t('library.pdfViewer.noResults')}</span>
          )}
        </div>
      )}

      {/* Annotation input */}
      {showAnnotationInput && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/90 border-b border-gray-800 shrink-0">
          <span className="text-sm text-gray-400">{t('library.pdfViewer.noteForPage', { page: currentPage })}</span>
          <input
            type="text"
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addAnnotation()
            }}
            placeholder={t('library.pdfViewer.annotationPlaceholder')}
            className="flex-1 max-w-md bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
            autoFocus
          />
          <button
            onClick={addAnnotation}
            disabled={!annotationText.trim()}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm transition-colors disabled:opacity-40"
          >
            {t('library.pdfViewer.add')}
          </button>
          <button
            onClick={() => setShowAnnotationInput(false)}
            className="px-2 py-1 text-gray-400 hover:text-gray-200 text-sm"
          >
            {t('common.actions.cancel')}
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Table of Contents sidebar */}
        {showToc && tocEntries.length > 0 && (
          <div className="w-64 bg-gray-900 border-r border-gray-800 shrink-0 flex flex-col">
            <div className="p-3 border-b border-gray-800">
              <h3 className="text-sm font-bold text-amber-400">{t('library.pdfViewer.tableOfContents')}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {(() => {
                // Find the active entry: last entry whose page <= currentPage
                // If user clicked a specific entry, prefer that while on the same page
                let activeIdx = -1
                if (userSelectedTocIdx !== null && tocEntries[userSelectedTocIdx]?.page === currentPage) {
                  activeIdx = userSelectedTocIdx
                } else {
                  for (let i = 0; i < tocEntries.length; i++) {
                    const e = tocEntries[i]
                    if (e.crossRef || e.page === 0) continue
                    if (e.page <= currentPage) {
                      activeIdx = i
                    }
                  }
                }

                return tocEntries.map((entry, idx) => {
                  // Determine if this entry has children (next entry has higher level)
                  const hasChildren = idx < tocEntries.length - 1 && tocEntries[idx + 1].level > entry.level
                  const isCollapsed = collapsedSections.has(idx)

                  // Check if this entry is hidden because an ancestor is collapsed
                  let hidden = false
                  {
                    let searchLevel = entry.level
                    for (let p = idx - 1; p >= 0 && searchLevel > 0; p--) {
                      if (tocEntries[p].level < searchLevel) {
                        if (collapsedSections.has(p)) {
                          hidden = true
                          break
                        }
                        searchLevel = tocEntries[p].level
                      }
                    }
                  }

                  if (hidden) return null

                  const isCrossRefDivider = entry.page === 0 && !entry.crossRef
                  const isActive = idx === activeIdx && !isCrossRefDivider

                  const toggleCollapse = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    setCollapsedSections((prev) => {
                      const next = new Set(prev)
                      if (next.has(idx)) next.delete(idx)
                      else next.add(idx)
                      return next
                    })
                  }

                  return (
                    <div
                      key={`${entry.title}-${entry.page}-${idx}`}
                      className={`flex items-center rounded transition-colors ${
                        isActive
                          ? 'bg-amber-600/20 text-amber-400'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-gray-200'
                      }`}
                      style={{ paddingLeft: `${4 + entry.level * 12}px` }}
                    >
                      {/* Expand/collapse toggle */}
                      {hasChildren ? (
                        <button
                          onClick={toggleCollapse}
                          className="w-4 h-4 flex items-center justify-center text-xs text-gray-500 hover:text-gray-300 shrink-0"
                        >
                          {isCollapsed ? '▶' : '▼'}
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}

                      {/* Navigation button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (entry.crossRef && onOpenBook) {
                            onOpenBook(entry.crossRef.bookId, entry.crossRef.page)
                          } else if (entry.page > 0) {
                            setUserSelectedTocIdx(idx)
                            goToPage(entry.page)
                          }
                        }}
                        className={`flex-1 text-left px-1 py-1 text-xs flex items-center justify-between gap-1 min-w-0 ${
                          entry.crossRef ? 'text-blue-400 hover:text-blue-300' : ''
                        }`}
                      >
                        <span className="truncate">{entry.title}</span>
                        {entry.page > 0 && (
                          <span className="text-xs text-gray-500 shrink-0">{entry.crossRef ? '↗' : entry.page}</span>
                        )}
                      </button>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* Bookmarks & Annotations sidebar */}
        {showBookmarks && (
          <div className="w-64 bg-gray-900 border-r border-gray-800 overflow-y-auto shrink-0 p-3">
            <h3 className="text-sm font-bold text-amber-400 mb-3">{t('library.pdfViewer.bookmarks')}</h3>
            {bookmarks.length === 0 ? (
              <p className="text-xs text-gray-500">{t('library.pdfViewer.noBookmarks')}</p>
            ) : (
              <div className="space-y-1 mb-4">
                {bookmarks
                  .sort((a, b) => a.page - b.page)
                  .map((bm) => (
                    <div key={bm.id} className="flex items-center gap-1 group">
                      <button
                        onClick={() => goToPage(bm.page)}
                        className={`flex-1 text-left text-xs px-2 py-1 rounded transition-colors ${
                          bm.page === currentPage ? 'bg-amber-600/20 text-amber-400' : 'text-gray-300 hover:bg-gray-800'
                        }`}
                      >
                        🔖 {bm.label}
                      </button>
                      <button
                        onClick={() => removeBookmark(bm.id)}
                        className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            )}

            <h3 className="text-sm font-bold text-amber-400 mb-3 mt-4">{t('library.pdfViewer.annotations')}</h3>
            {annotations.length === 0 ? (
              <p className="text-xs text-gray-500">{t('library.pdfViewer.noAnnotations')}</p>
            ) : (
              <div className="space-y-2">
                {annotations
                  .sort((a, b) => a.page - b.page)
                  .map((ann) => (
                    <div key={ann.id} className="group bg-gray-800/50 rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <button
                          onClick={() => goToPage(ann.page)}
                          className="text-xs text-amber-500 hover:text-amber-400"
                        >
                          {t('library.pdfViewer.pageLabel', { page: ann.page })}
                        </button>
                        <button
                          onClick={() => removeAnnotation(ann.id)}
                          className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-xs text-gray-300">{ann.text}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Scrollable page area */}
        <div className="flex-1 overflow-auto" ref={scrollContainerRef} style={{ willChange: 'transform' }}>
          <div className="flex flex-col items-center py-4">
            {(() => {
              const renderPage = (pageNum: number) => {
                const dim = pageDimensions.get(pageNum)
                const pageAnns = annotations.filter((a) => a.page === pageNum)
                const highlights = searchHighlights.get(pageNum)
                const pageStrokes = pageDrawings[pageNum]
                const hasStrokes = pageStrokes && pageStrokes.length > 0
                // Only mount drawing canvas on pages that need it
                const showDrawingOverlay =
                  dim && (hasStrokes || (drawingTool !== 'none' && Math.abs(pageNum - currentPage) <= 2))

                return (
                  <div key={pageNum} className="flex flex-col items-center">
                    <div
                      data-page={pageNum}
                      ref={(el) => {
                        if (el) pageRefsMap.current.set(pageNum, el)
                        else pageRefsMap.current.delete(pageNum)
                      }}
                      className="relative shrink-0"
                      style={{
                        width: dim ? dim.width : 600,
                        minHeight: dim ? dim.height : 800,
                        contentVisibility: 'auto',
                        containIntrinsicSize: `${dim ? dim.width : 600}px ${dim ? dim.height : 800}px`
                      }}
                    >
                      <canvas
                        ref={(el) => {
                          if (el) canvasRefsMap.current.set(pageNum, el)
                          else canvasRefsMap.current.delete(pageNum)
                        }}
                        className="shadow-2xl block"
                      />

                      {highlights && highlights.length > 0 && (
                        <div className="absolute inset-0 pointer-events-none">
                          {highlights.map((hl, idx) => (
                            <div
                              key={idx}
                              className="absolute bg-yellow-400/40 border border-yellow-500/60 rounded-sm"
                              style={{
                                left: hl.x,
                                top: hl.y,
                                width: hl.width,
                                height: hl.height
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {showDrawingOverlay && (
                        <PdfDrawingOverlay
                          page={pageNum}
                          width={dim!.width}
                          height={dim!.height}
                          activeTool={drawingTool}
                          color={drawingColor}
                          size={drawingSize}
                          strokes={pageStrokes || []}
                          onStrokeComplete={handleStrokeComplete}
                        />
                      )}

                      {pageAnns.length > 0 && (
                        <div className="absolute top-2 right-2 flex flex-col gap-1 max-w-48">
                          {pageAnns.map((ann) => (
                            <span
                              key={ann.id}
                              className="text-xs text-amber-300 bg-amber-900/70 px-1.5 py-0.5 rounded truncate"
                            >
                              📝 {ann.text}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              if (twoPageView) {
                const rows: JSX.Element[] = []
                for (let i = 1; i <= totalPages; i += 2) {
                  const leftPage = i
                  const rightPage = i + 1 <= totalPages ? i + 1 : null
                  rows.push(
                    <div key={`spread-${i}`} className="flex flex-col items-center">
                      <div className="py-2 text-xs text-gray-500 select-none">
                        {leftPage}
                        {rightPage ? `–${rightPage}` : ''} / {totalPages}
                      </div>
                      <div className="flex gap-1">
                        {renderPage(leftPage)}
                        {rightPage && renderPage(rightPage)}
                      </div>
                    </div>
                  )
                }
                return rows
              }

              return Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <div key={pageNum} className="flex flex-col items-center">
                  <div className="py-2 text-xs text-gray-500 select-none">
                    {pageNum} / {totalPages}
                  </div>
                  {renderPage(pageNum)}
                </div>
              ))
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
