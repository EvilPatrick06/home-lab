#!/usr/bin/env node
/**
 * Phase 28e.3–28e.7 — grep-based forbidden-pattern lint.
 *
 * Biome can't express these project-specific bans, so this script walks the
 * source tree and fails (exit 1) on any violation. Wired into `check:full` and
 * the CI workflow.
 *
 * Rules:
 *   28e.3 — `Math.random()` is banned outside crypto-random.ts + tests.
 *   28e.4 — bare `writeFile` import from node:fs[/promises] outside atomic-write.ts.
 *   28e.5 — importing `useNetworkStore` from `stores/use-network-store.ts` (the
 *           circular barrel) is banned; use `stores/network-store` instead.
 *   28e.6 — CJS `require(` in electron.vite.config.ts.
 *   28e.7 — skipped/todo tests (it.skip / xit / describe.skip / .todo).
 *   28e.8 — bare empty `catch {}` (production code) swallows errors silently;
 *           require a body/comment, or opt out with `// allow-empty-catch:`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const SRC = join(ROOT, 'src')

/** @type {Array<{ file: string; line: number; rule: string; text: string }>} */
const violations = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    // Skip vendored assets (minified bundles, the bundled pdf.js worker, etc.).
    if (name === 'public' || name === 'node_modules') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      walk(full)
    } else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.min\./.test(name)) {
      checkFile(full)
    }
  }
}

function checkFile(file) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const isTest = /\.test\.(ts|tsx)$/.test(file)
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const n = i + 1

    // 28e.3 — Math.random. Banned for game-outcome RNG (rolls, shuffles, picks).
    // Cosmetic/non-deterministic-UI uses (3D physics jitter, id suffixes) opt out
    // with an inline `// crypto-ok: <reason>` on the same or previous line.
    const cryptoOk = /crypto-ok:/.test(line) || (i > 0 && /crypto-ok:/.test(lines[i - 1]))
    if (/\bMath\.random\s*\(/.test(line) && !rel.endsWith('utils/crypto-random.ts') && !isTest && !cryptoOk) {
      violations.push({ file: rel, line: n, rule: '28e.3 Math.random', text: line.trim() })
    }

    // 28e.4 — bare writeFile import from node:fs in a STORAGE module (the
    // canonical-write rule applies to persistence code, not tests or unrelated
    // main-process modules that legitimately write transient files).
    if (
      /import\s*\{[^}]*\bwriteFile\b[^}]*\}\s*from\s*['"]node:fs(\/promises)?['"]/.test(line) &&
      rel.includes('src/main/storage/') &&
      !rel.endsWith('storage/atomic-write.ts') &&
      !isTest
    ) {
      violations.push({ file: rel, line: n, rule: '28e.4 bare writeFile import', text: line.trim() })
    }

    // 28e.5 — useNetworkStore from the circular barrel
    if (/from\s*['"][^'"]*stores\/use-network-store['"]/.test(line) && /useNetworkStore/.test(line)) {
      violations.push({ file: rel, line: n, rule: '28e.5 useNetworkStore barrel import', text: line.trim() })
    }

    // 28e.6 — require() in the vite config
    if (rel.endsWith('electron.vite.config.ts') && /\brequire\s*\(/.test(line)) {
      violations.push({ file: rel, line: n, rule: '28e.6 CJS require in vite config', text: line.trim() })
    }

    // 28e.7 — skipped/todo tests
    if (/\b(it|describe|test)\.(skip|todo)\b|\b(xit|xdescribe|xtest)\b/.test(line)) {
      violations.push({ file: rel, line: n, rule: '28e.7 skipped/todo test', text: line.trim() })
    }

    // 28e.8 — bare empty `catch {}` swallows errors with no record. A catch
    // must have a body (even a `/* reason */` comment documenting an
    // intentional best-effort ignore). Production code only; opt out with an
    // inline `// allow-empty-catch: <reason>` on the same or previous line.
    const allowEmptyCatch = /allow-empty-catch:/.test(line) || (i > 0 && /allow-empty-catch:/.test(lines[i - 1]))
    if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(line) && !isTest && !allowEmptyCatch) {
      violations.push({ file: rel, line: n, rule: '28e.8 bare empty catch', text: line.trim() })
    }
  }
}

walk(SRC)

if (violations.length > 0) {
  console.error(`\n✖ ${violations.length} forbidden-pattern violation(s):\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`)
    console.error(`    ${v.text}`)
  }
  console.error('')
  process.exit(1)
}

console.log('✓ forbidden-patterns: no violations')
