import { useState } from 'react'
import AiProviderSetup from '../../components/campaign/AiProviderSetup'
import { Button, Card, Modal } from '../../components/ui'
import { AI_PROVIDER_LABELS, DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER, DEFAULT_OLLAMA_URL } from '../../constants'
import type { AiProviderType, Campaign } from '../../types/campaign'

interface AiDmCardProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function AiDmCard({ campaign, saveCampaign }: AiDmCardProps): JSX.Element {
  const [showAiDmModal, setShowAiDmModal] = useState(false)
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
    setAiDmConfig({
      enabled: dm?.enabled ?? false,
      provider: dm?.provider ?? DEFAULT_AI_PROVIDER,
      model: dm?.model ?? dm?.ollamaModel ?? DEFAULT_AI_MODEL,
      ollamaUrl: dm?.ollamaUrl ?? DEFAULT_OLLAMA_URL,
      apiKey: dm?.claudeApiKey ?? dm?.openaiApiKey ?? dm?.geminiApiKey ?? ''
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
  const displayModel = campaign.aiDm?.model ?? campaign.aiDm?.ollamaModel ?? 'default'

  return (
    <>
      <Card title="AI Dungeon Master">
        {campaign.aiDm?.enabled ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-300">Enabled</span>
              <span className="text-xs text-gray-400">{providerLabel}</span>
              <span className="text-xs text-gray-500">{displayModel}</span>
            </div>
            <button onClick={openConfigure} className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer">
              Configure
            </button>
          </div>
        ) : (
          <div>
            <p className="text-gray-500 text-sm mb-2">AI DM is not enabled for this campaign.</p>
            <button onClick={openEnable} className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer">
              Enable AI DM
            </button>
          </div>
        )}
      </Card>

      <Modal open={showAiDmModal} onClose={() => setShowAiDmModal(false)} title="Configure AI Dungeon Master">
        <div className="max-h-[60vh] overflow-y-auto">
          <AiProviderSetup
            enabled={aiDmConfig.enabled}
            provider={aiDmConfig.provider}
            model={aiDmConfig.model}
            ollamaUrl={aiDmConfig.ollamaUrl}
            apiKey={aiDmConfig.apiKey}
            onProviderReady={() => {}}
            onChange={(data) => setAiDmConfig(data)}
          />
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowAiDmModal(false)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const aiDm = {
                enabled: aiDmConfig.enabled,
                provider: aiDmConfig.provider,
                model: aiDmConfig.model,
                ollamaUrl: aiDmConfig.ollamaUrl,
                claudeApiKey: aiDmConfig.provider === 'claude' ? aiDmConfig.apiKey : undefined,
                openaiApiKey: aiDmConfig.provider === 'openai' ? aiDmConfig.apiKey : undefined,
                geminiApiKey: aiDmConfig.provider === 'gemini' ? aiDmConfig.apiKey : undefined
              }
              await saveCampaign({ ...campaign, aiDm, updatedAt: new Date().toISOString() })
              if (aiDmConfig.enabled) {
                try {
                  await window.api.ai.configure({
                    provider: aiDmConfig.provider,
                    model: aiDmConfig.model,
                    ollamaUrl: aiDmConfig.ollamaUrl,
                    claudeApiKey: aiDm.claudeApiKey,
                    openaiApiKey: aiDm.openaiApiKey,
                    geminiApiKey: aiDm.geminiApiKey
                  })
                } catch {
                  /* ignore configure errors */
                }
              }
              setShowAiDmModal(false)
            }}
          >
            Save
          </Button>
        </div>
      </Modal>
    </>
  )
}
