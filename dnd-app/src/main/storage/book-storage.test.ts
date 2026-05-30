import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 28i — book config/data load+save against a real tmp userData dir. The
// module resolves its books dir + config path from electron's
// app.getPath('userData'); point that at a fresh tmp dir per test so we exercise
// the genuine fs read/write/parse path (round-trips, missing-file defaults,
// malformed-JSON tolerance, core-vs-custom book handling, PDF import guards).
//
// NOTE: book-storage's per-call path helpers (getBooksDir / getBookConfigPath)
// re-invoke app.getPath at call time, so they pick up the per-test mockUserData.
// CORE_BOOK_DEFS evaluates app.getPath once at import (under the init fallback),
// but registerCoreBooks's stat()/saveBookConfig run at call time against the live
// dir; the core-book tests recreate the expected core PDF path under mockUserData.

// State lives on a hoisted function declaration's static slot rather than a
// module-level let/const. A `let`/`const` would sit in its temporal dead zone
// when the hoisted vi.mock factory + `import './book-storage'` fire getPath
// during CORE_BOOK_DEFS evaluation; a hoisted function avoids that. Each test
// reassigns the dir in beforeEach.
function resolveUserData(): string {
  return state.dir ?? join(tmpdir(), 'book-storage-init')
}
function state(): void {}
state.dir = undefined as string | undefined

function setUserData(dir: string): void {
  state.dir = dir
}

vi.mock('electron', () => ({
  app: { getPath: vi.fn((name: string) => (name === 'userData' ? resolveUserData() : join(resolveUserData(), name))) }
}))

vi.mock('../log', () => ({ logToFile: vi.fn() }))

import {
  addBook,
  type BookConfig,
  type BookData,
  importBook,
  listImportedBooks,
  loadBookConfig,
  loadBookData,
  readBookFile,
  removeBook,
  saveBookConfig,
  saveBookData
} from './book-storage'

const CONFIG_PATH = (): string => join(resolveUserData(), 'book-config.json')
const BOOKS_DIR = (): string => join(resolveUserData(), 'books')

function makeConfig(overrides: Partial<BookConfig> = {}): BookConfig {
  return {
    id: 'book-1',
    title: 'A Tome',
    path: join(BOOKS_DIR(), 'book-1.pdf'),
    type: 'custom',
    addedAt: '2026-05-29T00:00:00.000Z',
    ...overrides
  }
}

