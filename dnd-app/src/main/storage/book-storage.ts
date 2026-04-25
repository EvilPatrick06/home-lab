import { app } from 'electron'
import { copyFile, mkdir, readdir, readFile, stat, unlink } from 'fs/promises'
import { basename, extname, join } from 'path'
import { logToFile } from '../log'
import { atomicWriteFile } from './atomic-write'

export interface BookConfig {
  id: string
  title: string
  path: string
  type: 'core' | 'custom'
  coverPath?: string
  addedAt: string
}

export interface BookmarkEntry {
  id: string
  bookId: string
  page: number
  label: string
  color?: string
  createdAt: string
}

export interface AnnotationEntry {
  id: string
  bookId: string
  page: number
  text: string
  highlight?: { x: number; y: number; width: number; height: number }
  createdAt: string
}

export interface BookData {
  bookmarks: BookmarkEntry[]
  annotations: AnnotationEntry[]
}

function getBooksDir(): string {
  return join(app.getPath('userData'), 'books')
}

function getBookConfigPath(): string {
  return join(app.getPath('userData'), 'book-config.json')
}

function getBookDataPath(bookId: string): string {
  return join(getBooksDir(), `${bookId}-data.json`)
}

export async function loadBookConfig(): Promise<BookConfig[]> {
  try {
    const content = await readFile(getBookConfigPath(), 'utf-8')
    return JSON.parse(content) as BookConfig[]
  } catch {
    return []
  }
}

export async function saveBookConfig(configs: BookConfig[]): Promise<{ success: boolean; error?: string }> {
  try {
    const dir = app.getPath('userData')
    await mkdir(dir, { recursive: true })
    await atomicWriteFile(getBookConfigPath(), JSON.stringify(configs, null, 2))
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save book config' }
  }
}

export async function addBook(config: BookConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const configs = await loadBookConfig()
    const existing = configs.findIndex((c) => c.id === config.id)
    if (existing >= 0) {
      configs[existing] = config
    } else {
      configs.push(config)
    }
    return saveBookConfig(configs)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add book' }
  }
}

export async function removeBook(bookId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const configs = await loadBookConfig()
    const filtered = configs.filter((c) => c.id !== bookId)

    // Delete the book data file if it exists
    try {
      await unlink(getBookDataPath(bookId))
    } catch {
      // Ignore if data file doesn't exist
    }

    // If it was a custom book stored in our books dir, delete the PDF too
    const book = configs.find((c) => c.id === bookId)
    if (book?.type === 'custom') {
      const booksDir = getBooksDir()
      if (book.path.startsWith(booksDir)) {
        try {
          await unlink(book.path)
        } catch {
          // Ignore
        }
      }
    }

    return saveBookConfig(filtered)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to remove book' }
  }
}

export async function importBook(
  sourcePath: string,
  _title: string,
  bookId: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const ext = extname(sourcePath).toLowerCase()
    if (ext !== '.pdf') {
      return { success: false, error: 'Only PDF files are supported' }
    }

    // Verify file exists
    await stat(sourcePath)

    const booksDir = getBooksDir()
    await mkdir(booksDir, { recursive: true })

    const destPath = join(booksDir, `${bookId}${ext}`)
    await copyFile(sourcePath, destPath)

    return { success: true, path: destPath }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to import book' }
  }
}

export async function readBookFile(filePath: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
  try {
    // Only allow reading PDF files from known locations
    const ext = extname(filePath).toLowerCase()
    if (ext !== '.pdf') {
      return { success: false, error: 'Only PDF files are supported' }
    }

    const data = await readFile(filePath)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to read book file' }
  }
}

export async function loadBookData(bookId: string): Promise<BookData> {
  try {
    const content = await readFile(getBookDataPath(bookId), 'utf-8')
    return JSON.parse(content) as BookData
  } catch {
    return { bookmarks: [], annotations: [] }
  }
}

export async function saveBookData(bookId: string, data: BookData): Promise<{ success: boolean; error?: string }> {
  try {
    const booksDir = getBooksDir()
    await mkdir(booksDir, { recursive: true })
    await atomicWriteFile(getBookDataPath(bookId), JSON.stringify(data, null, 2))
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save book data' }
  }
}

export async function listImportedBooks(): Promise<string[]> {
  try {
    const booksDir = getBooksDir()
    const files = await readdir(booksDir)
    return files.filter((f) => extname(f).toLowerCase() === '.pdf').map((f) => basename(f, '.pdf'))
  } catch {
    return []
  }
}

const CORE_BOOK_DEFS = [
  {
    id: 'phb-2024',
    title: "Player's Handbook 2024",
    path: join(app.getPath('userData'), 'core_books', 'PHB2024', 'PlayersHandbook2024.pdf')
  },
  {
    id: 'dmg-2024',
    title: "Dungeon Master's Guide 2024",
    path: join(app.getPath('userData'), 'core_books', 'DMG2024', 'Dungeon_Masters_Guide_2024.pdf')
  },
  {
    id: 'mm-2025',
    title: 'Monster Manual 2025',
    path: join(app.getPath('userData'), 'core_books', 'MM2025', 'Monster Manual 2024.pdf')
  }
]

/** Register core books at startup if they exist on disk and aren't yet configured */
export async function registerCoreBooks(): Promise<void> {
  try {
    const configs = await loadBookConfig()
    let changed = false

    for (const def of CORE_BOOK_DEFS) {
      if (configs.some((c) => c.id === def.id)) continue

      try {
        await stat(def.path)
        configs.push({
          id: def.id,
          title: def.title,
          path: def.path,
          type: 'core',
          addedAt: new Date().toISOString()
        })
        changed = true
        logToFile('INFO', `Registered core book: ${def.title} at ${def.path}`)
      } catch {
        logToFile('INFO', `Core book not found, skipping: ${def.path}`)
      }
    }

    if (changed) {
      await saveBookConfig(configs)
    }
  } catch (err) {
    logToFile('WARN', `Failed to register core books: ${err}`)
  }
}
