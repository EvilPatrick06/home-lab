import dmTabsJson from '@data/ui/dm-tabs.json'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AI_PROVIDER_LABELS } from '../../../constants'
import { useT } from '../../../i18n'
import { load5eDmTabs } from '../../../services/data-provider'
import { useAiDmStore } from '../../../stores/use-ai-dm-store'
import { useNarrationTtsStore } from '../../../stores/use-narration-tts-store'
import type { Campaign } from '../../../types/campaign'

const DMAudioPanel = lazy(() => import('./DMAudioPanel'))
const DMToolsTabContent = lazy(() => import('./DMToolsTabContent'))
const AiContextPanel = lazy(() => import('./AiContextPanel'))
const CombatLogPanel = lazy(() => import('../sidebar/CombatLogPanel'))
const JournalPanel = lazy(() => import('../sidebar/JournalPanel'))

interface DMTabPanelProps {
  onOpenModal: (modal: string) => void
  campaign: Campaign
  onDispute?: (ruling: string) => void
  onEditMap: () => void
}

// Phase 18d — group field added so the tab bar can render visual
// separators between functional groups (combat / world / tools / logs).
// Falls back to no group for any tab the JSON might be missing the field
// on (e.g. plugin-injected tabs from a custom data store).
const TABS = dmTabsJson as readonly { id: string; label: string; icon: string; group?: string }[]

/** Load DM tab definitions from the data store (includes plugin tabs). */
export async function loadDmTabData(): Promise<unknown> {
  return load5eDmTabs()
}

type TabId = string

const btnClass =
  'px-3 py-2 text-xs font-medium rounded-lg bg-surface-2/60 border border-border/50 text-gray-300 hover:bg-amber-600/20 hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer whitespace-nowrap'

const toggleOnClass =
  'px-3 py-2 text-xs font-medium rounded-lg bg-amber-600/30 border border-amber-500/50 text-amber-300 transition-all cursor-pointer whitespace-nowrap'

const toggleOffClass = btnClass

