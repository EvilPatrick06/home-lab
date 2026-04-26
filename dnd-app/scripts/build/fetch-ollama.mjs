#!/usr/bin/env node
/**
 * Fetch the Ollama distribution for a target platform and place it under
 * `dnd-app/resources/ollama/{platform}/` so electron-builder picks it up via
 * the platform-specific `extraResources` entries (filter `**\/*`).
 *
 * Ollama v0.5+ ships multi-file archives: a binary + runner libraries (CPU,
 * CUDA, ROCm). The binary loads runner libs via path relative to itself, so
 * we extract the WHOLE archive — not just the binary — and the lib/ dir sits
 * alongside it.
 *
 * Per-platform asset names (as of v0.21.x):
 *   linux:   ollama-linux-amd64.tar.zst   (binary at bin/ollama, ~2 GB)
 *   windows: ollama-windows-amd64.zip     (binary at ollama.exe, ~2 GB)
 *   darwin:  ollama-darwin.tgz            (single-binary, ~120 MB)
 *
 * Usage:
 *   node scripts/build/fetch-ollama.mjs --platform=linux
 *   node scripts/build/fetch-ollama.mjs --platform=windows --force
 *
 * Skips entirely when `BUNDLE_OLLAMA=0` env is set (slim builds).
 *
 * Requires Node 22+ (uses `fs/promises`, AbortSignal.timeout, native fetch).
 * Requires `tar` on PATH — Win10+, Ubuntu, macOS all ship it. Modern tar
 * (libarchive on Win/macOS, GNU tar 1.31+ on Linux) handles .tar.zst, .tgz,
 * and .zip natively.
 */

import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { chmod, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(HERE, '..', '..')

// ── CLI parsing ──

const args = new Map(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? 'true']
    })
)

const targetPlatform = (args.get('platform') ?? '').toLowerCase()
const force = args.get('force') === 'true'
const skip = process.env.BUNDLE_OLLAMA === '0'

if (skip) {
  console.log('[fetch-ollama] BUNDLE_OLLAMA=0 set — skipping bundle.')
  process.exit(0)
}

if (!['linux', 'windows', 'darwin'].includes(targetPlatform)) {
  console.error(
    `[fetch-ollama] usage: --platform=linux|windows|darwin (got: ${targetPlatform || 'missing'})`
  )
  process.exit(1)
}

// ── Per-platform config ──
//
// `binaryRelPath` is where the main `ollama` (or `ollama.exe`) binary ends up
// inside the extracted tree. Used for the idempotency check + chmod.

const PLATFORMS = {
  linux: {
    asset: 'ollama-linux-amd64.tar.zst',
    binaryRelPath: 'bin/ollama',
    // tar's --zstd needs zstd CLI (preinstalled on Ubuntu 22+ runners)
    extractArgs: (archive, dest) => ['--zstd', '-xf', archive, '-C', dest]
  },
  windows: {
    asset: 'ollama-windows-amd64.zip',
    binaryRelPath: 'ollama.exe',
    // Win10+ tar uses libarchive — handles .zip natively
    extractArgs: (archive, dest) => ['-xf', archive, '-C', dest]
  },
  darwin: {
    asset: 'ollama-darwin.tgz',
    binaryRelPath: 'ollama',
    extractArgs: (archive, dest) => ['-xzf', archive, '-C', dest]
  }
}

const config = PLATFORMS[targetPlatform]
const outputDir = join(PROJECT_ROOT, 'resources', 'ollama', targetPlatform)
const binaryPath = join(outputDir, config.binaryRelPath)

// Skip if binary already present at expected path
if (existsSync(binaryPath) && !force) {
  const sizeMb = (statSync(binaryPath).size / 1024 / 1024).toFixed(1)
  console.log(`[fetch-ollama] ${binaryPath} already exists (${sizeMb} MB) — skipping.`)
  console.log('[fetch-ollama] Pass --force to re-download.')
  process.exit(0)
}

// ── Resolve latest release ──

console.log('[fetch-ollama] Querying github.com/ollama/ollama for latest release…')
const release = await fetchJson('https://api.github.com/repos/ollama/ollama/releases/latest')
const tag = release.tag_name ?? 'unknown'
const asset = (release.assets ?? []).find((a) => a.name === config.asset)
if (!asset) {
  console.error(
    `[fetch-ollama] Asset "${config.asset}" not found in release ${tag}. ` +
      `Available: ${(release.assets ?? []).map((a) => a.name).join(', ')}`
  )
  process.exit(1)
}
const downloadUrl = asset.browser_download_url
const sizeMb = (asset.size / 1024 / 1024).toFixed(1)
console.log(`[fetch-ollama] Found ${config.asset} (${sizeMb} MB) in ${tag}`)

// ── Download to a tmp file ──

const tmpDir = join(PROJECT_ROOT, '.ollama-download-tmp')
mkdirSync(tmpDir, { recursive: true })
const archivePath = join(tmpDir, config.asset)

if (!existsSync(archivePath) || force) {
  console.log(`[fetch-ollama] Downloading → ${archivePath}`)
  await downloadTo(downloadUrl, archivePath)
} else {
  console.log(`[fetch-ollama] Reusing cached archive at ${archivePath}`)
}

// ── Extract whole archive into outputDir ──
//
// The whole tree is needed: lib/ollama/runners/ siblings of the binary are
// loaded at runtime by the binary itself for CPU/CUDA/ROCm acceleration.

await mkdir(outputDir, { recursive: true })
console.log(`[fetch-ollama] Extracting ${config.asset} → ${outputDir}`)
execFileSync('tar', config.extractArgs(archivePath, outputDir), { stdio: 'inherit' })

// chmod +x for POSIX
if (targetPlatform !== 'windows') {
  if (!existsSync(binaryPath)) {
    console.error(
      `[fetch-ollama] Binary not found at expected path after extraction: ${binaryPath}`
    )
    process.exit(1)
  }
  await chmod(binaryPath, 0o755)
}

// Cleanup tmp
await rm(tmpDir, { recursive: true, force: true })

const finalSizeMb = (statSync(binaryPath).size / 1024 / 1024).toFixed(1)
console.log(`[fetch-ollama] OK — binary at ${binaryPath} (${finalSizeMb} MB)`)

// ── Helpers ──

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dnd-vtt-build'
    },
    signal: AbortSignal.timeout(30_000)
  })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

async function downloadTo(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'dnd-vtt-build' },
    // 30 min — these are 2 GB files
    signal: AbortSignal.timeout(30 * 60_000)
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`)
  }
  const totalBytes = parseInt(res.headers.get('content-length') ?? '0', 10)
  let downloaded = 0
  let lastLogPct = -1

  const file = createWriteStream(dest)
  const reader = res.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    file.write(Buffer.from(value))
    downloaded += value.length
    if (totalBytes > 0) {
      const pct = Math.floor((downloaded / totalBytes) * 100)
      if (pct - lastLogPct >= 5) {
        process.stdout.write(`[fetch-ollama] ${pct}%\r`)
        lastLogPct = pct
      }
    }
  }
  file.end()
  await new Promise((res, rej) => {
    file.on('finish', res)
    file.on('error', rej)
  })
  process.stdout.write('\n')
}
