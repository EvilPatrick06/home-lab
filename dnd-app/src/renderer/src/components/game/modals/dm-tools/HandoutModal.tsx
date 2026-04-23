import { useCallback, useRef, useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'
import type { Handout, HandoutPage } from '../../../../types/game-state'
import ModalFormFooter from '../shared/ModalFormFooter'

interface HandoutModalProps {
  onClose: () => void
  onShareHandout?: (handout: Handout) => void
}

export default function HandoutModal({ onClose, onShareHandout }: HandoutModalProps): JSX.Element {
  const handouts = useGameStore((s) => s.handouts)
  const addHandout = useGameStore((s) => s.addHandout)
  const updateHandout = useGameStore((s) => s.updateHandout)
  const removeHandout = useGameStore((s) => s.removeHandout)

  const [title, setTitle] = useState('')
  const [contentType, setContentType] = useState<'image' | 'text'>('text')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<'all' | 'dm-only'>('dm-only')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pages, setPages] = useState<HandoutPage[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = useCallback(() => {
    setTitle('')
    setContentType('text')
    setContent('')
    setVisibility('dm-only')
    setEditingId(null)
    setPages([])
  }, [])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setContent(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }, [])

  const handleSave = useCallback(() => {
    if (!title.trim() || !content.trim()) return

    if (editingId) {
      updateHandout(editingId, {
        title: title.trim(),
        contentType,
        content,
        visibility,
        ...(pages.length > 0 ? { pages } : {})
      })
    } else {
      const handout: Handout = {
        id: crypto.randomUUID(),
        title: title.trim(),
        contentType,
        content,
        visibility,
        createdAt: Date.now(),
        ...(pages.length > 0 ? { pages } : {})
      }
      addHandout(handout)
    }
    resetForm()
  }, [title, content, contentType, visibility, editingId, pages, addHandout, updateHandout, resetForm])

  const addPage = useCallback(() => {
    setPages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), contentType: 'text', content: '', label: `Page ${prev.length + 1}` }
    ])
  }, [])

  const updatePage = useCallback((pageId: string, updates: Partial<HandoutPage>) => {
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, ...updates } : p)))
  }, [])

  const removePage = useCallback((pageId: string) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId))
  }, [])

  const handleShare = useCallback(
    (handout: Handout) => {
      const updated: Handout = { ...handout, visibility: 'all' }
      updateHandout(handout.id, { visibility: 'all' })
      onShareHandout?.(updated)
    },
    [updateHandout, onShareHandout]
  )

  const handleEdit = useCallback((handout: Handout) => {
    setEditingId(handout.id)
    setTitle(handout.title)
    setContentType(handout.contentType)
    setContent(handout.content)
    setVisibility(handout.visibility)
    setPages(handout.pages ?? [])
  }, [])

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-200">{editingId ? 'Edit Handout' : 'Handouts'}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Create / Edit Form */}
        <div className="border border-gray-700/50 rounded-lg p-3 mb-3 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Handout title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50"
            />
            <div className="flex rounded overflow-hidden border border-gray-700">
              <button
                onClick={() => {
                  setContentType('text')
                  setContent('')
                }}
                className={`px-2 py-1 text-[10px] cursor-pointer ${
                  contentType === 'text' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Text
              </button>
              <button
                onClick={() => {
                  setContentType('image')
                  setContent('')
                }}
                className={`px-2 py-1 text-[10px] cursor-pointer ${
                  contentType === 'image' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Image
              </button>
            </div>
          </div>

          {contentType === 'text' ? (
            <textarea
              placeholder="Handout text content..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50 resize-y"
            />
          ) : (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-300 file:cursor-pointer hover:file:bg-gray-600"
              />
              {content && (
                <div className="border border-gray-700/50 rounded p-1">
                  <img src={content} alt="Preview" className="max-h-32 rounded object-contain mx-auto" />
                </div>
              )}
            </div>
          )}

          <ModalFormFooter
            isEditing={!!editingId}
            isSaveDisabled={!title.trim() || !content.trim()}
            saveLabel="Save"
            editingLabel="Update"
            onCancel={resetForm}
            onSave={handleSave}
            leftSlot={
              <>
                <span className="text-[10px] text-gray-500">Visibility:</span>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as 'all' | 'dm-only')}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 outline-none cursor-pointer"
                >
                  <option value="dm-only">DM Only</option>
                  <option value="all">All Players</option>
                </select>
              </>
            }
          />

          {/* Multi-page editing */}
          {pages.length > 0 && (
            <div className="border-t border-gray-700/40 pt-2 space-y-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Additional Pages</span>
              {pages.map((page, idx) => (
                <div key={page.id} className="bg-gray-800/40 border border-gray-700/30 rounded p-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Page ${idx + 2} label`}
                      value={page.label ?? ''}
                      onChange={(e) => updatePage(page.id, { label: e.target.value })}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-200 outline-none"
                    />
                    <select
                      value={page.contentType}
                      onChange={(e) =>
                        updatePage(page.id, { contentType: e.target.value as 'text' | 'image', content: '' })
                      }
                      className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 outline-none cursor-pointer"
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                    </select>
                    <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={page.dmOnly ?? false}
                        onChange={(e) => updatePage(page.id, { dmOnly: e.target.checked })}
                        className="accent-amber-500"
                      />
                      DM Only
                    </label>
                    <button
                      onClick={() => removePage(page.id)}
                      className="px-1.5 py-0.5 text-[10px] bg-red-900/40 hover:bg-red-800/40 text-red-300 rounded cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                  {page.contentType === 'text' ? (
                    <textarea
                      placeholder="Page content..."
                      value={page.content}
                      onChange={(e) => updatePage(page.id, { content: e.target.value })}
                      rows={2}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-200 outline-none resize-y"
                    />
                  ) : (
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          if (typeof reader.result === 'string') updatePage(page.id, { content: reader.result })
                        }
                        reader.readAsDataURL(file)
                      }}
                      className="w-full text-[10px] text-gray-400 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-gray-700 file:text-gray-300 file:cursor-pointer"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={addPage}
            className="w-full py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700/40 border-dashed rounded cursor-pointer"
          >
            + Add Page
          </button>
        </div>

        {/* Handout List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
          {handouts.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              No handouts created yet. Use the form above to create one.
            </p>
          ) : (
            handouts.map((handout) => (
              <div
                key={handout.id}
                className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/40 rounded-lg p-2"
              >
                {/* Thumbnail / icon */}
                <div className="w-10 h-10 rounded bg-gray-700/50 flex items-center justify-center shrink-0 overflow-hidden">
                  {handout.contentType === 'image' ? (
                    <img src={handout.content} alt={handout.title} className="w-full h-full object-cover rounded" />
                  ) : (
                    <span className="text-gray-500 text-lg">T</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200 truncate">{handout.title}</p>
                  <p className="text-[10px] text-gray-500">
                    {handout.contentType === 'image' ? 'Image' : 'Text'} &middot;{' '}
                    {handout.visibility === 'all' ? 'Visible to all' : 'DM only'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleShare(handout)}
                    title="Share with players"
                    className="px-2 py-1 text-[10px] bg-green-700/40 hover:bg-green-600/40 text-green-300 border border-green-600/30 rounded cursor-pointer"
                  >
                    Share
                  </button>
                  <button
                    onClick={() => handleEdit(handout)}
                    title="Edit handout"
                    className="px-2 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeHandout(handout.id)}
                    title="Delete handout"
                    className="px-2 py-1 text-[10px] bg-red-900/40 hover:bg-red-800/40 text-red-300 border border-red-700/30 rounded cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
