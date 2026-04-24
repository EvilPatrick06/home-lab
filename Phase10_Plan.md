# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 10 of the D&D VTT project.

Phase 10 covers the **Lobby System** — session creation/joining, invite codes, player readiness, and lobby-to-game transitions. The audit scored it **8.5/10** and described it as "production-ready." The architecture is clean (Zustand slices, bridge pattern for network/UI separation, PeerJS P2P). The work here is **hardening edge cases**: race conditions, timing dependencies, connection visibility, and minor validation gaps.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 10 is entirely client-side. No Raspberry Pi involvement.

**Core Lobby Components:**

| File | Lines | Role |
|------|-------|------|
| `src/renderer/src/pages/LobbyPage.tsx` | 302 | Main lobby page — AI DM prep, connection status, navigation |
| `src/renderer/src/stores/use-lobby-store.ts` | 462 | Lobby state — players, chat, readiness, dice colors |
| `src/renderer/src/components/lobby/ReadyButton.tsx` | 87 | Ready toggle + "Start Game" button — **no mutex on game start** |
| `src/renderer/src/components/lobby/PlayerList.tsx` | 130 | Player roster with moderation |
| `src/renderer/src/components/lobby/PlayerCard.tsx` | 229 | Player display with status indicators |
| `src/renderer/src/components/lobby/LobbyLayout.tsx` | 60 | Layout container |
| `src/renderer/src/components/lobby/CharacterSelector.tsx` | ~120 | Character selection — **no campaign validation** |
| `src/renderer/src/pages/lobby/use-lobby-bridges.ts` | 264 | Network → lobby store bridge |

**Network Layer:**

| File | Lines | Role |
|------|-------|------|
| `src/renderer/src/network/host-manager.ts` | 342 | Host PeerJS init, heartbeat (5s), invite code generation |
| `src/renderer/src/network/client-manager.ts` | 295 | Client connection, exponential backoff reconnection |
| `src/renderer/src/stores/network-store/index.ts` | 334 | Network state management |
| `src/renderer/src/stores/network-store/host-handlers.ts` | 446 | Host message processing — readiness broadcast (line 66) |
| `src/renderer/src/stores/network-store/client-handlers.ts` | 867 | Client message processing — pong/latency (lines 410-415) |
| `src/renderer/src/network/host-message-handlers.ts` | 122 | Host message validation, invite code check (lines 64-68) |

**Join Flow:**

| File | Role |
|------|------|
| `src/renderer/src/pages/JoinGamePage.tsx` | Join page — auto-rejoin, invite code input, 15s timeout (lines 103-114) |
| `src/renderer/src/pages/InGamePage.tsx` | Game page — campaign loading effect (lines 82-119) |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives & Corrections

### HIGH PRIORITY

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| H1 | No mutex on "Start Game" — multiple clicks send duplicate `dm:game-start` messages | `ReadyButton.tsx` lines 29-39 | Clients receive conflicting/duplicate game start messages |
| H2 | AI DM scene prep doesn't block game start — game can start with incomplete AI scene | `LobbyPage.tsx` lines 32-60 | AI DM may not be ready when game begins |
| H3 | Latency tracked (`latencyMs`) but not displayed to users | `client-handlers.ts` lines 410-415 | Users can't detect poor connections |
| H4 | No validation that selected character belongs to current campaign | `CharacterSelector.tsx` lines 40-45 | Players can select characters from other campaigns |

### MEDIUM PRIORITY

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| M1 | `resetLobby()` on any disconnection loses chat history | `LobbyPage.tsx` line 68 | Temporary disconnect = lost chat |
| M2 | No grace period before removing disconnected players | `use-lobby-bridges.ts` | Brief network hiccup = kicked |
| M3 | Player color assignment doesn't prevent duplicates on simultaneous join | `use-lobby-store.ts` lines 187-192 | Two players get same color |
| M4 | No client-side invite code format validation | `JoinGamePage.tsx` | Bad UX for invalid codes |
| M5 | No validation all clients received campaign data before navigation | `ReadyButton.tsx` game start flow | Client may navigate without campaign |

### LOW PRIORITY

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| L1 | Ready buttons lack `aria-label` | `ReadyButton.tsx` | Screen reader accessibility |
| L2 | No screen reader announcements for player joins/leaves | `PlayerList.tsx` | Accessibility |
| L3 | Chat timeout is fixed 5 minutes, no duration selection | Moderation UI | Minor UX |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Game Start Mutex (H1)

