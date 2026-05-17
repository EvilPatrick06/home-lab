/**
 * Wire codec for the multiplayer transport. (Phase 29j)
 *
 * Network frames carry one of three encodings, distinguished by the
 * first byte:
 *
 *   0x01 — msgpack
 *   0x02 — msgpack + gzip (CompressionStream)
 *
 * Anything that isn't a Uint8Array starting with one of those tag
 * bytes is treated as a legacy JSON string and parsed via `JSON.parse`,
 * which keeps us wire-compatible with v2.1.9 and earlier clients/hosts
 * that don't negotiate the msgpack capability.
 *
 * `encodeMessage` decides the encoding for a peer based on its
 * advertised capabilities (see `JoinPayload.clientCapabilities`). When
 * the peer doesn't support msgpack we fall back to the JSON-string
 * path. Payloads above `GZIP_THRESHOLD_BYTES` after msgpack encoding
 * are gzipped on top, which roughly halves the wire bytes for the
 * larger map-image / state-full frames.
 */

import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack'
import type { NetworkMessage } from './types'

export const WIRE_TAG_MSGPACK = 0x01
export const WIRE_TAG_MSGPACK_GZIP = 0x02

export const GZIP_THRESHOLD_BYTES = 4_096

export interface EncodeOptions {
  /**
   * Whether the recipient supports binary frames. When false (the
   * default for unknown peers / pre-29j clients), encodeMessage
   * returns a JSON string so the wire stays backwards compatible.
   */
  msgpack?: boolean
  /**
   * Override the gzip threshold for tests.
   */
  gzipThresholdBytes?: number
}

function concatTag(tag: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 1)
  out[0] = tag
  out.set(body, 1)
  return out
}

async function gzip(input: Uint8Array): Promise<Uint8Array | null> {
  // CompressionStream is available in modern Electron renderers
  // (Chromium 80+). If the runtime lacks it (older test env) we
  // surface null so encodeMessage drops back to the un-gzipped frame.
  if (typeof CompressionStream === 'undefined') return null
  try {
    // Wrap the bytes in a fresh Uint8Array view that copies the
    // underlying buffer — bypasses the SharedArrayBuffer typing
    // friction that lib.dom uses for `BlobPart`.
    const sliced = input.slice()
    const blob = new Blob([sliced])
    const compressed = blob.stream().pipeThrough(new CompressionStream('gzip'))
    const buffer = await new Response(compressed).arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

async function gunzip(input: Uint8Array): Promise<Uint8Array> {
  // CompressionStream's counterpart. Unlike the encode path we
  // require this to work — if it's missing, the host shouldn't have
  // sent us a gzipped frame in the first place (capability handshake
  // gates msgpack itself; gzip is layered on top).
  const sliced = input.slice()
  const blob = new Blob([sliced])
  const decompressed = blob.stream().pipeThrough(new DecompressionStream('gzip'))
  const buffer = await new Response(decompressed).arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Encode a NetworkMessage for the wire. Returns a JSON string when
 * the recipient hasn't opted into msgpack, otherwise a tagged
 * Uint8Array. May resolve asynchronously because gzip uses
 * CompressionStream.
 */
export async function encodeMessage(msg: NetworkMessage, options: EncodeOptions = {}): Promise<string | Uint8Array> {
  if (!options.msgpack) {
    return JSON.stringify(msg)
  }
  const body = msgpackEncode(msg) as Uint8Array
  const threshold = options.gzipThresholdBytes ?? GZIP_THRESHOLD_BYTES
  if (body.length >= threshold) {
    const compressed = await gzip(body)
    if (compressed && compressed.length < body.length) {
      return concatTag(WIRE_TAG_MSGPACK_GZIP, compressed)
    }
  }
  return concatTag(WIRE_TAG_MSGPACK, body)
}

/**
 * Synchronous variant. Skips gzip — used by hot paths where the
 * caller has already decided the payload is too small to benefit
 * from compression (or by code paths that can't await).
 */
export function encodeMessageSync(msg: NetworkMessage, options: EncodeOptions = {}): string | Uint8Array {
  if (!options.msgpack) {
    return JSON.stringify(msg)
  }
  return concatTag(WIRE_TAG_MSGPACK, msgpackEncode(msg) as Uint8Array)
}

function toUint8Array(input: unknown): Uint8Array | null {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  return null
}

/**
 * Decode a wire frame back into a NetworkMessage. Accepts JSON
 * strings (legacy) or tagged Uint8Array / ArrayBuffer / TypedArray
 * payloads. Throws on unknown tag bytes or malformed JSON.
 */
export async function decodeMessage(raw: unknown): Promise<NetworkMessage> {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as NetworkMessage
  }
  const bytes = toUint8Array(raw)
  if (!bytes || bytes.length === 0) {
    throw new Error('decodeMessage: empty or unsupported frame')
  }
  const tag = bytes[0]
  const body = bytes.subarray(1)
  if (tag === WIRE_TAG_MSGPACK) {
    return msgpackDecode(body) as NetworkMessage
  }
  if (tag === WIRE_TAG_MSGPACK_GZIP) {
    const decompressed = await gunzip(body)
    return msgpackDecode(decompressed) as NetworkMessage
  }
  throw new Error(`decodeMessage: unknown wire tag 0x${tag.toString(16)}`)
}
