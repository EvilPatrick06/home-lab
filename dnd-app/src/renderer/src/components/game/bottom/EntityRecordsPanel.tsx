import { useCallback, useEffect, useState } from 'react'
import { addToast } from '../../../hooks/use-toast'
import { useT } from '../../../i18n'
import { Button, Modal } from '../../ui'

// PHASE-25 25F — DM-facing view/edit surface for entity records (the editability half of
// the Franz pattern). In solo play the player IS the DM, so this is also the correction UI.

type EntityKind = 'npc' | 'location' | 'item' | 'faction'
type Injection = 'auto' | 'always' | 'never'

interface EntityRecord {
  id: string
  name: string
  kind: EntityKind
  summary: string
  details: string
  aliases: string[]
  keywords: string[]
  injection: Injection
  source: 'ai' | 'extraction' | 'dm'
  locked: boolean
  mentions: number
}
interface EntityConfig {
  enabled: boolean
  autoExtract: boolean
  loreMode: 'all' | 'triggered'
}
interface EntityRecordsPanelProps {
  campaignId: string
}

const KINDS: EntityKind[] = ['npc', 'location', 'faction', 'item']
const INJECTIONS: Injection[] = ['auto', 'always', 'never']

interface FormState {
  name: string
  kind: EntityKind
  summary: string
  details: string
  aliases: string
  keywords: string
  injection: Injection
}
const EMPTY_FORM: FormState = {
  name: '',
  kind: 'npc',
  summary: '',
  details: '',
  aliases: '',
  keywords: '',
  injection: 'auto'
}

const splitList = (s: string): string[] => [
  ...new Set(
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  )
]