**Step 1 — Prevent Multiple Game Starts**
- Open `src/renderer/src/components/lobby/ReadyButton.tsx`
- Add a `gameStarting` state to prevent re-clicks:
  ```typescript
  const [gameStarting, setGameStarting] = useState(false)

  const handleStartGame = (): void => {
    if (gameStarting) return
    setGameStarting(true)
    sendMessage('dm:game-start', { campaignId, campaign })
    navigate(`/game/${campaign.id}`)
  }
  ```
- Disable the "Start Game" button while `gameStarting` is true
- Also disable if the button was clicked within the last 2 seconds (debounce guard)

### Sub-Phase B: AI DM Scene Blocking (H2)

**Step 2 — Block Game Start Until AI Scene Ready**
- Open `src/renderer/src/pages/LobbyPage.tsx`
- Find the AI DM scene preparation status (lines 32-60)
- Pass `sceneStatus` to `ReadyButton` as a prop
- In `ReadyButton`, disable "Start Game" when `sceneStatus !== 'ready'` AND AI DM is enabled:
  ```typescript
  const canStartGame = allPlayersReady && (!aiDmEnabled || sceneStatus === 'ready')
  ```
- Show a tooltip or status text: "Waiting for AI DM to prepare scene..."
- Add a "Start Anyway" override button for DMs who want to skip the wait (shown after 10 seconds of waiting)

### Sub-Phase C: Connection Quality Display (H3)

**Step 3 — Display Latency in Player Cards**
- Open `src/renderer/src/components/lobby/PlayerCard.tsx`
- Add a latency indicator showing the ping value:
  ```tsx
  {player.latencyMs != null && (
    <span className={`text-xs ${
      player.latencyMs < 100 ? 'text-green-400' :
      player.latencyMs < 250 ? 'text-yellow-400' :
      'text-red-400'
    }`}>
      {player.latencyMs}ms
    </span>
  )}
  ```
- Color coding: green (<100ms), yellow (100-250ms), red (>250ms)

**Step 4 — Display Connection Quality in Header**
- Open `src/renderer/src/pages/LobbyPage.tsx`
- In the connection status header (lines 212-223), add a latency display for clients:
  ```tsx
  {isClient && latencyMs != null && (
    <span className="text-xs text-gray-400">Ping: {latencyMs}ms</span>
  )}
  ```

### Sub-Phase D: Character Campaign Validation (H4)

**Step 5 — Validate Character Belongs to Campaign**
- Open `src/renderer/src/components/lobby/CharacterSelector.tsx`
- In `handleSelect` (lines 40-45), add validation:
  ```typescript
  const handleSelect = (character: Character5e) => {
    // If campaign has a player list with character restrictions, validate
    if (campaign?.id && character.campaignId && character.campaignId !== campaign.id) {
      // Show warning: "This character is from a different campaign"
      // Allow selection but warn
    }
    // ... existing selection logic
  }
  ```
- If characters don't have a `campaignId` field, add campaign-awareness by filtering the character list to show campaign-associated characters first, then "Other Characters" in a separate section

### Sub-Phase E: Connection Resilience (M1, M2)

**Step 6 — Smart Lobby Reset (Only on Intentional Disconnect)**
- Open `src/renderer/src/pages/LobbyPage.tsx`
- Find `resetLobby()` call on disconnection (line 68)
- Differentiate between intentional and unintentional disconnects:
  ```typescript
  const handleDisconnect = (reason: string) => {
    if (reason === 'kicked' || reason === 'banned' || reason === 'host-closed') {
      resetLobby()  // Full reset for intentional disconnects
    } else {
      // Temporary disconnect — keep chat, show reconnecting UI
      setReconnecting(true)
    }
  }
  ```
- Preserve chat history during reconnection attempts

**Step 7 — Add Grace Period for Disconnected Players**
- Open `src/renderer/src/pages/lobby/use-lobby-bridges.ts`
- Instead of immediately removing a disconnected player, start a grace timer:
  ```typescript
  const handlePeerDisconnect = (peerId: string) => {
    // Mark player as "reconnecting" instead of removing
    lobbyStore.setPlayerStatus(peerId, 'reconnecting')
    
    // Set 15-second grace period
    setTimeout(() => {
      const player = lobbyStore.getPlayer(peerId)
      if (player?.status === 'reconnecting') {
        lobbyStore.removePlayer(peerId)
        broadcastSystemMessage(`${player.displayName} disconnected.`)
      }
    }, 15000)
  }
  ```
- Add a `status: 'connected' | 'reconnecting' | 'disconnected'` field to `LobbyPlayer`
- Show "Reconnecting..." indicator on the PlayerCard for grace period players

### Sub-Phase F: Player Color Deduplication (M3)

