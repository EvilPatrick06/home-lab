/**
 * Pre-build chunk index from rulebook markdown files.
 * Run: node scripts/build-chunk-index.js
 *
 * Reads markdown files from PHB2024, DMG2024, and MM2025 directories
 * under "5.5e References/" and writes resources/chunk-index.json
 * for bundling with the installer.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')

const MAX_CHUNK_TOKENS = 4000
const CHARS_PER_TOKEN = 4

const SOURCES = [
  { dir: 'PHB2024/markdown', book: 'PHB' },
  { dir: 'DMG2024/markdown', book: 'DMG' },
  { dir: 'MM2025/Markdown', book: 'MM' }
]

function collectMarkdownFiles(dir) {
  const files = []

  function walk(current) {
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

function stripHtmlStubs(text) {
  return text.replace(/<table class="rd__b-special[\s\S]*?<\/table>/g, '')
}

function stripImageRefs(text) {
  return text.replace(/!\[.*?\]\(img\/.*?\)/g, '')
}

function cleanContent(text) {
  let cleaned = stripHtmlStubs(text)
  cleaned = stripImageRefs(cleaned)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  return cleaned.trim()
}

function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function parseMarkdownStructure(markdown) {
  const lines = markdown.split('\n')
  const root = []
  const stack = []
  let currentContent = []

  function flushContent() {
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

      const headingPath = []
      for (const s of stack) {
        if (s.level < level) {
          headingPath.push(s.node.heading)
        }
      }
      headingPath.push(heading)

      const node = {
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

function splitAtParagraphs(text, maxTokens) {
  const maxChars = maxTokens * CHARS_PER_TOKEN
  const parts = []
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

function createChunk(id, source, headingPath, heading, content) {
  const keywordSource = (heading + ' ' + content.slice(0, 500)).toLowerCase()
  const words = keywordSource
    .split(/[^a-z0-9'-]+/)
    .filter((w) => w.length > 2)
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

function flattenToChunks(nodes, source, idPrefix) {
  const chunks = []
  let counter = 0

  function processNode(node) {
    const content = cleanContent(node.content)

    if (node.children.length > 0) {
      if (content.length > 100) {
        counter++
        chunks.push(createChunk(
          `${idPrefix}-${counter}`,
          source,
          node.headingPath,
          node.heading,
          content
        ))
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
          const heading = parts.length > 1
            ? `${node.heading} (Part ${i + 1})`
            : node.heading
          chunks.push(createChunk(
            `${idPrefix}-${counter}`,
            source,
            node.headingPath,
            heading,
            parts[i]
          ))
        }
      } else {
        counter++
        chunks.push(createChunk(
          `${idPrefix}-${counter}`,
          source,
          node.headingPath,
          node.heading,
          content
        ))
      }
    }
  }

  for (const node of nodes) {
    processNode(node)
  }

  return chunks
}

// ── Main ──

const refsBase = join(ROOT, '5.5e References')
const allChunks = []
const sourceStats = []

for (const source of SOURCES) {
  const sourceDir = join(refsBase, source.dir)

  if (!existsSync(sourceDir)) {
    console.warn(`Warning: ${source.book} directory not found at ${sourceDir}, skipping`)
    continue
  }

  const mdFiles = collectMarkdownFiles(sourceDir)
  if (mdFiles.length === 0) {
    console.warn(`Warning: no markdown files found in ${sourceDir}, skipping`)
    continue
  }

  console.log(`Processing ${source.book} (${mdFiles.length} files)...`)
  const markdown = mdFiles.map(f => readFileSync(f, 'utf-8')).join('\n\n').replace(/\r\n?/g, '\n')
  const tree = parseMarkdownStructure(markdown)
  const chunks = flattenToChunks(tree, source.book, source.book.toLowerCase())

  allChunks.push(...chunks)
  sourceStats.push({
    file: source.dir,
    book: source.book,
    totalChunks: chunks.length
  })
}

const index = {
  version: 1,
  createdAt: new Date().toISOString(),
  sources: sourceStats,
  chunks: allChunks
}

const outDir = join(ROOT, 'resources')
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true })
}

const outPath = join(outDir, 'chunk-index.json')
writeFileSync(outPath, JSON.stringify(index))

console.log(`Done — ${allChunks.length} chunks indexed → ${outPath}`)
for (const s of sourceStats) {
  console.log(`  ${s.book}: ${s.totalChunks} chunks`)
}
