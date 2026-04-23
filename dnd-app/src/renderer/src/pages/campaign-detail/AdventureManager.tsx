import { useState } from 'react'
import AdventureImportWizard from '../../components/campaign/AdventureImportWizard'
import type { AdventureData } from '../../components/campaign/AdventureWizard'
import AdventureWizard from '../../components/campaign/AdventureWizard'
import { Button, Card, Modal } from '../../components/ui'
import { type AdventureImportResult, exportAdventure } from '../../services/io/adventure-io'
import type { AdventureEntry, Campaign } from '../../types/campaign'

interface AdventureManagerProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function AdventureManager({ campaign, saveCampaign }: AdventureManagerProps): JSX.Element {
  const [showWizard, setShowWizard] = useState(false)
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    levelTier: '1-4',
    premise: '',
    hook: '',
    villain: '',
    setting: '',
    playerStakes: '',
    encounters: '',
    climax: '',
    resolution: ''
  })

  const adventures = campaign.adventures ?? []

  const openEdit = (adv: AdventureEntry): void => {
    setEditingId(adv.id)
    setForm({
      title: adv.title,
      levelTier: adv.levelTier,
      premise: adv.premise,
      hook: adv.hook,
      villain: adv.villain,
      setting: adv.setting,
      playerStakes: adv.playerStakes,
      encounters: adv.encounters,
      climax: adv.climax,
      resolution: adv.resolution
    })
  }

  const handleSave = async (): Promise<void> => {
    if (!editingId) return
    const updated = adventures.map((a) =>
      a.id === editingId ? { ...a, ...form, title: form.title.trim() || a.title } : a
    )
    await saveCampaign({ ...campaign, adventures: updated, updatedAt: new Date().toISOString() })
    setEditingId(null)
  }

  const handleDelete = async (advId: string): Promise<void> => {
    await saveCampaign({
      ...campaign,
      adventures: adventures.filter((a) => a.id !== advId),
      updatedAt: new Date().toISOString()
    })
  }

  const handleExport = async (adv: AdventureEntry): Promise<void> => {
    const relatedEncounters = campaign.encounters ?? []
    const relatedNpcs = campaign.npcs ?? []
    await exportAdventure(adv, relatedEncounters, relatedNpcs)
  }

  const handleImport = async (result: AdventureImportResult): Promise<void> => {
    const existingEncounters = campaign.encounters ?? []
    const existingNpcs = campaign.npcs ?? []
    await saveCampaign({
      ...campaign,
      adventures: [...adventures, result.adventure],
      encounters: [...existingEncounters, ...result.encounters],
      npcs: [...existingNpcs, ...result.npcs],
      updatedAt: new Date().toISOString()
    })
  }

  return (
    <>
      <Card title={`Adventures (${adventures.length})`}>
        {showWizard ? (
          <AdventureWizard
            onSave={(adventureData: AdventureData) => {
              const entry = {
                id: crypto.randomUUID(),
                ...adventureData,
                createdAt: new Date().toISOString()
              }
              saveCampaign({
                ...campaign,
                adventures: [...adventures, entry],
                updatedAt: new Date().toISOString()
              })
              setShowWizard(false)
            }}
            onCancel={() => setShowWizard(false)}
          />
        ) : (
          <>
            {adventures.length === 0 ? (
              <p className="text-gray-500 text-sm mb-3">
                No adventures planned yet. Use the DMG 4-step process to create one.
              </p>
            ) : (
              <div className="space-y-2 mb-3">
                {adventures.map((adv) => (
                  <div key={adv.id} className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-200">{adv.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                          Lvl {adv.levelTier}
                        </span>
                        <button
                          onClick={() => openEdit(adv)}
                          className="text-[10px] text-amber-400 hover:text-amber-300 cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleExport(adv)}
                          className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer"
                        >
                          Export
                        </button>
                        <button
                          onClick={() => handleDelete(adv.id)}
                          className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 line-clamp-2">{adv.premise}</div>
                    {adv.villain && <div className="text-[10px] text-gray-500 mt-1">Antagonist: {adv.villain}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowWizard(true)}
                className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                + Create Adventure
              </button>
              <button
                onClick={() => setShowImportWizard(true)}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                Import Adventure
              </button>
            </div>
          </>
        )}
      </Card>

      {/* Adventure Import Wizard */}
      <AdventureImportWizard
        open={showImportWizard}
        onClose={() => setShowImportWizard(false)}
        onImport={handleImport}
      />

      {/* Adventure Edit Modal */}
      <Modal open={editingId !== null} onClose={() => setEditingId(null)} title="Edit Adventure">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Level Tier</label>
            <select
              value={form.levelTier}
              onChange={(e) => setForm((f) => ({ ...f, levelTier: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="1-4">1-4 (Local Heroes)</option>
              <option value="5-10">5-10 (Heroes of the Realm)</option>
              <option value="11-16">11-16 (Masters of the Realm)</option>
              <option value="17-20">17-20 (Masters of the World)</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Premise</label>
            <textarea
              value={form.premise}
              onChange={(e) => setForm((f) => ({ ...f, premise: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Adventure Hook</label>
            <textarea
              value={form.hook}
              onChange={(e) => setForm((f) => ({ ...f, hook: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-xs mb-1">Villain / Antagonist</label>
              <input
                type="text"
                value={form.villain}
                onChange={(e) => setForm((f) => ({ ...f, villain: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Setting</label>
              <input
                type="text"
                value={form.setting}
                onChange={(e) => setForm((f) => ({ ...f, setting: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Player Stakes</label>
            <textarea
              value={form.playerStakes}
              onChange={(e) => setForm((f) => ({ ...f, playerStakes: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Encounters</label>
            <textarea
              value={form.encounters}
              onChange={(e) => setForm((f) => ({ ...f, encounters: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Climax</label>
            <textarea
              value={form.climax}
              onChange={(e) => setForm((f) => ({ ...f, climax: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Resolution</label>
            <textarea
              value={form.resolution}
              onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setEditingId(null)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!form.title.trim()}>
            Save
          </Button>
        </div>
      </Modal>
    </>
  )
}
