import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { logToFile } from '../log'
import type { BookSource, Chunk, ChunkIndex } from './types'

const MAX_CHUNK_TOKENS = 4000
const CHARS_PER_TOKEN = 4

interface SourceDir {
  devDir: string
  packagedDir: string
  book: BookSource
}

const SOURCES: SourceDir[] = [
  { devDir: 'PHB2024/markdown', packagedDir: 'PHB', book: 'PHB' },
  { devDir: 'DMG2024/markdown', packagedDir: 'DMG', book: 'DMG' },
  { devDir: 'MM2025/Markdown', packagedDir: 'MM', book: 'MM' }
]

function getReferencesBase(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'rulebooks')
  }
  return join(app.getAppPath(), '5.5e References')
}

function getSourcePath(source: SourceDir): string {
  const base = getReferencesBase()
  return app.isPackaged ? join(base, source.packagedDir) : join(base, source.devDir)
}

function collectMarkdownFiles(dir: string): string[] {
  const files: string[] = []

  function walk(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }

  walk(dir)
  return files.sort()
}

function getIndexPath(): string {
  return join(app.getPath('userData'), 'chunk-index.json')
}

function stripHtmlStubs(text: string): string {
  return text.replace(/<table class="rd__b-special[\s\S]*?<\/table>/g, '')
}

function stripImageRefs(text: string): string {
  return text.replace(/!\[.*?\]\(img\/.*?\)/g, '')
}

function cleanContent(text: string): string {
  let cleaned = stripHtmlStubs(text)
  cleaned = stripImageRefs(cleaned)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  return cleaned.trim()
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

interface HeadingNode {
  level: number
  heading: string
  headingPath: string[]
  content: string
  children: HeadingNode[]
}

function parseMarkdownStructure(markdown: string): HeadingNode[] {
  const lines = markdown.split('\n')
  const root: HeadingNode[] = []
  const stack: { level: number; node: HeadingNode }[] = []
  let currentContent: string[] = []

  function flushContent(): void {
    if (stack.length > 0 && currentContent.length > 0) {
      stack[stack.length - 1].node.content += currentContent.join('\n')
    }
    currentContent = []
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushContent()
      const level = headingMatch[1].length
      const heading = headingMatch[2].trim()

      const headingPath: string[] = []
      for (const s of stack) {
        if (s.level < level) {
          headingPath.push(s.node.heading)
        }
      }
      headingPath.push(heading)

      const node: HeadingNode = {
        level,
        heading,
        headingPath,
        content: '',
        children: []
      }

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }

      if (stack.length > 0) {
        stack[stack.length - 1].node.children.push(node)
      } else {
        root.push(node)
      }

      stack.push({ level, node })
    } else {
      currentContent.push(line)
    }
  }
  flushContent()

  return root
}

function splitAtParagraphs(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN
  const parts: string[] = []
  let remaining = text

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf('\n\n', maxChars)
    if (splitAt < maxChars * 0.3) {
      splitAt = remaining.lastIndexOf('. ', maxChars)
      if (splitAt < maxChars * 0.3) {
        splitAt = maxChars
      } else {
        splitAt += 1
      }
    }
    parts.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }

  if (remaining.length > 0) {
    parts.push(remaining)
  }

  return parts
}

