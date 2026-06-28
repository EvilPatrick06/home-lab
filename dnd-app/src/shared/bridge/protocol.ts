/**
 * Native ↔ WebView bridge protocol (mobile embed-first architecture).
 *
 * The React Native shell and the embedded in-game WebView are two separate JS
 * realms that can only exchange strings over `react-native-webview`'s
 * postMessage/onMessage. This module defines the wire format they speak:
 *
 *   - RPC (request → response) for `window.api`-style calls that return a value
 *     (storage reads/writes, registry lookups). Correlated by a monotonic id.
 *   - Events (fire-and-forget) for state notifications, carrying a monotonic
 *     sequence number so a reloaded WebView can detect a gap and request a
 *     resync of just the missed events (mirrors the multiplayer replay buffer).
 *
 * Frames are msgpack-encoded (reusing the dependency the multiplayer codec
 * already uses) then base64'd, because the transport channel is string-only.
 * A one-byte tag prefixes the msgpack body so the format can evolve.
 */

import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack'

export const BRIDGE_PROTOCOL_VERSION = 1

/** Default RPC timeout — matches the BMO bridge's 15s HTTP timeout. */
export const BRIDGE_RPC_TIMEOUT_MS = 15_000

/** How many recent events each endpoint retains for resync (per the network
 * layer's 500-entry replay buffer). */
export const BRIDGE_EVENT_BUFFER_SIZE = 500

export type BridgeRole = 'native' | 'web'

export type BridgeFrame =
  | { k: 'hello'; protocol: number; role: BridgeRole }
  | { k: 'rpc-req'; id: number; method: string; args: readonly unknown[] }
  | { k: 'rpc-ok'; id: number; result: unknown }
  | { k: 'rpc-err'; id: number; error: string }
  | { k: 'event'; seq: number; name: string; payload: unknown }
  | { k: 'resync'; sinceSeq: number }

const WIRE_TAG_MSGPACK_B64 = 0x01

// ── base64 (Uint8Array ⇄ string), dependency-free so it works identically in
//    the browser, Electron, Hermes (RN), and Node test runners. ──────────────
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = (() => {
  const table = new Uint8Array(256)
  for (let i = 0; i < B64_CHARS.length; i++) table[B64_CHARS.charCodeAt(i)] = i
  return table
})()

function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + B64_CHARS[n & 63]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i]! << 16
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + '=='
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + '='
  }
  return out
}

function base64ToBytes(b64: string): Uint8Array {
  const len = b64.length
  if (len % 4 !== 0) throw new Error('bridge: malformed base64 frame')
  let pad = 0
  if (len > 0 && b64[len - 1] === '=') pad++
  if (len > 1 && b64[len - 2] === '=') pad++
  const outLen = (len / 4) * 3 - pad
  const out = new Uint8Array(outLen)
  let o = 0
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[b64.charCodeAt(i)]!
    const b = B64_LOOKUP[b64.charCodeAt(i + 1)]!
    const c = B64_LOOKUP[b64.charCodeAt(i + 2)]!
    const d = B64_LOOKUP[b64.charCodeAt(i + 3)]!
    const n = (a << 18) | (b << 12) | (c << 6) | d
    if (o < outLen) out[o++] = (n >> 16) & 0xff
    if (o < outLen) out[o++] = (n >> 8) & 0xff
    if (o < outLen) out[o++] = n & 0xff
  }
  return out
}

/** Serialize a frame to a transport string (tag byte + msgpack, base64'd). */
export function encodeFrame(frame: BridgeFrame): string {
  const body = msgpackEncode(frame) as Uint8Array
  const tagged = new Uint8Array(body.length + 1)
  tagged[0] = WIRE_TAG_MSGPACK_B64
  tagged.set(body, 1)
  return bytesToBase64(tagged)
}

/** Parse a transport string back into a frame. Throws on unknown tag / corrupt
 * payload so callers can log + drop rather than mis-dispatch. */
export function decodeFrame(data: string): BridgeFrame {
  const bytes = base64ToBytes(data)
  if (bytes.length === 0) throw new Error('bridge: empty frame')
  const tag = bytes[0]
  if (tag !== WIRE_TAG_MSGPACK_B64) throw new Error(`bridge: unknown wire tag 0x${tag!.toString(16)}`)
  return msgpackDecode(bytes.subarray(1)) as BridgeFrame
}
