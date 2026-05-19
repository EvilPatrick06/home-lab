import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Phase 15a Step 19 — build guard.
//
// Library data lives in `useLibraryStore.entries[category]`. Consumers
// reference entries via `EntryRef` and hydrate with `useHydratedRef` /
// `useLibraryEntry` / `useLibraryEntries`. Direct imports of `public/data/**`,
// raw `fetch('/data/5e/...')` calls, and inline library-shape literals
// reopen the duplicate-data regression class Phase 15 closes.
//
// This spec fails CI on any new offender outside the allowlist. Add an
// inline `// boundary-allow: <reason>` (reason required after the colon)
// to opt a specific line out.

const RENDERER_SRC = resolve(__dirname, '../../..')
const ALLOWED_PREFIXES = [
  // The library service layer owns ingest; these paths are inside the trust boundary.
  'src/renderer/src/services/library/',
  'src/renderer/src/stores/use-library-store.ts',
  'src/renderer/src/services/library-service.ts',
  // adventure-loader still fetches a flat manifest; 15g shrinks the allowlist after migration.
  'src/renderer/src/services/adventure-loader.ts'
]

const FORBIDDEN_PATTERNS: Array<{ regex: RegExp; description: string }> = [
  {
    regex: /import\s+[^'";]*from\s+['"][^'"]*public\/data\/[^'"]+['"]/,
    description: 'direct import from public/data/**'
  },
  {
    regex: /fetch\s*\(\s*['"`][^'"`]*data\/5e\/[^'"`]+['"`]/,
    description: "fetch('/data/5e/...') call"
  }
]

// Phase 15a Step 19 #3 — literal-shape detection.
// A consumer that hard-codes >=3 of these keys in close proximity is
// almost certainly embedding library data inline.
// boundary-allow: spec definition of the canonical key list
const SHAPE_KEYS = [
  'name',
  'description',
  'damage',
  'traits',
  'level',
  'school',
  'hit_die',
  'ability_score_increase',
  'casting_time',
  'range'
]
const SHAPE_KEY_REGEX = new RegExp(`\\b(${SHAPE_KEYS.join('|')})\\s*:`, 'g')
const WINDOW_LINES = 20
const MIN_KEYS = 3

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue
    const full = join(dir, name)
    const s = statSync(full)
    if (s.isDirectory()) {
      listFiles(full, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

function isAllowed(repoRelPath: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => repoRelPath.startsWith(prefix))
}

function violationsForFile(absPath: string): Array<{ line: number; description: string; excerpt: string }> {
  const content = readFileSync(absPath, 'utf8')
  const lines = content.split('\n')
  const out: Array<{ line: number; description: string; excerpt: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('boundary-allow:')) continue
    for (const { regex, description } of FORBIDDEN_PATTERNS) {
      if (regex.test(line)) {
        out.push({ line: i + 1, description, excerpt: line.trim() })
      }
    }
  }
  return out
}

function literalShapeViolations(absPath: string): Array<{ startLine: number; endLine: number; keys: string[] }> {
  const content = readFileSync(absPath, 'utf8')
  const lines = content.split('\n')
  const hits: Array<{ line: number; key: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    SHAPE_KEY_REGEX.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SHAPE_KEY_REGEX.exec(line)) !== null) {
      hits.push({ line: i + 1, key: m[1] })
    }
  }
  const clusters: Array<{ startLine: number; endLine: number; keys: Set<string> }> = []
  let current: { startLine: number; endLine: number; keys: Set<string> } | null = null
  for (const hit of hits) {
    if (current && hit.line - current.endLine <= WINDOW_LINES) {
      current.endLine = hit.line
      current.keys.add(hit.key)
    } else {
      if (current && current.keys.size >= MIN_KEYS) clusters.push(current)
      current = { startLine: hit.line, endLine: hit.line, keys: new Set([hit.key]) }
    }
  }
  if (current && current.keys.size >= MIN_KEYS) clusters.push(current)
  return clusters
    .filter((c) => {
      // Lookback by one extra line so a comment directly ABOVE the cluster (the
      // natural place for an inline opt-out) suppresses the report.
      const start = Math.max(0, c.startLine - 2)
      const end = Math.min(c.endLine, lines.length)
      for (let j = start; j < end; j++) {
        if (lines[j]?.includes('boundary-allow:')) return false
      }
      return true
    })
    .map((c) => ({ startLine: c.startLine, endLine: c.endLine, keys: Array.from(c.keys) }))
}

describe('library boundary (phase 15a step 19)', () => {
  // dnd-app/ root — the test's working frame for allowlist matching.
  const projectRoot = resolve(__dirname, '../../../../..')
  const files = listFiles(RENDERER_SRC)

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('no consumer imports public/data/** or fetches /data/5e/** outside the allowlist', () => {
    const offenders: Array<{ file: string; line: number; description: string; excerpt: string }> = []
    for (const abs of files) {
      const repoRel = relative(projectRoot, abs)
      if (isAllowed(repoRel.replace(/\\/g, '/'))) continue
      for (const v of violationsForFile(abs)) {
        offenders.push({ file: repoRel.replace(/\\/g, '/'), ...v })
      }
    }
    if (offenders.length > 0) {
      const formatted = offenders.map((o) => `  ${o.file}:${o.line} — ${o.description}\n    ${o.excerpt}`).join('\n')
      throw new Error(
        `${offenders.length} library-boundary violation${offenders.length === 1 ? '' : 's'}:\n${formatted}\n\nFix: route through useLibraryStore + useLibraryEntry / useLibraryEntries / useHydratedRef, or add an inline '// boundary-allow: <reason>' on the offending line with a justifying reason.`
      )
    }
    expect(offenders).toEqual([])
  })

  it('allowlist is non-empty (sanity)', () => {
    expect(ALLOWED_PREFIXES.length).toBeGreaterThan(0)
  })

  it('boundary-allow comment suppresses a would-be offender', () => {
    const fake = `import x from '/public/data/5e/spells/spells.json' // boundary-allow: test fixture only`
    const matches = FORBIDDEN_PATTERNS.some((p) => p.regex.test(fake)) && !fake.includes('boundary-allow:')
    expect(matches).toBe(false)
  })

  it('no consumer literal embeds >=3 library-shape keys in proximity outside the allowlist', () => {
    const offenders: Array<{ file: string; startLine: number; endLine: number; keys: string[] }> = []
    for (const abs of files) {
      const repoRel = relative(projectRoot, abs).replace(/\\/g, '/')
      if (isAllowed(repoRel)) continue
      for (const v of literalShapeViolations(abs)) {
        offenders.push({ file: repoRel, ...v })
      }
    }
    if (offenders.length > 0) {
      const formatted = offenders
        .map((o) => `  ${o.file}:${o.startLine}-${o.endLine} — keys: ${o.keys.join(', ')}`)
        .join('\n')
      throw new Error(
        `${offenders.length} library-literal-shape violation${offenders.length === 1 ? '' : 's'} (≥${MIN_KEYS} of ${SHAPE_KEYS.join(', ')} within ${WINDOW_LINES} lines):\n${formatted}\n\nFix: hold an EntryRef and hydrate via useLibraryEntry / useLibraryEntries / useHydratedRef, OR add an inline '// boundary-allow: <reason>' inside the offending block with a justifying reason.`
      )
    }
    expect(offenders).toEqual([])
  })
})
