import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { ChatFilePayload } from '../../network'
import { isModerationEnabled, setModerationEnabled } from '../../network'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ACCEPTED_FILES = '.png,.jpg,.jpeg,.gif,.webp,.dndchar,.dndcamp'

function generateFileMessageId(): string {
  return `file-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

export default function ChatInput(): JSX.Element {
  const [value, setValue] = useState('')
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [muteRemaining, setMuteRemaining] = useState(0)
  const lastMessageTimeRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const muteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const sendChat = useLobbyStore((s) => s.sendChat)
  const slowModeSeconds = useLobbyStore((s) => s.slowModeSeconds)
  const isHost = useLobbyStore((s) => s.isHost)
  const setSlowMode = useLobbyStore((s) => s.setSlowMode)
  const fileSharingEnabled = useLobbyStore((s) => s.fileSharingEnabled)
  const setFileSharingEnabled = useLobbyStore((s) => s.setFileSharingEnabled)
  const chatMutedUntil = useLobbyStore((s) => s.chatMutedUntil)
  const setChatMutedUntil = useLobbyStore((s) => s.setChatMutedUntil)
  const [moderationOn, setModerationOn] = useState(() => isModerationEnabled())
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const displayName = useNetworkStore((s) => s.displayName)
  const localPeerId = useNetworkStore((s) => s.localPeerId)

  // Update cooldown timer
  useEffect(() => {
    if (slowModeSeconds > 0 && cooldownRemaining > 0) {
      cooldownTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - lastMessageTimeRef.current
        const remaining = Math.max(0, slowModeSeconds * 1000 - elapsed)
        setCooldownRemaining(Math.ceil(remaining / 1000))
        if (remaining <= 0 && cooldownTimerRef.current) {
          clearInterval(cooldownTimerRef.current)
          cooldownTimerRef.current = null
        }
      }, 200)
    }
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
        cooldownTimerRef.current = null
      }
    }
  }, [cooldownRemaining, slowModeSeconds])

  // Chat mute countdown timer
  useEffect(() => {
    if (!chatMutedUntil) {
      setMuteRemaining(0)
      return
    }

    const updateRemaining = (): void => {
      const remaining = Math.max(0, chatMutedUntil - Date.now())
      const seconds = Math.ceil(remaining / 1000)
      setMuteRemaining(seconds)
      if (remaining <= 0) {
        setChatMutedUntil(null)
        if (muteTimerRef.current) {
          clearInterval(muteTimerRef.current)
          muteTimerRef.current = null
        }
      }
    }

    updateRemaining()
    muteTimerRef.current = setInterval(updateRemaining, 500)

    return () => {
      if (muteTimerRef.current) {
        clearInterval(muteTimerRef.current)
        muteTimerRef.current = null
      }
    }
  }, [chatMutedUntil, setChatMutedUntil])

  // DM/host is exempt from slow mode cooldown
  const isOnCooldown = !isHost && slowModeSeconds > 0 && cooldownRemaining > 0
  const isChatMuted = muteRemaining > 0
  const isInputDisabled = isOnCooldown || isChatMuted

  const handleSend = (): void => {
    if (!value.trim()) return
    if (isInputDisabled) return

    sendChat(value)
    setValue('')

    // Start slow mode cooldown (DM is exempt)
    if (slowModeSeconds > 0 && !isHost) {
      lastMessageTimeRef.current = Date.now()
      setCooldownRemaining(slowModeSeconds)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return

    const isImage = file.type.startsWith('image/')
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE

    if (file.size > maxSize) {
      useLobbyStore.getState().addChatMessage({
        id: generateFileMessageId(),
        senderId: 'system',
        senderName: 'System',
        content: `File too large. Max size: ${isImage ? '5MB' : '2MB'} for ${isImage ? 'images' : 'files'}.`,
        timestamp: Date.now(),
        isSystem: true
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      const mimeType = isImage ? file.type : 'application/octet-stream'
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const fileType = isImage ? 'image' : ext === 'dndchar' ? 'character' : ext === 'dndcamp' ? 'campaign' : 'file'

      // Add to local chat
      const localPlayer = useLobbyStore.getState().players.find((p) => p.peerId === localPeerId)
      useLobbyStore.getState().addChatMessage({
        id: generateFileMessageId(),
        senderId: 'local',
        senderName: 'You',
        content: `shared a file: ${file.name}`,
        timestamp: Date.now(),
        isSystem: false,
        senderColor: localPlayer?.color,
        isFile: true,
        fileName: file.name,
        fileType,
        fileData: base64,
        mimeType
      })

      // Send over network
      const filePayload: ChatFilePayload = {
        fileName: file.name,
        fileType,
        fileData: base64,
        mimeType,
        senderId: localPeerId || '',
        senderName: displayName
      }
      sendMessage('chat:file', filePayload)
    }
    reader.readAsDataURL(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="border-t border-gray-800">
      {/* DM slow mode controls */}
      {isHost && (
        <div className="flex items-center gap-2 px-3 pt-2 flex-wrap">
          <span className="text-xs text-gray-500">Slow mode:</span>
          {[0, 5, 10, 30, 60].map((sec) => (
            <button
              key={sec}
              onClick={() => {
                setSlowMode(sec)
                sendMessage('dm:slow-mode', { seconds: sec })
                useLobbyStore.getState().addChatMessage({
                  id: `sys-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                  senderId: 'system',
                  senderName: 'System',
                  content: sec === 0 ? 'Slow mode disabled.' : `Slow mode enabled: ${sec} seconds.`,
                  timestamp: Date.now(),
                  isSystem: true
                })
              }}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                slowModeSeconds === sec ? 'bg-amber-600/30 text-amber-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {sec === 0 ? 'Off' : `${sec}s`}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <span className="text-xs text-gray-500">Files:</span>
          <button
            onClick={() => {
              const newVal = !fileSharingEnabled
              setFileSharingEnabled(newVal)
              sendMessage('dm:file-sharing', { enabled: newVal })
              useLobbyStore.getState().addChatMessage({
                id: `sys-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: newVal ? 'File sharing enabled.' : 'File sharing disabled.',
                timestamp: Date.now(),
                isSystem: true
              })
            }}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              fileSharingEnabled ? 'bg-amber-600/30 text-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {fileSharingEnabled ? 'On' : 'Off'}
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <span className="text-xs text-gray-500">Auto-mod:</span>
          <button
            onClick={() => {
              const newVal = !moderationOn
              setModerationEnabled(newVal)
              setModerationOn(newVal)
              useLobbyStore.getState().addChatMessage({
                id: `sys-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: newVal ? 'Auto-moderation enabled.' : 'Auto-moderation disabled.',
                timestamp: Date.now(),
                isSystem: true
              })
            }}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              moderationOn ? 'bg-amber-600/30 text-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {moderationOn ? 'On' : 'Off'}
          </button>
        </div>
      )}

      <div className="flex gap-2 p-3">
        {/* File attach button — shown when file sharing is enabled or user is DM */}
        {(fileSharingEnabled || isHost) && (
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            className="p-2 rounded-lg text-gray-500 hover:text-amber-400 hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path
                fillRule="evenodd"
                d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.52 9.52l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.451a1.125 1.125 0 0 0 1.587 1.595l3.454-3.553a3 3 0 0 0 0-4.242Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
        <input ref={fileInputRef} type="file" accept={ACCEPTED_FILES} onChange={handleFileSelect} className="hidden" />

        <input
          type="text"
          data-chat-input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isChatMuted
              ? `Muted for ${muteRemaining}s...`
              : isOnCooldown
                ? `Slow mode (${cooldownRemaining}s)...`
                : 'Type a message or /roll 1d20...'
          }
          disabled={isInputDisabled}
          className={`flex-1 px-3 py-2 rounded-lg bg-gray-800 border text-gray-100
                     placeholder-gray-600 focus:border-amber-500 focus:outline-none
                     transition-colors text-sm disabled:opacity-50 ${
                       isChatMuted ? 'border-red-700/50' : 'border-gray-700'
                     }`}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || isInputDisabled}
          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium
                     text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isChatMuted ? `${muteRemaining}s` : isOnCooldown ? `${cooldownRemaining}s` : 'Send'}
        </button>
      </div>
    </div>
  )
}
