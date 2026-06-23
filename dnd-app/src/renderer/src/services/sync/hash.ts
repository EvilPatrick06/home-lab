/**
 * FNV-1a (32-bit) content hash over bytes → 8-hex. Fast, dependency-free, and
 * non-cryptographic — used purely to detect whether a locally-serialized entity
 * changed since its last sync. Not a security primitive.
 */

export function hashBytes(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let h = 0x811c9dc5
  for (let i = 0; i < u8.length; i++) {
    h ^= u8[i]
    // h *= 16777619, via shifts to stay in 32-bit unsigned.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
