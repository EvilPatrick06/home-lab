import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { Button } from '../ui'

type AudioCategory = 'ambient' | 'effect' | 'music'

export interface CustomAudioEntry {
  id: string
  fileName: string
  displayName: string
  category: AudioCategory
}

interface AudioStepProps {
  audioEntries: CustomAudioEntry[]
  onChange: (entries: CustomAudioEntry[]) => void
  // PHASE-13 13F — surface the picked File bytes so the wizard can upload them on create
  // and so this step can preview them via object URLs. Keyed by entry id.
  onFilesChange?: (files: Map<string, File>) => void
}

const CATEGORIES: Array<{ value: AudioCategory; label: string }> = [
  { value: 'ambient', label: 'Ambient' },
  { value: 'effect', label: 'Effect' },
  { value: 'music', label: 'Music' }
]

const CATEGORY_COLORS: Record<AudioCategory, string> = {
  ambient: 'bg-blue-900/40 text-blue-300',
  effect: 'bg-orange-900/40 text-orange-300',
  music: 'bg-purple-900/40 text-purple-300'
}

export default function AudioStep({ audioEntries, onChange, onFilesChange }: AudioStepProps): JSX.Element {
  const { t } = useT()
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // PHASE-13 13F — entry id → picked File (the wizard uploads these on create; previews
  // play them via object URLs). File objects can't be persisted, so a restored draft has
  // metadata but no bytes here — preview then no-ops for those entries.
  const filesRef = useRef<Map<string, File>>(new Map())
  const previewUrlRef = useRef<string | null>(null)

  const stopPreview = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.pause()
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])

  // Revoke any live object URL on unmount.
  useEffect(() => {
    return () => {
      stopPreview()
    }
  }, [stopPreview])

  const handleFilesAdded = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      const audioFiles = fileArray.filter((f) => /\.(mp3|ogg|wav|webm|m4a)$/i.test(f.name))
      if (audioFiles.length === 0) return

      const newEntries: CustomAudioEntry[] = audioFiles.map((file) => {
        const entry: CustomAudioEntry = {
          id: crypto.randomUUID(),
          fileName: file.name,
          displayName: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          category: 'effect'
        }
        filesRef.current.set(entry.id, file)
        return entry
      })
      // Batch all picked files into one update (the old per-file loop dropped all but the last).
      onChange([...audioEntries, ...newEntries])
      onFilesChange?.(new Map(filesRef.current))
    },
    [audioEntries, onChange, onFilesChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        handleFilesAdded(e.dataTransfer.files)
      }
    },
    [handleFilesAdded]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesAdded(e.target.files)
      }
      // Reset the file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [handleFilesAdded]
  )

  const handleRemove = useCallback(
    (id: string) => {
      if (previewingId === id) {
        stopPreview()
        setPreviewingId(null)
      }
      filesRef.current.delete(id)
      onFilesChange?.(new Map(filesRef.current))
      onChange(audioEntries.filter((e) => e.id !== id))
    },
    [audioEntries, onChange, onFilesChange, previewingId, stopPreview]
  )

  const handleDisplayNameChange = useCallback(
    (id: string, newName: string) => {
      onChange(audioEntries.map((e) => (e.id === id ? { ...e, displayName: newName } : e)))
    },
    [audioEntries, onChange]
  )

  const handleCategoryChange = useCallback(
    (id: string, newCategory: AudioCategory) => {
      onChange(audioEntries.map((e) => (e.id === id ? { ...e, category: newCategory } : e)))
    },
    [audioEntries, onChange]
  )

  const handlePreviewToggle = useCallback(
    (id: string) => {
      if (previewingId === id) {
        stopPreview()
        setPreviewingId(null)
        return
      }

      // Stop any current preview (and revoke its URL) before starting a new one.
      stopPreview()

      const file = filesRef.current.get(id)
      if (!file) {
        // Restored-draft entry with no in-memory bytes — nothing to play.
        setPreviewingId(null)
        return
      }

      if (!audioElRef.current) {
        audioElRef.current = new Audio()
        audioElRef.current.addEventListener('ended', () => setPreviewingId(null))
      }
      const url = URL.createObjectURL(file)
      previewUrlRef.current = url
      audioElRef.current.src = url
      void audioElRef.current.play()
      setPreviewingId(id)
    },
    [previewingId, stopPreview]
  )

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">{t('campaign.audioStep.title')}</h2>
      <p className="text-muted text-sm mb-6">{t('campaign.audioStep.subtitle')}</p>

      <div className="max-w-2xl">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6 ${
            isDragOver ? 'border-amber-500 bg-accent-strong/10' : 'border-border hover:border-gray-600'
          }`}
        >
          <div className="text-3xl text-gray-500 mb-2">{'\u266B'}</div>
          <p className="text-gray-300 mb-1">{t('campaign.audioStep.dropPrompt')}</p>
          <p className="text-gray-500 text-sm mb-4">{t('campaign.audioStep.supportedFormats')}</p>
          <Button variant="secondary" onClick={handleBrowseClick}>
            {t('campaign.audioStep.browseFiles')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.ogg,.wav,.webm,.m4a"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>

        {/* Uploaded files list */}
        {audioEntries.length > 0 && (
          <div className="space-y-3">
            <span className="text-sm font-semibold text-gray-300">
              {t('campaign.audioStep.filesAdded', { count: audioEntries.length })}
            </span>
            {audioEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-surface/50 border border-gray-800 rounded-lg p-4 flex items-center gap-3"
              >
                {/* Preview button */}
                <button
                  onClick={() => handlePreviewToggle(entry.id)}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-surface-2 hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer text-sm"
                  title={
                    previewingId === entry.id
                      ? t('campaign.audioStep.stopPreview')
                      : t('campaign.audioStep.previewSound')
                  }
                >
                  {previewingId === entry.id ? '\u25A0' : '\u25B6'}
                </button>

                {/* Display name input */}
                <input
                  type="text"
                  value={entry.displayName}
                  onChange={(e) => handleDisplayNameChange(entry.id, e.target.value)}
                  className="flex-1 min-w-0 bg-surface-2 border border-border rounded px-3 py-1.5 text-sm text-fg focus:outline-none focus:border-amber-500 transition-colors"
                  placeholder={t('campaign.audioStep.displayName')}
                />

                {/* Category dropdown */}
                <select
                  value={entry.category}
                  onChange={(e) => handleCategoryChange(entry.id, e.target.value as AudioCategory)}
                  className="bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-fg focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {t(`campaign.audioStep.category.${cat.value}`)}
                    </option>
                  ))}
                </select>

                {/* Category badge */}
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${CATEGORY_COLORS[entry.category]}`}>
                  {entry.category}
                </span>

                {/* Delete button */}
                <button
                  onClick={() => handleRemove(entry.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer text-lg shrink-0"
                  title={t('campaign.audioStep.removeFile')}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {audioEntries.length === 0 && (
          <p className="text-gray-500 text-sm mt-2">{t('campaign.audioStep.emptyState')}</p>
        )}
      </div>
    </div>
  )
}
