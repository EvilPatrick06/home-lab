import { useState } from 'react'
import { Button, Card, Modal } from '../../components/ui'
import { useT } from '../../i18n'
import type { Campaign, CustomRule } from '../../types/campaign'

const CATEGORY_COLORS: Record<string, string> = {
  combat: 'bg-red-900/40 text-red-300',
  exploration: 'bg-green-900/40 text-green-300',
  social: 'bg-blue-900/40 text-blue-300',
  rest: 'bg-purple-900/40 text-purple-300',
  other: 'bg-gray-800 text-gray-300'
}

interface RuleManagerProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function RuleManager({ campaign, saveCampaign }: RuleManagerProps): JSX.Element {
  const { t } = useT()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CustomRule | null>(null)
  const [form, setForm] = useState({ name: '', description: '', category: 'other' as CustomRule['category'] })

  const openAdd = (): void => {
    setEditing(null)
    setForm({ name: '', description: '', category: 'other' })
    setShowModal(true)
  }
  const openEdit = (rule: CustomRule): void => {
    setEditing(rule)
    setForm({ name: rule.name, description: rule.description, category: rule.category })
    setShowModal(true)
  }
  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) return
    let customRules: CustomRule[]
    if (editing) {
      customRules = campaign.customRules.map((r) =>
        r.id === editing.id ? { ...r, ...form, name: form.name.trim() } : r
      )
    } else {
      customRules = [...campaign.customRules, { id: crypto.randomUUID(), ...form, name: form.name.trim() }]
    }
    await saveCampaign({ ...campaign, customRules, updatedAt: new Date().toISOString() })
    setShowModal(false)
  }
  const handleDelete = async (ruleId: string): Promise<void> => {
    await saveCampaign({
      ...campaign,
      customRules: campaign.customRules.filter((r) => r.id !== ruleId),
      updatedAt: new Date().toISOString()
    })
  }

  return (
    <>
      <Card title={t('pages.ruleManager.cardTitle', { count: campaign.customRules.length })}>
        {campaign.customRules.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('pages.ruleManager.noRules')}</p>
        ) : (
          <div className="space-y-2">
            {campaign.customRules.map((rule) => (
              <div key={rule.id} className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{rule.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[rule.category]}`}>
                      {rule.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(rule)}
                      className="text-xs text-gray-400 hover:text-amber-400 cursor-pointer"
                    >
                      {t('pages.ruleManager.edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="text-xs text-gray-400 hover:text-red-400 cursor-pointer"
                    >
                      {t('common.actions.delete')}
                    </button>
                  </div>
                </div>
                {rule.description && <p className="text-gray-400 text-xs">{rule.description}</p>}
              </div>
            ))}
          </div>
        )}
        <button onClick={openAdd} className="mt-3 text-xs text-amber-400 hover:text-amber-300 cursor-pointer">
          {t('pages.ruleManager.addRule')}
        </button>
      </Card>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? t('pages.ruleManager.editRuleTitle') : t('pages.ruleManager.addRuleTitle')}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">{t('pages.ruleManager.ruleNameLabel')}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              placeholder={t('pages.ruleManager.ruleNamePlaceholder')}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">{t('pages.ruleManager.categoryLabel')}</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as CustomRule['category'] }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="combat">{t('pages.ruleManager.categoryCombat')}</option>
              <option value="exploration">{t('pages.ruleManager.categoryExploration')}</option>
              <option value="social">{t('pages.ruleManager.categorySocial')}</option>
              <option value="rest">{t('pages.ruleManager.categoryRest')}</option>
              <option value="other">{t('pages.ruleManager.categoryOther')}</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">{t('pages.ruleManager.descriptionLabel')}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-20 resize-none"
              placeholder={t('pages.ruleManager.descriptionPlaceholder')}
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!form.name.trim()}>
            {editing ? t('common.actions.save') : t('pages.ruleManager.add')}
          </Button>
        </div>
      </Modal>
    </>
  )
}
