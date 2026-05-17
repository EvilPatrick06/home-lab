/**
 * Cryptographically secure random number generation for dice rolling.
 * Uses crypto.getRandomValues() for better randomness than Math.random().
 */

const BUFFER_SIZE = 256
let buffer: Uint32Array | null = null
let bufferIdx = BUFFER_SIZE

// Resolve crypto.getRandomValues for both renderer (Web Crypto) and the
// vitest node environment, which exposes it via `globalThis.crypto`
// (Node 19+) or `require('node:crypto').webcrypto`.
function getRandomFn(): (buf: Uint32Array) => void {
  const g = globalThis as { crypto?: { getRandomValues?: (buf: Uint32Array) => void } }
  if (g.crypto?.getRandomValues) {
    return (buf) => g.crypto!.getRandomValues!(buf)
  }
  // Fallback: Math.random — tolerable for tests, never reached in production
  // (browsers + Electron both ship Web Crypto).
  return (buf) => {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 0x100000000)
  }
}

function refillBuffer(): void {
  buffer = new Uint32Array(BUFFER_SIZE)
  getRandomFn()(buffer)
  bufferIdx = 0
}

function nextUint32(): number {
  if (!buffer || bufferIdx >= BUFFER_SIZE) refillBuffer()
  return buffer![bufferIdx++]
}

/** Returns a random float in [0, 1) using crypto.getRandomValues. */
export function cryptoRandom(): number {
  return nextUint32() / 4294967296
}

/** Returns a random integer in [1, sides] inclusive — a single die roll. */
export function cryptoRollDie(sides: number): number {
  return Math.floor(cryptoRandom() * sides) + 1
}
