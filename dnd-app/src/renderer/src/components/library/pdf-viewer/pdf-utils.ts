// Misc PDF viewer helpers extracted from PdfViewer.tsx (behavior-preserving).
import * as pdfjsLib from 'pdfjs-dist'
import { cryptoRandom } from '../../../utils/crypto-random'
import { logger } from '../../../utils/logger'

// Fetch the worker script and create a blob URL — works in both dev and
// production Electron. Idempotent: only the first invocation sets workerSrc.
let workerInitStarted = false
export function initPdfWorker(): void {
  if (workerInitStarted) return
  workerInitStarted = true
  ;(async () => {
    try {
      // Relative path: the packaged renderer loads from `file://…/renderer/
      // index.html`, where an absolute `/pdf.worker.min.mjs` resolves to the
      // filesystem root (`/C:/pdf.worker.min.mjs` on Windows) → not found.
      // `./` resolves against the renderer dir in both dev (http) and packaged.
      const resp = await fetch('./pdf.worker.min.mjs')
      const text = await resp.text()
      const blob = new Blob([text], { type: 'application/javascript' })
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
    } catch (err) {
      logger.warn('[PdfViewer] Failed to load worker, PDF parsing will run on main thread:', err)
    }
  })()
}

export function generateId(): string {
  return `${Date.now()}-${cryptoRandom().toString(36).slice(2, 9)}`
}
