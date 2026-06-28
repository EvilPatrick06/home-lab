import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useT } from '../../../i18n'
import { getEffectiveClasses } from '../../../services/character/effective-character-5e'
import { parseDiceFormula, rollDice } from '../../../services/dice/dice-engine'
import { getCurrentAmbient, subscribeToCurrentAmbient } from '../../../services/sound-manager'
import { useNetworkStore } from '../../../stores/network-store'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useGameStore } from '../../../stores/use-game-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import type { Campaign } from '../../../types/campaign'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import { getCharacterSheetPath } from '../../../utils/character-routes'
import { trigger3dDice } from '../dice3d'
import MacroBar from '../player/MacroBar'
import ChatPanel from './GameChatPanel'

interface PlayerBottomBarProps {
  character: Character | null
  campaignId: string
  onAction: () => void
  onItem: () => void
  onFamiliar?: () => void
  onWildShape?: () => void
  onSteed?: () => void
  onJump?: () => void
  onFallingDamage?: () => void
  onTravelPace?: () => void
  onQuickCondition?: () => void
  onCheckTime?: () => void
  onLightSource?: () => void
  /** Phase 15b: activate the map measurement tool for the local player.
   *  Measurement is rendered to the player's own canvas only — not broadcast. */
  onMeasure?: () => void
  /** Phase 15b: activate the line-of-sight check tool. */
  onCheckLos?: () => void
  /** Phase 15d: open the personal player journal panel. */
  onMyNotes?: () => void
  /** Phase 15f: open the in-game spell preparation panel (prepared casters only). */
  onSpellPrep?: () => void
  onTrade?: () => void
  onJournal?: () => void
  onCompendium?: () => void
  onDowntime?: () => void
  onSpellRef?: () => void
  onShortcutRef?: () => void
  onWhisper?: () => void
  playerName: string
  campaign: Campaign
  collapsed?: boolean
  onToggleCollapse?: () => void
  onOpenModal?: (modal: string) => void
  onLinkClick?: (category: string, name: string) => void
}

