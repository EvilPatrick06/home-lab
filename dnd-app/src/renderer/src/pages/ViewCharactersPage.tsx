import { Swords } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CharacterCard, ConfirmDialog, Spinner } from '../components/ui'
import { addToast } from '../hooks/use-toast'
import { useT } from '../i18n'
import { exportCharacterToFile, importCharacterFromFile } from '../services/io/character-io'
import { importDndBeyondCharacter } from '../services/io/import-dnd-beyond'
import { importFoundryCharacter } from '../services/io/import-foundry'
import { exportCharacterToPdf } from '../services/io/pdf-export'
import { useCharacterStore } from '../stores/use-character-store'
import { getBuilderCreatePath, getCharacterSheetPath } from '../utils/character-routes'
import { logger } from '../utils/logger'

type StatusFilter = 'active' | 'retired' | 'deceased' | 'all'

const filterTabs: Array<{ key: StatusFilter; labelKey: string }> = [
  { key: 'active', labelKey: 'pages.viewCharactersPage.filterActive' },
  { key: 'retired', labelKey: 'pages.viewCharactersPage.filterRetired' },
  { key: 'deceased', labelKey: 'pages.viewCharactersPage.filterDeceased' },
  { key: 'all', labelKey: 'pages.viewCharactersPage.filterAll' }
]

