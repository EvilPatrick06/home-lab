#!/usr/bin/env node
/**
 * Fetch the Ollama binary for a target platform and place it at
 * `dnd-app/resources/ollama/{ollama,ollama.exe}` so electron-builder picks it
 * up via the platform-specific `extraResources` entries.
 *
 * Reads the latest Ollama release from the GitHub API, downloads the right
 * asset for the target platform, extracts the binary, and writes it to the
 * resources tree. Idempotent — skips download if the binary already exists
 * unless `--force` is passed.
 *
 * Usage:
 *   node scripts/build/fetch-ollama.mjs --platform=linux
 *   node scripts/build/fetch-ollama.mjs --platform=windows --force
 *
 * Skips entirely when `BUNDLE_OLLAMA=0` env is set (for slim builds).
 *
 * Requires Node 22+ (uses `fs/promises.cp`, AbortSignal.timeout, native fetch).
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

const PLATFORMS = {
  linux: {
    asset: 'ollama-linux-amd64.tgz',
    binaryInArchive: 'bin/ollama',
    outputName: 'ollama',
    extract: extractTgz
  },
  windows: {
    asset: 'ollama-windows-amd64.zip',
    binaryInArchive: 'ollama.exe',
    outputName: 'ollama.exe',
    extract: extractZip
  },
  darwin: {
    asset: 'ollama-darwin.tgz',
    binaryInArchive: 'ollama',
    outputName: 'ollama',
    extract: extractTgz
  }
}

const config = PLATFORMS[targetPlatform]
const outputDir = join(PROJECT_ROOT, 'resources', 'ollama', targetPlatform)
const outputPath = join(outputDir, config.outputName)

// Skip if already present
if (existsSync(outputPath) && !force) {
  const sizeMb = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
  console.log(`[fetch-ollama] ${outputPath} already exists (${sizeMb} MB) — skipping.`)
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

// ── Extract binary ──

await mkdir(outputDir, { recursive: true })
console.log(`[fetch-ollama] Extracting ${config.binaryInArchive} → ${outputPath}`)
await config.extract(archivePath, config.binaryInArchive, outputPath)

// chmod +x for POSIX
if (targetPlatform !== 'windows') {
  await chmod(outputPath, 0o755)
}

// Cleanup tmp
await rm(tmpDir, { recursive: true, force: true })

const finalSizeMb = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
console.log(`[fetch-ollama] OK — ${outputPath} (${finalSizeMb} MB)`)

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
    signal: AbortSignal.timeout(10 * 60_000) // 10 min — these are big files
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
      if (pct - lastLogPct >= 10) {
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

async function extractTgz(archive, member, dest) {
  // Use system tar — available on every CI runner (incl. Windows since Win10).
  // Extract a single member to stdout, redirect to destination.
  const buf = execFileSync('tar', ['-xzOf', archive, member], { maxBuffer: 1024 * 1024 * 1024 })
  await import('node:fs/promises').then((m) => m.writeFile(dest, buf))
}

async function extractZip(archive, member, dest) {
  // `extract-zip` is a direct prod dep already (see plugin-installer.ts swap),
  // but we don't want to ship it for build. Use a one-shot via node's zlib +
  // PowerShell on Windows, or `unzip` on POSIX.
  if (process.platform === 'win32') {
    const ps = `Expand-Archive -Force -Path '${archive.replace(/'/g, "''")}' -DestinationPath '${dirname(dest).replace(/'/g, "''")}'`
    execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' })
    // The extracted layout puts ollama.exe at the top of the destination
  } else {
    // unzip is available on every Linux runner and macOS by default
    execFileSync('unzip', ['-o', '-j', archive, member, '-d', dirname(dest)], { stdio: 'inherit' })
  }
}
