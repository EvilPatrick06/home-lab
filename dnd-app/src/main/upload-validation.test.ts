import { describe, expect, it } from 'vitest'
import { validateMagicBytes, validateUploadExtension } from './upload-validation'

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])
const ogg = Buffer.from([0x4f, 0x67, 0x67, 0x53])
const mp3Id3 = Buffer.from([0x49, 0x44, 0x33, 0x03])
const mp3Sync = Buffer.from([0xff, 0xfb, 0x90, 0x00])

describe('validateMagicBytes (Phase 20f)', () => {
  it('matches each supported kind', () => {
    expect(validateMagicBytes(png, ['png'])).toBe(true)
    expect(validateMagicBytes(jpeg, ['jpeg'])).toBe(true)
    expect(validateMagicBytes(gif, ['gif'])).toBe(true)
    expect(validateMagicBytes(webp, ['webp'])).toBe(true)
    expect(validateMagicBytes(wav, ['wav'])).toBe(true)
    expect(validateMagicBytes(ogg, ['ogg'])).toBe(true)
    expect(validateMagicBytes(mp3Id3, ['mp3'])).toBe(true)
    expect(validateMagicBytes(mp3Sync, ['mp3'])).toBe(true)
  })

  it('rejects mismatched headers', () => {
    expect(validateMagicBytes(png, ['jpeg'])).toBe(false)
    expect(validateMagicBytes(wav, ['webp'])).toBe(false) // both RIFF, differ at byte 8
  })
})

describe('validateUploadExtension (Phase 20f)', () => {
  it('passes a real PNG named .png', () => {
    expect(validateUploadExtension(png, 'png')).toBeNull()
    expect(validateUploadExtension(png, '.png')).toBeNull()
  })

  it('rejects a PNG renamed to .jpg', () => {
    expect(validateUploadExtension(png, 'jpg')).toBe('Invalid file type: header does not match extension')
  })

  it('passes unknown extensions through (gated elsewhere)', () => {
    expect(validateUploadExtension(Buffer.from([0x00]), 'pdf')).toBeNull()
  })
})
