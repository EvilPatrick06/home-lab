import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import CharacterBuilder5e from '../components/builder/5e/CharacterBuilder5e'
import { applyBuilderDraft, clearBuilderDraft, loadBuilderDraft, useAutoSaveBuilderDraft } from '../hooks/use-auto-save'
import { addToast } from '../hooks/use-toast'
import { useT } from '../i18n'
import { useBuilderStore } from '../stores/use-builder-store'
import type { Character } from '../types/character'

export default function CreateCharacterPage(): JSX.Element {
  const { t } = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const phase = useBuilderStore((s) => s.phase)
  const selectGameSystem = useBuilderStore((s) => s.selectGameSystem)
  const editingCharacterId = useBuilderStore((s) => s.editingCharacterId)
  const loadCharacterForEdit = useBuilderStore((s) => s.loadCharacterForEdit)
  const [draftPrompt, setDraftPrompt] = useState(false)

  // Hydrate builder from URL param when editing via direct link
  useEffect(() => {
    if (!id || editingCharacterId === id) return
    let cancelled = false
    window.api.loadCharacter(id).then((raw) => {
      if (cancelled) return
      if (!raw) {
        navigate('/characters', { replace: true })
        return
      }
      loadCharacterForEdit(raw as unknown as Character)
    })
    return () => {
      cancelled = true
    }
  }, [id, editingCharacterId, loadCharacterForEdit, navigate])

  useEffect(() => {
    if (phase === 'system-select' && !id) {
      selectGameSystem('dnd5e')
    }
  }, [phase, selectGameSystem, id])

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
    const draft = loadBuilderDraft()
    if (draft) {
      applyBuilderDraft(draft)
    }
    setDraftPrompt(false)
    addToast(t('pages.createCharacterPage.draftResumed'), 'info')
  }, [t])

  const handleDiscardDraft = useCallback((): void => {
    clearBuilderDraft()
    setDraftPrompt(false)
  }, [])

  // Ctrl+S to save (triggers the builder's save flow)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        addToast(t('pages.createCharacterPage.useSaveButton'), 'info')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [t])

  // Phase 17m — the "Library" quick-link now lives inline in the builder's
  // header (CharacterBuilder5e) instead of as a floating button here; the old
  // `fixed top-3 right-14` button overlapped the Save Character button.
  return (
    <>
      <CharacterBuilder5e />
      {draftPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-surface border border-border rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">{t('pages.createCharacterPage.resumeDraftTitle')}</h3>
            <p className="text-muted text-sm mb-4">{t('pages.createCharacterPage.resumeDraftPrompt')}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDiscardDraft}
                className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-surface-2
                  transition-colors cursor-pointer text-sm"
              >
                {t('pages.createCharacterPage.discard')}
              </button>
              <button
                onClick={handleResumeDraft}
                className="px-4 py-2 bg-amber-600 hover:bg-accent-strong rounded-lg
                  transition-colors cursor-pointer text-sm font-semibold text-white"
              >
                {t('pages.createCharacterPage.resume')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