**Step 8 — Prevent Duplicate Colors**
- Open `src/renderer/src/stores/use-lobby-store.ts`
- Find `addPlayer` (lines 187-192) where colors are assigned
- Check existing player colors and assign the next unused color:
  ```typescript
  const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e91e63']

  const assignColor = (players: LobbyPlayer[]): string => {
    const usedColors = new Set(players.map(p => p.color))
    return PLAYER_COLORS.find(c => !usedColors.has(c)) ?? PLAYER_COLORS[players.length % PLAYER_COLORS.length]
  }
  ```

### Sub-Phase G: Input Validation (M4)

**Step 9 — Add Invite Code Format Validation**
- Open `src/renderer/src/pages/JoinGamePage.tsx`
- Add client-side validation before attempting connection:
  ```typescript
  const isValidInviteCode = (code: string): boolean => {
    const cleaned = code.trim().toUpperCase()
    return cleaned.length === 8 && /^[A-Z0-9]+$/.test(cleaned)
  }
  ```
- Disable "Join" button when code is invalid
- Show inline validation message: "Invite code must be 8 characters"

### Sub-Phase H: Game Start Confirmation (M5)

**Step 10 — Confirm All Clients Received Campaign Data**
- After the host sends `dm:game-start`, wait for acknowledgments from all clients before navigating:
  ```typescript
  const handleStartGame = async (): void => {
    if (gameStarting) return
    setGameStarting(true)
    
    // Send game-start to all clients
    sendMessage('dm:game-start', { campaignId, campaign })
    
    // Wait for all clients to acknowledge (max 5 seconds)
    const acked = await waitForAcknowledgments(connectedPeerIds, 5000)
    
    if (!acked) {
      // Some clients didn't acknowledge — show warning but proceed
      console.warn('Not all clients acknowledged game start')
    }
    
    navigate(`/game/${campaign.id}`)
  }
  ```
- On the client side, add a `dm:game-start-ack` response after receiving and processing the campaign data
- This is a best-effort mechanism — proceed after timeout even without full acknowledgment

### Sub-Phase I: Accessibility (L1, L2)

**Step 11 — Add ARIA Labels**
- Open `src/renderer/src/components/lobby/ReadyButton.tsx`
- Add `aria-label` to ready toggle and start game buttons:
  ```tsx
  <button aria-label={isReady ? "Mark as not ready" : "Mark as ready"} ...>
  <button aria-label="Start game session" disabled={!canStartGame} ...>
  ```

**Step 12 — Add Screen Reader Announcements**
- Open `src/renderer/src/components/lobby/PlayerList.tsx`
- Add `aria-live="polite"` region for player join/leave announcements:
  ```tsx
  <div aria-live="polite" className="sr-only">
    {announcements.map(a => <span key={a.id}>{a.text}</span>)}
  </div>
  ```
- When a player joins: announce "PlayerName has joined the lobby"
- When a player leaves: announce "PlayerName has left the lobby"
- When readiness changes: announce "PlayerName is ready" / "PlayerName is no longer ready"

---

## ⚠️ Constraints & Edge Cases

### Game Start Mutex
- **The `gameStarting` state must be in the component, not the store** — if it were in the store and the store synced across instances, it could prevent legitimate starts. Keep it local.
- **Navigation happens immediately for the host** after sending the message. This is correct — the host is also a peer and can self-navigate.
- **Do NOT add a server-side lock** — there is no server. This is P2P. The host IS the authority.

### AI DM Scene Blocking
- **The "Start Anyway" override is important** — if the AI service is down or slow, the DM should not be permanently blocked from starting.
- **Scene preparation may run indefinitely** if the AI provider is misconfigured. The timeout/override prevents this from being a blocker.

### Connection Grace Period
- **15 seconds is a reasonable grace** for WebRTC peer reconnection. PeerJS reconnection with exponential backoff typically takes 3-10 seconds for a temporary network hiccup.
- **During grace period, the player's spot must be held** — don't allow a new player to take the slot or color.
- **If the player reconnects during grace, cancel the removal timer** and restore their status to 'connected'.

### Character Validation
- **Characters may not have a `campaignId` field** — many characters are generic. The validation should be a soft warning, not a hard block. Players should be able to bring any character to any campaign.
- **Don't modify the Character5e type** for this — use the campaign's player list or session history to determine expected characters.

### Color Assignment
- **The host assigns colors** — in P2P, the host is authoritative for player state. Color assignment should happen in the host handler when a player joins, not in the client's local store.
- **Verify the color assignment happens in the host handler**, not just the local `addPlayer`. If it's local-only, simultaneous joins can still collide.

Begin implementation now. Start with Sub-Phase A (Step 1) for the game start mutex — this is a one-line fix with high impact. Then Sub-Phase B (Step 2) for AI scene blocking, and Sub-Phase E (Steps 6-7) for connection resilience. These are the highest-value improvements for the smallest code changes.
