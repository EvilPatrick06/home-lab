import { describe, expect, it } from 'vitest'
import type { FileReadResult } from './file-reader'
import { formatFileContent, hasFileReadTag, parseFileRead, stripFileRead } from './file-reader'

describe('file-reader', () => {
  describe('hasFileReadTag', () => {
    it('detects FILE_READ tag', () => {
      expect(hasFileReadTag('Some text [FILE_READ]{"path": "test.txt"}[/FILE_READ] more text')).toBe(true)
    })

    it('returns false when no tag present', () => {
      expect(hasFileReadTag('Some text without tags')).toBe(false)
    })

    it('handles multiline content inside tag', () => {
      const text = `Here is something
[FILE_READ]
{"path": "C:/Users/test/file.txt"}
[/FILE_READ]
And more text`
      expect(hasFileReadTag(text)).toBe(true)
    })
  })

  describe('parseFileRead', () => {
    it('parses JSON path from tag', () => {
      const result = parseFileRead('[FILE_READ]{"path": "C:/test/file.txt"}[/FILE_READ]')
      expect(result).toEqual({ path: 'C:/test/file.txt' })
    })

    it('parses multiline tag with whitespace', () => {
      const text = `[FILE_READ]
  {"path": "/home/user/notes.md"}
[/FILE_READ]`
      const result = parseFileRead(text)
      expect(result).toEqual({ path: '/home/user/notes.md' })
    })

    it('parses plain text path (no JSON)', () => {
      const result = parseFileRead('[FILE_READ]C:/simple/path.txt[/FILE_READ]')
      expect(result).toEqual({ path: 'C:/simple/path.txt' })
    })

    it('returns null when no tag present', () => {
      expect(parseFileRead('no tag here')).toBeNull()
    })

    it('returns null for malformed JSON without valid path', () => {
      expect(parseFileRead('[FILE_READ]{invalid json}[/FILE_READ]')).toBeNull()
    })
  })

  describe('stripFileRead', () => {
    it('removes FILE_READ tag from text', () => {
      const text = 'Before [FILE_READ]{"path": "test.txt"}[/FILE_READ] After'
      expect(stripFileRead(text)).toBe('BeforeAfter')
    })

    it('handles text with no tag', () => {
      expect(stripFileRead('just text')).toBe('just text')
    })

    it('removes multiline tag', () => {
      const text = `Let me read that file.
[FILE_READ]
{"path": "C:/test.txt"}
[/FILE_READ]
I'll check it for you.`
      const result = stripFileRead(text)
      expect(result).toContain('Let me read that file.')
      expect(result).toContain("I'll check it for you.")
      expect(result).not.toContain('FILE_READ')
    })
  })

  describe('formatFileContent', () => {
    it('formats successful read result', () => {
      const result: FileReadResult = {
        success: true,
        path: 'C:/test/file.txt',
        content: 'Hello, world!'
      }
      const formatted = formatFileContent(result)
      expect(formatted).toBe('[FILE CONTENT: C:/test/file.txt]\nHello, world!\n[/FILE CONTENT]')
    })

    it('formats error result', () => {
      const result: FileReadResult = {
        success: false,
        path: 'C:/missing.txt',
        error: 'File not found'
      }
      const formatted = formatFileContent(result)
      expect(formatted).toBe('[FILE ERROR: C:/missing.txt]\nFile not found\n[/FILE ERROR]')
    })
  })
})
