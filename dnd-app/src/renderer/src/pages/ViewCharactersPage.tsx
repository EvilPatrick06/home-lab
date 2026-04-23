import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CharacterCard, ConfirmDialog, Spinner } from '../components/ui'
import { addToast } from '../hooks/use-toast'
import { exportCharacterToFile, importCharacterFromFile } from '../services/io/character-io'
import { importDndBeyondCharacter } from '../services/io/import-dnd-beyond'
import { importFoundryCharacter } from '../services/io/import-foundry'
import { exportCharacterToPdf } from '../services/io/pdf-export'
import { useCharacterStore } from '../stores/use-character-store'
import { getCharacterSheetPath } from '../utils/character-routes'
import { logger } from '../utils/logger'

type StatusFilter = 'active' | 'retired' | 'deceased' | 'all'

const filterTabs: Array<{ key: StatusFilter; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'retired', label: 'Retired' },
  { key: 'deceased', label: 'Deceased' },
  { key: 'all', label: 'All' }
]

export default function ViewCharactersPage(): JSX.Element {
  const navigate = useNavigate()
  const { characters, loading, loadCharacters, deleteCharacter, deleteAllCharacters, saveCharacter } =
    useCharacterStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [showImportMenu, setShowImportMenu] = useState(false)
  const importMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  useEffect(() => {
    if (!showImportMenu) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setShowImportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showImportMenu])

  const handleDelete = async (id: string): Promise<void> => {
    await deleteCharacter(id)
    setShowDeleteConfirm(null)
    addToast('Character deleted', 'success')
  }

  const handleDeleteAll = async (): Promise<void> => {
    await deleteAllCharacters()
    setShowDeleteAllConfirm(false)
    addToast('All characters deleted', 'success')
  }

  const handleExport = async (characterId: string): Promise<void> => {
    const character = characters.find((c) => c.id === characterId)
    if (!character) return
    try {
      const saved = await exportCharacterToFile(character)
      if (saved) addToast('Character exported', 'success')
    } catch (err) {
      logger.error('Failed to export character:', err)
      addToast('Failed to export character', 'error')
    }
  }

  const handleImport = async (): Promise<void> => {
    setShowImportMenu(false)
    try {
      const character = await importCharacterFromFile()
      if (character) {
        await saveCharacter(character)
        addToast('Character imported successfully', 'success')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import character'
      addToast(message, 'error')
    }
  }

  const handleImportDdb = async (): Promise<void> => {
    setShowImportMenu(false)
    try {
      const character = await importDndBeyondCharacter()
      if (character) {
        await saveCharacter(character)
        addToast(`Imported "${character.name}" from D&D Beyond`, 'success')
      }
    } catch (err) {
      logger.error('DDB import failed:', err)
      addToast('Failed to import D&D Beyond character', 'error')
    }
  }

  const handleImportFoundry = async (): Promise<void> => {
    setShowImportMenu(false)
    try {
      const character = await importFoundryCharacter()
      if (character) {
        await saveCharacter(character)
        addToast(`Imported "${character.name}" from Foundry VTT`, 'success')
      }
    } catch (err) {
      logger.error('Foundry import failed:', err)
      addToast('Failed to import Foundry VTT character', 'error')
    }
  }

  const handleExportPdf = async (characterId: string): Promise<void> => {
    const character = characters.find((c) => c.id === characterId)
    if (!character) return
    try {
      const success = await exportCharacterToPdf(character)
      if (success) addToast('Character exported to PDF', 'success')
      else addToast('Failed to export PDF', 'error')
    } catch (err) {
      logger.error('PDF export failed:', err)
      addToast('Failed to export PDF', 'error')
    }
  }

  const filteredCharacters = useMemo(() => {
    let result = characters
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((c) => c.name.toLowerCase().includes(q))
    }
    return result
  }, [characters, statusFilter, searchQuery])

  return (
    <div className="p-8 h-screen overflow-y-auto">
      <button
        onClick={() => navigate('/')}
        className="text-amber-400 hover:text-amber-300 hover:underline mb-6 block cursor-pointer"
      >
        &larr; Back to Menu
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Your Characters</h1>
        <div className="flex items-center gap-2">
          {characters.length > 0 && (
            <button
              onClick={() => setShowDeleteAllConfirm(true)}
              className="px-4 py-2 border border-gray-600 hover:border-red-600 hover:bg-gray-800
                         text-gray-400 hover:text-red-400 rounded-lg font-semibold text-sm
                         transition-colors cursor-pointer"
            >
              Delete All
            </button>
          )}
          <div className="relative" ref={importMenuRef}>
            <button
              onClick={() => setShowImportMenu(!showImportMenu)}
              className="px-4 py-2 border border-gray-600 hover:border-amber-600 hover:bg-gray-800
                         text-gray-300 hover:text-amber-400 rounded-lg font-semibold text-sm
                         transition-colors cursor-pointer flex items-center gap-1"
            >
              Import
              <span className="text-[10px]">{showImportMenu ? '\u25B2' : '\u25BC'}</span>
            </button>
            {showImportMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 py-1">
                <button
                  onClick={handleImport}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-amber-400 cursor-pointer"
                >
                  From File (.dndchar)
                </button>
                <button
                  onClick={handleImportDdb}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-amber-400 cursor-pointer"
                >
                  D&D Beyond JSON
                </button>
                <button
                  onClick={handleImportFoundry}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-amber-400 cursor-pointer"
                >
                  Foundry VTT JSON
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => navigate('/characters/create')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg
                       font-semibold text-sm transition-colors cursor-pointer"
          >
            + New Character
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search characters by name..."
          className="w-full max-w-md px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
            placeholder-gray-500 focus:border-amber-500 focus:outline-none transition-colors text-sm"
        />
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              statusFilter === tab.key
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
            {tab.key !== 'all' && (
              <span className="ml-1.5 text-xs text-gray-600">
                {characters.filter((c) => c.status === tab.key).length}
              </span>
            )}
            {tab.key === 'all' && <span className="ml-1.5 text-xs text-gray-600">{characters.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Spinner size="lg" />
          <span className="text-sm text-gray-500">Loading characters...</span>
        </div>
      ) : characters.length === 0 ? (
        <div className="border border-dashed border-gray-700 rounded-lg p-12 text-center text-gray-500">
          <div className="text-4xl mb-4">&#9876;</div>
          <p className="text-xl mb-2">No characters yet</p>
          <p className="mb-4">Create your first character to begin your adventure.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate('/characters/create')}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg
                         font-semibold transition-colors cursor-pointer"
            >
              Create Character
            </button>
            <button
              onClick={handleImport}
              className="px-5 py-2.5 border border-gray-600 hover:border-amber-600 hover:bg-gray-800
                         text-gray-300 hover:text-amber-400 rounded-lg font-semibold
                         transition-colors cursor-pointer"
            >
              Import Character
            </button>
          </div>
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <p className="text-lg mb-1">
            {searchQuery ? `No characters matching "${searchQuery}"` : `No ${statusFilter} characters`}
          </p>
          <p className="text-sm">Try a different filter or create a new character.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCharacters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              onClick={() => navigate(getCharacterSheetPath(char))}
              onDelete={() => setShowDeleteConfirm(char.id)}
              onExport={() => handleExport(char.id)}
              onExportPdf={() => handleExportPdf(char.id)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!showDeleteConfirm}
        title="Delete Character?"
        message="This action cannot be undone. The character will be permanently deleted."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />

      <ConfirmDialog
        open={showDeleteAllConfirm}
        title="Delete All Characters?"
        message={`This will permanently delete all ${characters.length} character${characters.length !== 1 ? 's' : ''}. This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        onConfirm={handleDeleteAll}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />
    </div>
  )
}
