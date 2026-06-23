import { useEffect, useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { useNetworkStore } from '../../../../stores/network-store'
import { useAiDmStore } from '../../../../stores/use-ai-dm-store'
import { useCampaignStore } from '../../../../stores/use-campaign-store'
import { useGameStore } from '../../../../stores/use-game-store'

interface AiImageModalProps {
  onClose: () => void
}

interface GenResult {
  imageId?: string
  dataUrl: string
  provider?: string
  model?: string
  usedFallback?: boolean
}

const SUBJECTS = ['npc-portrait', 'scene', 'item', 'creature', 'custom'] as const
const STYLES = ['painterly', 'ink-sketch', 'photorealistic', 'isometric'] as const

/**
 * PHASE-33 33F — DM image-generation modal. Describe → generate (with SD progress) → preview → attach
 * as handout / NPC portrait / map-token image through EXISTING store actions (no new sync types).
 * Gated on the opt-in flag; renders an empty state when disabled.
 */
export default function AiImageModal({ onClose }: AiImageModalProps): JSX.Element {
  const { t } = useT()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [subjectType, setSubjectType] = useState<(typeof SUBJECTS)[number]>('npc-portrait')
  const [description, setDescription] = useState('')
  const [stylePreset, setStylePreset] = useState<(typeof STYLES)[number] | ''>('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<GenResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attachMsg, setAttachMsg] = useState<string | null>(null)
  const [shareWithPlayers, setShareWithPlayers] = useState(false)
  const [npcId, setNpcId] = useState('')
  const [tokenId, setTokenId] = useState('')

  const messages = useAiDmStore((s) => s.messages)
  const addHandout = useGameStore((s) => s.addHandout)
  const updateToken = useGameStore((s) => s.updateToken)
  const maps = useGameStore((s) => s.maps)
  const activeMapId = useGameStore((s) => s.activeMapId)
  const campaign = useCampaignStore((s) => s.getActiveCampaign())
  const npcs = (campaign?.npcs ?? []) as Array<{ id: string; name: string }>
  const tokens = maps.find((m) => m.id === activeMapId)?.tokens ?? []

  useEscapeKey(onClose)

  useEffect(() => {
    void window.api.aiImage.getConfig().then((c) => setEnabled(c.enabled ?? false))
  }, [])

  // Clean up the progress listener on unmount (listener-leak guard).
  useEffect(() => () => window.api.aiImage.removeProgressListener(), [])

  const lastNarration = [...messages].reverse().find((m) => m.role === 'assistant')?.content

  const handleGenerate = async (): Promise<void> => {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setProgress(null)
    setAttachMsg(null)
    window.api.aiImage.onProgress((d) => setProgress(d.progress))
    try {
      const res = await window.api.aiImage.generate({
        subjectType,
        description: description.trim(),
        stylePreset: stylePreset || undefined
      })
      if (res.success && res.dataUrl) {
        setResult({
          imageId: res.imageId,
          dataUrl: res.dataUrl,
          provider: res.provider,
          model: res.model,
          usedFallback: res.usedFallback
        })
      } else {
        if (res.disabled) setEnabled(false)
        setError(res.error ?? t('game.aiImageModal.error'))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      window.api.aiImage.removeProgressListener()
      setLoading(false)
      setProgress(null)
    }
  }

  const handleAttachHandout = (): void => {
    if (!result) return
    const handout = {
      id: crypto.randomUUID(),
      title: description.slice(0, 60) || 'AI image',
      contentType: 'image' as const,
      content: result.dataUrl,
      visibility: (shareWithPlayers ? 'all' : 'dm') as 'all' | 'dm',
      createdAt: Date.now()
    }
    addHandout(handout as never)
    if (shareWithPlayers) useNetworkStore.getState().sendMessage?.('dm:share-handout', { handout })
    setAttachMsg(t('game.aiImageModal.handoutAdded'))
  }

  const handleAttachNpc = async (): Promise<void> => {
    if (!result || !npcId || !campaign) return
    await useCampaignStore.getState().saveCampaign({
      ...campaign,
      npcs: (campaign.npcs ?? []).map((n) => (n.id === npcId ? { ...n, portraitPath: result.dataUrl } : n)),
      updatedAt: new Date().toISOString()
    } as never)
    setAttachMsg(t('game.aiImageModal.npcUpdated'))
  }

  const handleAttachToken = (): void => {
    if (!result || !tokenId || !activeMapId) return
    updateToken(activeMapId, tokenId, { imagePath: result.dataUrl })
    setAttachMsg(t('game.aiImageModal.tokenUpdated'))
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
          <h2 className="text-lg font-semibold text-fg">{t('game.aiImageModal.title')}</h2>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none cursor-pointer">
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {enabled === false ? (
            <div className="text-center py-8">
              <p className="text-gray-300 font-medium">{t('game.aiImageModal.disabledTitle')}</p>
              <p className="text-gray-500 text-xs mt-1">{t('game.aiImageModal.disabledHint')}</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <label className="flex items-center gap-1.5 text-gray-400">
                  {t('game.aiImageModal.subjectType')}
                  <select
                    className="bg-surface-2 border border-border rounded px-2 py-1 text-gray-200"
                    name="subject-type"
                    value={subjectType}
                    onChange={(e) => setSubjectType(e.target.value as (typeof SUBJECTS)[number])}
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {t(`game.aiImageModal.subject_${s}` as never)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-gray-400">
                  {t('game.aiImageModal.style')}
                  <select
                    className="bg-surface-2 border border-border rounded px-2 py-1 text-gray-200"
                    name="style-preset"
                    value={stylePreset}
                    onChange={(e) => setStylePreset(e.target.value as (typeof STYLES)[number] | '')}
                  >
                    <option value="">—</option>
                    {STYLES.map((s) => (
                      <option key={s} value={s}>
                        {t(`game.aiImageModal.style_${s}` as never)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <textarea
                className="w-full h-20 bg-surface-2 border border-border rounded px-2 py-1 text-gray-200 resize-none"
                name="description"
                placeholder={t('game.aiImageModal.descriptionPlaceholder')}
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {lastNarration && (
                <button
                  onClick={() => setDescription(lastNarration.slice(0, 600))}
                  className="text-xs text-accent hover:underline cursor-pointer"
                >
                  {t('game.aiImageModal.useLastNarration')}
                </button>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading || !description.trim()}
                className="px-3 py-1.5 rounded bg-amber-600 hover:bg-accent-strong text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                {loading ? t('game.aiImageModal.generating') : t('game.aiImageModal.generate')}
              </button>
              {loading && progress !== null && (
                <div className="h-1.5 bg-surface-2 rounded overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}

              {result && (
                <div className="space-y-2 border-t border-border/40 pt-3">
                  <img src={result.dataUrl} className="max-h-64 rounded border border-border mx-auto" />
                  <p className="text-[11px] text-gray-500 text-center">
                    {result.provider}
                    {result.model ? ` · ${result.model}` : ''}
                    {result.usedFallback ? ` · ${t('game.aiImageModal.fallbackUsed')}` : ''} ·{' '}
                    {t('game.aiImageModal.savedToLibrary')}
                  </p>

                  {/* Handout */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleAttachHandout}
                      className="px-2 py-1 text-xs rounded bg-surface-2 hover:bg-gray-700 text-gray-300 cursor-pointer"
                    >
                      {t('game.aiImageModal.attachHandout')}
                    </button>
                    <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        name="share-with-players"
                        checked={shareWithPlayers}
                        onChange={(e) => setShareWithPlayers(e.target.checked)}
                      />
                      {t('game.aiImageModal.shareWithPlayers')}
                    </label>
                  </div>

                  {/* NPC portrait */}
                  <div className="flex items-center gap-2">
                    <select
                      className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                      name="npc-id"
                      value={npcId}
                      onChange={(e) => setNpcId(e.target.value)}
                    >
                      <option value="">
                        {npcs.length ? t('game.aiImageModal.attachNpc') : t('game.aiImageModal.noNpcs')}
                      </option>
                      {npcs.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void handleAttachNpc()}
                      disabled={!npcId}
                      className="px-2 py-1 text-xs rounded bg-surface-2 hover:bg-gray-700 text-gray-300 cursor-pointer disabled:opacity-40"
                    >
                      {t('game.aiImageModal.attachNpc')}
                    </button>
                  </div>

                  {/* Token image */}
                  <div className="flex items-center gap-2">
                    <select
                      className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                      name="token-id"
                      value={tokenId}
                      onChange={(e) => setTokenId(e.target.value)}
                    >
                      <option value="">
                        {tokens.length ? t('game.aiImageModal.attachToken') : t('game.aiImageModal.noTokens')}
                      </option>
                      {tokens.map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAttachToken}
                      disabled={!tokenId}
                      className="px-2 py-1 text-xs rounded bg-surface-2 hover:bg-gray-700 text-gray-300 cursor-pointer disabled:opacity-40"
                    >
                      {t('game.aiImageModal.attachToken')}
                    </button>
                  </div>

                  {attachMsg && <p className="text-xs text-green-400">{attachMsg}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
