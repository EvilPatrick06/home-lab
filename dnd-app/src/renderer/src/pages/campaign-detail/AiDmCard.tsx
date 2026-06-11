import { useState } from 'react'
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
  const [saving, setSaving] = useState(false)
  const [providerReady, setProviderReady] = useState(false)
  const [aiDmConfig, setAiDmConfig] = useState<{
    enabled: boolean
    provider: AiProviderType
    model: string
    ollamaUrl: string
    apiKey: string
  }>({
    enabled: false,
    provider: DEFAULT_AI_PROVIDER,
    model: DEFAULT_AI_MODEL,
    ollamaUrl: DEFAULT_OLLAMA_URL,
    apiKey: ''
  })

  const openConfigure = (): void => {
    const dm = campaign.aiDm
    const provider = dm?.provider ?? DEFAULT_AI_PROVIDER
    setAiDmConfig({
      enabled: dm?.enabled ?? false,
      provider,
      model: dm?.model ?? dm?.ollamaModel ?? DEFAULT_AI_MODEL,
      ollamaUrl: dm?.ollamaUrl ?? DEFAULT_OLLAMA_URL,
      apiKey: keyForProvider(dm, provider)
    })
    setShowAiDmModal(true)
  }

  const openEnable = (): void => {
    setAiDmConfig({
      enabled: true,
      provider: DEFAULT_AI_PROVIDER,
      model: DEFAULT_AI_MODEL,
      ollamaUrl: DEFAULT_OLLAMA_URL,
      apiKey: ''
    })
    setShowAiDmModal(true)
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

      <Modal open={showAiDmModal} onClose={() => setShowAiDmModal(false)} title={t('pages.aiDmCard.configureTitle')}>
        <div className="max-h-[60vh] overflow-y-auto">
          <AiProviderSetup
            enabled={aiDmConfig.enabled}
            provider={aiDmConfig.provider}
            model={aiDmConfig.model}
            ollamaUrl={aiDmConfig.ollamaUrl}
            apiKey={aiDmConfig.apiKey}
            onProviderReady={setProviderReady}
            onChange={(data) => setAiDmConfig(data)}
          />
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
                  aiDmConfig.provider === 'gemini' ? aiDmConfig.apiKey || undefined : campaign.aiDm?.geminiApiKey
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
                    geminiApiKey: aiDm.geminiApiKey
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
