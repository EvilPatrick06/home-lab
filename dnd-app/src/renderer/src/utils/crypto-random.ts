/**
 * Cryptographically secure random number generation for dice rolling.
 * Uses crypto.getRandomValues() for better randomness than Math.random().
 */

const BUFFER_SIZE = 256
let buffer: Uint32Array | null = null
let bufferIdx = BUFFER_SIZE

function refillBuffer(): void {
  buffer = new Uint32Array(BUFFER_SIZE)
  crypto.getRandomValues(buffer)
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
