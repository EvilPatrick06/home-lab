import { useState } from 'react'
import AdventureImportWizard from '../../components/campaign/AdventureImportWizard'
import type { AdventureData } from '../../components/campaign/AdventureWizard'
import AdventureWizard from '../../components/campaign/AdventureWizard'
import { Button, Card, Modal } from '../../components/ui'
import { useT } from '../../i18n'
import { type AdventureImportResult, exportAdventure } from '../../services/io/adventure-io'
import type { AdventureEntry, Campaign } from '../../types/campaign'

interface AdventureManagerProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function AdventureManager({ campaign, saveCampaign }: AdventureManagerProps): JSX.Element {
  const { t } = useT()
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
      <Card title={t('pages.adventureManager.adventures', { count: adventures.length })}>
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
              <p className="text-gray-500 text-sm mb-3">{t('pages.adventureManager.noAdventures')}</p>
            ) : (
              <div className="space-y-2 mb-3">
                {adventures.map((adv) => (
                  <div key={adv.id} className="bg-surface-2/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-200">{adv.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                          {t('pages.adventureManager.lvl', { levelTier: adv.levelTier })}
                        </span>
                        <button
                          onClick={() => openEdit(adv)}
                          className="text-xs text-accent hover:text-amber-300 cursor-pointer"
                        >
                          {t('pages.adventureManager.edit')}
                        </button>
                        <button
                          onClick={() => handleExport(adv)}
                          className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                        >
                          {t('pages.adventureManager.export')}
                        </button>
                        <button
                          onClick={() => handleDelete(adv.id)}
                          className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          {t('common.actions.delete')}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-muted line-clamp-2">{adv.premise}</div>
                    {adv.villain && (
                      <div className="text-xs text-gray-500 mt-1">
                        {t('pages.adventureManager.antagonist', { villain: adv.villain })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowWizard(true)}
                className="text-xs text-accent hover:text-amber-300 cursor-pointer"
              >
                {t('pages.adventureManager.createAdventure')}
              </button>
              <button
                onClick={() => setShowImportWizard(true)}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                {t('pages.adventureManager.importAdventure')}
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
      <Modal open={editingId !== null} onClose={() => setEditingId(null)} title={t('pages.adventureManager.editTitle')}>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.titleLabel')}</label>
            <input
              type="text"
              name="adventure-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.levelTier')}</label>
            <select
              name="level-tier"
              value={form.levelTier}
              onChange={(e) => setForm((f) => ({ ...f, levelTier: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
            >
              <option value="1-4">{t('pages.adventureManager.tier1to4')}</option>
              <option value="5-10">{t('pages.adventureManager.tier5to10')}</option>
              <option value="11-16">{t('pages.adventureManager.tier11to16')}</option>
              <option value="17-20">{t('pages.adventureManager.tier17to20')}</option>
            </select>
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.premise')}</label>
            <textarea
              name="premise"
              value={form.premise}
              onChange={(e) => setForm((f) => ({ ...f, premise: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.adventureHook')}</label>
            <textarea
              name="adventure-hook"
              value={form.hook}
              onChange={(e) => setForm((f) => ({ ...f, hook: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.villainAntagonist')}</label>
              <input
                type="text"
                name="villain"
                value={form.villain}
                onChange={(e) => setForm((f) => ({ ...f, villain: e.target.value }))}
                className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.setting')}</label>
              <input
                type="text"
                name="setting"
                value={form.setting}
                onChange={(e) => setForm((f) => ({ ...f, setting: e.target.value }))}
                className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.playerStakes')}</label>
            <textarea
              name="player-stakes"
              value={form.playerStakes}
              onChange={(e) => setForm((f) => ({ ...f, playerStakes: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.encounters')}</label>
            <textarea
              name="encounters"
              value={form.encounters}
              onChange={(e) => setForm((f) => ({ ...f, encounters: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.climax')}</label>
            <textarea
              name="climax"
              value={form.climax}
              onChange={(e) => setForm((f) => ({ ...f, climax: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.adventureManager.resolution')}</label>
            <textarea
              name="resolution"
              value={form.resolution}
              onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500 h-16 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setEditingId(null)}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!form.title.trim()}>
            {t('common.actions.save')}
          </Button>
        </div>
      </Modal>
    </>
  )
}
