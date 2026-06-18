import { useCallback, useEffect, useState } from 'react'
import AiImageSetup from '../../components/campaign/AiImageSetup'
import AiProviderSetup from '../../components/campaign/AiProviderSetup'
import { Button, Card, Modal } from '../../components/ui'
import { AI_PROVIDER_LABELS, DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER, DEFAULT_OLLAMA_URL } from '../../constants'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import type { AiDmConfig, AiProviderType, Campaign } from '../../types/campaign'

interface AiDmCardProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

// PHASE-10 10H — prefill the key for the CONFIGURED provider, not the first non-null one.
function keyForProvider(dm: AiDmConfig | undefined, p: AiProviderType): string {
  return (
    (p === 'claude' ? dm?.claudeApiKey : p === 'openai' ? dm?.openaiApiKey : p === 'gemini' ? dm?.geminiApiKey : '') ??
    ''
  )
}

export default function AiDmCard({ campaign, saveCampaign }: AiDmCardProps): JSX.Element {
  const { t } = useT()
  const [showAiDmModal, setShowAiDmModal] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false) // PHASE-33
  const [saving, setSaving] = useState(false)
  const [providerReady, setProviderReady] = useState(false)
  const [aiDmConfig, setAiDmConfig] = useState<{
    enabled: boolean
    provider: AiProviderType
    model: string
    ollamaUrl: string
    apiKey: string
    // PHASE-23 23D: structured extraction mode (Ollama-only).
    structuredExtraction: 'off' | 'fallback' | 'always'
    // PHASE-24: hybrid retrieval (Ollama-only) + campaign-doc search (any provider).
    ragEmbeddingsEnabled: boolean
    ragEmbeddingModel: string
    ragCampaignDocsEnabled: boolean
    // PHASE-28: narrative-engine opt-ins (any provider).
    questTrackingEnabled: boolean
    oracleEnabled: boolean
    directorEnabled: boolean
    directorCadence: number
    // PHASE-29: per-task routing + local-endpoint flavor.
    routingEnabled: boolean
    routingSmallModel: string
    localEndpointFlavor: 'ollama' | 'llamacpp'
    allowMapGeneration: boolean
  }>({
    enabled: false,
    provider: DEFAULT_AI_PROVIDER,
    model: DEFAULT_AI_MODEL,
    ollamaUrl: DEFAULT_OLLAMA_URL,
    apiKey: '',
    structuredExtraction: 'off',
    ragEmbeddingsEnabled: false,
    ragEmbeddingModel: 'nomic-embed-text',
    ragCampaignDocsEnabled: false,
    questTrackingEnabled: false,
    oracleEnabled: false,
    directorEnabled: false,
    directorCadence: 6,
    routingEnabled: false,
    routingSmallModel: '',
    localEndpointFlavor: 'ollama',
    allowMapGeneration: false
  })
  // PHASE-26: scene-based memory is an engine-owned per-campaign flag (NOT campaign.aiDm),
  // read/written over IPC — independent of the configure modal's aiDm save.
  const [sceneMemoryOn, setSceneMemoryOn] = useState(false)
  // PHASE-27: world-state tracking — same engine-owned per-campaign flag pattern, over IPC.
  const [worldStateOn, setWorldStateOn] = useState(false)

  const openConfigure = (): void => {
    const dm = campaign.aiDm
    const provider = dm?.provider ?? DEFAULT_AI_PROVIDER
    setAiDmConfig({
      enabled: dm?.enabled ?? false,
      provider,
      model: dm?.model ?? dm?.ollamaModel ?? DEFAULT_AI_MODEL,
      ollamaUrl: dm?.ollamaUrl ?? DEFAULT_OLLAMA_URL,
      apiKey: keyForProvider(dm, provider),
      structuredExtraction: dm?.structuredExtraction ?? 'off',
      ragEmbeddingsEnabled: dm?.ragEmbeddingsEnabled ?? false,
      ragEmbeddingModel: dm?.ragEmbeddingModel ?? 'nomic-embed-text',
      // PHASE-24 24D: campaign-doc search defaults ON for never-saved configs,
      // reflects the saved value otherwise.
      ragCampaignDocsEnabled: dm == null ? true : (dm.ragCampaignDocsEnabled ?? false),
      // PHASE-28: narrative-engine opt-ins (all default off; absent ≡ off).
      questTrackingEnabled: dm?.questTrackingEnabled ?? false,
      oracleEnabled: dm?.oracleEnabled ?? false,
      directorEnabled: dm?.directorEnabled ?? false,
      directorCadence: dm?.directorCadence ?? 6,
      // PHASE-29: routing + local-endpoint flavor.
      routingEnabled: dm?.routingEnabled ?? false,
      routingSmallModel: dm?.routingSmallModel ?? '',
      localEndpointFlavor: dm?.localEndpointFlavor ?? 'ollama',
      allowMapGeneration: dm?.allowMapGeneration ?? false
    })
    setShowAiDmModal(true)
  }

  const openEnable = (): void => {
    setAiDmConfig({
      enabled: true,
      provider: DEFAULT_AI_PROVIDER,
      model: DEFAULT_AI_MODEL,
      ollamaUrl: DEFAULT_OLLAMA_URL,
      apiKey: '',
      structuredExtraction: 'off',
      ragEmbeddingsEnabled: false,
      ragEmbeddingModel: 'nomic-embed-text',
      ragCampaignDocsEnabled: true, // 24D: default-on for new configs
      questTrackingEnabled: false,
      oracleEnabled: false,
      directorEnabled: false,
      directorCadence: 6,
      routingEnabled: false,
      routingSmallModel: '',
      localEndpointFlavor: 'ollama',
      allowMapGeneration: false
    })
    setShowAiDmModal(true)
  }

  // PHASE-24 24C: embed-index status row.
  const [embedStatus, setEmbedStatus] = useState<{
    status: string
    percent?: number
    chunkCount?: number
    error?: string
  }>({ status: 'idle' })
  const refreshEmbedStatus = useCallback(async () => {
    if (window.api?.ai?.getEmbedIndexStatus) setEmbedStatus(await window.api.ai.getEmbedIndexStatus())
  }, [])
  useEffect(() => {
    if (!showAiDmModal) return
    void refreshEmbedStatus()
    const off = window.api?.ai?.onEmbedIndexProgress?.((d) =>
      setEmbedStatus((s) => ({ ...s, status: 'building', percent: d.percent }))
    )
    return () => off?.()
  }, [showAiDmModal, refreshEmbedStatus])
  const embedStatusText =
    embedStatus.status === 'building'
      ? `building ${embedStatus.percent ?? 0}%`
      : embedStatus.status === 'ready'
        ? `ready — ${embedStatus.chunkCount ?? 0} chunks`
        : embedStatus.status === 'error'
          ? `error: ${embedStatus.error ?? ''}`
          : 'not built'

  // PHASE-26: load the scene-memory flag once the AI DM is enabled (the toggle only shows then).
  const aiDmEnabled = campaign.aiDm?.enabled ?? false
  useEffect(() => {
    if (!aiDmEnabled) return
    let cancelled = false
    window.api.ai
      .sceneMemoryGet?.(campaign.id)
      .then((r) => {
        if (!cancelled && r?.success && r.data) setSceneMemoryOn(r.data.enabled)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [campaign.id, aiDmEnabled])

  const handleSceneMemoryToggle = async (next: boolean): Promise<void> => {
    setSceneMemoryOn(next) // optimistic
    const r = await window.api.ai.sceneMemorySetEnabled?.(campaign.id, next)
    if (r && !r.success) {
      setSceneMemoryOn(!next)
      addToast(r.error ?? t('pages.aiDmCard.sceneMemorySaveFailed'), 'error')
    }
  }

  // PHASE-27: load + toggle the world-state flag (engine-owned, via getWorldState/setWorldStateEnabled).
  useEffect(() => {
    if (!aiDmEnabled) return
    let cancelled = false
    window.api.ai
      .getWorldState?.(campaign.id)
      .then((r) => {
        if (!cancelled && r?.success && r.store) setWorldStateOn(r.store.enabled)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [campaign.id, aiDmEnabled])

  const handleWorldStateToggle = async (next: boolean): Promise<void> => {
    setWorldStateOn(next) // optimistic
    const r = await window.api.ai.setWorldStateEnabled?.(campaign.id, next)
    if (r && !r.success) {
      setWorldStateOn(!next)
      addToast(r.error ?? t('pages.aiDmCard.worldStateSaveFailed'), 'error')
    }
  }

  const providerLabel = AI_PROVIDER_LABELS[campaign.aiDm?.provider ?? 'ollama'] ?? 'Ollama'
  const displayModel = campaign.aiDm?.model ?? campaign.aiDm?.ollamaModel ?? t('pages.aiDmCard.defaultModel')

  return (
    <>
      <Card title={t('pages.aiDmCard.title')}>
        {campaign.aiDm?.enabled ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-300">
                {t('pages.aiDmCard.enabled')}
              </span>
              <span className="text-xs text-muted">{providerLabel}</span>
              <span className="text-xs text-gray-500">{displayModel}</span>
            </div>
            <button onClick={openConfigure} className="text-xs text-accent hover:text-amber-300 cursor-pointer">
              {t('pages.aiDmCard.configure')}
            </button>
            {/* PHASE-26: scene-based memory toggle (per-campaign engine flag). */}
            <div className="pt-1">
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sceneMemoryOn}
                  onChange={(e) => handleSceneMemoryToggle(e.target.checked)}
                />
                {t('pages.aiDmCard.sceneMemory')}
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5">{t('pages.aiDmCard.sceneMemoryHint')}</p>
            </div>
            {/* PHASE-27: world-state tracking toggle (per-campaign engine flag). */}
            <div className="pt-1">
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={worldStateOn}
                  onChange={(e) => handleWorldStateToggle(e.target.checked)}
                />
                {t('pages.aiDmCard.worldState')}
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5">{t('pages.aiDmCard.worldStateHint')}</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-gray-500 text-sm mb-2">{t('pages.aiDmCard.notEnabled')}</p>
            <button onClick={openEnable} className="text-xs text-accent hover:text-amber-300 cursor-pointer">
              {t('pages.aiDmCard.enableAiDm')}
            </button>
          </div>
        )}
      </Card>

      {/* PHASE-33 — opt-in AI image generation (separate card + modal; never touches AiProviderSetup). */}
      <Card title={t('pages.aiDmCard.imageGenTitle')}>
        <p className="text-gray-500 text-sm mb-2">{t('pages.aiDmCard.imageGenDescription')}</p>
        <button
          onClick={() => setShowImageModal(true)}
          className="text-xs text-accent hover:text-amber-300 cursor-pointer"
        >
          {t('pages.aiDmCard.imageGenConfigure')}
        </button>
      </Card>

      <Modal open={showImageModal} onClose={() => setShowImageModal(false)} title={t('pages.aiDmCard.imageGenTitle')}>
        <div className="max-h-[60vh] overflow-y-auto">
          <AiImageSetup />
        </div>
      </Modal>

      <Modal open={showAiDmModal} onClose={() => setShowAiDmModal(false)} title={t('pages.aiDmCard.configureTitle')}>
        <div className="max-h-[60vh] overflow-y-auto">
          <AiProviderSetup
            enabled={aiDmConfig.enabled}
            provider={aiDmConfig.provider}
            model={aiDmConfig.model}
            ollamaUrl={aiDmConfig.ollamaUrl}
            apiKey={aiDmConfig.apiKey}
            routingEnabled={aiDmConfig.routingEnabled}
            routingSmallModel={aiDmConfig.routingSmallModel}
            localEndpointFlavor={aiDmConfig.localEndpointFlavor}
            onProviderReady={setProviderReady}
            onChange={(data) => setAiDmConfig((prev) => ({ ...prev, ...data }))}
          />
          {/* PHASE-23 23D: structured extraction — Ollama-only opt-in. */}
          {aiDmConfig.provider === 'ollama' && (
            <div className="mt-3">
              <label htmlFor="structured-extraction" className="block text-xs text-gray-300 mb-1">
                {t('pages.aiDmCard.structuredExtractionLabel')}
              </label>
              <select
                id="structured-extraction"
                className="w-full bg-surface-2/60 border border-border/50 rounded px-2 py-1 text-xs text-gray-200"
                value={aiDmConfig.structuredExtraction}
                onChange={(e) =>
                  setAiDmConfig((prev) => ({
                    ...prev,
                    structuredExtraction: e.target.value as 'off' | 'fallback' | 'always'
                  }))
                }
              >
                <option value="off">{t('pages.aiDmCard.structuredExtractionOff')}</option>
                <option value="fallback">{t('pages.aiDmCard.structuredExtractionFallback')}</option>
                <option value="always">{t('pages.aiDmCard.structuredExtractionAlways')}</option>
              </select>
              <p className="text-[11px] text-gray-500 mt-1">{t('pages.aiDmCard.structuredExtractionHelp')}</p>
            </div>
          )}
          {/* PHASE-24 24C: semantic rules search (Ollama-only opt-in). */}
          {aiDmConfig.provider === 'ollama' && (
            <div className="mt-3">
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiDmConfig.ragEmbeddingsEnabled}
                  onChange={(e) => setAiDmConfig((p) => ({ ...p, ragEmbeddingsEnabled: e.target.checked }))}
                />
                {t('campaign.aiProviderSetup.semanticSearch')}
              </label>
              {aiDmConfig.ragEmbeddingsEnabled && (
                <div className="mt-2 pl-6">
                  <input
                    type="text"
                    className="w-full bg-surface-2/60 border border-border/50 rounded px-2 py-1 text-xs text-gray-200"
                    value={aiDmConfig.ragEmbeddingModel}
                    onChange={(e) => setAiDmConfig((p) => ({ ...p, ragEmbeddingModel: e.target.value }))}
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t('campaign.aiProviderSetup.semanticSearchModelHint')}
                  </p>
                  <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-2">
                    <span>{embedStatusText}</span>
                    <button
                      className="underline text-accent"
                      onClick={() => {
                        void window.api.ai.rebuildEmbedIndex?.().then(() => void refreshEmbedStatus())
                      }}
                    >
                      {t('campaign.aiProviderSetup.semanticSearchRebuild')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* PHASE-24 24D: campaign-document search (any provider; lexical-only). */}
          <div className="mt-3">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={aiDmConfig.ragCampaignDocsEnabled}
                onChange={(e) => setAiDmConfig((p) => ({ ...p, ragCampaignDocsEnabled: e.target.checked }))}
              />
              {t('campaign.aiProviderSetup.campaignDocSearch')}
            </label>
          </div>
          {/* PHASE-28: narrative engine — quest auto-tracking / director / oracle. All default off,
              any provider; each adds background model calls. */}
          <div className="mt-4 border-t border-border/40 pt-3">
            <p className="text-xs text-gray-400 font-semibold mb-1.5">{t('pages.aiDmCard.narrativeEngine')}</p>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={aiDmConfig.questTrackingEnabled}
                onChange={(e) => setAiDmConfig((p) => ({ ...p, questTrackingEnabled: e.target.checked }))}
              />
              {t('pages.aiDmCard.questTracking')}
            </label>
            <p className="text-[11px] text-gray-500 mb-2 ml-6">{t('pages.aiDmCard.questTrackingHint')}</p>
            {/* PHASE-34: AI battlemap generation (off by default; behavior-risky ⇒ opt-in). */}
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={aiDmConfig.allowMapGeneration}
                onChange={(e) => setAiDmConfig((p) => ({ ...p, allowMapGeneration: e.target.checked }))}
              />
              {t('pages.aiDmCard.allowMapGeneration')}
            </label>
            <p className="text-[11px] text-gray-500 mb-2 ml-6">{t('pages.aiDmCard.allowMapGenerationHint')}</p>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={aiDmConfig.directorEnabled}
                onChange={(e) => setAiDmConfig((p) => ({ ...p, directorEnabled: e.target.checked }))}
              />
              {t('pages.aiDmCard.director')}
            </label>
            <p className="text-[11px] text-gray-500 mb-1 ml-6">{t('pages.aiDmCard.directorHint')}</p>
            {aiDmConfig.directorEnabled && (
              <label className="flex items-center gap-2 text-xs text-gray-300 mb-2 ml-6">
                {t('pages.aiDmCard.directorCadence')}
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={aiDmConfig.directorCadence}
                  onChange={(e) =>
                    setAiDmConfig((p) => ({
                      ...p,
                      directorCadence: Math.max(2, Math.min(20, Number.parseInt(e.target.value, 10) || 6))
                    }))
                  }
                  className="w-16 bg-surface-2 border border-border rounded px-1 py-0.5 text-xs"
                />
              </label>
            )}
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={aiDmConfig.oracleEnabled}
                onChange={(e) => setAiDmConfig((p) => ({ ...p, oracleEnabled: e.target.checked }))}
              />
              {t('pages.aiDmCard.oracle')}
            </label>
            <p className="text-[11px] text-gray-500 ml-6">{t('pages.aiDmCard.oracleHint')}</p>
          </div>
        </div>
        {/* PHASE-10 10H — informative, not obstructive: detection probes the SAVED main-side URL,
            so hard-gating Save would trap a not-yet-reachable remote-Ollama setup. */}
        {aiDmConfig.enabled && !providerReady && (
          <p className="text-amber-400 text-xs mt-2">{t('pages.aiDmCard.notReadyWarning')}</p>
        )}
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowAiDmModal(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              // Preserve the OTHER providers' stored keys; only the selected provider's field
              // is written (|| undefined so an intentionally-cleared field erases that key).
              const aiDm = {
                enabled: aiDmConfig.enabled,
                provider: aiDmConfig.provider,
                model: aiDmConfig.model,
                ollamaUrl: aiDmConfig.ollamaUrl,
                claudeApiKey:
                  aiDmConfig.provider === 'claude' ? aiDmConfig.apiKey || undefined : campaign.aiDm?.claudeApiKey,
                openaiApiKey:
                  aiDmConfig.provider === 'openai' ? aiDmConfig.apiKey || undefined : campaign.aiDm?.openaiApiKey,
                geminiApiKey:
                  aiDmConfig.provider === 'gemini' ? aiDmConfig.apiKey || undefined : campaign.aiDm?.geminiApiKey,
                // PHASE-23 23D: persist the extraction mode (meaningful for Ollama only).
                structuredExtraction: aiDmConfig.structuredExtraction,
                // PHASE-24: hybrid retrieval + campaign-doc search.
                ragEmbeddingsEnabled: aiDmConfig.ragEmbeddingsEnabled,
                ragEmbeddingModel: aiDmConfig.ragEmbeddingModel,
                ragCampaignDocsEnabled: aiDmConfig.ragCampaignDocsEnabled,
                // PHASE-28: narrative-engine opt-ins (read main-side via loadCampaignById; NOT
                // passed to window.api.ai.configure — they don't affect the provider link).
                questTrackingEnabled: aiDmConfig.questTrackingEnabled,
                oracleEnabled: aiDmConfig.oracleEnabled,
                directorEnabled: aiDmConfig.directorEnabled,
                directorCadence: aiDmConfig.directorCadence,
                // PHASE-29: per-task routing + local-endpoint flavor.
                routingEnabled: aiDmConfig.routingEnabled,
                routingSmallModel: aiDmConfig.routingSmallModel,
                localEndpointFlavor: aiDmConfig.localEndpointFlavor,
                // PHASE-34: let the AI DM generate battlemaps (opt-in; default off).
                allowMapGeneration: aiDmConfig.allowMapGeneration
              }
              try {
                await saveCampaign({ ...campaign, aiDm, updatedAt: new Date().toISOString() })
                if (aiDmConfig.enabled) {
                  const res = await window.api.ai.configure({
                    provider: aiDmConfig.provider,
                    model: aiDmConfig.model,
                    ollamaUrl: aiDmConfig.ollamaUrl,
                    claudeApiKey: aiDm.claudeApiKey,
                    openaiApiKey: aiDm.openaiApiKey,
                    geminiApiKey: aiDm.geminiApiKey,
                    structuredExtraction: aiDmConfig.structuredExtraction,
                    ragEmbeddingsEnabled: aiDmConfig.ragEmbeddingsEnabled,
                    ragEmbeddingModel: aiDmConfig.ragEmbeddingModel,
                    ragCampaignDocsEnabled: aiDmConfig.ragCampaignDocsEnabled,
                    // PHASE-29: routing affects the live main-process config, so push it here too.
                    routing: { enabled: aiDmConfig.routingEnabled, smallModel: aiDmConfig.routingSmallModel },
                    localEndpointFlavor: aiDmConfig.localEndpointFlavor
                  })
                  if (!res.success) throw new Error(res.error ?? 'configure failed')
                }
                setShowAiDmModal(false)
              } catch (err) {
                addToast(
                  t('pages.aiDmCard.saveFailed', { error: err instanceof Error ? err.message : String(err) }),
                  'error'
                )
                // keep the modal open so the user can fix it
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? t('pages.aiDmCard.saving') : t('common.actions.save')}
          </Button>
        </div>
      </Modal>
    </>
  )
}
