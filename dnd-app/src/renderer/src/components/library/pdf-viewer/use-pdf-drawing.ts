import { useCallback, useState } from 'react'
import type { DrawingStroke, DrawingTool, PageDrawings } from '../PdfDrawingOverlay'

/**
 * Freehand drawing/markup for the PDF viewer: the active tool/color/size, the
 * per-page stroke store, the undo/redo stacks, and the stroke/undo/redo/clear
 * handlers. Extracted from `PdfViewer` (god-file decomposition). Takes the
 * current page as input; `redoStack` stays internal (only the handlers and the
 * derived `currentPageHasRedo` flag touch it), while `pageDrawings` /
 * `setPageDrawings` are returned because the viewer persists + reloads them.
 */
export function usePdfDrawing(currentPage: number) {
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const [drawingColor, setDrawingColor] = useState('#FACC15')
  const [drawingSize, setDrawingSize] = useState(20)
  const [pageDrawings, setPageDrawings] = useState<PageDrawings>({})
  const [redoStack, setRedoStack] = useState<PageDrawings>({})

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

  return {
    drawingTool,
    setDrawingTool,
    drawingColor,
    setDrawingColor,
    drawingSize,
    setDrawingSize,
    pageDrawings,
    setPageDrawings,
    handleStrokeComplete,
    handleUndoDrawing,
    handleRedoDrawing,
    handleClearPageDrawings,
    currentPageHasStrokes,
    currentPageHasRedo
  }
}
