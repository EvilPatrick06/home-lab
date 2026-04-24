import { useCallback, useState } from 'react'
import type { HomebrewEntry, LibraryCategory, LibraryItem } from '../../types/library'
import { getCategoryDef } from '../../types/library'

interface HomebrewCreateModalProps {
  category: LibraryCategory
  existingItem?: LibraryItem
  onSave: (entry: HomebrewEntry) => Promise<void>
  onClose: () => void
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

const EDITABLE_SKIP = new Set(['id', '_homebrewId', '_basedOn', '_createdAt', 'tokenSize', 'source'])

export default function HomebrewCreateModal({
  category,
  existingItem,
  onSave,
  onClose
}: HomebrewCreateModalProps): JSX.Element {
  const catDef = getCategoryDef(category)
  const isEditing = !!existingItem?.data._homebrewId
  const basedOn = existingItem?.data._basedOn as string | undefined

  const initialData: Record<string, unknown> = existingItem
    ? Object.fromEntries(Object.entries(existingItem.data).filter(([k]) => !EDITABLE_SKIP.has(k)))
    : { name: '', description: '' }

  const [formData, setFormData] = useState<Record<string, unknown>>(initialData)
  const [newFieldKey, setNewFieldKey] = useState('')
  const [saving, setSaving] = useState(false)

  const updateField = (key: string, value: unknown): void => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const removeField = (key: string): void => {
    setFormData((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const addField = (): void => {
    if (!newFieldKey.trim()) return
    const key = newFieldKey.trim().replace(/\s+/g, '_').toLowerCase()
    setFormData((prev) => ({ ...prev, [key]: '' }))
    setNewFieldKey('')
  }

  const handleSave = async (): Promise<void> => {
    const name = (formData.name as string)?.trim()
    if (!name) return

    setSaving(true)
    try {
      const entry: HomebrewEntry = {
        id: isEditing ? (existingItem!.data._homebrewId as string) : crypto.randomUUID(),
        type: category,
        name,
        data: { ...formData, id: `homebrew-${crypto.randomUUID().slice(0, 8)}` },
        basedOn: basedOn ?? existingItem?.id,
        createdAt: isEditing
          ? (existingItem!.data._createdAt as string) || new Date().toISOString()
          : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await onSave(entry)
    } finally {
      setSaving(false)
    }
  }

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  const editableFields = Object.entries(formData).filter(([k]) => !EDITABLE_SKIP.has(k))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleBackdropClick}>
      <div className="absolute inset-0 bg-black/70" aria-hidden="true" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {catDef && <span className="text-2xl">{catDef.icon}</span>}
            <div>
              <h2 className="text-xl font-bold text-gray-100">
                {isEditing ? 'Edit' : 'Create'} Custom {catDef?.label ?? category}
              </h2>
              {basedOn && <p className="text-xs text-gray-500 mt-0.5">Based on: {existingItem?.name}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-2xl leading-none cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {editableFields.map(([key, value]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {formatLabel(key)}
                </label>
                {key !== 'name' && key !== 'description' && (
                  <button
                    onClick={() => removeField(key)}
                    className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              {renderEditField(key, value, updateField)}
            </div>
          ))}

          <div className="pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-2">Add custom field</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addField()}
                placeholder="Field name..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={addField}
                disabled={!newFieldKey.trim()}
                className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving || !(formData.name as string)?.trim()}
            className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Entry'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-gray-600 hover:bg-gray-800 text-gray-200 font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function renderEditField(key: string, value: unknown, onChange: (key: string, value: unknown) => void): JSX.Element {
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(key, e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
        />
        <span className="text-sm text-gray-300">{value ? 'Yes' : 'No'}</span>
      </label>
    )
  }

  if (typeof value === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(key, Number(e.target.value))}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
      />
    )
  }

  if (typeof value === 'string' && (value.length > 100 || key === 'description' || key === 'effect')) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(key, e.target.value)}
        rows={4}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none resize-y"
      />
    )
  }

  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return (
      <input
        type="text"
        value={value.join(', ')}
        onChange={(e) =>
          onChange(
            key,
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
        placeholder="Comma separated values..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
      />
    )
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <textarea
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try {
            onChange(key, JSON.parse(e.target.value))
          } catch {
            // Keep raw text if not valid JSON yet
          }
        }}
        rows={4}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono text-xs focus:border-amber-500 focus:outline-none resize-y"
      />
    )
  }

  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(key, e.target.value)}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
    />
  )
}
