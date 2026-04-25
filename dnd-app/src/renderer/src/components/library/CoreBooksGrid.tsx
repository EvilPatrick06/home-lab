import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState } from '../ui'

interface BookConfig {
  id: string
  title: string
  path: string
  type: 'core' | 'custom'
  coverPath?: string
  addedAt: string
}

const CORE_BOOK_DEFS = [
  {
    key: 'phb-2024',
    title: "Player's Handbook 2024",
    icon: '📗',
    description: 'Classes, species, spells, and rules for players'
  },
  {
    key: 'dmg-2024',
    title: "Dungeon Master's Guide 2024",
    icon: '📘',
    description: 'World building, encounters, and DM tools'
  },
  {
    key: 'mm-2025',
    title: 'Monster Manual 2025',
    icon: '📕',
    description: 'Monster stat blocks and lore'
  }
]

interface CoreBooksGridProps {
  onOpenBook: (book: BookConfig) => void
}

export default function CoreBooksGrid({ onOpenBook }: CoreBooksGridProps): JSX.Element {
  const [books, setBooks] = useState<BookConfig[]>([])
  const [loading, setLoading] = useState(true)

  const loadBooks = useCallback(async () => {
    try {
      const configs = await window.api.books.loadConfig()
      setBooks(configs)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBooks()
  }, [loadBooks])

  const handleBrowseForBook = useCallback(
    async (coreDef?: { key: string; title: string }) => {
      try {
        const result = await window.api.showOpenDialog({
          title: coreDef ? `Select ${coreDef.title} PDF` : 'Select PDF Book',
          filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        })
        if (!result) return

        const bookId = coreDef?.key ?? globalThis.crypto.randomUUID()
        const title = coreDef?.title ?? result.split(/[/\\]/).pop()?.replace('.pdf', '') ?? 'Untitled Book'

        const config: BookConfig = {
          id: bookId,
          title,
          path: result,
          type: coreDef ? 'core' : 'custom',
          addedAt: new Date().toISOString()
        }

        await window.api.books.add(config)
        await loadBooks()
      } catch {
        // ignore
      }
    },
    [loadBooks]
  )

  const handleImportBook = useCallback(async () => {
    try {
      const result = await window.api.showOpenDialog({
        title: 'Import PDF Book',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
      })
      if (!result) return

      const bookId = globalThis.crypto.randomUUID()
      const fileName = result.split(/[/\\]/).pop()?.replace('.pdf', '') ?? 'Untitled Book'

      // Import (copy) into userData/books/
      const importResult = await window.api.books.import(result, fileName, bookId)
      if (!importResult.success || !importResult.path) return

      const config: BookConfig = {
        id: bookId,
        title: fileName,
        path: importResult.path,
        type: 'custom',
        addedAt: new Date().toISOString()
      }

      await window.api.books.add(config)
      await loadBooks()
    } catch {
      // ignore
    }
  }, [loadBooks])

  const handleRemoveBook = useCallback(
    async (bookId: string) => {
      await window.api.books.remove(bookId)
      await loadBooks()
    },
    [loadBooks]
  )

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-32 bg-gray-800 rounded" />
          <div className="h-32 bg-gray-800 rounded" />
        </div>
      </div>
    )
  }

  const coreBooks = CORE_BOOK_DEFS.map((def) => ({
    ...def,
    config: books.find((b) => b.id === def.key)
  }))

  const customBooks = books.filter((b) => b.type === 'custom')

  return (
    <div className="p-4 space-y-6">
      {/* Core Books */}
      <section>
        <h3 className="text-lg font-bold text-amber-400 mb-3">Core Rulebooks</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coreBooks.map((book) => (
            <div
              key={book.key}
              className="group relative bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-amber-600/50 transition-all"
            >
              <div className="p-4 flex flex-col items-center text-center gap-2">
                <span className="text-4xl">{book.icon}</span>
                <h4 className="text-sm font-bold text-gray-200">{book.title}</h4>
                <p className="text-xs text-gray-500">{book.description}</p>

                {book.config ? (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => onOpenBook(book.config!)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium transition-colors"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleRemoveBook(book.key)}
                      className="px-2 py-1.5 bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-400 rounded text-sm transition-colors"
                      title="Remove book link"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleBrowseForBook({ key: book.key, title: book.title })}
                    className="mt-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
                  >
                    📂 Link PDF
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Custom Books */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-300">Custom Books</h3>
          <Button variant="secondary" size="sm" onClick={handleImportBook}>
            + Import PDF
          </Button>
        </div>

        {customBooks.length === 0 ? (
          <EmptyState title="No custom books" description="Import your own PDF books to read them here." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {customBooks.map((book) => (
              <div
                key={book.id}
                className="group relative bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-amber-600/50 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📓</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-200 truncate">{book.title}</h4>
                    <p className="text-[10px] text-gray-500">Added {new Date(book.addedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onOpenBook(book)}
                      className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs transition-colors"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleRemoveBook(book.id)}
                      className="px-1.5 py-1 text-gray-500 hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
