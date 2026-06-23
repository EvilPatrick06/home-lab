import { useCallback, useState } from 'react'
import { addToast } from '../../../hooks/use-toast'
import { useT } from '../../../i18n'
import { useCampaignStore } from '../../../stores/use-campaign-store'
import type { Campaign } from '../../../types/campaign'

// PHASE-29 29D — DM-only mid-session model swap. Lets the DM change the active model (for the
// currently-active provider) without leaving the game. Provider switching stays in the
// campaign-detail flow (keys/URL/GPU-pin validation lives there). The next message picks the new
// model automatically — startChat re-reads currentConfig.model per request.

export default function AiModelSwapPopover({
  campaign,
  disabled
}: {
  campaign: Campaign
  disabled: boolean
}): JSX.Element {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState('')
  const [selected, setSelected] = useState('')
  const [models, setModels] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cfg = await window.api.ai.getConfig()
      const provider = cfg.provider ?? 'ollama'
      setCurrent(cfg.model ?? '')
      setSelected(cfg.model ?? '')
      const list =
        provider === 'ollama'
          ? await window.api.ai.listInstalledModels()
          : (await window.api.ai.listCloudModels(provider)).map((m) => m.id)
      setModels(list)
    } catch {
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [])

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next) void load()
  }

  const apply = async (): Promise<void> => {
    if (!selected || selected === current) {
      setOpen(false)
      return
    }
    // Merge so keys / url / routing / flavor are preserved — only the model changes.
    const cfg = await window.api.ai.getConfig()
    const res = await window.api.ai.configure({ ...cfg, model: selected })
    if (res && !res.success) {
      addToast(res.error ?? t('game.chatPanel.modelSwap.failed'), 'error')
      return
    }
    await useCampaignStore.getState().saveCampaign({
      ...campaign,
      aiDm: { ...campaign.aiDm, enabled: true, model: selected },
      updatedAt: new Date().toISOString()
    })
    addToast(t('game.chatPanel.modelSwap.switched', { model: selected }), 'success')
    setCurrent(selected)
    setOpen(false)
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="text-[10px] text-accent hover:text-amber-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t('game.chatPanel.modelSwap.change')}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 z-50 w-56 bg-surface border border-border rounded-lg shadow-lg p-2">
          <div className="text-[11px] text-gray-400 mb-1">
            {t('game.chatPanel.modelSwap.current', { model: current || '—' })}
          </div>
          <select
            value={selected}
            name="ai-model"
            onChange={(e) => setSelected(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs mb-2 focus:outline-none focus:border-amber-500"
          >
            {models.length === 0 ? (
              <option value="">{loading ? t('common.states.loading') : t('game.chatPanel.modelSwap.noModels')}</option>
            ) : (
              models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-0.5 text-xs rounded bg-surface-2 text-muted hover:bg-gray-700 cursor-pointer"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              type="button"
              onClick={apply}
              className="px-2 py-0.5 text-xs rounded bg-accent/80 text-white hover:bg-accent cursor-pointer"
            >
              {t('game.chatPanel.modelSwap.apply')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
