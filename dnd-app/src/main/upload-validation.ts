/**
 * Phase 20f — magic-byte validation for binary uploads.
 *
 * A renderer-supplied filename/extension is not trustworthy (a `.exe` can be
 * renamed `.png`). Before persisting an uploaded image or audio file we sniff
 * the leading bytes and confirm they match the claimed kind.
 */

type FileKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'ogg' | 'wav' | 'mp3'

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false
  }
  return true
}

/** True if `buffer` looks like one of `kinds` by its magic bytes. */
export function validateMagicBytes(buffer: Buffer, kinds: FileKind[]): boolean {
  return kinds.some((kind) => {
    switch (kind) {
      case 'png':
        return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])
      case 'jpeg':
        // ffd8ffe0 (JFIF) / ffd8ffe1 (EXIF) / ffd8ffe8 (SPIFF) — all start ffd8ff.
        return startsWith(buffer, [0xff, 0xd8, 0xff])
      case 'gif':
        return startsWith(buffer, [0x47, 0x49, 0x46, 0x38]) // GIF8
      case 'webp':
        // RIFF....WEBP
        return startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
      case 'wav':
        // RIFF....WAVE
        return startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x41, 0x56, 0x45], 8)
      case 'ogg':
        return startsWith(buffer, [0x4f, 0x67, 0x67, 0x53]) // OggS
      case 'mp3':
        // ID3 tag or MPEG frame sync (0xFFEx/0xFFFx).
        return startsWith(buffer, [0x49, 0x44, 0x33]) || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
      default:
        return false
    }
  })
}

const EXTENSION_KINDS: Record<string, FileKind[]> = {
  png: ['png'],
  jpg: ['jpeg'],
  jpeg: ['jpeg'],
  gif: ['gif'],
  webp: ['webp'],
  wav: ['wav'],
  ogg: ['ogg'],
  oga: ['ogg'],
  mp3: ['mp3']
}

/**
 * Validate that `buffer`'s magic bytes match its file extension. Returns null on
 * success, or an error message on mismatch. Extensions not in the map (e.g. a
 * format we don't sniff) pass through — callers gate the allowed set elsewhere.
 */
export function validateUploadExtension(buffer: Buffer, extension: string): string | null {
  const ext = extension.replace(/^\./, '').toLowerCase()
  const kinds = EXTENSION_KINDS[ext]
  if (!kinds) return null
  if (!validateMagicBytes(buffer, kinds)) {
    return 'Invalid file type: header does not match extension'
  }
  return null
}
