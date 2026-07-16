import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { afterEach, describe, expect, it } from 'vitest'
import type { FileReadResult } from './file-reader'
import { formatFileContent, hasFileReadTag, parseFileRead, readRequestedFile, stripFileRead } from './file-reader'

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

  describe('readRequestedFile — symlink containment (SECURITY-LOG 2026-07-15)', () => {
    const userData = app.getPath('userData')
    const campaignsDir = join(userData, 'campaigns', 'sec-test')
    const secretPath = join(userData, 'ai-config.json')
    const created: string[] = [join(userData, 'campaigns', 'sec-test'), secretPath]

    afterEach(async () => {
      for (const c of created) await rm(c, { recursive: true, force: true }).catch(() => undefined)
    })

    it('reads a real file inside an allowed dir (positive control)', async () => {
      await mkdir(campaignsDir, { recursive: true })
      const real = join(campaignsDir, 'notes.txt')
      await writeFile(real, 'campaign notes')
      const res = await readRequestedFile(real)
      expect(res.success).toBe(true)
      expect(res.content).toBe('campaign notes')
    })

    it('denies a symlink inside an allowed dir that targets an out-of-tree secret', async () => {
      await mkdir(campaignsDir, { recursive: true })
      await writeFile(secretPath, '{"anthropicApiKey":"sk-SECRET"}')
      const link = join(campaignsDir, 'leak.txt')
      await rm(link, { force: true }).catch(() => undefined)
      await symlink(secretPath, link)
      const res = await readRequestedFile(link)
      expect(res.success).toBe(false)
      expect(res.content).toBeUndefined()
      expect(res.error).toMatch(/Access denied/)
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
