import { useState } from 'react'
import { AudioStep } from '../../components/campaign'
import type { CustomAudioEntry } from '../../components/campaign/AudioStep'
import { Button, Card, Modal } from '../../components/ui'
import type { Campaign } from '../../types/campaign'

interface AudioManagerProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function AudioManager({ campaign, saveCampaign }: AudioManagerProps): JSX.Element {
  const [showAudioAdd, setShowAudioAdd] = useState(false)
  const [newAudioEntries, setNewAudioEntries] = useState<CustomAudioEntry[]>([])
  const [editingAudioId, setEditingAudioId] = useState<string | null>(null)
  const [audioEntryForm, setAudioEntryForm] = useState({
    displayName: '',
    category: 'effect' as 'ambient' | 'effect' | 'music'
  })

  const openEditAudioEntry = (audio: {
    id: string
    displayName: string
    category: 'ambient' | 'effect' | 'music'
  }): void => {
    setEditingAudioId(audio.id)
    setAudioEntryForm({ displayName: audio.displayName, category: audio.category })
  }

  const handleSaveAudioEntry = async (): Promise<void> => {
    if (!editingAudioId) return
    const customAudio = (campaign.customAudio ?? []).map((a) =>
      a.id === editingAudioId
        ? { ...a, displayName: audioEntryForm.displayName.trim() || a.displayName, category: audioEntryForm.category }
        : a
    )
    await saveCampaign({ ...campaign, customAudio, updatedAt: new Date().toISOString() })
    setEditingAudioId(null)
  }

  const handleDeleteAudioEntry = async (audioId: string): Promise<void> => {
    await saveCampaign({
      ...campaign,
      customAudio: (campaign.customAudio ?? []).filter((a) => a.id !== audioId),
      updatedAt: new Date().toISOString()
    })
  }

  const handleAddAudio = async (): Promise<void> => {
    if (newAudioEntries.length === 0) return
    await saveCampaign({
      ...campaign,
      customAudio: [...(campaign.customAudio ?? []), ...newAudioEntries],
      updatedAt: new Date().toISOString()
    })
    setShowAudioAdd(false)
    setNewAudioEntries([])
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Custom Audio ({(campaign.customAudio ?? []).length})</h3>
        </div>
        {(campaign.customAudio ?? []).length === 0 ? (
          <p className="text-gray-500 text-sm">No custom audio files added.</p>
        ) : (
          <div className="space-y-2">
            {(campaign.customAudio ?? []).map((audio) => (
              <div key={audio.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                <div>
                  <span className="font-semibold text-sm">{audio.displayName}</span>
                  <span className="text-gray-500 text-xs ml-2">{audio.fileName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      audio.category === 'music'
                        ? 'bg-purple-900/40 text-purple-300'
                        : audio.category === 'ambient'
                          ? 'bg-blue-900/40 text-blue-300'
                          : 'bg-amber-900/40 text-amber-300'
                    }`}
                  >
                    {audio.category}
                  </span>
                  <button
                    onClick={() => openEditAudioEntry(audio)}
                    className="text-xs text-gray-400 hover:text-amber-400 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteAudioEntry(audio.id)}
                    className="text-xs text-gray-400 hover:text-red-400 cursor-pointer"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => {
            setNewAudioEntries([])
            setShowAudioAdd(true)
          }}
          className="mt-3 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
        >
          + Add Audio
        </button>
      </Card>

      {/* Add Audio Modal */}
      <Modal open={showAudioAdd} onClose={() => setShowAudioAdd(false)} title="Add Custom Audio">
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <AudioStep audioEntries={newAudioEntries} onChange={setNewAudioEntries} />
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowAudioAdd(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddAudio} disabled={newAudioEntries.length === 0}>
            Add
          </Button>
        </div>
      </Modal>

      {/* Audio Entry Edit Modal */}
      <Modal open={editingAudioId !== null} onClose={() => setEditingAudioId(null)} title="Edit Audio Entry">
        <div className="space-y-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Display Name</label>
            <input
              type="text"
              value={audioEntryForm.displayName}
              onChange={(e) => setAudioEntryForm((f) => ({ ...f, displayName: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Category</label>
            <select
              value={audioEntryForm.category}
              onChange={(e) =>
                setAudioEntryForm((f) => ({ ...f, category: e.target.value as 'ambient' | 'effect' | 'music' }))
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="music">Music</option>
              <option value="ambient">Ambient</option>
              <option value="effect">Effect</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setEditingAudioId(null)}>
            Cancel
          </Button>
          <Button onClick={handleSaveAudioEntry}>Save</Button>
        </div>
      </Modal>
    </>
  )
}
