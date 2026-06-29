import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useRef, useState } from 'react'
import type { SearchHighlight } from './types'

export interface SearchResult {
  page: number
  matches: number
}

export interface UsePdfSearchOptions {
  pdfDoc: PDFDocumentProxy | null
  scale: number
  goToPage: (page: number) => void
}

/**
 * Full-text search for the PDF viewer: the open/query UI state, the per-page
 * result + highlight-rectangle computation, and result navigation. Extracted
 * from `PdfViewer` (god-file decomposition) — it owns all search state and
 * takes the document, render scale, and page-navigation callback as inputs so
 * the viewer shell no longer carries this concern. `setSearchResults` /
 * `setSearchHighlights` / `setCurrentSearchIdx` stay internal; only the values
 * and the two query setters the toolbar/keyboard handlers need are returned.
 */
export function usePdfSearch({ pdfDoc, scale, goToPage }: UsePdfSearchOptions) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [currentSearchIdx, setCurrentSearchIdx] = useState(0)
  const [searchHighlights, setSearchHighlights] = useState<Map<number, SearchHighlight[]>>(new Map())
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Text search — also extracts highlight rectangles for matching text
  const handleSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) return

    const results: SearchResult[] = []
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

  return {
    searchQuery,
    setSearchQuery,
    searchOpen,
    setSearchOpen,
    searchResults,
    currentSearchIdx,
    searchHighlights,
    searchInputRef,
    handleSearch,
    nextSearchResult,
    prevSearchResult
  }
}