export default function DMTabPanel({ onOpenModal, campaign, onDispute, onEditMap }: DMTabPanelProps): JSX.Element {
  const { t } = useT()
  const [activeTab, setActiveTab] = useState<TabId>('combat')

  // AI DM store
  const aiEnabled = useAiDmStore((s) => s.enabled)
  const aiPaused = useAiDmStore((s) => s.paused)
  const aiIsTyping = useAiDmStore((s) => s.isTyping)
  // PHASE-10 10A — show the configured provider's model (or provider label), not a hardcoded "Ollama".
  const aiDm = campaign.aiDm
  const aiModel = aiDm?.model ?? aiDm?.ollamaModel ?? AI_PROVIDER_LABELS[aiDm?.provider ?? 'ollama'] ?? 'AI'
  const setPaused = useAiDmStore((s) => s.setPaused)
  const cancelStream = useAiDmStore((s) => s.cancelStream)
  const dmApprovalRequired = useAiDmStore((s) => s.dmApprovalRequired)
  const setDmApprovalRequired = useAiDmStore((s) => s.setDmApprovalRequired)
  const narrationTtsEnabled = useNarrationTtsStore((s) => s.enabled)
  const setNarrationTtsEnabled = useNarrationTtsStore((s) => s.setEnabled)

  // Token budget state (for AI DM tab)
  const [tokenBudget, setTokenBudget] = useState<{
    rulebookChunks: number
    srdData: number
    characterData: number
    campaignData: number
    creatures: number
    gameState: number
    memory: number
    total: number
  } | null>(null)
  const [showTokenDetail, setShowTokenDetail] = useState(false)

  const refreshTokenBudget = useCallback(async () => {
    try {
      // First try to get the cached breakdown from THIS campaign's last live build (07A)
      const data = await window.api.ai.getTokenBudget(campaign.id)
      if (data && data.total > 0) {
        setTokenBudget(data)
        return
      }

      // No breakdown yet (no chat sent) — run a preview build so the user
      // can see realistic token counts for characters, campaign, SRD, etc.
      const characterIds = campaign.players.map((p) => p.characterId).filter((id): id is string => id !== null)
      const preview = await window.api.ai.previewTokenBudget(campaign.id, characterIds)
      if (preview) {
        setTokenBudget(preview)
      }
    } catch {
      // Non-fatal
    }
  }, [campaign.id, campaign.players])

  // Refresh token budget when switching to AI DM tab
  useEffect(() => {
    if (activeTab === 'aidm' && aiEnabled) {
      refreshTokenBudget()
    }
  }, [activeTab, aiEnabled, refreshTokenBudget])

  // Auto-refresh token budget after AI stream completes
  const wasTypingRef = useRef(false)
  useEffect(() => {
    if (wasTypingRef.current && !aiIsTyping && activeTab === 'aidm') {
      // Stream just finished — refresh the token budget
      refreshTokenBudget()
    }
    wasTypingRef.current = aiIsTyping
  }, [aiIsTyping, activeTab, refreshTokenBudget])

  function renderTabContent(): JSX.Element {
    switch (activeTab) {
      case 'combat':
        return (
          <div className="flex flex-wrap gap-1.5">
            <button className={btnClass} onClick={() => onOpenModal('initiative')}>
              {t('game.dmTabPanel.initiative')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('quickCondition')}>
              {t('game.dmTabPanel.quickConditions')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('creatures')}>
              {t('game.dmTabPanel.monsterLookup')}
            </button>
          </div>
        )

      case 'magic':
        // QA-S4: tab used to be just AoE + Custom Effect. Surface the
        // other magic-adjacent modals that already exist elsewhere so
        // the tab matches the density of Combat / DM Tools.
        return (
          <div className="flex flex-wrap gap-1.5">
            <button className={btnClass} onClick={() => onOpenModal('aoe')}>
              {t('game.dmTabPanel.aoeTemplate')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('customEffect')}>
              {t('game.dmTabPanel.customEffect')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('spellRef')}>
              {t('game.dmTabPanel.spellReference')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('lightSource')}>
              {t('game.dmTabPanel.lightSource')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('summonCreature')}>
              {t('game.dmTabPanel.summonCreature')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('quickCondition')}>
              {t('game.dmTabPanel.applyCondition')}
            </button>
          </div>
        )

      case 'dmtools':
        return (
          <Suspense fallback={<div />}>
            <DMToolsTabContent onOpenModal={onOpenModal} btnClass={btnClass} />
          </Suspense>
        )

      case 'map':
        return (
          <div className="flex flex-wrap gap-1.5">
            <button className={btnClass} onClick={onEditMap}>
              {t('game.dmTabPanel.editMap')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('jump')}>
              {t('game.dmTabPanel.jumpCalculator')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('falling')}>
              {t('game.dmTabPanel.fallingDamage')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('travelPace')}>
              {t('game.dmTabPanel.travelCalculator')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('gridSettings')}>
              {t('game.dmTabPanel.gridSettings')}
            </button>
          </div>
        )

      case 'party':
        return (
          <div className="flex flex-wrap gap-1.5">
            <button className={btnClass} onClick={() => onOpenModal('shortRest')}>
              {t('game.dmTabPanel.shortRest')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('longRest')}>
              {t('game.dmTabPanel.longRest')}
            </button>
          </div>
        )

      case 'audio':
        return (
          <Suspense
            fallback={<div className="text-xs text-gray-500 p-2">{t('game.dmTabPanel.loadingAudioPanel')}</div>}
          >
            <DMAudioPanel />
          </Suspense>
        )

      case 'aidm':
        return (
          <div className="flex flex-wrap gap-1.5 items-start">
            {aiEnabled ? (
              <>
                <span className="text-xs text-purple-400 font-semibold uppercase tracking-wider w-full">
                  {t('game.dmTabPanel.aiDmLabel', { model: aiModel })}{' '}
                  {aiPaused ? t('game.dmTabPanel.pausedSuffix') : ''}
                </span>
                <button className={aiPaused ? toggleOnClass : btnClass} onClick={() => setPaused(!aiPaused)}>
                  {aiPaused ? t('game.dmTabPanel.resumeAi') : t('game.dmTabPanel.pauseAi')}
                </button>
                {aiIsTyping && (
                  <button
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-red-900/40 border border-red-700/50 text-red-300 hover:bg-red-800/40 hover:border-red-600/50 transition-all cursor-pointer whitespace-nowrap"
                    onClick={() => cancelStream()}
                  >
                    {t('game.dmTabPanel.cancelResponse')}
                  </button>
                )}
                <button
                  className={dmApprovalRequired ? toggleOnClass : toggleOffClass}
                  onClick={() => setDmApprovalRequired(!dmApprovalRequired)}
                  title={t('game.dmTabPanel.dmApprovalTitle')}
                >
                  {t('game.dmTabPanel.dmApproval')}{' '}
                  {dmApprovalRequired ? t('game.dmTabPanel.on') : t('game.dmTabPanel.off')}
                </button>
                <button
                  className={narrationTtsEnabled ? toggleOnClass : toggleOffClass}
                  onClick={() => setNarrationTtsEnabled(!narrationTtsEnabled)}
                  title={t('game.dmTabPanel.speakNarrationTitle')}
                >
                  {t('game.dmTabPanel.speakNarration')}{' '}
                  {narrationTtsEnabled ? t('game.dmTabPanel.on') : t('game.dmTabPanel.off')}
                </button>
                <button
                  className={btnClass}
                  onClick={() => {
                    refreshTokenBudget()
                    setShowTokenDetail((t) => !t)
                  }}
                >
                  {t('game.dmTabPanel.tokenBudget')}{' '}
                  {tokenBudget ? t('game.dmTabPanel.tokenCount', { count: tokenBudget.total.toLocaleString() }) : ''}
                </button>

                {showTokenDetail && tokenBudget && (
                  <div className="w-full bg-surface/60 border border-border/40 rounded-lg px-3 py-2 space-y-0.5">
                    {(
                      [
                        [t('game.dmTabPanel.budgetRulebook'), tokenBudget.rulebookChunks],
                        [t('game.dmTabPanel.budgetSrdData'), tokenBudget.srdData],
                        [t('game.dmTabPanel.budgetCharacters'), tokenBudget.characterData],
                        [t('game.dmTabPanel.budgetCampaign'), tokenBudget.campaignData],
                        [t('game.dmTabPanel.budgetCreatures'), tokenBudget.creatures],
                        [t('game.dmTabPanel.budgetGameState'), tokenBudget.gameState],
                        [t('game.dmTabPanel.budgetMemory'), tokenBudget.memory]
                      ] as const
                    ).map(([label, val]) => (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-gray-500">{label}</span>
                        <span className="text-muted">{val.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs border-t border-border pt-0.5 mt-0.5">
                      <span className="text-purple-400 font-semibold">{t('game.dmTabPanel.totalContext')}</span>
                      <span className="text-purple-400 font-semibold">{tokenBudget.total.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <Suspense
                  fallback={
                    <div className="text-xs text-gray-500 w-full">{t('game.dmTabPanel.loadingContextPanel')}</div>
                  }
                >
                  <AiContextPanel campaignId={campaign.id} />
                </Suspense>

                {onDispute && (
                  <button className={btnClass} onClick={() => onDispute('last ruling')}>
                    {t('game.dmTabPanel.disputeRuling')}
                  </button>
                )}
              </>
            ) : (
              <span className="text-xs text-gray-500">{t('game.dmTabPanel.aiDmNotEnabled')}</span>
            )}
          </div>
        )

      case 'campaign':
        return (
          <div className="flex flex-wrap gap-1.5">
            <button className={btnClass} onClick={() => onOpenModal('notes')}>
              {t('game.dmTabPanel.dmNotes')}
            </button>
            {campaign.calendar && (
              <button className={btnClass} onClick={() => onOpenModal('calendar')}>
                {t('game.dmTabPanel.calendar')}
              </button>
            )}
            <button className={btnClass} onClick={() => onOpenModal('chaseTracker')}>
              {t('game.dmTabPanel.chaseTracker')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('magic-item-tracker')}>
              {t('game.dmTabPanel.magicItems')}
            </button>
          </div>
        )

      case 'dice':
        return (
          <div className="flex flex-wrap gap-1.5">
            <button className={btnClass} onClick={() => onOpenModal('diceRoller')}>
              {t('game.dmTabPanel.diceRoller')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('dmRoller')}>
              {t('game.dmTabPanel.dmRoller')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('hiddenDice')}>
              {t('game.dmTabPanel.hiddenDice')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('mobCalculator')}>
              {t('game.dmTabPanel.mobCalculator')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('groupRoll')}>
              {t('game.dmTabPanel.groupRoll')}
            </button>
          </div>
        )

      case 'chat':
        return (
          <div className="flex flex-wrap gap-1.5">
            <button className={btnClass} onClick={() => onOpenModal('whisper')}>
              {t('game.dmTabPanel.whisper')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('shop')}>
              {t('game.dmTabPanel.shop')}
            </button>
          </div>
        )

      case 'utility':
        return (
          <div className="flex flex-wrap gap-1.5">
            <button className={btnClass} onClick={() => onOpenModal('handout')}>
              {t('game.dmTabPanel.handouts')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('commandRef')}>
              {t('game.dmTabPanel.commandReference')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('shortcutRef')}>
              {t('game.dmTabPanel.shortcutReference')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('spellRef')}>
              {t('game.dmTabPanel.quickReference')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('sharedJournal')}>
              {t('game.dmTabPanel.journal')}
            </button>
            <button className={btnClass} onClick={() => onOpenModal('compendium')}>
              {t('game.dmTabPanel.compendium')}
            </button>
          </div>
        )

      case 'combatlog':
        return (
          <Suspense fallback={<div />}>
            <CombatLogPanel />
          </Suspense>
        )

      case 'journal':
        return (
          <Suspense fallback={<div />}>
            <JournalPanel campaignId={campaign.id} isDM={true} playerName="DM" />
          </Suspense>
        )

      default:
        return <div />
    }
  }

  return (
    <div className="flex flex-col gap-1 h-full min-h-0">
      {/* Tab bar — Phase 18d inserts a thin vertical divider between
          functional groups (combat / world / tools / logs) so the 13
          tabs read as four sections instead of one flat blob. */}
      <div className="flex overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 gap-0.5 shrink-0 items-end min-w-0">
        {TABS.map((tab, i) => {
          const prevGroup = i > 0 ? TABS[i - 1].group : tab.group
          const groupChanged = i > 0 && prevGroup !== tab.group
          return (
            <div key={tab.id} className="flex items-end">
              {groupChanged && <div className="self-stretch w-px bg-gray-700/40 mx-1.5 mb-0.5" aria-hidden="true" />}
              <button
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-t-lg whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-amber-600/25 border border-b-0 border-amber-500/50 text-amber-300'
                    : 'bg-surface-2/40 border border-b-0 border-border/30 text-muted hover:bg-gray-700/40 hover:text-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            </div>
          )
        })}
      </div>

      {/* Tab content — scrollable */}
      <div className="bg-surface/40 border border-border/30 rounded-lg p-2 min-h-[60px] flex-1 overflow-y-auto">
        {renderTabContent()}
      </div>
    </div>
  )
}
