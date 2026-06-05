import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '../components/ui'
import { useT } from '../i18n'
import { configureAiFromCampaign } from '../services/ai-dm-routing'
import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useCampaignStore } from '../stores/use-campaign-store'

// Poll the main-process scene status; this is the "tracker" — there is NO hard time
// limit on the AI, we just watch it and react to ready/error.
const POLL_MS = 2000
// After this long with no result, show a soft warning (NOT a timeout — prep keeps running).
const SLOW_WARNING_SECONDS = 120

/**
 * Solo AI campaigns route here before the game: it loads the AI, prepares the opening
 * scene, and only enters the game once the scene is ready (the game then drops the scene
 * narration into chat). There is no time limit — a local model can take a while on the
 * first response — so instead we poll/track it, show elapsed time, surface a failure with
 * a Retry, and let the player cancel at any point.
 */
export default function ScenePrepPage(): JSX.Element {
  const { t } = useT()
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === campaignId))
  const sceneStatus = useAiDmStore((s) => s.sceneStatus)
  const sceneError = useAiDmStore((s) => s.sceneError)
  const [elapsed, setElapsed] = useState(0)
  const startedRef = useRef(false)

  const startPrep = useCallback(() => {
    if (!campaign?.aiDm?.enabled) return
    const store = useAiDmStore.getState()
    store.initFromCampaign(campaign)
    const characterIds = campaign.players.filter((p) => p.isActive && p.characterId).map((p) => p.characterId as string)
    // Apply the campaign's chosen model/provider BEFORE generating the scene.
    void configureAiFromCampaign(campaign).finally(() => {
      void store.prepareScene(campaign.id, characterIds)
    })
  }, [campaign])

  // Kick off prep once. A non-AI campaign has no scene to prepare — go straight in.
  useEffect(() => {
    if (!campaign) return
    if (!campaign.aiDm?.enabled) {
      navigate(`/game/${campaign.id}`, { replace: true })
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    startPrep()
  }, [campaign, navigate, startPrep])

  // Tick elapsed time + poll the scene status while preparing.
  useEffect(() => {
    if (!campaign?.aiDm?.enabled) return
    const start = Date.now()
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    const poll = setInterval(() => {
      void useAiDmStore.getState().checkSceneStatus(campaign.id)
    }, POLL_MS)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [campaign])

  // Enter the game the moment the scene is ready.
  useEffect(() => {
    if (sceneStatus === 'ready' && campaign) {
      navigate(`/game/${campaign.id}`, { replace: true })
    }
  }, [sceneStatus, campaign, navigate])

  const handleCancel = useCallback(() => {
    void useAiDmStore.getState().cancelStream()
    useAiDmStore.setState({ sceneStatus: 'idle', sceneError: null })
    navigate(`/campaign/${campaignId}`, { replace: true })
  }, [campaignId, navigate])

  const handleRetry = useCallback(() => {
    setElapsed(0)
    startedRef.current = true
    useAiDmStore.setState({ sceneStatus: 'idle', sceneError: null })
    startPrep()
  }, [startPrep])

  if (!campaign) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface p-8 text-center text-muted">
        {t('pages.lobbyPage.scenePrepFailed')}
      </div>
    )
  }

  const isError = sceneStatus === 'error'
  const isSlow = !isError && elapsed >= SLOW_WARNING_SECONDS

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-surface p-8 text-center">
      <h1 className="font-bold text-2xl text-gray-100">{t('pages.lobbyPage.soloPrepTitle')}</h1>
      <p className="max-w-md text-gray-400 text-sm">{t('pages.lobbyPage.soloPrepSubtitle', { name: campaign.name })}</p>

      {!isError && (
        <>
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-accent/30 border-t-accent"
            aria-hidden="true"
          />
          <p className="text-accent text-sm" aria-live="polite">
            {t('pages.lobbyPage.soloPrepWorking', { seconds: elapsed })}
          </p>
          {isSlow && <p className="max-w-md text-amber-300/90 text-xs">{t('pages.lobbyPage.soloPrepSlow')}</p>}
          <Button variant="secondary" onClick={handleCancel}>
            {t('pages.lobbyPage.soloPrepCancel')}
          </Button>
        </>
      )}

      {isError && (
        <>
          <p className="font-semibold text-red-400">{t('pages.lobbyPage.soloPrepErrorTitle')}</p>
          {sceneError && <p className="max-w-md text-red-300/80 text-xs">{sceneError}</p>}
          <div className="flex gap-3">
            <Button onClick={handleRetry}>{t('pages.lobbyPage.scenePrepRetry')}</Button>
            <Button variant="secondary" onClick={handleCancel}>
              {t('pages.lobbyPage.soloPrepBack')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