function createChunk(id: string, source: BookSource, headingPath: string[], heading: string, content: string): Chunk {
  const keywordSource = `${heading} ${content.slice(0, 500)}`.toLowerCase()
  const words = keywordSource.split(/[^a-z0-9'-]+/).filter((w) => w.length > 2)
  const keywords = [...new Set(words)].slice(0, 20)

  return {
    id,
    source,
    headingPath,
    heading,
    content,
    tokenEstimate: estimateTokens(content),
    keywords
  }
}

function flattenToChunks(nodes: HeadingNode[], source: BookSource, idPrefix: string): Chunk[] {
  const chunks: Chunk[] = []
  let counter = 0

  function processNode(node: HeadingNode): void {
    const content = cleanContent(node.content)

    if (node.children.length > 0) {
      if (content.length > 100) {
        counter++
        chunks.push(createChunk(`${idPrefix}-${counter}`, source, node.headingPath, node.heading, content))
      }
      for (const child of node.children) {
        processNode(child)
      }
    } else {
      if (content.length < 50) return

      if (estimateTokens(content) > MAX_CHUNK_TOKENS) {
        const parts = splitAtParagraphs(content, MAX_CHUNK_TOKENS)
        for (let i = 0; i < parts.length; i++) {
          counter++
          const heading = parts.length > 1 ? `${node.heading} (Part ${i + 1})` : node.heading
          chunks.push(createChunk(`${idPrefix}-${counter}`, source, node.headingPath, heading, parts[i]))
        }
      } else {
        counter++
        chunks.push(createChunk(`${idPrefix}-${counter}`, source, node.headingPath, node.heading, content))
      }
    }
  }

  for (const node of nodes) {
    processNode(node)
  }

  return chunks
}

/**
 * Build the chunk index from rulebook markdown files.
 * Returns the index and saves it to userData.
 */
export function buildChunkIndex(onProgress?: (percent: number, stage: string) => void): ChunkIndex {
  onProgress?.(0, 'Scanning rulebook files...')

  const allChunks: Chunk[] = []
  const sourceStats: ChunkIndex['sources'] = []

  for (let i = 0; i < SOURCES.length; i++) {
    const source = SOURCES[i]
    const sourceDir = getSourcePath(source)

    if (!existsSync(sourceDir)) {
      logToFile('WARN', `Warning: ${source.book} directory not found at ${sourceDir}, skipping`)
      continue
    }

    const pct = Math.round((i / SOURCES.length) * 80)
    onProgress?.(pct, `Processing ${source.book}...`)

    const mdFiles = collectMarkdownFiles(sourceDir)
    if (mdFiles.length === 0) {
      logToFile('WARN', `Warning: no markdown files found in ${sourceDir}, skipping`)
      continue
    }

    const markdown = mdFiles
      .map((f) => readFileSync(f, 'utf-8'))
      .join('\n\n')
      .replace(/\r\n?/g, '\n')
    const tree = parseMarkdownStructure(markdown)
    const chunks = flattenToChunks(tree, source.book, source.book.toLowerCase())

    allChunks.push(...chunks)
    sourceStats.push({
      file: source.devDir,
      book: source.book,
      totalChunks: chunks.length
    })
  }

  onProgress?.(90, 'Saving index...')

  const index: ChunkIndex = {
    version: 1,
    createdAt: new Date().toISOString(),
    sources: sourceStats,
    chunks: allChunks
  }

  const outPath = getIndexPath()
  const outDir = dirname(outPath)
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true })
  }

  writeFileSync(outPath, JSON.stringify(index))

  onProgress?.(100, `Done — ${allChunks.length} chunks indexed`)

  return index
}

function getBundledIndexPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'chunk-index.json')
  }
  return join(app.getAppPath(), 'resources', 'chunk-index.json')
}

/**
 * Load chunk index from disk.
 * Checks bundled (resources) first, then falls back to userData.
 */
export function loadChunkIndex(): ChunkIndex | null {
  // Try bundled index first
  const bundledPath = getBundledIndexPath()
  if (existsSync(bundledPath)) {
    try {
      const raw = readFileSync(bundledPath, 'utf-8')
      return JSON.parse(raw) as ChunkIndex
    } catch {
      // Fall through to userData
    }
  }

  // Fall back to userData index
  const indexPath = getIndexPath()
  if (!existsSync(indexPath)) return null

  try {
    const raw = readFileSync(indexPath, 'utf-8')
    return JSON.parse(raw) as ChunkIndex
  } catch {
    return null
  }
}
