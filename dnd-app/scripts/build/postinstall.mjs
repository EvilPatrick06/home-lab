#!/usr/bin/env node
/**
 * Postinstall steps for dnd-app.
 *
 * 1. Copy `pdfjs-dist/build/pdf.worker.min.mjs` into `src/renderer/public/`
 *    so the renderer can load it via `<script>` at runtime.
 *
 * Why this script (not an inline `node -e`):
 *  - The pdfjs-dist build layout has changed in past majors. A clear failure
 *    message + the resolved path (instead of `ENOENT: ... pdf.worker.min.mjs`)
 *    saves the next bumper from grepping their lockfile.
 *  - Inline `-e` strings inside `package.json` aren't reviewable.
 */

import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(HERE, '..', '..')

const pdfWorkerSource = join(PROJECT_ROOT, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const pdfWorkerDest = join(PROJECT_ROOT, 'src', 'renderer', 'public', 'pdf.worker.min.mjs')

function getPdfjsVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(PROJECT_ROOT, 'node_modules', 'pdfjs-dist', 'package.json'), 'utf-8')
    )
    return pkg.version ?? 'unknown'
  } catch {
    return 'not installed'
  }
}

function copyPdfWorker() {
  if (!existsSync(pdfWorkerSource)) {
    const version = getPdfjsVersion()
    console.error(
      `[postinstall] pdfjs-dist worker not found at:\n  ${pdfWorkerSource}\n` +
        `pdfjs-dist version: ${version}\n` +
        `If pdfjs-dist's build layout changed (worker filename or path), update scripts/build/postinstall.mjs.`
    )
    process.exit(1)
  }

  copyFileSync(pdfWorkerSource, pdfWorkerDest)
}

copyPdfWorker()
