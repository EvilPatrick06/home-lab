import { useCallback, useEffect, useState } from 'react'
import CharacterBuilder5e from '../components/builder/5e/CharacterBuilder5e'
import { clearBuilderDraft, loadBuilderDraft, useAutoSaveBuilderDraft } from '../hooks/use-auto-save'
import { addToast } from '../hooks/use-toast'
import { useBuilderStore } from '../stores/use-builder-store'

export default function CreateCharacterPage(): JSX.Element {
  const phase = useBuilderStore((s) => s.phase)
  const selectGameSystem = useBuilderStore((s) => s.selectGameSystem)
  const editingCharacterId = useBuilderStore((s) => s.editingCharacterId)
  const [draftPrompt, setDraftPrompt] = useState(false)

  useEffect(() => {
    if (phase === 'system-select') {
      selectGameSystem('dnd5e')
    }
  }, [phase, selectGameSystem])

  // Auto-save builder drafts to localStorage
  useAutoSaveBuilderDraft()

  // Check for saved draft on mount (only for new characters)
  useEffect(() => {
    if (editingCharacterId) return
    const draft = loadBuilderDraft()
    if (draft?.characterName) {
      setDraftPrompt(true)
    }
  }, [editingCharacterId])

  const handleResumeDraft = useCallback((): void => {
    setDraftPrompt(false)
    addToast('Draft resumed', 'info')
  }, [])

  const handleDiscardDraft = useCallback((): void => {
    clearBuilderDraft()
    setDraftPrompt(false)
  }, [])

  // Ctrl+S to save (triggers the builder's save flow)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        addToast('Use the Save button to save your character', 'info')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <CharacterBuilder5e />
      {draftPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Resume Draft?</h3>
            <p className="text-gray-400 text-sm mb-4">
              You have an unsaved character draft. Would you like to resume where you left off?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDiscardDraft}
                className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800
                  transition-colors cursor-pointer text-sm"
              >
                Discard
              </button>
              <button
                onClick={handleResumeDraft}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg
                  transition-colors cursor-pointer text-sm font-semibold text-white"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
