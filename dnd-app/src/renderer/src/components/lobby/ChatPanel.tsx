import { useVirtualizer } from '@tanstack/react-virtual'
import { memo, useEffect, useRef } from 'react'
import { type ChatMessage, useLobbyStore } from '../../stores/use-lobby-store'
import { ChatInput } from '.'

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const FileAttachment = memo(function FileAttachment({ msg }: { msg: ChatMessage }): JSX.Element {
  const isImage = msg.mimeType?.startsWith('image/')

  if (isImage && msg.fileData && msg.mimeType) {
    return (
      <div className="ml-14 mt-1">
        <img
          src={`data:${msg.mimeType};base64,${msg.fileData}`}
          alt={msg.fileName || 'Shared image'}
          className="max-w-[300px] max-h-[200px] rounded-lg border border-gray-700 object-contain"
        />
        <p className="text-xs text-gray-500 mt-0.5">{msg.fileName}</p>
      </div>
    )
  }

  // Non-image file (character/campaign export)
  const handleDownload = (): void => {
    if (!msg.fileData || !msg.fileName) return
    const binary = atob(msg.fileData)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: msg.mimeType || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = msg.fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const fileIcon = msg.fileType === 'character' ? 'Character' : msg.fileType === 'campaign' ? 'Campaign' : 'File'

  return (
    <div className="ml-14 mt-1">
      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700
                   hover:border-amber-600/50 transition-colors cursor-pointer group"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 text-amber-400"
        >
          <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
        </svg>
        <div className="text-left">
          <p className="text-sm text-gray-200 group-hover:text-amber-300">{msg.fileName}</p>
          <p className="text-xs text-gray-500">{fileIcon} file</p>
        </div>
      </button>
    </div>
  )
})

const MessageBubble = memo(function MessageBubble({ msg }: { msg: ChatMessage }): JSX.Element {
  // System messages
  if (msg.isSystem) {
    return (
      <div className="px-4 py-1.5">
        <p className="text-xs text-gray-500 italic text-center">
          <span className="text-gray-600">{formatTime(msg.timestamp)}</span>
          {' — '}
          {msg.content}
        </p>
      </div>
    )
  }

  // Dice roll messages
  if (msg.isDiceRoll && msg.diceResult) {
    const { formula, total, rolls } = msg.diceResult
    return (
      <div className="px-4 py-2">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs text-gray-600">{formatTime(msg.timestamp)}</span>
          <span
            className="text-sm font-semibold"
            style={{ color: msg.senderColor || (msg.senderId === 'local' ? '#FBBF24' : '#60A5FA') }}
          >
            {msg.senderName}
          </span>
          <span className="text-xs text-gray-500">{msg.content}</span>
        </div>
        <div className="ml-14 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 inline-block">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {rolls.map((roll, i) => (
                <span
                  key={i}
                  className="inline-flex items-center justify-center w-7 h-7 rounded bg-gray-700
                             text-sm font-mono font-bold text-gray-200"
                >
                  {roll}
                </span>
              ))}
              {formula.includes('+') && <span className="text-sm text-gray-400 ml-1">+{formula.split('+')[1]}</span>}
              {formula.includes('-') && (
                <span className="text-sm text-gray-400 ml-1">{formula.slice(formula.indexOf('-'))}</span>
              )}
            </div>
            <span className="text-gray-500 text-sm">&rarr;</span>
            <span className="text-sm font-semibold text-amber-400">{total}</span>
          </div>
        </div>
      </div>
    )
  }

  // File messages
  if (msg.isFile) {
    const isLocal = msg.senderId === 'local'
    return (
      <div className="px-4 py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-gray-600">{formatTime(msg.timestamp)}</span>
          <span
            className="text-sm font-semibold"
            style={{ color: msg.senderColor || (isLocal ? '#FBBF24' : '#60A5FA') }}
          >
            {msg.senderName}
          </span>
          <span className="text-xs text-gray-500">shared a file</span>
        </div>
        <FileAttachment msg={msg} />
      </div>
    )
  }

  // Normal chat messages
  const isLocal = msg.senderId === 'local'
  const isWhisper = msg.content.startsWith('[Whisper')

  return (
    <div className="px-4 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-gray-600">{formatTime(msg.timestamp)}</span>
        <span className="text-sm font-semibold" style={{ color: msg.senderColor || (isLocal ? '#FBBF24' : '#60A5FA') }}>
          {msg.senderName}
        </span>
      </div>
      <p className={`text-sm ml-14 ${isWhisper ? 'text-purple-300 italic' : 'text-gray-300'}`}>{msg.content}</p>
    </div>
  )
})

export default function ChatPanel(): JSX.Element {
  const chatMessages = useLobbyStore((s) => s.chatMessages)
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: chatMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10
  })

  useEffect(() => {
    if (chatMessages.length > 0) {
      virtualizer.scrollToIndex(chatMessages.length - 1, { align: 'end' })
    }
  }, [chatMessages.length, virtualizer])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Chat</h2>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto py-2" aria-live="polite">
        {chatMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-600">No messages yet. Say hello!</p>
          </div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const msg = chatMessages[virtualItem.index]
              return (
                <div
                  key={msg.id}
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
                  <MessageBubble msg={msg} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ChatInput />
    </div>
  )
}
