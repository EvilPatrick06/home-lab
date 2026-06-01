#!/usr/bin/env node
/**
 * Headless boot smoke-test for the packaged Electron app.
 *
 * Launches the built app (`out/`) under a virtual X display (xvfb) with software
 * GL, lets it boot for a fixed window, and FAILS only if the process crashes or
 * logs a fatal/uncaught error before the window closes. This covers the
 * "does the Electron-42 + Vite-8/Rolldown build actually start + initialise the
 * main + renderer + load index.html without crashing" concern that the
 * packaging-only release checks don't — without needing a human at a GUI.
 *
 * Usage:  node scripts/smoke/headless-boot.mjs [seconds]
 * Exits 0 = booted clean, 1 = crash/fatal, 2 = skipped (no xvfb / not Linux).
 *
 * Linux-only (needs xvfb). On macOS/Windows it skips with exit 2 so it can be a
 * no-op in cross-platform CI matrices.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const seconds = Number(process.argv[2]) || 30

function have(bin) {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0
}

if (process.platform !== 'linux' || !have('xvfb-run')) {
  console.log('[smoke] skipped — needs Linux + xvfb-run (exit 2)')
  process.exit(2)
}

const mainEntry = resolve(root, 'out/main/index.js')
const electronBin = resolve(root, 'node_modules/electron/dist/electron')
if (!existsSync(mainEntry)) {
  console.error('[smoke] no build found at out/main/index.js — run `npm run build` first')
  process.exit(1)
}
if (!existsSync(electronBin)) {
  console.error('[smoke] electron binary not found at', electronBin)
  process.exit(1)
}

console.log(`[smoke] launching built app headless for ${seconds}s …`)
// `timeout` returns 124 when it kills a still-running process — that's our PASS
// signal (the app booted + survived the window). Any other non-zero before the
// timeout means it crashed on boot.
const res = spawnSync(
  'xvfb-run',
  ['-a', '-s', '-screen 0 1280x800x24', 'timeout', String(seconds), electronBin, '.', '--no-sandbox'],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
)

const out = `${res.stdout || ''}\n${res.stderr || ''}`
// Genuine boot failures (ignore the expected xvfb/GPU/software-GL noise).
const fatal = out
  .split('\n')
  .filter((l) => /FATAL|uncaught|unhandledRejection|is not a function|Cannot read|undefined is not/i.test(l))
  .filter((l) => !/GPU process|swiftshader|libva|MESA|atom_cache|deprecated/i.test(l))

if (res.status === 124) {
  if (fatal.length > 0) {
    console.error('[smoke] FAIL — booted but logged fatal error(s):')
    for (const l of fatal) console.error('  ' + l.trim())
    process.exit(1)
  }
  console.log('[smoke] PASS — app booted and ran the full window with no crash')
  process.exit(0)
}

console.error(`[smoke] FAIL — app exited early (code ${res.status}) — likely a boot crash:`)
for (const l of fatal.slice(0, 20)) console.error('  ' + l.trim())
if (fatal.length === 0) console.error(out.split('\n').slice(-20).join('\n'))
process.exit(1)