export default function PlayerBottomBar({
  character,
  campaignId,
  onAction,
  onItem,
  onFamiliar,
  onWildShape,
  onSteed,
  onJump,
  onFallingDamage,
  onTravelPace,
  onQuickCondition,
  onCheckTime,
  onLightSource,
  onMeasure,
  onCheckLos,
  onMyNotes,
  onSpellPrep,
  onTrade,
  onJournal,
  onCompendium,
  onDowntime,
  onSpellRef,
  onShortcutRef,
  onWhisper,
  playerName,
  campaign,
  collapsed,
  onToggleCollapse,
  onOpenModal,
  onLinkClick
}: PlayerBottomBarProps): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsRef = useRef<HTMLDivElement>(null)

  // Phase 14d: surface the currently playing ambient track so players
  // know the soundscape they're in (and that ambient sync is working).
  const [currentAmbient, setCurrentAmbient] = useState<string | null>(() => getCurrentAmbient())
  useEffect(() => subscribeToCurrentAmbient((value) => setCurrentAmbient(value)), [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleViewSheet = (): void => {
    if (!character) return
    navigate(getCharacterSheetPath(character), { state: { returnTo: `/game/${campaignId}` } })
  }

  // Re-fetch character from store to ensure fresh data with populated classes array
  const freshCharacter = useCharacterStore((s) =>
    character ? (s.characters.find((c) => c.id === character.id) ?? character) : character
  )

  const addChatMessage = useLobbyStore((s) => s.addChatMessage)
  const localPeerId = useNetworkStore((s) => s.localPeerId)

  const handleMacroRoll = (formula: string, label: string): void => {
    const parsed = parseDiceFormula(formula)
    if (!parsed) return
    const rolls = rollDice(parsed.count, parsed.sides)
    const total = rolls.reduce((s, r) => s + r, 0) + parsed.modifier
    const msg = {
      id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: localPeerId || 'local',
      senderName: playerName,
      content: t('game.playerBottomBar.macroRolled', { label, formula }),
      timestamp: Date.now(),
      isSystem: false,
      isDiceRoll: true,
      diceResult: { formula, rolls, total }
    }
    addChatMessage(msg)
    sendMessage('game:dice-result', {
      formula,
      rolls,
      total,
      isCritical: false,
      isFumble: false,
      rollerName: playerName
    })
    trigger3dDice({ formula, rolls, total, rollerName: playerName })
    useGameStore.getState().addDiceRoll({
      id: crypto.randomUUID(),
      formula,
      rolls,
      total,
      rollerName: playerName,
      reason: label,
      timestamp: Date.now(),
      isCritical: false,
      isFumble: false
    })
  }

  // Determine which companion options to show based on character class
  const is5e = freshCharacter && is5eCharacter(freshCharacter)
  const classes5e = is5e ? getEffectiveClasses(freshCharacter) : []
  const isDruid = is5e && classes5e.some((c) => c.name.toLowerCase() === 'druid')
  const hasWizardOrWarlock = is5e && classes5e.some((c) => ['wizard', 'warlock'].includes(c.name.toLowerCase()))
  const isPaladin = is5e && classes5e.some((c) => c.name.toLowerCase() === 'paladin')

  return (
    <div className="min-h-0 h-full bg-base/90 backdrop-blur-sm border-t border-amber-900/30 flex min-w-0 relative">
      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -top-5 left-1/2 -translate-x-1/2 z-10 px-3 py-1
          bg-surface-2 border border-border/50 rounded-t-lg text-muted hover:text-gray-200
          cursor-pointer transition-colors"
        title={collapsed ? t('game.playerBottomBar.expand') : t('game.playerBottomBar.collapse')}
        aria-label={collapsed ? t('game.playerBottomBar.expand') : t('game.playerBottomBar.collapse')}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        )}
      </button>

      {/* Phase 14d: Currently playing ambient \u2014 small pill in the
          top-left corner of the bottom bar. Only renders when something
          is actually playing; null state stays out of the way. */}
      {currentAmbient && (
        <div
          className="absolute -top-5 right-3 z-10 px-2.5 py-0.5 text-xs flex items-center gap-1
            bg-surface-2 border border-border/50 rounded-t-lg text-amber-300"
          title={t('game.playerBottomBar.currentlyPlaying', { track: currentAmbient })}
        >
          <span aria-hidden>\u266A</span>
          <span className="font-medium">{currentAmbient.replace(/^ambient-/, '')}</span>
        </div>
      )}

      {collapsed ? (
        <div className="flex-1 px-3 py-1.5 flex items-center gap-3 min-w-0">
          {/* Phase 16D — keep the macro bar visible when the bottom bar is
              collapsed. Previously macros were nested inside the expanded
              center column and vanished entirely when collapsed, even
              though they're the fastest path to a player's action of the
              turn. Rendering here puts them on the same row as the
              collapsed chat input. */}
          {freshCharacter && (
            <div className="shrink-0 max-w-[40%] overflow-x-auto">
              <MacroBar character={freshCharacter} onRoll={handleMacroRoll} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <ChatPanel
              isDM={false}
              playerName={playerName}
              campaign={campaign}
              character={character}
              collapsed
              onOpenModal={onOpenModal}
              onLinkClick={onLinkClick}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Left: action buttons */}
          <div className="w-36 shrink-0 flex flex-col gap-1.5 p-2 border-r border-border/50 overflow-y-auto">
            <button
              onClick={handleViewSheet}
              disabled={!character}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-surface-2/60 border border-border/50
            text-gray-200 hover:bg-amber-600/30 hover:border-amber-500/50 hover:text-amber-300
            transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('game.playerBottomBar.viewSheet')}
            </button>
            <button
              onClick={() => character && useGameStore.getState().requestCenterOnEntity(character.id)}
              disabled={!character}
              title={t('game.playerBottomBar.centerOnMeTitle')}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-surface-2/60 border border-border/50
            text-gray-200 hover:bg-amber-600/30 hover:border-amber-500/50 hover:text-amber-300
            transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('game.playerBottomBar.centerOnMe')}
            </button>
            <button
              onClick={onAction}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-surface-2/60 border border-border/50
            text-gray-200 hover:bg-amber-600/30 hover:border-amber-500/50 hover:text-amber-300
            transition-all cursor-pointer"
            >
              {t('game.playerBottomBar.doAnAction')}
            </button>
            <button
              onClick={onItem}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-surface-2/60 border border-border/50
            text-gray-200 hover:bg-amber-600/30 hover:border-amber-500/50 hover:text-amber-300
            transition-all cursor-pointer"
            >
              {t('game.playerBottomBar.useAnItem')}
            </button>

            {/* Tools dropdown */}
            <div className="relative" ref={toolsRef}>
              <button
                onClick={() => setToolsOpen(!toolsOpen)}
                aria-haspopup="menu"
                aria-expanded={toolsOpen}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-surface-2/60 border border-border/50
              text-gray-200 hover:bg-gray-700/60 hover:text-fg
              transition-all cursor-pointer"
              >
                {t('game.playerBottomBar.tools')}
              </button>

              {toolsOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-48 max-h-[60vh] overflow-y-auto bg-surface/95 backdrop-blur-sm border border-border/50 rounded-xl shadow-xl z-20">
                  {/* Combat & Movement */}
                  <div className="px-2 pt-2 pb-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">
                      {t('game.playerBottomBar.combatMovement')}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onOpenModal?.('diceRoller')
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.diceRoller')}
                  </button>
                  {/* Phase 15b: player measurement + LoS tools. Local-only —
                      the measurement line is drawn to the player's own
                      PixiJS canvas, never broadcast. LoS uses the same
                      raycast-visibility code path the DM's vision uses. */}
                  {onMeasure && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onMeasure()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.measureDistance')}
                    </button>
                  )}
                  {onCheckLos && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onCheckLos()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.checkLineOfSight')}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onJump?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.jumpCalculator')}
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onFallingDamage?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.fallingDamage')}
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onTravelPace?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.travelPaceReference')}
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onQuickCondition?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.conditionsViewer')}
                  </button>
                  {onLightSource && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onLightSource()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.lightSources')}
                    </button>
                  )}

                  {/* Reference */}
                  <div className="border-t border-border/40 mx-2 mt-1" />
                  <div className="px-2 pt-2 pb-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">
                      {t('game.playerBottomBar.reference')}
                    </span>
                  </div>
                  {/* Phase 15f: in-game spell prep — visible to all but the
                      modal itself gates by class (prepared casters only) and
                      out-of-combat. */}
                  {onSpellPrep && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onSpellPrep()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.prepareSpells')}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onSpellRef?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.quickReference')}
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onOpenModal?.('commandRef')
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.commandReference')}
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onShortcutRef?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.shortcutReference')}
                  </button>

                  {/* Social */}
                  <div className="border-t border-border/40 mx-2 mt-1" />
                  <div className="px-2 pt-2 pb-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">
                      {t('game.playerBottomBar.social')}
                    </span>
                  </div>
                  {/* Phase 15d: personal journal — private, local-only notes
                      for the player. Never broadcast / synced; stored in
                      localStorage keyed on characterId. */}
                  {onMyNotes && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onMyNotes()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.myNotes')}
                    </button>
                  )}
                  {onWhisper && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onWhisper()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-purple-300 hover:bg-surface-2 hover:text-purple-200 transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.whisper')}
                    </button>
                  )}
                  {onCheckTime && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onCheckTime()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.checkTime')}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      const msg = t('game.playerBottomBar.requestsShortRest', { playerName })
                      addChatMessage({
                        id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                        senderId: 'system',
                        senderName: t('game.playerBottomBar.systemSender'),
                        content: msg,
                        timestamp: Date.now(),
                        isSystem: true
                      })
                      sendMessage('chat:message', { message: msg, isSystem: true })
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.requestShortRest')}
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      const msg = t('game.playerBottomBar.requestsLongRest', { playerName })
                      addChatMessage({
                        id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                        senderId: 'system',
                        senderName: t('game.playerBottomBar.systemSender'),
                        content: msg,
                        timestamp: Date.now(),
                        isSystem: true
                      })
                      sendMessage('chat:message', { message: msg, isSystem: true })
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                  >
                    {t('game.playerBottomBar.requestLongRest')}
                  </button>
                  {onDowntime && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onDowntime()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.downtimeActivity')}
                    </button>
                  )}
                  {onTrade && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onTrade()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-amber-300 hover:bg-surface-2 hover:text-amber-200 transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.tradeItems')}
                    </button>
                  )}
                  {onJournal && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onJournal()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.sharedJournal')}
                    </button>
                  )}
                  {onCompendium && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onCompendium()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
                    >
                      {t('game.playerBottomBar.compendium')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Class-specific companion buttons */}
            {hasWizardOrWarlock && (
              <button
                onClick={onFamiliar}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-surface-2/60 border border-border/50
              text-accent hover:bg-amber-600/30 hover:border-amber-500/50 hover:text-amber-300
              transition-all cursor-pointer"
              >
                {t('game.playerBottomBar.findFamiliar')}
              </button>
            )}
            {isDruid && (
              <button
                onClick={onWildShape}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-surface-2/60 border border-border/50
              text-green-400 hover:bg-green-600/30 hover:border-green-500/50 hover:text-green-300
              transition-all cursor-pointer"
              >
                {t('game.playerBottomBar.wildShape')}
              </button>
            )}
            {isPaladin && (
              <button
                onClick={onSteed}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-surface-2/60 border border-border/50
              text-blue-400 hover:bg-blue-600/30 hover:border-blue-500/50 hover:text-blue-300
              transition-all cursor-pointer"
              >
                {t('game.playerBottomBar.findSteed')}
              </button>
            )}
          </div>

          {/* Center: macro bar + chat */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Macro bar */}
            <div className="shrink-0 border-b border-border/30">
              <MacroBar character={freshCharacter} onRoll={handleMacroRoll} />
            </div>

            {/* Chat panel */}
            <ChatPanel
              isDM={false}
              playerName={playerName}
              campaign={campaign}
              character={character}
              onOpenModal={onOpenModal}
              onLinkClick={onLinkClick}
            />
          </div>
        </>
      )}
    </div>
  )
}
