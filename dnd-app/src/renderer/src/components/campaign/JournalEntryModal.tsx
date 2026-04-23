import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '../ui'

interface JournalEntryModalProps {
  open: boolean
  onClose: () => void
  onSave: (entry: { title: string; content: string; isPrivate: boolean }) => void
  initialData?: { title: string; content: string; isPrivate: boolean } | null
}

export default function JournalEntryModal({ open, onClose, onSave, initialData }: JournalEntryModalProps): JSX.Element {
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [content, setContent] = useState(initialData?.content ?? '')
  const [isPrivate, setIsPrivate] = useState(initialData?.isPrivate ?? false)

  useEffect(() => {
    if (open) {
      setTitle(initialData?.title ?? '')
      setContent(initialData?.content ?? '')
      setIsPrivate(initialData?.isPrivate ?? false)
    }
  }, [open, initialData])

  const handleSave = () => {
    if (!title.trim() || !content.trim()) return
    onSave({ title: title.trim(), content: content.trim(), isPrivate })
  }

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Edit Journal Entry' : 'New Journal Entry'}>
      <div className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Session 1: The Beginning"
        />
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Content</label>
          <textarea
            className="w-full h-48 bg-gray-900 border border-gray-700 rounded-md p-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors resize-y shadow-inner drop-shadow-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What happened in this session?"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="w-4 h-4 accent-amber-500 rounded border-gray-700 bg-gray-900"
          />
          <span className="text-sm text-gray-300">DM Only (Private)</span>
        </label>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || !content.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}