describe('book-storage', () => {
  beforeEach(() => {
    setUserData(mkdtempSync(join(tmpdir(), 'book-storage-')))
  })

  afterEach(() => {
    rmSync(resolveUserData(), { recursive: true, force: true })
  })

  describe('loadBookConfig', () => {
    it('returns an empty array when the config file is missing', async () => {
      expect(await loadBookConfig()).toEqual([])
    })

    it('returns an empty array on malformed JSON', async () => {
      await mkdir(resolveUserData(), { recursive: true })
      writeFileSync(CONFIG_PATH(), '{ not valid json')
      expect(await loadBookConfig()).toEqual([])
    })

    it('parses a well-formed config file', async () => {
      const cfg = makeConfig()
      await mkdir(resolveUserData(), { recursive: true })
      writeFileSync(CONFIG_PATH(), JSON.stringify([cfg]))
      expect(await loadBookConfig()).toEqual([cfg])
    })
  })

  describe('saveBookConfig + round-trip', () => {
    it('writes the config to <userData>/book-config.json and round-trips', async () => {
      const cfg = makeConfig()
      const result = await saveBookConfig([cfg])
      expect(result).toEqual({ success: true })
      expect(existsSync(CONFIG_PATH())).toBe(true)
      expect(await loadBookConfig()).toEqual([cfg])
    })

    it('persists multiple configs preserving order', async () => {
      const a = makeConfig({ id: 'a', title: 'Alpha' })
      const b = makeConfig({ id: 'b', title: 'Bravo', type: 'core' })
      expect((await saveBookConfig([a, b])).success).toBe(true)
      expect(await loadBookConfig()).toEqual([a, b])
    })
  })

  describe('addBook', () => {
    it('appends a new book', async () => {
      expect((await addBook(makeConfig({ id: 'x' }))).success).toBe(true)
      const configs = await loadBookConfig()
      expect(configs.map((c) => c.id)).toEqual(['x'])
    })

    it('replaces an existing book with the same id instead of duplicating', async () => {
      await addBook(makeConfig({ id: 'dup', title: 'First' }))
      await addBook(makeConfig({ id: 'dup', title: 'Second' }))
      const configs = await loadBookConfig()
      expect(configs).toHaveLength(1)
      expect(configs[0]?.title).toBe('Second')
    })
  })

  describe('removeBook', () => {
    it('removes the config entry by id', async () => {
      await saveBookConfig([makeConfig({ id: 'keep' }), makeConfig({ id: 'drop' })])
      const result = await removeBook('drop')
      expect(result).toEqual({ success: true })
      expect((await loadBookConfig()).map((c) => c.id)).toEqual(['keep'])
    })

    it('also deletes the book data file when present', async () => {
      await saveBookConfig([makeConfig({ id: 'd1' })])
      await saveBookData('d1', { bookmarks: [], annotations: [] })
      const dataPath = join(BOOKS_DIR(), 'd1-data.json')
      expect(existsSync(dataPath)).toBe(true)

      await removeBook('d1')
      expect(existsSync(dataPath)).toBe(false)
    })

    it('deletes the PDF of a custom book stored inside the books dir', async () => {
      const pdfPath = join(BOOKS_DIR(), 'custom-1.pdf')
      await mkdir(BOOKS_DIR(), { recursive: true })
      await writeFile(pdfPath, 'fake-pdf-bytes')
      await saveBookConfig([makeConfig({ id: 'custom-1', type: 'custom', path: pdfPath })])
      expect(existsSync(pdfPath)).toBe(true)

      await removeBook('custom-1')
      expect(existsSync(pdfPath)).toBe(false)
    })

    it('leaves a core book PDF on disk (only custom books in the books dir are deleted)', async () => {
      const corePath = join(resolveUserData(), 'core_books', 'core.pdf')
      await mkdir(join(resolveUserData(), 'core_books'), { recursive: true })
      await writeFile(corePath, 'core-pdf')
      await saveBookConfig([makeConfig({ id: 'core-1', type: 'core', path: corePath })])

      await removeBook('core-1')
      expect(existsSync(corePath)).toBe(true)
    })

    it('succeeds removing a non-existent id (no-op filter)', async () => {
      await saveBookConfig([makeConfig({ id: 'only' })])
      const result = await removeBook('ghost')
      expect(result).toEqual({ success: true })
      expect((await loadBookConfig()).map((c) => c.id)).toEqual(['only'])
    })
  })

  describe('importBook', () => {
    it('rejects non-PDF source files', async () => {
      const result = await importBook('/tmp/notes.txt', 'Notes', 'b')
      expect(result).toEqual({ success: false, error: 'Only PDF files are supported' })
    })

    it('rejects a PDF source path that does not exist', async () => {
      const result = await importBook(join(resolveUserData(), 'missing.pdf'), 'Gone', 'gone')
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('copies a valid PDF into <userData>/books/<id>.pdf', async () => {
      const src = join(resolveUserData(), 'source.pdf')
      await mkdir(resolveUserData(), { recursive: true })
      await writeFile(src, 'pdf-content')

      const result = await importBook(src, 'My Book', 'mybook')
      expect(result.success).toBe(true)
      const expectedDest = join(BOOKS_DIR(), 'mybook.pdf')
      expect(result.path).toBe(expectedDest)
      expect(existsSync(expectedDest)).toBe(true)
      expect(await readFile(expectedDest, 'utf-8')).toBe('pdf-content')
    })
  })

  describe('readBookFile', () => {
    it('rejects a non-PDF path', async () => {
      const result = await readBookFile(join(resolveUserData(), 'image.png'))
      expect(result).toEqual({ success: false, error: 'Only PDF files are supported' })
    })

    it('returns the file bytes for an existing PDF', async () => {
      const pdf = join(resolveUserData(), 'read-me.pdf')
      await mkdir(resolveUserData(), { recursive: true })
      await writeFile(pdf, 'binary-ish')
      const result = await readBookFile(pdf)
      expect(result.success).toBe(true)
      expect(result.data?.toString('utf-8')).toBe('binary-ish')
    })

    it('fails for a missing PDF path', async () => {
      const result = await readBookFile(join(resolveUserData(), 'absent.pdf'))
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('loadBookData / saveBookData', () => {
    it('returns the empty default shape when no data file exists', async () => {
      expect(await loadBookData('nope')).toEqual({ bookmarks: [], annotations: [] })
    })

    it('returns the empty default shape on malformed JSON', async () => {
      await mkdir(BOOKS_DIR(), { recursive: true })
      writeFileSync(join(BOOKS_DIR(), 'bad-data.json'), '{ broken')
      expect(await loadBookData('bad')).toEqual({ bookmarks: [], annotations: [] })
    })

    it('round-trips bookmarks and annotations through save → load', async () => {
      const data: BookData = {
        bookmarks: [{ id: 'bm1', bookId: 'b', page: 12, label: 'Spells', color: '#fff', createdAt: 'now' }],
        annotations: [
          {
            id: 'an1',
            bookId: 'b',
            page: 12,
            text: 'note',
            highlight: { x: 1, y: 2, width: 3, height: 4 },
            createdAt: 'now'
          }
        ]
      }
      expect((await saveBookData('b', data)).success).toBe(true)
      expect(await loadBookData('b')).toEqual(data)
    })
  })

  describe('listImportedBooks', () => {
    it('returns an empty array when the books dir is missing', async () => {
      expect(await listImportedBooks()).toEqual([])
    })

    it('lists PDF basenames (without extension) and ignores non-PDF files', async () => {
      await mkdir(BOOKS_DIR(), { recursive: true })
      await writeFile(join(BOOKS_DIR(), 'one.pdf'), 'x')
      await writeFile(join(BOOKS_DIR(), 'two.pdf'), 'x')
      await writeFile(join(BOOKS_DIR(), 'one-data.json'), 'x')
      await writeFile(join(BOOKS_DIR(), 'readme.txt'), 'x')
      const result = await listImportedBooks()
      expect(result.sort()).toEqual(['one', 'two'])
    })
  })

  describe('registerCoreBooks', () => {
    // CORE_BOOK_DEFS freezes app.getPath('userData') at module-import time. To make
    // its def.path resolve to the live per-test dir, re-import the module fresh
    // (vi.resetModules) AFTER mockUserData is set — the electron mock factory then
    // re-evaluates resolveUserData() against the current dir during that re-import.
    async function freshBookStorage(): Promise<typeof import('./book-storage')> {
      vi.resetModules()
      return import('./book-storage')
    }

    const PHB_PDF = (): string => join(resolveUserData(), 'core_books', 'PHB2024', 'PlayersHandbook2024.pdf')

    it('registers a core book whose PDF exists on disk', async () => {
      await mkdir(join(resolveUserData(), 'core_books', 'PHB2024'), { recursive: true })
      await writeFile(PHB_PDF(), 'phb')

      const reg = await freshBookStorage()
      await reg.registerCoreBooks()

      const configs = await reg.loadBookConfig()
      const phb = configs.find((c) => c.id === 'phb-2024')
      expect(phb).toBeDefined()
      expect(phb?.type).toBe('core')
      expect(phb?.title).toBe("Player's Handbook 2024")
      expect(phb?.path).toBe(PHB_PDF())
    })

    it('does not register core books whose files are absent', async () => {
      const reg = await freshBookStorage()
      await reg.registerCoreBooks()
      expect(await reg.loadBookConfig()).toEqual([])
    })

    it('does not duplicate an already-configured core book', async () => {
      await mkdir(join(resolveUserData(), 'core_books', 'PHB2024'), { recursive: true })
      await writeFile(PHB_PDF(), 'phb')

      const reg = await freshBookStorage()
      await reg.registerCoreBooks()
      await reg.registerCoreBooks()

      const phbCount = (await reg.loadBookConfig()).filter((c) => c.id === 'phb-2024').length
      expect(phbCount).toBe(1)
    })
  })
})
