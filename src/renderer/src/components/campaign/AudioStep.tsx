import { useCallback, useRef, useState } from 'react'
import { logger } from '../../utils/logger'
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

export default function AudioStep({ audioEntries, onChange }: AudioStepProps): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFilesAdded = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      const audioFiles = fileArray.filter((f) => /\.(mp3|ogg|wav|webm|m4a)$/i.test(f.name))

      for (const file of audioFiles) {
        const entry: CustomAudioEntry = {
          id: crypto.randomUUID(),
          fileName: file.name,
          displayName: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          category: 'effect'
        }
        // We store the entry for the wizard; actual upload happens on campaign create
        onChange([...audioEntries, entry])
      }
    },
    [audioEntries, onChange]
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
        audioElRef.current?.pause()
        setPreviewingId(null)
      }
      onChange(audioEntries.filter((e) => e.id !== id))
    },
    [audioEntries, onChange, previewingId]
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
    (id: string, fileName: string) => {
      if (previewingId === id) {
        audioElRef.current?.pause()
        setPreviewingId(null)
        return
      }

      // Stop any current preview
      if (audioElRef.current) {
        audioElRef.current.pause()
      }

      // For local preview before upload, we cannot play from disk.
      // This will work for files already uploaded (in DM Audio Panel).
      // In the wizard, this is a no-op placeholder.
      setPreviewingId(null)
      logger.debug('[AudioStep] Preview not available in wizard for:', fileName)
    },
    [previewingId]
  )

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Custom Audio</h2>
      <p className="text-gray-400 text-sm mb-6">
        Upload custom ambient tracks, sound effects, and music for your campaign. This step is optional and you can add
        more later from the DM Audio Panel.
      </p>

      <div className="max-w-2xl">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6 ${
            isDragOver ? 'border-amber-500 bg-amber-500/10' : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <div className="text-3xl text-gray-500 mb-2">{'\u266B'}</div>
          <p className="text-gray-300 mb-1">Drag and drop audio files here</p>
          <p className="text-gray-500 text-sm mb-4">Supported formats: MP3, OGG, WAV, WebM, M4A</p>
          <Button variant="secondary" onClick={handleBrowseClick}>
            Browse Files
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
              {audioEntries.length} file{audioEntries.length !== 1 ? 's' : ''} added
            </span>
            {audioEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 flex items-center gap-3"
              >
                {/* Preview button */}
                <button
                  onClick={() => handlePreviewToggle(entry.id, entry.fileName)}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer text-sm"
                  title={previewingId === entry.id ? 'Stop preview' : 'Preview sound'}
                >
                  {previewingId === entry.id ? '\u25A0' : '\u25B6'}
                </button>

                {/* Display name input */}
                <input
                  type="text"
                  value={entry.displayName}
                  onChange={(e) => handleDisplayNameChange(entry.id, e.target.value)}
                  className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors"
                  placeholder="Display name"
                />

                {/* Category dropdown */}
                <select
                  value={entry.category}
                  onChange={(e) => handleCategoryChange(entry.id, e.target.value as AudioCategory)}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
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
                  title="Remove file"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {audioEntries.length === 0 && (
          <p className="text-gray-500 text-sm mt-2">
            No custom audio files added. You can skip this step or add audio later from the DM toolbar during gameplay.
          </p>
        )}
      </div>
    </div>
  )
}
