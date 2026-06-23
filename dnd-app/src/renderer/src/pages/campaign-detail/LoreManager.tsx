import { Button, Card, Modal } from '../../components/ui'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { exportEntities, importEntities, reIdItems } from '../../services/io/entity-io'
import type { Campaign, LoreEntry } from '../../types/campaign'
import { useCrudModal } from './use-crud-modal'

const LORE_CATEGORY_COLORS: Record<string, string> = {
  world: 'bg-blue-900/40 text-blue-300',
  faction: 'bg-purple-900/40 text-purple-300',
  location: 'bg-green-900/40 text-green-300',
  item: 'bg-amber-900/40 text-amber-300',
  other: 'bg-surface-2 text-gray-300'
}

interface LoreManagerProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function LoreManager({ campaign, saveCampaign }: LoreManagerProps): JSX.Element {
  const { t } = useT()
  const lore = campaign.lore ?? []
  const { showModal, editing, form, setForm, openAdd, openEdit, close, persist } = useCrudModal<
    LoreEntry,
    { title: string; content: string; category: LoreEntry['category']; isVisibleToPlayers: boolean; keywords: string }
  >({
    campaign,
    saveCampaign,
    emptyForm: { title: '', content: '', category: 'world', isVisibleToPlayers: false, keywords: '' },
    toForm: (entry) => ({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      isVisibleToPlayers: entry.isVisibleToPlayers,
      keywords: (entry.keywords ?? []).join(', ')
    })
  })

  // Comma-separated → trimmed, de-duped, capped at 8 (PHASE-25 keyword-injection contract).
  const parseKeywords = (s: string): string[] =>
    [
      ...new Set(
        s
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      )
    ].slice(0, 8)

  const handleSave = async (): Promise<void> => {
    if (!form.title.trim()) return
    const kw = parseKeywords(form.keywords)
    const applyFields = (base: Partial<LoreEntry>): LoreEntry => {
      const next: LoreEntry = {
        ...base,
        id: base.id ?? crypto.randomUUID(),
        createdAt: base.createdAt ?? new Date().toISOString(),
        title: form.title.trim(),
        content: form.content,
        category: form.category,
        isVisibleToPlayers: form.isVisibleToPlayers
      }
      // Persist keywords only when non-empty so untouched entries stay shape-stable.
      if (kw.length) next.keywords = kw
      else delete next.keywords
      return next
    }
    const newLore = editing ? lore.map((l) => (l.id === editing.id ? applyFields(l) : l)) : [...lore, applyFields({})]
    await persist({ lore: newLore })
    close()
  }
  const handleDelete = async (loreId: string): Promise<void> => {
    await persist({ lore: lore.filter((l) => l.id !== loreId) })
  }
  const handleToggleVisibility = async (loreId: string): Promise<void> => {
    const updated = lore.map((l) => (l.id === loreId ? { ...l, isVisibleToPlayers: !l.isVisibleToPlayers } : l))
    await persist({ lore: updated })
  }

  const handleExport = async (): Promise<void> => {
    if (!lore.length) return
    try {
      const ok = await exportEntities('lore', lore)
      if (ok) addToast(t('pages.loreManager.exportedLore', { count: lore.length }), 'success')
    } catch {
      addToast(t('pages.loreManager.exportFailed'), 'error')
    }
  }
  const handleImport = async (): Promise<void> => {
    try {
      const result = await importEntities<LoreEntry>('lore')
      if (!result) return
      const items = reIdItems(result.items)
      const newLore = [...lore, ...items]
      await saveCampaign({ ...campaign, lore: newLore, updatedAt: new Date().toISOString() })
      addToast(t('pages.loreManager.importedLore', { count: items.length }), 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('pages.loreManager.importFailed'), 'error')
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{t('pages.loreManager.lore', { count: lore.length })}</h3>
          <div className="flex items-center gap-2">
            <button onClick={handleImport} className="text-xs text-muted hover:text-accent cursor-pointer">
              {t('pages.loreManager.import')}
            </button>
            {lore.length > 0 && (
              <button onClick={handleExport} className="text-xs text-muted hover:text-accent cursor-pointer">
                {t('pages.loreManager.exportAll')}
              </button>
            )}
          </div>
        </div>
        {lore.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('pages.loreManager.noLore')}</p>
        ) : (
          <div className="space-y-2">
            {lore.map((entry) => (
              <div key={entry.id} className="bg-surface-2/50 rounded-lg p-3">
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
                      className={`text-xs cursor-pointer ${entry.isVisibleToPlayers ? 'text-green-400 hover:text-green-300' : 'text-gray-500 hover:text-muted'}`}
                      title={
                        entry.isVisibleToPlayers
                          ? t('pages.loreManager.visibleToPlayers')
                          : t('pages.loreManager.dmOnly')
                      }
                    >
                      {entry.isVisibleToPlayers ? '\u{1F441}' : '\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}'}
                    </button>
                    <button
                      onClick={() => openEdit(entry)}
                      className="text-xs text-muted hover:text-accent cursor-pointer"
                    >
                      {t('pages.loreManager.edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-xs text-muted hover:text-red-400 cursor-pointer"
                    >
                      {t('common.actions.delete')}
                    </button>
                  </div>
                </div>
                <p className="text-muted text-xs line-clamp-2">{entry.content}</p>
                {!!entry.keywords?.length && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {entry.keywords.map((kw) => (
                      <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <button onClick={openAdd} className="mt-3 text-xs text-accent hover:text-amber-300 cursor-pointer">
          {t('pages.loreManager.addLore')}
        </button>
      </Card>

      <Modal
        open={showModal}
        onClose={() => close()}
        title={editing ? t('pages.loreManager.editLore') : t('pages.loreManager.addLoreTitle')}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.loreManager.titleLabel')}</label>
            <input
              type="text"
              name="lore-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('pages.loreManager.titlePlaceholder')}
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.loreManager.category')}</label>
            <select
              name="lore-category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as LoreEntry['category'] }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
            >
              <option value="world">{t('pages.loreManager.world')}</option>
              <option value="faction">{t('pages.loreManager.faction')}</option>
              <option value="location">{t('pages.loreManager.location')}</option>
              <option value="item">{t('pages.loreManager.item')}</option>
              <option value="other">{t('pages.loreManager.other')}</option>
            </select>
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.loreManager.content')}</label>
            <textarea
              name="lore-content"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500 h-32 resize-none"
              placeholder={t('pages.loreManager.contentPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.loreManager.keywordsLabel')}</label>
            <input
              type="text"
              name="lore-keywords"
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('pages.loreManager.keywordsPlaceholder')}
            />
            <p className="text-[11px] text-gray-500 mt-1">{t('pages.loreManager.keywordsHelp')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              name="lore-visible-to-players"
              checked={form.isVisibleToPlayers}
              onChange={(e) => setForm((f) => ({ ...f, isVisibleToPlayers: e.target.checked }))}
              className="rounded"
            />
            {t('pages.loreManager.visibleToPlayersLabel')}
          </label>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => close()}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!form.title.trim()}>
            {editing ? t('common.actions.save') : t('pages.loreManager.add')}
          </Button>
        </div>
      </Modal>
    </>
  )
}
