import { useEffect, useState } from 'react'
import { useT } from '../../i18n'

/**
 * PHASE-33 33E — opt-in AI image-generation settings. Stores NO API keys (cloud providers reuse the
 * AI DM keys managed in AiProviderSetup); only the SD endpoint + per-provider knobs. `enabled` defaults
 * to false. Does NOT touch AiProviderSetup.tsx.
 */

type Providers = { sdWebui: boolean; openai: boolean; gemini: boolean }

const DEFAULTS = {
  enabled: false,
  provider: 'sd-webui' as const,
  fallbackProvider: 'none' as const,
  sdWebuiUrl: 'http://127.0.0.1:7860',
  sdModel: '',
  sdSteps: 28,
  sdSampler: 'Euler a',
  sdCfgScale: 7,
  openaiModel: 'gpt-image-1',
  openaiQuality: 'low' as const,
  geminiModel: 'gemini-2.5-flash-image',
  size: '1024x1024' as const
}
type ImageConfig = typeof DEFAULTS

export default function AiImageSetup(): JSX.Element {
  const { t } = useT()
  const [cfg, setCfg] = useState<ImageConfig>(DEFAULTS)
  const [providers, setProviders] = useState<Providers | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.aiImage.getConfig().then((c) => setCfg((prev) => ({ ...prev, ...(c as Partial<ImageConfig>) })))
  }, [])

  const set = <K extends keyof ImageConfig>(key: K, value: ImageConfig[K]): void => {
    setCfg((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async (): Promise<void> => {
    setError(null)
    const res = await window.api.aiImage.configure(cfg)
    if (res.success) setSaved(true)
    else setError(res.error || t('campaign.aiImageSetup.error'))
  }

  const handleTest = async (): Promise<void> => {
    setProviders(await window.api.aiImage.checkProviders())
  }

  const selectCls = 'bg-surface-2 border border-border rounded px-2 py-1 text-sm text-gray-200'
  const inputCls = 'bg-surface-2 border border-border rounded px-2 py-1 text-sm text-gray-200 w-full'

  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-center gap-2 cursor-pointer text-gray-200">
        <input
          type="checkbox"
          name="enabled"
          checked={cfg.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
        />
        {t('campaign.aiImageSetup.enable')}
      </label>

      <label className="flex items-center justify-between gap-2 text-gray-400">
        {t('campaign.aiImageSetup.provider')}
        <select
          className={selectCls}
          name="provider"
          value={cfg.provider}
          onChange={(e) => set('provider', e.target.value as ImageConfig['provider'])}
        >
          <option value="sd-webui">Stable Diffusion (local)</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-2 text-gray-400">
        {t('campaign.aiImageSetup.fallback')}
        <select
          className={selectCls}
          name="fallback-provider"
          value={cfg.fallbackProvider}
          onChange={(e) => set('fallbackProvider', e.target.value as ImageConfig['fallbackProvider'])}
        >
          <option value="none">{t('campaign.aiImageSetup.none')}</option>
          <option value="sd-webui">Stable Diffusion (local)</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
      </label>

      <div>
        <label className="block text-gray-400 mb-1">{t('campaign.aiImageSetup.sdUrl')}</label>
        <input
          className={inputCls}
          name="sd-webui-url"
          value={cfg.sdWebuiUrl}
          onChange={(e) => set('sdWebuiUrl', e.target.value)}
        />
        <p className="text-[11px] text-gray-500 mt-0.5">{t('campaign.aiImageSetup.sdUrlHint')}</p>
      </div>

      <details className="border border-border rounded p-2">
        <summary className="cursor-pointer text-gray-300">{t('campaign.aiImageSetup.advanced')}</summary>
        <div className="space-y-2 mt-2">
          <label className="flex items-center justify-between gap-2 text-gray-400">
            {t('campaign.aiImageSetup.sdModel')}
            <input
              className={`${inputCls} max-w-[60%]`}
              name="sd-model"
              value={cfg.sdModel}
              onChange={(e) => set('sdModel', e.target.value)}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-gray-400">
            {t('campaign.aiImageSetup.steps')}
            <input
              type="number"
              min={1}
              max={150}
              className={`${selectCls} w-20`}
              name="sd-steps"
              value={cfg.sdSteps}
              onChange={(e) => set('sdSteps', Number.parseInt(e.target.value, 10) || 28)}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-gray-400">
            {t('campaign.aiImageSetup.sampler')}
            <input
              className={`${inputCls} max-w-[60%]`}
              name="sd-sampler"
              value={cfg.sdSampler}
              onChange={(e) => set('sdSampler', e.target.value)}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-gray-400">
            {t('campaign.aiImageSetup.cfgScale')}
            <input
              type="number"
              min={1}
              max={30}
              step={0.5}
              className={`${selectCls} w-20`}
              name="sd-cfg-scale"
              value={cfg.sdCfgScale}
              onChange={(e) => set('sdCfgScale', Number.parseFloat(e.target.value) || 7)}
            />
          </label>
        </div>
      </details>

      <details className="border border-border rounded p-2">
        <summary className="cursor-pointer text-gray-300">{t('campaign.aiImageSetup.cloud')}</summary>
        <div className="space-y-2 mt-2">
          <label className="flex items-center justify-between gap-2 text-gray-400">
            {t('campaign.aiImageSetup.openaiModel')}
            <input
              className={`${inputCls} max-w-[60%]`}
              name="openai-model"
              value={cfg.openaiModel}
              onChange={(e) => set('openaiModel', e.target.value)}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-gray-400">
            {t('campaign.aiImageSetup.quality')}
            <select
              className={selectCls}
              name="openai-quality"
              value={cfg.openaiQuality}
              onChange={(e) => set('openaiQuality', e.target.value as ImageConfig['openaiQuality'])}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="auto">auto</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-gray-400">
            {t('campaign.aiImageSetup.geminiModel')}
            <input
              className={`${inputCls} max-w-[60%]`}
              name="gemini-model"
              value={cfg.geminiModel}
              onChange={(e) => set('geminiModel', e.target.value)}
            />
          </label>
          <p className="text-[11px] text-gray-500">{t('campaign.aiImageSetup.disabledNote')}</p>
        </div>
      </details>

      <label className="flex items-center justify-between gap-2 text-gray-400">
        {t('campaign.aiImageSetup.size')}
        <select
          className={selectCls}
          name="size"
          value={cfg.size}
          onChange={(e) => set('size', e.target.value as ImageConfig['size'])}
        >
          <option value="1024x1024">1024×1024</option>
          <option value="1024x1536">1024×1536</option>
          <option value="1536x1024">1536×1024</option>
        </select>
      </label>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleTest}
          className="px-2 py-1 text-xs rounded bg-surface-2 hover:bg-gray-700 text-gray-300 cursor-pointer"
        >
          {t('campaign.aiImageSetup.testConnection')}
        </button>
        {providers && (
          <span className="text-xs flex gap-2">
            <span className={providers.sdWebui ? 'text-green-400' : 'text-gray-500'}>
              SD {providers.sdWebui ? '✓' : '✗'}
            </span>
            <span className={providers.openai ? 'text-green-400' : 'text-gray-500'}>
              OpenAI {providers.openai ? t('campaign.aiImageSetup.keyPresent') : t('campaign.aiImageSetup.keyMissing')}
            </span>
            <span className={providers.gemini ? 'text-green-400' : 'text-gray-500'}>
              Gemini {providers.gemini ? t('campaign.aiImageSetup.keyPresent') : t('campaign.aiImageSetup.keyMissing')}
            </span>
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSave}
        className="px-3 py-1.5 text-sm rounded bg-amber-600 hover:bg-accent-strong text-white font-semibold cursor-pointer"
      >
        {saved ? t('campaign.aiImageSetup.saved') : t('campaign.aiImageSetup.save')}
      </button>
    </div>
  )
}
