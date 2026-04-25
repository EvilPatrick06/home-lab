import { useVirtualizer } from '@tanstack/react-virtual'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addToast } from '../../../hooks/use-toast'
import { speakNarrationThroughBmo } from '../../../services/bmo-narration'
import { type CommandContext, executeCommand } from '../../../services/chat-commands'
import { lookupContent } from '../../../services/library/content-index'
import { useAiDmStore } from '../../../stores/use-ai-dm-store'
import type { ChatMessage } from '../../../stores/use-lobby-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/network-store'
import type { Campaign } from '../../../types/campaign'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { LibraryCategory } from '../../../types/library'
import { renderChatContent } from '../../../utils/chat-links'
import { trigger3dDice } from '../dice3d'
import DiceResult from '../dice3d/DiceResult'
import SkillRollButton from '../player/SkillRollButton'
import CommandAutocomplete from './CommandAutocomplete'

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
          <span className="text-[10px] font-semibold text-amber-400 block mb-0.5">Dungeon Master</span>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {isDM && aiNarrationText && onSpeakNarration && (
              <button
                onClick={() => onSpeakNarration(aiNarrationText)}
                className="text-[9px] text-gray-600 hover:text-amber-400 cursor-pointer"
                title="Speak this narration through BMO"
              >
                Speak
              </button>
            )}
            {isDM && onDispute && (
              <button
                onClick={() => onDispute(msg.content)}
                className="text-[9px] text-gray-600 hover:text-amber-400 cursor-pointer"
                title="Dispute this ruling"
              >
                Dispute
              </button>
            )}
          </div>
        </div>
        <span className="text-sm text-gray-100 font-sans">{msg.content}</span>
      </div>
    )
  }
  if (msg.isSystem) {
    return (
      <div className="text-sm text-gray-400 text-center py-0.5 font-sans">
        {renderChatContent(msg.content, onLinkClick, renderPreview)}
      </div>
    )
  }
  return (
    <div className="py-0.5">
      <span className="text-xs font-medium font-sans" style={{ color: msg.senderColor || '#9CA3AF' }}>
        {msg.senderName}:
      </span>
      <span className="text-sm text-gray-100 ml-1 font-sans">
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
  campaign: _campaign,
  character,
  collapsed,
  onOpenModal,
  onDispute,
  onLinkClick
}: ChatPanelProps): JSX.Element {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const chatMessages = useLobbyStore((s) => s.chatMessages)
  const sendChat = useLobbyStore((s) => s.sendChat)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const aiIsTyping = useAiDmStore((s) => s.isTyping)
  const aiStreamingText = useAiDmStore((s) => s.streamingText)
  const aiEnabled = useAiDmStore((s) => s.enabled)
  const aiLastError = useAiDmStore((s) => s.lastError)
  const aiMessages = useAiDmStore((s) => s.messages)

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

  const addSysMsg = (content: string): void => {
    addChatMessage({
      id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'system',
      senderName: 'System',
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
        addErrorMessage: (err) => addSysMsg(`Error: ${err}`),
        openModal: onOpenModal
      }

      const result = executeCommand(trimmed, ctx)
      if (result) {
        if (result.error) {
          addSysMsg(`Error: ${result.error}`)
        }
        setInput('')
        return
      }
    }

    // Regular chat message
    sendChat(trimmed)
    sendMessage('chat:message', {
      message: trimmed,
      isSystem: false,
      isDiceRoll: false
    })
    setInput('')
  }

  const handleDiceRoll = (result: { formula: string; total: number; rolls: number[] }): void => {
    const msg = {
      id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: localPeerId || 'local',
      senderName: playerName,
      content: `rolled ${result.formula}`,
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

  const renderPreview = useCallback((category: LibraryCategory, name: string): React.ReactNode | null => {
    const ref = lookupContent(name)
    if (!ref) return null
    // Compact preview card
    return React.createElement(
      'div',
      {
        className: 'bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs'
      },
      React.createElement('div', { className: 'font-bold text-amber-400 mb-1' }, ref.name),
      React.createElement('div', { className: 'text-gray-400 capitalize' }, ref.category.replace(/-/g, ' '))
    )
  }, [])

  const handleSpeakNarration = async (text: string): Promise<void> => {
    const result = await speakNarrationThroughBmo(text)
    if (!result.success) {
      addToast(result.error ?? 'Failed to send narration to BMO', 'error')
    }
  }

  if (collapsed) {
    return (
      <div className="flex items-center gap-1 w-full">
        <input
          ref={inputRef}
          data-chat-input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend()
          }}
          placeholder="Type a message or /command..."
          className="flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
            placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-2.5 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white
            font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Send
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 min-h-0" aria-live="polite">
        {chatMessages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No messages yet</p>
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
            <div className="text-xs text-amber-400 italic flex items-center gap-1">
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span
                  className="w-1 h-1 bg-amber-400 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-1 h-1 bg-amber-400 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
              AI DM is typing...
            </div>
            {aiStreamingText && (
              <div className="text-sm text-gray-200 mt-0.5 max-h-20 overflow-hidden font-sans">
                {aiStreamingText.slice(-200)}
              </div>
            )}
          </div>
        )}

        {/* AI error display */}
        {aiEnabled && aiLastError && !aiIsTyping && (
          <div className="py-1 text-xs text-red-400 italic">AI DM error: {aiLastError}</div>
        )}
      </div>

      {/* AI DM Status Bar (DM only) */}
      {isDM && aiEnabled && (
        <div className="border-t border-gray-800/50 px-2 py-1 shrink-0 flex items-center gap-2 text-[10px]">
          <span className={`w-1.5 h-1.5 rounded-full ${aiIsTyping ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`} />
          <span className="text-gray-500">AI {aiIsTyping ? 'responding' : 'ready'}</span>
          <span className="text-gray-600 ml-auto" title="Estimated conversation tokens">
            ~{Math.ceil(aiMessages.reduce((sum, m) => sum + m.content.length, 0) / 4).toLocaleString()} / 23,000 tokens
          </span>
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (!showAutocomplete || input.includes(' '))) handleSend()
            }}
            placeholder="Type a message or /command..."
            className="flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white
              font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Send
          </button>
          {/* Help button */}
          <button
            onClick={() => onOpenModal?.('commandRef')}
            className="px-1.5 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200
              transition-colors cursor-pointer border border-gray-700"
            title="Command reference"
          >
            ?
          </button>
          {!isDM && character && (
            <SkillRollButton character={character} playerName={playerName} onRoll={handleDiceRoll} />
          )}
        </div>
      </div>
    </div>
  )
}