export default function ViewCharactersPage(): JSX.Element {
  const { t } = useT()
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
    addToast(t('pages.viewCharactersPage.toastDeleted'), 'success')
  }

  const handleDeleteAll = async (): Promise<void> => {
    await deleteAllCharacters()
    setShowDeleteAllConfirm(false)
    addToast(t('pages.viewCharactersPage.toastAllDeleted'), 'success')
  }

  const handleExport = async (characterId: string): Promise<void> => {
    const character = characters.find((c) => c.id === characterId)
    if (!character) return
    try {
      const saved = await exportCharacterToFile(character)
      if (saved) addToast(t('pages.viewCharactersPage.toastExported'), 'success')
    } catch (err) {
      logger.error('Failed to export character:', err)
      addToast(t('pages.viewCharactersPage.toastExportFailed'), 'error')
    }
  }

  const handleImport = async (): Promise<void> => {
    setShowImportMenu(false)
    try {
      const character = await importCharacterFromFile()
      if (character) {
        await saveCharacter(character)
        addToast(t('pages.viewCharactersPage.toastImported'), 'success')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('pages.viewCharactersPage.toastImportFailed')
      addToast(message, 'error')
    }
  }

  const handleImportDdb = async (): Promise<void> => {
    setShowImportMenu(false)
    try {
      const character = await importDndBeyondCharacter()
      if (character) {
        await saveCharacter(character)
        addToast(t('pages.viewCharactersPage.toastImportedDdb', { name: character.name }), 'success')
      }
    } catch (err) {
      logger.error('DDB import failed:', err)
      addToast(t('pages.viewCharactersPage.toastImportDdbFailed'), 'error')
    }
  }

  const handleImportFoundry = async (): Promise<void> => {
    setShowImportMenu(false)
    try {
      const character = await importFoundryCharacter()
      if (character) {
        await saveCharacter(character)
        addToast(t('pages.viewCharactersPage.toastImportedFoundry', { name: character.name }), 'success')
      }
    } catch (err) {
      logger.error('Foundry import failed:', err)
      addToast(t('pages.viewCharactersPage.toastImportFoundryFailed'), 'error')
    }
  }

  const handleExportPdf = async (characterId: string): Promise<void> => {
    const character = characters.find((c) => c.id === characterId)
    if (!character) return
    try {
      const success = await exportCharacterToPdf(character)
      if (success) addToast(t('pages.viewCharactersPage.toastExportedPdf'), 'success')
      else addToast(t('pages.viewCharactersPage.toastExportPdfFailed'), 'error')
    } catch (err) {
      logger.error('PDF export failed:', err)
      addToast(t('pages.viewCharactersPage.toastExportPdfFailed'), 'error')
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
        className="text-accent hover:text-amber-300 hover:underline mb-6 block cursor-pointer"
      >
        &larr; {t('pages.viewCharactersPage.backToMenu')}
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{t('pages.viewCharactersPage.title')}</h1>
        <div className="flex items-center gap-2">
          {characters.length > 0 && (
            <button
              onClick={() => setShowDeleteAllConfirm(true)}
              className="px-4 py-2 border border-gray-600 hover:border-red-600 hover:bg-surface-2
                         text-muted hover:text-red-400 rounded-lg font-semibold text-sm
                         transition-colors cursor-pointer"
            >
              {t('pages.viewCharactersPage.deleteAll')}
            </button>
          )}
          <div className="relative" ref={importMenuRef}>
            <button
              onClick={() => setShowImportMenu(!showImportMenu)}
              className="px-4 py-2 border border-gray-600 hover:border-amber-600 hover:bg-surface-2
                         text-gray-300 hover:text-accent rounded-lg font-semibold text-sm
                         transition-colors cursor-pointer flex items-center gap-1"
            >
              {t('pages.viewCharactersPage.import')}
              <span className="text-xs">{showImportMenu ? '\u25B2' : '\u25BC'}</span>
            </button>
            {showImportMenu && (
              <div className="absolute end-0 top-full mt-1 w-52 bg-surface border border-border rounded-lg shadow-xl z-20 py-1">
                <button
                  onClick={handleImport}
                  className="w-full text-start px-4 py-2 text-sm text-gray-300 hover:bg-surface-2 hover:text-accent cursor-pointer"
                >
                  {t('pages.viewCharactersPage.importFromFile')}
                </button>
                <button
                  onClick={handleImportDdb}
                  className="w-full text-start px-4 py-2 text-sm text-gray-300 hover:bg-surface-2 hover:text-accent cursor-pointer"
                >
                  {t('pages.viewCharactersPage.importDdb')}
                </button>
                <button
                  onClick={handleImportFoundry}
                  className="w-full text-start px-4 py-2 text-sm text-gray-300 hover:bg-surface-2 hover:text-accent cursor-pointer"
                >
                  {t('pages.viewCharactersPage.importFoundry')}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => navigate(getBuilderCreatePath())}
            className="px-4 py-2 bg-amber-600 hover:bg-accent-strong text-white rounded-lg
                       font-semibold text-sm transition-colors cursor-pointer"
          >
            {t('pages.viewCharactersPage.newCharacter')}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <input
          name="character-search"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('pages.viewCharactersPage.searchPlaceholder')}
          className="w-full max-w-md px-4 py-2 rounded-lg bg-surface-2 border border-border text-fg
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
                ? 'border-amber-500 text-accent'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t(tab.labelKey)}
            {tab.key !== 'all' && (
              <span className="ms-1.5 text-xs text-gray-600">
                {characters.filter((c) => c.status === tab.key).length}
              </span>
            )}
            {tab.key === 'all' && <span className="ms-1.5 text-xs text-gray-600">{characters.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Spinner size="lg" />
          <span className="text-sm text-gray-500">{t('pages.viewCharactersPage.loadingCharacters')}</span>
        </div>
      ) : characters.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center text-gray-500">
          <Swords className="w-10 h-10 mx-auto mb-4 text-gray-500" aria-hidden="true" />
          <p className="text-xl mb-2">{t('pages.viewCharactersPage.noCharactersYet')}</p>
          <p className="mb-4">{t('pages.viewCharactersPage.createFirstPrompt')}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate(getBuilderCreatePath())}
              className="px-5 py-2.5 bg-amber-600 hover:bg-accent-strong text-white rounded-lg
                         font-semibold transition-colors cursor-pointer"
            >
              {t('pages.viewCharactersPage.createCharacter')}
            </button>
            <button
              onClick={handleImport}
              className="px-5 py-2.5 border border-gray-600 hover:border-amber-600 hover:bg-surface-2
                         text-gray-300 hover:text-accent rounded-lg font-semibold
                         transition-colors cursor-pointer"
            >
              {t('pages.viewCharactersPage.importCharacter')}
            </button>
          </div>
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <p className="text-lg mb-1">
            {searchQuery
              ? t('pages.viewCharactersPage.noMatching', { query: searchQuery })
              : t('pages.viewCharactersPage.noStatusCharacters', { status: statusFilter })}
          </p>
          <p className="text-sm">{t('pages.viewCharactersPage.tryDifferentFilter')}</p>
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
        title={t('pages.viewCharactersPage.deleteTitle')}
        message={t('pages.viewCharactersPage.deleteMessage')}
        confirmLabel={t('common.actions.delete')}
        variant="danger"
        onConfirm={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />

      <ConfirmDialog
        open={showDeleteAllConfirm}
        title={t('pages.viewCharactersPage.deleteAllTitle')}
        message={
          characters.length !== 1
            ? t('pages.viewCharactersPage.deleteAllMessagePlural', { count: characters.length })
            : t('pages.viewCharactersPage.deleteAllMessageSingular', { count: characters.length })
        }
        confirmLabel={t('pages.viewCharactersPage.deleteAll')}
        variant="danger"
        onConfirm={handleDeleteAll}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />
    </div>
  )
}
