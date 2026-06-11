import { SETTINGS_KEYS } from './settings-keys'
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

// IPC file size limits + AI web-search approval timeout (canonical source: shared/constants.ts)
export { MAX_READ_FILE_SIZE, MAX_WRITE_CONTENT_SIZE, WEB_SEARCH_APPROVAL_TIMEOUT_MS } from '../../../shared/constants'

// UI: pages
export const LOADING_GRACE_PERIOD_MS = 4000
export const LOBBY_COPY_TIMEOUT_MS = 2000

// UI: desktop notifications (notification-service)
export const NOTIFICATION_AUTO_CLOSE_MS = 5000

// Lobby: how long a kicked peer stays visible (as 'disconnected') before removal
export const KICK_PLAYER_REMOVE_DELAY_MS = 1500

// AI DM store
// Auto-reject queued mutations the DM never acted on.
export const AI_MUTATIONS_AUTO_REJECT_MS = 60_000
// Cap on player messages queued behind an in-flight AI reply (multiplayer: player B chatting
// while the AI answers player A). Overflow is dropped with a DM alert rather than unbounded
// pileup on a slow local model. (PHASE-05 05F)
export const AI_MESSAGE_QUEUE_MAX = 5
// Safety timeout that force-clears a stuck "typing" stream. The handler fires
// at STREAM_SAFETY_TIMEOUT_MS and only acts if at least
// STREAM_SAFETY_THRESHOLD_MS has actually elapsed (guards against early wakeups).
// MUST stay ABOVE the main process's longest provider timeout — for Ollama that is
// OLLAMA_PREFILL_TIMEOUT_MS (300s, llm-provider.ts): a local model on CPU can spend
// minutes in prompt prefill before the first token, and the main process emits a
// 'loading_model' heartbeat throughout, so this backstop must NOT fire mid-prefill and
// mask a valid slow response. The main process delivers a specific prefill/inactivity
// timeout (and no longer retries it) at ~300s — before this generic backstop at 330s.
export const STREAM_SAFETY_TIMEOUT_MS = 330_000
export const STREAM_SAFETY_THRESHOLD_MS = 325_000

// AI DM scene bootstrap (use-game-effects)
// Brief wait for persisted messages to land before forcing a reload from disk.
export const SCENE_MESSAGE_WAIT_MS = 500
// Poll cadence while a scene is still streaming in.
export const SCENE_POLL_INTERVAL_MS = 1000
// Threshold for a one-time "still working" chat notice — NOT a poll kill switch (06E). The
// poll keeps running until ready/error/idle/unmount. Stays ABOVE the main process's
// OLLAMA_PREFILL_TIMEOUT_MS (300s) so the notice doesn't fire during a normal cold prefill.
export const SCENE_POLL_SLOW_NOTICE_MS = 330_000
// Fallback delay before kicking off scene generation when no prep happened.
export const SCENE_FALLBACK_DELAY_MS = 1500

// Peer: peer-manager
export const PEER_CREATION_TIMEOUT_MS = 15000
export const INVITE_CODE_LENGTH = 6

// Session persistence (player rejoin)
export const LAST_SESSION_KEY = SETTINGS_KEYS.LAST_SESSION
export const JOINED_SESSIONS_KEY = SETTINGS_KEYS.JOINED_SESSIONS
export const AUTO_REJOIN_KEY = SETTINGS_KEYS.AUTO_REJOIN
export const DISPLAY_NAME_KEY = SETTINGS_KEYS.DISPLAY_NAME

// Heartbeat — Phase 18a tightened timeouts so half-open WebRTC connections
// (where the channel reports `open` but data silently drops) recover faster.
// The host already pings every 5s (network/host-manager.ts PING_INTERVAL_MS)
// and 17f counts every peer message as liveness, so a healthy peer's
// heartbeat refreshes well within 30s; a peer that's truly silent for 30s
// is now flagged as disconnected, and force-removed at 60s so the client's
// auto-reconnect path kicks in instead of the user waiting 2 minutes.
// Previous values: 45_000 / 120_000.
export const HEARTBEAT_INTERVAL_MS = 15_000
export const HEARTBEAT_TIMEOUT_MS = 30_000
export const HEARTBEAT_REMOVE_MS = 60_000

// Cloud ICE servers (fallback when Pi is unreachable)
export const CLOUD_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' }
]

// Game-state auto-save (io/game-auto-save)
// Debounce window before a store change is persisted.
export const GAME_AUTO_SAVE_DEBOUNCE_MS = 5000
// Re-run delay when a save completes while another was queued.
export const GAME_AUTO_SAVE_REQUEUE_MS = 250
// flushAutoSave() spinlock: poll cadence + max retries while a save is in flight.
export const GAME_AUTO_SAVE_FLUSH_POLL_MS = 100
export const GAME_AUTO_SAVE_FLUSH_MAX_RETRIES = 20

// AI / Ollama
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
export const DEFAULT_AI_PROVIDER = 'ollama' as const
// Must match a curated/installable model id (see main/ai/ollama-manager.ts). The
// recommended lightweight default; bare 'llama3.1' was NOT installable (curated
// has 'llama3.1:8b'/'llama3.1:70b'), so wizards saved a model that 404'd on use.
export const DEFAULT_AI_MODEL = 'llama3.2:3b'

export const AI_PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama (Local)',
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)'
}

export const AI_PROVIDERS = ['ollama', 'claude', 'openai', 'gemini'] as const
