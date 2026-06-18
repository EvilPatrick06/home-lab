#!/usr/bin/env node
// Zero-dependency PWA icon generator.
//
// Writes valid PNGs by hand — no canvas, no fonts, no image libraries. We
// build raw 8-bit RGBA scanlines (one leading filter byte per row, filter
// type 0 = "None"), zlib-deflate them, and frame the result in the minimal
// PNG chunk set (signature + IHDR + IDAT + IEND), each chunk CRC32-checked.
//
// The artwork is pure pixel geometry: a flat dark background with a centered
// amber diamond "spellbook gem" glyph. Regular icons fill ~55% of the canvas;
// the maskable icon fills ~45% so the glyph stays inside the inner-80% safe
// circle that launchers may crop to. The apple-touch-icon is rendered OPAQUE
// (no alpha) because iOS composites home-screen icons over no background.
//
// Run once and commit the four PNGs in public/:
//   node scripts/generate-pwa-icons.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ---------------------------------------------------------------------------
// CRC32 (PNG uses the standard IEEE 802.3 polynomial, reflected)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ---------------------------------------------------------------------------
// PNG chunk framing
// ---------------------------------------------------------------------------
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcInput), 0)
  return Buffer.concat([length, typeBuf, data, crc])
}

// colorType 6 = RGBA, 2 = RGB (opaque). bitDepth always 8.
function ihdr(width, height, colorType) {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(width, 0)
  data.writeUInt32BE(height, 4)
  data.writeUInt8(8, 8) // bit depth
  data.writeUInt8(colorType, 9) // color type
  data.writeUInt8(0, 10) // compression: deflate
  data.writeUInt8(0, 11) // filter: adaptive
  data.writeUInt8(0, 12) // interlace: none
  return chunk('IHDR', data)
}

// pixels: Uint8Array of width*height*channels (channels 3 or 4).
// Prepend filter byte 0 to each scanline, deflate, wrap as IDAT.
function buildPng(width, height, channels, pixels) {
  const stride = width * channels
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    const srcStart = y * stride
    const dstStart = y * (stride + 1)
    raw[dstStart] = 0 // filter type: None
    pixels.copy
      ? pixels.copy(raw, dstStart + 1, srcStart, srcStart + stride)
      : raw.set(pixels.subarray(srcStart, srcStart + stride), dstStart + 1)
  }
  const colorType = channels === 4 ? 6 : 2
  const idat = chunk('IDAT', deflateSync(raw, { level: 9 }))
  return Buffer.concat([PNG_SIGNATURE, ihdr(width, height, colorType), idat, chunk('IEND', Buffer.alloc(0))])
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const BG = [0x1a, 0x0e, 0x08] // #1a0e08 dark leather
const AMBER = [0xf5, 0x9e, 0x0b] // #f59e0b spellbook gem
const AMBER_DIM = [0xb4, 0x73, 0x09] // darker amber for the inner facet line

// ---------------------------------------------------------------------------
// Glyph rendering — centered diamond with a thin inner outline (a "gem book").
// `scale` is the fraction of min(width,height) the diamond's full width spans.
// `opaque` controls whether we emit RGB (3ch, iOS) or RGBA (4ch).
// ---------------------------------------------------------------------------
function renderIcon(size, scale, opaque) {
  const channels = opaque ? 3 : 4
  const px = new Uint8Array(size * size * channels)

  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const half = (size * scale) / 2 // half-diagonal of the diamond
  const innerHalf = half * 0.6 // inner facet ring

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // L1 (diamond) distance from center, normalized to the diamond extent.
      const d = Math.abs(x - cx) + Math.abs(y - cy)
      let color
      let alpha = 255
      if (d <= half) {
        // inside diamond — amber; draw a 1.5px-ish dim facet ring near innerHalf
        const ringDelta = Math.abs(d - innerHalf)
        color = ringDelta < Math.max(1.5, size * 0.006) ? AMBER_DIM : AMBER
      } else {
        color = BG
        alpha = opaque ? 255 : 0 // transparent outside the glyph for maskable/regular
      }
      const i = (y * size + x) * channels
      px[i] = color[0]
      px[i + 1] = color[1]
      px[i + 2] = color[2]
      if (channels === 4) px[i + 3] = alpha
    }
  }
  // For non-opaque icons we still want a solid dark plate behind the glyph so
  // the diamond reads on light launcher backgrounds — fill BG fully opaque,
  // then the diamond sits on top. (Maskable/regular both keep a full bg.)
  if (!opaque) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        if (px[i + 3] === 0) {
          px[i] = BG[0]
          px[i + 1] = BG[1]
          px[i + 2] = BG[2]
          px[i + 3] = 255
        }
      }
    }
  }
  return buildPng(size, size, channels, Buffer.from(px))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public')
mkdirSync(outDir, { recursive: true })

const REGULAR_SCALE = 0.55
const MASKABLE_SCALE = 0.45 // smaller → stays inside the inner-80% safe circle

const outputs = [
  { name: 'pwa-192x192.png', size: 192, scale: REGULAR_SCALE, opaque: false },
  { name: 'pwa-512x512.png', size: 512, scale: REGULAR_SCALE, opaque: false },
  { name: 'pwa-maskable-512x512.png', size: 512, scale: MASKABLE_SCALE, opaque: false },
  { name: 'apple-touch-icon.png', size: 180, scale: REGULAR_SCALE, opaque: true },
]

for (const { name, size, scale, opaque } of outputs) {
  const png = renderIcon(size, scale, opaque)
  writeFileSync(join(outDir, name), png)
  console.log(`wrote public/${name} (${size}x${size}, ${png.length} bytes, ${opaque ? 'RGB/opaque' : 'RGBA'})`)
}

console.log('done — commit the four PNGs in public/')
