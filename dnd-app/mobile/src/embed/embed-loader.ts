/**
 * Resolves the base URL for the embedded in-game WebView bundle.
 *
 * Production path: unzip the Metro-bundled `assets/embed.zip` into the app cache
 * on first launch, then load `file://…/index.html` (works offline in the APK).
 *
 * Fallback: the hosted web build when unzip fails or `extra.embedRemote` is true.
 */
import { Asset } from 'expo-asset'
import Constants from 'expo-constants'
import * as FileSystem from 'expo-file-system'
import { unzipSync } from 'fflate'

const REMOTE_EMBED = 'https://bmo.mybmoai.work/DungeonTableOnline/'
const CACHE_DIR = `${FileSystem.cacheDirectory}embed/`
const INDEX_PATH = `${CACHE_DIR}index.html`

// Metro resolves this at bundle time; `prestart` / `build:embed` must create the file.
// biome-ignore lint/style/noCommonJs: Expo asset modules use require()
const EMBED_ZIP_MODULE = require('../../assets/embed.zip') as number

let baseReady: Promise<string> | null = null

function useRemoteEmbed(): boolean {
  return (Constants.expoConfig?.extra as { embedRemote?: boolean } | undefined)?.embedRemote === true
}

function buildEntry(base: string, route?: string): string {
  const root = base.endsWith('/') ? base : `${base}/`
  const hash = route ? `#/${route.replace(/^\/+/, '')}` : ''
  return `${root}index.html${hash}`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function writeBinary(path: string, data: Uint8Array): Promise<void> {
  await FileSystem.writeAsStringAsync(path, bytesToBase64(data), {
    encoding: FileSystem.EncodingType.Base64
  })
}

async function ensureLocalEmbed(): Promise<string> {
  const existing = await FileSystem.getInfoAsync(INDEX_PATH)
  if (existing.exists) return CACHE_DIR

  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true })

  const asset = Asset.fromModule(EMBED_ZIP_MODULE)
  await asset.downloadAsync()
  const zipUri = asset.localUri ?? asset.uri
  const zipB64 = await FileSystem.readAsStringAsync(zipUri, { encoding: FileSystem.EncodingType.Base64 })
  const zipBytes = Uint8Array.from(atob(zipB64), (c) => c.charCodeAt(0))
  const files = unzipSync(zipBytes)

  for (const [relPath, data] of Object.entries(files)) {
    if (relPath.endsWith('/')) continue
    const out = `${CACHE_DIR}${relPath}`
    const slash = out.lastIndexOf('/')
    if (slash > CACHE_DIR.length) {
      await FileSystem.makeDirectoryAsync(out.slice(0, slash), { intermediates: true }).catch(() => {})
    }
    await writeBinary(out, data)
  }

  const index = await FileSystem.getInfoAsync(INDEX_PATH)
  if (!index.exists) throw new Error('embed unzip finished but index.html is missing')
  return CACHE_DIR
}

async function resolveBase(): Promise<string> {
  if (useRemoteEmbed()) return REMOTE_EMBED
  try {
    const dir = await ensureLocalEmbed()
    return `file://${dir}`
  } catch (err) {
    console.warn('[embed] local bundle unavailable, falling back to remote:', err)
    return REMOTE_EMBED
  }
}

/** Returns a loadable entry URL (file:// or https://) for the embedded SPA. */
export async function resolveEmbedEntry(route?: string): Promise<string> {
  if (!baseReady) baseReady = resolveBase()
  const base = await baseReady
  return buildEntry(base, route)
}
