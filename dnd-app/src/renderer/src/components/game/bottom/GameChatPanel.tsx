// SECURITY (Phase 20b) — JSX-only chat rendering contract.
// Chat content is rendered exclusively through React JSX text nodes (see
// renderChatContent in utils/chat-links.ts), which auto-escapes user/AI input.
// NEVER introduce `dangerouslySetInnerHTML` / `innerHTML` here. If markdown is
// ever added to chat, the markdown→HTML step MUST be sanitized with DOMPurify,
// and any linkified URL MUST pass `isSafeHref` (chat-links.ts) before becoming
// an anchor href.
import { useVirtualizer } from '@tanstack/react-virtual'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAiReadiness } from '../../../hooks/use-ai-readiness'
import { addToast } from '../../../hooks/use-toast'
import { useT } from '../../../i18n'
import { routePlayerMessageToAiDm } from '../../../services/ai-dm-routing'
import { speakNarrationThroughBmo } from '../../../services/bmo-narration'
import { type CommandContext, executeCommand } from '../../../services/chat-commands'
import { lookupContent } from '../../../services/library/content-index'
import { useNetworkStore } from '../../../stores/network-store'
import { useAiDmStore } from '../../../stores/use-ai-dm-store'
import type { ChatMessage } from '../../../stores/use-lobby-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import type { Campaign } from '../../../types/campaign'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { LibraryCategory } from '../../../types/library'
import { renderChatContent } from '../../../utils/chat-links'
import { sanitizeStreamPreview } from '../../../utils/stream-preview'
import { trigger3dDice } from '../dice3d'
import DiceResult from '../dice3d/DiceResult'
import AiModelSwapPopover from '../dm/AiModelSwapPopover'
import SkillRollButton from '../player/SkillRollButton'
import { AiDmStatusBar } from './AiDmStatusBar'
import CommandAutocomplete from './CommandAutocomplete'
import XCardButton from './XCardButton'

const BottomChatMessage = memo(function BottomChatMessage({
  msg,
  isDM,
  onDispute,
  aiNarrationText,
  onSpeakNarration,
  onLinkClick,
  renderPreview
}: {
  msg: ChatMessage
  isDM: boolean
  onDispute?: (ruling: string) => void
  aiNarrationText?: string
  onSpeakNarration?: (text: string) => void
  onLinkClick?: (category: string, name: string) => void
  renderPreview?: (category: LibraryCategory, name: string) => React.ReactNode | null
}): JSX.Element {
  const { t } = useT()
  if (msg.isDiceRoll && msg.diceResult) {
    return (
      <DiceResult
        formula={msg.diceResult.formula}
        rolls={msg.diceResult.rolls}
        total={msg.diceResult.total}
        rollerName={msg.senderName}
      />
    )
  }
  if (msg.senderId === 'ai-dm') {
    return (
      <div className="py-1 pl-2 border-l-2 border-amber-500/50 group">
        <div className="flex items-start justify-between">
          <span className="text-xs font-semibold text-accent block mb-0.5">{t('game.chatPanel.dungeonMaster')}</span>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {isDM && aiNarrationText && onSpeakNarration && (
              <button
                onClick={() => onSpeakNarration(aiNarrationText)}
                className="text-[9px] text-gray-600 hover:text-accent cursor-pointer"
                title={t('game.chatPanel.speakTitle')}
              >
                {t('game.chatPanel.speak')}
              </button>
            )}
            {isDM && onDispute && (
              <button
                onClick={() => onDispute(msg.content)}
                className="text-[9px] text-gray-600 hover:text-accent cursor-pointer"
                title={t('game.chatPanel.disputeTitle')}
              >
                {t('game.chatPanel.dispute')}
              </button>
            )}
          </div>
        </div>
        <span className="text-sm text-fg font-sans">{msg.content}</span>
      </div>
    )
  }
  if (msg.isSystem) {
    return (
      <div className="text-sm text-muted text-center py-0.5 font-sans">
        {renderChatContent(msg.content, onLinkClick, renderPreview)}
      </div>
    )
  }
  return (
    <div className="py-0.5">
      <span className="text-xs font-medium font-sans" style={{ color: msg.senderColor || '#9CA3AF' }}>
        {msg.senderName}:
      </span>
      <span className="text-sm text-fg ml-1 font-sans">
        {renderChatContent(msg.content, onLinkClick, renderPreview)}
      </span>
    </div>
  )
})

