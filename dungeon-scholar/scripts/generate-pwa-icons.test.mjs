// Verifies the committed PWA icons WITHOUT re-running generation. Reads each
// PNG straight off disk and asserts the 8-byte PNG signature plus the IHDR
// width / height / bit-depth / color-type. This catches a corrupted, missing,
// or wrong-dimensioned asset in CI without depending on the generator running
// at build time (the PNGs are committed artifacts).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// colorType 6 = RGBA, 2 = RGB (opaque, used for the iOS apple-touch-icon).
const ICONS = [
  { name: 'pwa-192x192.png', width: 192, height: 192, colorType: 6 },
  { name: 'pwa-512x512.png', width: 512, height: 512, colorType: 6 },
  { name: 'pwa-maskable-512x512.png', width: 512, height: 512, colorType: 6 },
  { name: 'apple-touch-icon.png', width: 180, height: 180, colorType: 2 },
]

function readHeader(name) {
  const buf = readFileSync(join(publicDir, name))
  return {
    signature: buf.subarray(0, 8),
    // IHDR data begins at byte 16 (8 sig + 4 length + 4 "IHDR").
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf.readUInt8(24),
    colorType: buf.readUInt8(25),
    // Bytes 12-15 must spell "IHDR" — the first chunk of a valid PNG.
    ihdrType: buf.subarray(12, 16).toString('ascii'),
  }
}

describe('committed PWA icons', () => {
  it.each(ICONS)('$name has a valid PNG signature + IHDR', ({ name, width, height, colorType }) => {
    const h = readHeader(name)
    expect(h.signature.equals(PNG_SIGNATURE)).toBe(true)
    expect(h.ihdrType).toBe('IHDR')
    expect(h.width).toBe(width)
    expect(h.height).toBe(height)
    expect(h.bitDepth).toBe(8)
    expect(h.colorType).toBe(colorType)
  })
})
