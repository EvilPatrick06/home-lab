// Network: client-manager
export const CONNECTION_TIMEOUT_MS = 15000
export const RECONNECT_DELAY_MS = 2000
export const MAX_RECONNECT_RETRIES = 5
export const BASE_RETRY_MS = 1000
export const MAX_RETRY_MS = 30_000

// Network: host-manager
export const MESSAGE_SIZE_LIMIT = 65536
export const FILE_SIZE_LIMIT = 8 * 1024 * 1024
export const MAX_DISPLAY_NAME_LENGTH = 32
export const RATE_LIMIT_WINDOW_MS = 1000
export const MAX_MESSAGES_PER_WINDOW = 10
export const MAX_RECONNECT_ATTEMPTS = 5
export const JOIN_TIMEOUT_MS = 10_000
export const KICK_DELAY_MS = 100

// Global rate limiting
export const MAX_GLOBAL_MESSAGES_PER_SECOND = 200

// Chat
export const MAX_CHAT_LENGTH = 2000

// IPC file size limits (canonical source: shared/constants.ts)
export { MAX_READ_FILE_SIZE, MAX_WRITE_CONTENT_SIZE } from '../../../shared/constants'

// UI: pages
export const LOADING_GRACE_PERIOD_MS = 4000
export const LOBBY_COPY_TIMEOUT_MS = 2000

// Peer: peer-manager
export const PEER_CREATION_TIMEOUT_MS = 15000
export const INVITE_CODE_LENGTH = 6

// Session persistence (player rejoin)
export const LAST_SESSION_KEY = 'dnd-vtt-last-session'
export const JOINED_SESSIONS_KEY = 'dnd-vtt-joined-sessions'
export const AUTO_REJOIN_KEY = 'dnd-vtt-auto-rejoin'
export const DISPLAY_NAME_KEY = 'dnd-vtt-display-name'

// Heartbeat
export const HEARTBEAT_INTERVAL_MS = 15_000
export const HEARTBEAT_TIMEOUT_MS = 45_000
export const HEARTBEAT_REMOVE_MS = 120_000

// Cloud ICE servers (fallback when Pi is unreachable)
export const CLOUD_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' }
]

// AI / Ollama
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
export const DEFAULT_AI_PROVIDER = 'ollama' as const
export const DEFAULT_AI_MODEL = 'llama3.1'

export const AI_PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama (Local)',
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)'
}

export const AI_PROVIDERS = ['ollama', 'claude', 'openai', 'gemini'] as const