interface ChatPanelProps {
  isDM: boolean
  playerName: string
  campaign?: Campaign
  character?: Character | null
  collapsed?: boolean
  onOpenModal?: (modal: string) => void
  onDispute?: (ruling: string) => void
  onLinkClick?: (category: string, name: string) => void
}

export default function ChatPanel({
  isDM,
  playerName,
  campaign,
  character,
  collapsed,
  onOpenModal,
  onDispute,
  onLinkClick
}: ChatPanelProps): JSX.Element {
  const { t } = useT()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const chatMessages = useLobbyStore((s) => s.chatMessages)
  const sendChat = useLobbyStore((s) => s.sendChat)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const networkRole = useNetworkStore((s) => s.role)
  const aiIsTyping = useAiDmStore((s) => s.isTyping)
  const aiPaused = useAiDmStore((s) => s.paused)
  const aiStreamingText = useAiDmStore((s) => s.streamingText)
  const aiStreamStatus = useAiDmStore((s) => s.streamStatus)
  const aiConnectionStatus = useAiDmStore((s) => s.connectionStatus)
  const aiLastContextTruncated = useAiDmStore((s) => s.lastContextTruncated)
  const aiFileReadStatus = useAiDmStore((s) => s.fileReadStatus)
  const aiEnabled = useAiDmStore((s) => s.enabled)
  const aiLastError = useAiDmStore((s) => s.lastError)
  const aiClearLastError = useAiDmStore((s) => s.clearLastError)
  const aiMessages = useAiDmStore((s) => s.messages)
  // PHASE-10 10E — remember the last message routed to the AI so the error line can retry it.
  const lastAiRouteRef = useRef<{ message: string; senderName: string } | null>(null)

  // Honest readiness probe (PHASE-10 10B): distinguishes checking / failed / not-ready /
  // ready, re-checks every 30s while visible, and exposes a manual recheck.
  const {
    usable: aiUsable,
    provider: aiProvider,
    probeFailed: aiProbeFailed,
    conversationBudget: aiConversationBudget,
    recheck: aiRecheck
  } = useAiReadiness(isDM && aiEnabled)
  // A stream error is the strongest readiness signal — re-probe immediately when one lands.
  useEffect(() => {
    if (aiLastError) aiRecheck()
  }, [aiLastError, aiRecheck])

  const aiNarrationByTimestamp = useMemo(() => {
    const narrationMap = new Map<number, string>()
    for (const message of aiMessages) {
      if (message.role === 'assistant' && message.content.trim()) {
        narrationMap.set(message.timestamp, message.content)
      }
    }
    return narrationMap
  }, [aiMessages])

  const virtualizer = useVirtualizer({
    count: chatMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10
  })

  const showAutocomplete = input.startsWith('/') && !input.includes(' ')

  useEffect(() => {
    if (chatMessages.length > 0) {
      virtualizer.scrollToIndex(chatMessages.length - 1, { align: 'end' })
    }
  }, [chatMessages.length, virtualizer])

  // PHASE-10 10D — stick-to-bottom for the streaming preview/indicator (which live OUTSIDE
  // the virtualizer, so scrollToIndex can't reach them). Only auto-scroll if the user was
  // already near the bottom; a user scrolled up is not yanked.
  const stickToBottomRef = useRef(true)
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — re-run the stick-to-bottom effect whenever the streaming preview changes
  useEffect(() => {
    if (stickToBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [aiIsTyping, aiStreamingText])

  const addSysMsg = (content: string): void => {
    addChatMessage({
      id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'system',
      senderName: t('game.chatPanel.systemSender'),
      content,
      timestamp: Date.now(),
      isSystem: true
    })
  }

  const broadcastSysMsg = (content: string): void => {
    addSysMsg(content)
    sendMessage('chat:message', { message: content, isSystem: true })
  }

  const handleSend = (): void => {
    const trimmed = input.trim()
    if (!trimmed) return

    // Try command system first
    if (trimmed.startsWith('/')) {
      const char5e = character && is5eCharacter(character) ? (character as Character5e) : null
      const ctx: CommandContext = {
        isDM,
        playerName,
        character: char5e,
        localPeerId: localPeerId || 'local',
        addSystemMessage: addSysMsg,
        broadcastSystemMessage: broadcastSysMsg,
        addErrorMessage: (err) => addSysMsg(t('game.chatPanel.errorPrefix', { error: err })),
        openModal: onOpenModal,
        campaignId: campaign?.id,
        oracleEnabled: campaign?.aiDm?.oracleEnabled ?? false
      }

      const result = executeCommand(trimmed, ctx)
      if (result) {
        if (result.error) {
          addSysMsg(t('game.chatPanel.errorPrefix', { error: result.error }))
        }
        setInput('')
        return
      }
      // GM-3 — slash-prefixed but matched no command: it's an unknown command,
      // not chat. Surface a hint instead of broadcasting "/foobar" to everyone.
      addSysMsg(t('game.chatPanel.unknownCommand', { command: trimmed.split(/\s+/)[0] }))
      setInput('')
      return
    }

    // Regular chat message. sendChat OWNS the network broadcast for multiplayer
    // (use-lobby-store.sendChat already sends 'chat:message' when connected); the
    // extra sendMessage that used to be here double-delivered every message to peers.
    sendChat(trimmed)
    // Route to the AI DM for SOLO and the HOST's OWN message. The network receive
    // loop only ever sees PEER messages, so the host's own typed message would never
    // reach the AI otherwise. Clients don't route (only the host runs the AI).
    if (campaign && (networkRole === 'none' || networkRole === 'host') && aiEnabled && !aiPaused) {
      lastAiRouteRef.current = { message: trimmed, senderName: playerName }
      routePlayerMessageToAiDm(
        campaign.id,
        trimmed,
        playerName,
        campaign.players ?? [],
        campaign.calendar?.exactTimeDefault
      )
    }
    setInput('')
  }

  // PHASE-10 10E — retry the last failed AI turn through the real routing path (fresh context
  // is rebuilt by routePlayerMessageToAiDm). Known minor wart: the failed turn's user message
  // may already sit in main's conversation history, so a retry can duplicate the user line —
  // accepted (turn transactionality is a main-side concern, out of scope here).
  const handleRetryAi = (): void => {
    const ref = lastAiRouteRef.current
    if (!ref || !campaign) return
    aiClearLastError()
    routePlayerMessageToAiDm(
      campaign.id,
      ref.message,
      ref.senderName,
      campaign.players ?? [],
      campaign.calendar?.exactTimeDefault
    )
  }
  const canRetryAi =
    lastAiRouteRef.current != null &&
    campaign != null &&
    (networkRole === 'none' || networkRole === 'host') &&
    aiEnabled &&
    !aiPaused

  const handleDiceRoll = (result: { formula: string; total: number; rolls: number[] }): void => {
    const msg = {
      id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: localPeerId || 'local',
      senderName: playerName,
      content: t('game.chatPanel.rolled', { formula: result.formula }),
      timestamp: Date.now(),
      isSystem: false,
      isDiceRoll: true,
      diceResult: result
    }
    addChatMessage(msg)

    sendMessage('game:dice-result', {
      formula: result.formula,
      rolls: result.rolls,
      total: result.total,
      isCritical: false,
      isFumble: false,
      rollerName: playerName
    })

    // Trigger 3D dice animation
    trigger3dDice({ formula: result.formula, rolls: result.rolls, total: result.total, rollerName: playerName })
  }

  const handleAutocompleteSelect = (command: string): void => {
    setInput(command)
    inputRef.current?.focus()
  }

  const renderPreview = useCallback((_category: LibraryCategory, name: string): React.ReactNode | null => {
    const ref = lookupContent(name)
    if (!ref) return null
    // Compact preview card
    return React.createElement(
      'div',
      {
        className: 'bg-surface border border-border rounded-lg p-3 text-xs'
      },
      React.createElement('div', { className: 'font-bold text-accent mb-1' }, ref.name),
      React.createElement('div', { className: 'text-muted capitalize' }, ref.category.replace(/-/g, ' '))
    )
  }, [])

  const handleSpeakNarration = async (text: string): Promise<void> => {
    const result = await speakNarrationThroughBmo(text)
    if (!result.success) {
      addToast(result.error ?? t('game.chatPanel.narrationFailed'), 'error')
    }
  }

  if (collapsed) {
    return (
      <div className="flex items-center gap-1 w-full">
        <input
          ref={inputRef}
          data-chat-input
          type="text"
          name="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend()
          }}
          placeholder={t('game.chatPanel.placeholder')}
          className="flex-1 px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-fg
            placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-2.5 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-accent-strong text-white
            font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {t('game.chatPanel.send')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 min-h-0"
        aria-live="polite"
      >
        {chatMessages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">{t('game.chatPanel.noMessages')}</p>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const msg = chatMessages[virtualItem.index]
              return (
                <div
                  key={`${msg.id}-${virtualItem.index}`}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`
                  }}
                >
                  <BottomChatMessage
                    msg={msg}
                    isDM={isDM}
                    onDispute={onDispute}
                    aiNarrationText={msg.senderId === 'ai-dm' ? aiNarrationByTimestamp.get(msg.timestamp) : undefined}
                    onSpeakNarration={handleSpeakNarration}
                    onLinkClick={onLinkClick}
                    renderPreview={renderPreview}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* AI typing indicator */}
        {aiEnabled && aiIsTyping && (
          <div className="py-1">
            <div className="text-xs text-accent italic flex items-center gap-1">
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
              {/* PHASE-14 14D — file-read first (names the file, basename only; full path in title),
                  then cold-model load, then generic typing. */}
              {aiFileReadStatus?.status === 'reading' ? (
                <span title={aiFileReadStatus.path}>
                  {t('game.chatPanel.aiReadingFile', {
                    file: aiFileReadStatus.path.split(/[\\/]/).pop() ?? aiFileReadStatus.path
                  })}
                </span>
              ) : aiStreamStatus === 'loading_model' ? (
                t('game.chatPanel.aiLoadingModel')
              ) : (
                t('game.chatPanel.aiTyping')
              )}
            </div>
            {aiStreamingText && (
              <div className="text-sm text-gray-200 mt-0.5 max-h-20 overflow-hidden font-sans">
                {sanitizeStreamPreview(aiStreamingText).slice(-200)}
              </div>
            )}
          </div>
        )}

        {/* AI error display (dismiss + retry — PHASE-10 10E) */}
        {aiEnabled && aiLastError && !aiIsTyping && (
          <div className="py-1 text-xs text-red-400 italic flex items-center gap-2">
            <span className="flex-1">{t('game.chatPanel.aiError', { error: aiLastError })}</span>
            {canRetryAi && (
              <button
                type="button"
                onClick={handleRetryAi}
                className="not-italic text-red-300 hover:text-red-100 underline cursor-pointer"
              >
                {t('game.chatPanel.aiErrorRetry')}
              </button>
            )}
            <button
              type="button"
              onClick={aiClearLastError}
              aria-label={t('game.chatPanel.aiErrorDismiss')}
              className="not-italic text-red-300 hover:text-red-100 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* AI DM Status Bar (DM only) */}
      {isDM && aiEnabled && (
        <div className="flex items-center justify-between gap-2">
          <AiDmStatusBar
            isTyping={aiIsTyping}
            paused={aiPaused}
            usable={aiUsable}
            probeFailed={aiProbeFailed}
            provider={aiProvider}
            usedTokens={Math.ceil(aiMessages.reduce((sum, m) => sum + m.content.length, 0) / 4)}
            maxTokens={aiConversationBudget}
            onRecheck={aiRecheck}
            connection={aiConnectionStatus}
            contextTruncated={aiLastContextTruncated}
          />
          {/* PHASE-29 29D — mid-session model swap (disabled mid-stream). */}
          {campaign && <AiModelSwapPopover campaign={campaign} disabled={aiIsTyping} />}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-800 p-2 shrink-0 relative">
        {/* Autocomplete */}
        <CommandAutocomplete input={input} isDM={isDM} onSelect={handleAutocompleteSelect} visible={showAutocomplete} />

        <div className="flex gap-1">
          <input
            ref={inputRef}
            data-chat-input
            type="text"
            name="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (!showAutocomplete || input.includes(' '))) handleSend()
            }}
            placeholder={t('game.chatPanel.placeholder')}
            className="flex-1 px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-accent-strong text-white
              font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {t('game.chatPanel.send')}
          </button>
          {/* Help button */}
          <button
            onClick={() => onOpenModal?.('commandRef')}
            className="px-1.5 py-1.5 text-xs rounded-lg bg-surface-2 hover:bg-gray-700 text-muted hover:text-gray-200
              transition-colors cursor-pointer border border-border"
            title={t('game.chatPanel.commandReference')}
          >
            ?
          </button>
          {/* PHASE-32 32E — X-Card (opt-in; off by default ⇒ absent for existing campaigns). */}
          {campaign?.aiDm?.enabled && campaign?.sessionZero?.xCardEnabled && <XCardButton />}
          {!isDM && character && (
            <SkillRollButton character={character} playerName={playerName} onRoll={handleDiceRoll} />
          )}
        </div>
      </div>
    </div>
  )
}