export default function EntityRecordsPanel({ campaignId }: EntityRecordsPanelProps): JSX.Element {
  const { t } = useT()
  const [config, setConfig] = useState<EntityConfig>({ enabled: false, autoExtract: false, loreMode: 'all' })
  const [records, setRecords] = useState<EntityRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<EntityRecord | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.api.ai.getEntities?.(campaignId)
      if (r?.success) {
        if (r.config) setConfig(r.config)
        setRecords((r.records as EntityRecord[]) ?? [])
      }
    } catch {
      // best-effort; a fetch failure just leaves the last-known list
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const patchConfig = useCallback(
    async (patch: Partial<EntityConfig>) => {
      const r = await window.api.ai.setEntitiesConfig?.(campaignId, patch)
      if (r?.success && r.config) setConfig(r.config)
    },
    [campaignId]
  )

  const openAdd = (): void => {
    setForm(EMPTY_FORM)
    setEditing('new')
  }
  const openEdit = (rec: EntityRecord): void => {
    setForm({
      name: rec.name,
      kind: rec.kind,
      summary: rec.summary,
      details: rec.details,
      aliases: rec.aliases.join(', '),
      keywords: rec.keywords.join(', '),
      injection: rec.injection
    })
    setEditing(rec)
  }

  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) return
    const r = await window.api.ai.upsertEntity?.(campaignId, {
      kind: form.kind,
      name: form.name.trim(),
      summary: form.summary,
      details: form.details,
      aliases: splitList(form.aliases),
      keywords: splitList(form.keywords),
      injection: form.injection,
      source: 'dm'
    })
    if (r && !r.success) addToast(r.error ?? t('game.entityRecordsPanel.saveFailed'), 'error')
    setEditing(null)
    await refresh()
  }

  const handleDelete = async (rec: EntityRecord): Promise<void> => {
    if (!confirm(t('game.entityRecordsPanel.deleteConfirm', { name: rec.name }))) return
    await window.api.ai.deleteEntity?.(campaignId, rec.id)
    await refresh()
  }

  return (
    <div className="w-full bg-surface/60 border border-border/40 rounded-lg px-3 py-2 mt-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
          {t('game.entityRecordsPanel.heading')}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={openAdd}
            className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-muted hover:bg-gray-700 hover:text-gray-300 cursor-pointer"
          >
            {t('game.entityRecordsPanel.add')}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-muted hover:bg-gray-700 hover:text-gray-300 cursor-pointer disabled:opacity-50"
          >
            {loading ? t('common.states.loading') : t('game.entityRecordsPanel.refresh')}
          </button>
        </div>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap items-center gap-3 mb-2 text-xs text-gray-300">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            name="entities-enabled"
            checked={config.enabled}
            onChange={(e) => patchConfig({ enabled: e.target.checked })}
          />
          {t('game.entityRecordsPanel.enabled')}
        </label>
        <label className={`flex items-center gap-1.5 ${config.enabled ? 'cursor-pointer' : 'opacity-40'}`}>
          <input
            type="checkbox"
            name="entities-auto-extract"
            checked={config.autoExtract}
            disabled={!config.enabled}
            onChange={(e) => patchConfig({ autoExtract: e.target.checked })}
          />
          {t('game.entityRecordsPanel.autoExtract')}
        </label>
        <label className="flex items-center gap-1.5">
          {t('game.entityRecordsPanel.loreMode')}
          <select
            value={config.loreMode}
            name="lore-mode"
            onChange={(e) => patchConfig({ loreMode: e.target.value as 'all' | 'triggered' })}
            className="bg-surface-2 border border-border rounded px-1 py-0.5 text-xs"
          >
            <option value="all">{t('game.entityRecordsPanel.loreModeAll')}</option>
            <option value="triggered">{t('game.entityRecordsPanel.loreModeTriggered')}</option>
          </select>
        </label>
      </div>

      {records.length === 0 ? (
        <div className="text-xs text-gray-600 py-1">{t('game.entityRecordsPanel.empty')}</div>
      ) : (
        <div className="space-y-2">
          {KINDS.filter((k) => records.some((r) => r.kind === k)).map((kind) => {
            const group = records.filter((r) => r.kind === kind)
            return (
              <div key={kind}>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
                  {t(`game.entityRecordsPanel.kind.${kind}`)} ({group.length})
                </div>
                <div className="space-y-0.5">
                  {group.map((rec) => (
                    <div key={rec.id} className="flex items-center justify-between py-0.5">
                      <div className="min-w-0 me-2">
                        <span className="text-xs text-fg">
                          {rec.locked && <span title={t('game.entityRecordsPanel.locked')}>🔒 </span>}
                          {rec.name}
                        </span>
                        <span className="text-[10px] text-gray-500 ms-1">[{rec.injection}]</span>
                        {rec.summary && <p className="text-[11px] text-muted truncate">{rec.summary}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openEdit(rec)}
                          className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-muted hover:bg-gray-700 hover:text-gray-300 cursor-pointer"
                        >
                          {t('game.entityRecordsPanel.edit')}
                        </button>
                        <button
                          onClick={() => handleDelete(rec)}
                          className="px-1.5 py-0.5 text-xs rounded bg-red-900/40 text-red-400 hover:bg-red-800/40 cursor-pointer"
                        >
                          {t('common.actions.delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('game.entityRecordsPanel.addTitle') : t('game.entityRecordsPanel.editTitle')}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-muted text-xs mb-1">{t('game.entityRecordsPanel.nameLabel')}</label>
            <input
              type="text"
              name="entity-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-muted text-xs mb-1">{t('game.entityRecordsPanel.kindLabel')}</label>
              <select
                value={form.kind}
                name="entity-kind"
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as EntityKind }))}
                className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`game.entityRecordsPanel.kind.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-muted text-xs mb-1">{t('game.entityRecordsPanel.injectionLabel')}</label>
              <select
                value={form.injection}
                name="entity-injection"
                onChange={(e) => setForm((f) => ({ ...f, injection: e.target.value as Injection }))}
                className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg"
              >
                {INJECTIONS.map((i) => (
                  <option key={i} value={i}>
                    {t(`game.entityRecordsPanel.injection.${i}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('game.entityRecordsPanel.summaryLabel')}</label>
            <textarea
              value={form.summary}
              name="entity-summary"
              maxLength={400}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg h-20 resize-none"
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('game.entityRecordsPanel.detailsLabel')}</label>
            <textarea
              value={form.details}
              name="entity-details"
              maxLength={1200}
              onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg h-24 resize-none"
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('game.entityRecordsPanel.aliasesLabel')}</label>
            <input
              type="text"
              name="entity-aliases"
              value={form.aliases}
              onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg"
              placeholder={t('game.entityRecordsPanel.commaHint')}
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('game.entityRecordsPanel.keywordsLabel')}</label>
            <input
              type="text"
              name="entity-keywords"
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg"
              placeholder={t('game.entityRecordsPanel.commaHint')}
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setEditing(null)}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!form.name.trim()}>
            {t('common.actions.save')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
