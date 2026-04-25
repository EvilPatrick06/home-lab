import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { parseDiceFormula, rollDice } from '../../../services/dice/dice-engine'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useGameStore } from '../../../stores/use-game-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/network-store'
import type { Campaign } from '../../../types/campaign'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import { getCharacterSheetPath } from '../../../utils/character-routes'
import { trigger3dDice } from '../dice3d'
import MacroBar from '../player/MacroBar'
import ChatPanel from './ChatPanel'

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
  const navigate = useNavigate()
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsRef = useRef<HTMLDivElement>(null)

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
      content: `${label}: rolled ${formula}`,
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
  const isDruid = is5e && freshCharacter.classes.some((c) => c.name.toLowerCase() === 'druid')
  const hasWizardOrWarlock =
    is5e && freshCharacter.classes.some((c) => ['wizard', 'warlock'].includes(c.name.toLowerCase()))
  const isPaladin = is5e && freshCharacter.classes.some((c) => c.name.toLowerCase() === 'paladin')

  return (
    <div className="min-h-0 h-full bg-gray-950/90 backdrop-blur-sm border-t border-amber-900/30 flex min-w-0 relative">
      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -top-5 left-1/2 -translate-x-1/2 z-10 px-3 py-0.5 text-[10px]
          bg-gray-800 border border-gray-700/50 rounded-t-lg text-gray-400 hover:text-gray-200
          cursor-pointer transition-colors"
        title={collapsed ? 'Expand bottom bar' : 'Collapse bottom bar'}
      >
        {collapsed ? '\u25B2' : '\u25BC'}
      </button>

      {collapsed ? (
        <div className="flex-1 px-3 py-1.5">
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
      ) : (
        <>
          {/* Left: action buttons */}
          <div className="w-36 shrink-0 flex flex-col gap-1.5 p-2 border-r border-gray-700/50 overflow-y-auto">
            <button
              onClick={handleViewSheet}
              disabled={!character}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-800/60 border border-gray-700/50
            text-gray-200 hover:bg-amber-600/30 hover:border-amber-500/50 hover:text-amber-300
            transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              View Sheet
            </button>
            <button
              onClick={onAction}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-800/60 border border-gray-700/50
            text-gray-200 hover:bg-amber-600/30 hover:border-amber-500/50 hover:text-amber-300
            transition-all cursor-pointer"
            >
              Do an Action
            </button>
            <button
              onClick={onItem}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-800/60 border border-gray-700/50
            text-gray-200 hover:bg-amber-600/30 hover:border-amber-500/50 hover:text-amber-300
            transition-all cursor-pointer"
            >
              Use an Item
            </button>

            {/* Tools dropdown */}
            <div className="relative" ref={toolsRef}>
              <button
                onClick={() => setToolsOpen(!toolsOpen)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-gray-800/60 border border-gray-700/50
              text-gray-200 hover:bg-gray-700/60 hover:text-gray-100
              transition-all cursor-pointer"
              >
                Tools...
              </button>

              {toolsOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-48 max-h-[60vh] overflow-y-auto bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl shadow-xl z-20">
                  {/* Combat & Movement */}
                  <div className="px-2 pt-2 pb-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">
                      Combat & Movement
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onOpenModal?.('diceRoller')
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Dice Roller
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onJump?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Jump Calculator
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onFallingDamage?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Falling Damage
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onTravelPace?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Travel Pace Reference
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onQuickCondition?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Conditions Viewer
                  </button>
                  {onLightSource && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onLightSource()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                    >
                      Light Sources
                    </button>
                  )}

                  {/* Reference */}
                  <div className="border-t border-gray-700/40 mx-2 mt-1" />
                  <div className="px-2 pt-2 pb-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Reference</span>
                  </div>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onSpellRef?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Quick Reference
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onOpenModal?.('commandRef')
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Command Reference
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      onShortcutRef?.()
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Shortcut Reference
                  </button>

                  {/* Social */}
                  <div className="border-t border-gray-700/40 mx-2 mt-1" />
                  <div className="px-2 pt-2 pb-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Social</span>
                  </div>
                  {onWhisper && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onWhisper()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-purple-300 hover:bg-gray-800 hover:text-purple-200 transition-colors cursor-pointer"
                    >
                      Whisper
                    </button>
                  )}
                  {onCheckTime && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onCheckTime()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                    >
                      Check Time
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      const msg = `${playerName} requests a Short Rest.`
                      addChatMessage({
                        id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                        senderId: 'system',
                        senderName: 'System',
                        content: msg,
                        timestamp: Date.now(),
                        isSystem: true
                      })
                      sendMessage('chat:message', { message: msg, isSystem: true })
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Request Short Rest
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false)
                      const msg = `${playerName} requests a Long Rest.`
                      addChatMessage({
                        id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                        senderId: 'system',
                        senderName: 'System',
                        content: msg,
                        timestamp: Date.now(),
                        isSystem: true
                      })
                      sendMessage('chat:message', { message: msg, isSystem: true })
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                  >
                    Request Long Rest
                  </button>
                  {onDowntime && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onDowntime()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                    >
                      Downtime Activity
                    </button>
                  )}
                  {onTrade && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onTrade()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-amber-300 hover:bg-gray-800 hover:text-amber-200 transition-colors cursor-pointer"
                    >
                      Trade Items
                    </button>
                  )}
                  {onJournal && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onJournal()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                    >
                      Shared Journal
                    </button>
                  )}
                  {onCompendium && (
                    <button
                      onClick={() => {
                        setToolsOpen(false)
                        onCompendium()
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
                    >
                      Compendium
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Class-specific companion buttons */}
            {hasWizardOrWarlock && (
              <button
                onClick={onFamiliar}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-800/60 border border-gray-700/50
              text-amber-400 hover:bg-amber-600/30 hover:border-amber-500/50 hover:text-amber-300
              transition-all cursor-pointer"
              >
                Find Familiar
              </button>
            )}
            {isDruid && (
              <button
                onClick={onWildShape}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-800/60 border border-gray-700/50
              text-green-400 hover:bg-green-600/30 hover:border-green-500/50 hover:text-green-300
              transition-all cursor-pointer"
              >
                Wild Shape
              </button>
            )}
            {isPaladin && (
              <button
                onClick={onSteed}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-800/60 border border-gray-700/50
              text-blue-400 hover:bg-blue-600/30 hover:border-blue-500/50 hover:text-blue-300
              transition-all cursor-pointer"
              >
                Find Steed
              </button>
            )}
          </div>

          {/* Center: macro bar + chat */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Macro bar */}
            <div className="shrink-0 border-b border-gray-700/30">
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
