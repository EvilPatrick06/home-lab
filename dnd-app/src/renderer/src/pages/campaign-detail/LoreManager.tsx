import { useState } from 'react'
import { Button, Card, Modal } from '../../components/ui'
import { addToast } from '../../hooks/use-toast'
import { exportEntities, importEntities, reIdItems } from '../../services/io/entity-io'
import type { Campaign, LoreEntry } from '../../types/campaign'

const LORE_CATEGORY_COLORS: Record<string, string> = {
  world: 'bg-blue-900/40 text-blue-300',
  faction: 'bg-purple-900/40 text-purple-300',
  location: 'bg-green-900/40 text-green-300',
  item: 'bg-amber-900/40 text-amber-300',
  other: 'bg-gray-800 text-gray-300'
}

interface LoreManagerProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function LoreManager({ campaign, saveCampaign }: LoreManagerProps): JSX.Element {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<LoreEntry | null>(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'world' as LoreEntry['category'],
    isVisibleToPlayers: false
  })

  const lore = campaign.lore ?? []

  const openAdd = (): void => {
    setEditing(null)
    setForm({ title: '', content: '', category: 'world', isVisibleToPlayers: false })
    setShowModal(true)
  }
  const openEdit = (entry: LoreEntry): void => {
    setEditing(entry)
    setForm({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      isVisibleToPlayers: entry.isVisibleToPlayers
    })
    setShowModal(true)
  }
  const handleSave = async (): Promise<void> => {
    if (!form.title.trim()) return
    let newLore: LoreEntry[]
    if (editing) {
      newLore = lore.map((l) => (l.id === editing.id ? { ...l, ...form, title: form.title.trim() } : l))
    } else {
      newLore = [
        ...lore,
        { id: crypto.randomUUID(), ...form, title: form.title.trim(), createdAt: new Date().toISOString() }
      ]
    }
    await saveCampaign({ ...campaign, lore: newLore, updatedAt: new Date().toISOString() })
    setShowModal(false)
  }
  const handleDelete = async (loreId: string): Promise<void> => {
    await saveCampaign({
      ...campaign,
      lore: lore.filter((l) => l.id !== loreId),
      updatedAt: new Date().toISOString()
    })
  }
  const handleToggleVisibility = async (loreId: string): Promise<void> => {
    const updated = lore.map((l) => (l.id === loreId ? { ...l, isVisibleToPlayers: !l.isVisibleToPlayers } : l))
    await saveCampaign({ ...campaign, lore: updated, updatedAt: new Date().toISOString() })
  }

  const handleExport = async (): Promise<void> => {
    if (!lore.length) return
    try {
      const ok = await exportEntities('lore', lore)
      if (ok) addToast(`Exported ${lore.length} lore entry(ies)`, 'success')
    } catch {
      addToast('Lore export failed', 'error')
    }
  }
  const handleImport = async (): Promise<void> => {
    try {
      const result = await importEntities<LoreEntry>('lore')
      if (!result) return
      const items = reIdItems(result.items)
      const newLore = [...lore, ...items]
      await saveCampaign({ ...campaign, lore: newLore, updatedAt: new Date().toISOString() })
      addToast(`Imported ${items.length} lore entry(ies)`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Lore import failed', 'error')
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Lore ({lore.length})</h3>
          <div className="flex items-center gap-2">
            <button onClick={handleImport} className="text-[10px] text-gray-400 hover:text-amber-400 cursor-pointer">
              Import
            </button>
            {lore.length > 0 && (
              <button onClick={handleExport} className="text-[10px] text-gray-400 hover:text-amber-400 cursor-pointer">
                Export All
              </button>
            )}
          </div>
        </div>
        {lore.length === 0 ? (
          <p className="text-gray-500 text-sm">No lore entries yet. Add world details, factions, and locations.</p>
        ) : (
          <div className="space-y-2">
            {lore.map((entry) => (
              <div key={entry.id} className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{entry.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${LORE_CATEGORY_COLORS[entry.category]}`}>
                      {entry.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleVisibility(entry.id)}
                      className={`text-xs cursor-pointer ${entry.isVisibleToPlayers ? 'text-green-400 hover:text-green-300' : 'text-gray-500 hover:text-gray-400'}`}
                      title={entry.isVisibleToPlayers ? 'Visible to players' : 'DM only'}
                    >
                      {entry.isVisibleToPlayers ? '\u{1F441}' : '\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}'}
                    </button>
                    <button
                      onClick={() => openEdit(entry)}
                      className="text-xs text-gray-400 hover:text-amber-400 cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-xs text-gray-400 hover:text-red-400 cursor-pointer"
                    >
                      Del
                    </button>
                  </div>
                </div>
                <p className="text-gray-400 text-xs line-clamp-2">{entry.content}</p>
              </div>
            ))}
          </div>
        )}
        <button onClick={openAdd} className="mt-3 text-xs text-amber-400 hover:text-amber-300 cursor-pointer">
          + Add Lore
        </button>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Lore' : 'Add Lore'}>
        <div className="space-y-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              placeholder="Lore title"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as LoreEntry['category'] }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="world">World</option>
              <option value="faction">Faction</option>
              <option value="location">Location</option>
              <option value="item">Item</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Content</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-32 resize-none"
              placeholder="Lore content"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.isVisibleToPlayers}
              onChange={(e) => setForm((f) => ({ ...f, isVisibleToPlayers: e.target.checked }))}
              className="rounded"
            />
            Visible to players
          </label>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!form.title.trim()}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </div>
      </Modal>
    </>
  )
}
