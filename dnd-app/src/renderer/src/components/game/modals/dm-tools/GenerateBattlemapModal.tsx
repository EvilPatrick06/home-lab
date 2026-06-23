import { useState } from 'react'
import { BATTLEMAP_THEMES, type BattlemapSpec } from '../../../../../../shared/battlemap-spec'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { getActiveCampaignId } from '../../../../services/active-campaign-ref'
import { applyBattlemapSpec } from '../../../../services/map/battlemap/apply-spec'
import { compileSpec } from '../../../../services/map/battlemap/compile-spec'
import { renderBattlemap } from '../../../../services/map/battlemap/tile-renderer'
import { getGameStore, getLobbyStore, getNetworkStore } from '../../../../stores/store-accessors'

interface GenerateBattlemapModalProps {
  onClose: () => void
}

const SIZES = [10, 15, 20, 25, 30, 40, 50, 60]

/**
 * PHASE-34 34F — DM-only Generate Battlemap modal: prompt → preview → create (optionally switch to it).
 * Generation is main-side (the configured provider); compile + render + apply are renderer-side.
 */
export default function GenerateBattlemapModal({ onClose }: GenerateBattlemapModalProps): JSX.Element {
  const { t } = useT()
  const [prompt, setPrompt] = useState('')
  const [theme, setTheme] = useState('')
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [switchTo, setSwitchTo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [spec, setSpec] = useState<BattlemapSpec | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(onClose)

  const handleGenerate = async (): Promise<void> => {
    const campaignId = getActiveCampaignId()
    if (!prompt.trim() || !campaignId) return
    setBusy(true)
    setError(null)
    setSpec(null)
    setPreviewUrl(null)
    try {
      const res = await window.api.ai.generateBattlemap({
        campaignId,
        prompt: prompt.trim(),
        theme: theme || undefined,
        widthCells: width || undefined,
        heightCells: height || undefined
      })
      if (res.success && res.spec) {
        const s = res.spec as BattlemapSpec
        setSpec(s)
        setWarnings(res.warnings ?? [])
        setPreviewUrl(renderBattlemap(s, compileSpec(s, 40), 40, () => document.createElement('canvas')))
      } else {
        setError(res.error ?? t('game.generateBattlemap.error'))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = (): void => {
    const campaignId = getActiveCampaignId()
    if (!spec || !campaignId) return
    applyBattlemapSpec(spec, {
      campaignId,
      switchTo,
      stores: { getGameStore, getLobbyStore, getNetworkStore }
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface border border-border rounded-lg shadow-xl w-[640px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-fg">{t('game.generateBattlemap.title')}</h2>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none cursor-pointer">
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          <div>
            <label className="block text-gray-400 mb-1">{t('game.generateBattlemap.descriptionLabel')}</label>
            <textarea
              name="battlemap-prompt"
              className="w-full h-20 bg-surface-2 border border-border rounded px-2 py-1 text-gray-200 resize-none"
              placeholder={t('game.generateBattlemap.descriptionPlaceholder')}
              maxLength={2000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="flex gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-gray-400">
              {t('game.generateBattlemap.themeLabel')}
              <select
                name="battlemap-theme"
                className="bg-surface-2 border border-border rounded px-2 py-1 text-gray-200"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="">{t('game.generateBattlemap.themeAuto')}</option>
                {BATTLEMAP_THEMES.map((th) => (
                  <option key={th} value={th}>
                    {th}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-gray-400">
              {t('game.generateBattlemap.sizeLabel')}
              <select
                name="battlemap-width"
                className="bg-surface-2 border border-border rounded px-1 py-1 text-gray-200"
                value={width}
                onChange={(e) => setWidth(Number.parseInt(e.target.value, 10))}
              >
                <option value={0}>auto</option>
                {SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-gray-600">×</span>
              <select
                name="battlemap-height"
                className="bg-surface-2 border border-border rounded px-1 py-1 text-gray-200"
                value={height}
                onChange={(e) => setHeight(Number.parseInt(e.target.value, 10))}
              >
                <option value={0}>auto</option>
                {SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              name="switch-to"
              checked={switchTo}
              onChange={(e) => setSwitchTo(e.target.checked)}
            />
            {t('game.generateBattlemap.switchToLabel')}
          </label>

          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={busy || !prompt.trim()}
              className="px-3 py-1.5 rounded bg-amber-600 hover:bg-accent-strong text-white font-semibold cursor-pointer disabled:opacity-50"
            >
              {busy
                ? t('game.generateBattlemap.generating')
                : spec
                  ? t('game.generateBattlemap.regenerate')
                  : t('game.generateBattlemap.generate')}
            </button>
            {spec && (
              <button
                onClick={handleCreate}
                className="px-3 py-1.5 rounded bg-green-700 hover:bg-green-600 text-white font-semibold cursor-pointer"
              >
                {t('game.generateBattlemap.create')}
              </button>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {spec && (
            <div className="space-y-2 border-t border-border/40 pt-3">
              <p className="text-sm text-gray-200">{spec.name}</p>
              {previewUrl && <img src={previewUrl} className="max-h-72 rounded border border-border mx-auto" />}
              {warnings.length > 0 && (
                <div className="text-[11px] text-amber-400">
                  <p>{t('game.generateBattlemap.warningsTitle')}</p>
                  <ul className="list-disc ml-4">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
