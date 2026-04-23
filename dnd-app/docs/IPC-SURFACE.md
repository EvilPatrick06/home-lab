# IPC Surface — dnd-app

Electron IPC channels between main and renderer processes.

Phase22 audit flagged that these weren't documented. This doc fills that gap. **Keep this doc in sync when adding new IPC handlers.**

## Where channels are defined

- **Channel names:** `src/shared/ipc-channels.ts`
- **Zod schemas:** `src/shared/ipc-schemas.ts`
- **Main process handlers:** `src/main/ipc/*-handlers.ts`
- **Renderer consumers:** `src/renderer/src/services/*`
- **Preload exposed API:** `src/preload/index.ts` + `src/preload/index.d.ts`

## How IPC works here

```
Renderer (React) ──window.api.X()──► Preload ──ipcRenderer.invoke──► Main handler
                                                                        │
                ◄──────────────────────────────────────────── response ─┘
```

Preload's `window.api` object is the only way renderer talks to main. Defined in `src/preload/index.ts`, typed in `index.d.ts`.

## Handler modules

### AI (`src/main/ipc/ai-handlers.ts`)

| Channel | Request | Response | Purpose |
|---|---|---|---|
| `ai:generate` | `{ prompt, model, systemPrompt? }` | `{ text, tokensUsed }` | One-shot completion |
| `ai:stream-start` | `{ prompt, model, systemPrompt?, conversationId? }` | `{ streamId }` | Start streaming chat |
| `ai:stream-cancel` | `{ streamId }` | `{ ok }` | Cancel in-flight stream |
| `ai:approve-web-search` | `{ streamId, approved }` | `{ ok }` | Human-in-loop tool call approval |
| `ai:vision` | `{ imageBase64, prompt }` | `{ description }` | Image understanding |

Emits events to renderer:
- `ai:stream-delta` — `{ streamId, textDelta }`
- `ai:stream-done` — `{ streamId, final }`
- `ai:stream-error` — `{ streamId, error }`

### Audio (`src/main/ipc/audio-handlers.ts`)

| Channel | Request | Response | Purpose |
|---|---|---|---|
| `audio:play-sound` | `{ url }` | `{ ok }` | Play a sound file |
| `audio:stop-all` | — | `{ ok }` | Stop all playback |
| `audio:set-volume` | `{ volume }` (0-1) | `{ ok }` | Master volume |

### Game data (`src/main/ipc/game-data-handlers.ts`)

| Channel | Request | Response | Purpose |
|---|---|---|---|
| `game-data:load` | `{ kind, id }` | `{ data }` | Load one game data entity (spell, monster, etc.) |
| `game-data:list` | `{ kind, filter? }` | `{ items }` | List all of a kind |
| `game-data:search` | `{ query, kinds? }` | `{ results }` | Fuzzy search across content |

`kind` ∈ `spell | monster | equipment | class | origin | feat | condition | rule | ...`

### Storage (`src/main/ipc/storage-handlers.ts`)

| Channel | Request | Response | Purpose |
|---|---|---|---|
| `storage:character:list` | — | `{ characters }` | All character sheets |
| `storage:character:load` | `{ id }` | `{ character }` | One character |
| `storage:character:save` | `{ character }` | `{ id }` | Save (atomic write) |
| `storage:character:delete` | `{ id }` | `{ ok }` | Delete |
| `storage:campaign:*` | (parallel to character) | | Campaigns |
| `storage:game-state:*` | | | Game session snapshots |
| `storage:homebrew:*` | | | User homebrew content |
| `storage:bastion:*` | | | Player bastions (2024 rules) |
| `storage:custom-creature:*` | | | Homebrew monsters |
| `storage:book:*` | | | Book/notes |
| `storage:ban:*` | | | Content bans (moderation) |
| `storage:image-library:*` | | | Image library |
| `storage:map-library:*` | | | Map library |

All storage uses atomic writes (`atomic-write.ts`) — temp file + rename.

Data is in `%APPDATA%/dnd-vtt/` (Windows) / `~/.config/dnd-vtt/` (Linux).

### Plugins (`src/main/ipc/plugin-handlers.ts`)

| Channel | Request | Response | Purpose |
|---|---|---|---|
| `plugin:list` | — | `{ plugins }` | Installed plugins |
| `plugin:install` | `{ path, metadata }` | `{ id }` | Install from path |
| `plugin:uninstall` | `{ id }` | `{ ok }` | |
| `plugin:enable` / `:disable` | `{ id }` | `{ ok }` | Toggle |
| `plugin:invoke` | `{ id, method, args }` | `{ result }` | Call plugin API |

Plugin system details: [`PLUGIN-SYSTEM.md`](./PLUGIN-SYSTEM.md)

### Cloud sync (`src/main/ipc/cloud-sync-handlers.ts`)

| Channel | Request | Response | Purpose |
|---|---|---|---|
| `cloud-sync:status` | — | `{ connected, lastSync }` | Sync state |
| `cloud-sync:push` | — | `{ ok }` | Force upload local |
| `cloud-sync:pull` | — | `{ ok }` | Force download remote |
| `cloud-sync:enable` / `:disable` | `{ config? }` | `{ ok }` | Toggle |

### BMO sync (`src/main/ipc/bmo-sync-handlers.ts`)

Bidirectional — renderer triggers calls to BMO Pi + receives callbacks.

| Channel | Request | Response | Purpose |
|---|---|---|---|
| `bmo:ping` | — | `{ ok, latencyMs }` | Test connection |
| `bmo:narrate` | `{ text, voice? }` | `{ ok }` | Have BMO speak |
| `bmo:start-discord-session` | `{ campaignId }` | `{ sessionId }` | Start D&D Discord session |
| `bmo:end-discord-session` | `{ sessionId }` | `{ ok }` | End session |
| `bmo:push-initiative` | `{ order }` | `{ ok }` | Send initiative to Discord |

Events emitted to renderer when BMO pushes a callback:
- `bmo:discord-message` — Discord chat message
- `bmo:discord-roll` — Discord player dice roll
- `bmo:initiative-sync` — Initiative update from BMO side
- `bmo:player-join` / `bmo:player-leave` — Discord session events

### Discord (`src/main/ipc/discord-handlers.ts`)

Controls the DM-machine Discord bot (different from BMO's Discord bot).

| Channel | Request | Response | Purpose |
|---|---|---|---|
| `discord:status` | — | `{ connected }` | Bot status |
| `discord:connect` | `{ token }` | `{ ok }` | Connect |
| `discord:send-message` | `{ channelId, text }` | `{ messageId }` | Post |
| `discord:list-guilds` | — | `{ guilds }` | Bot's servers |

## Adding a new channel

1. Define in `src/shared/ipc-channels.ts`:
   ```typescript
   export const IPC_CHANNELS = {
     // ...
     MY_CHANNEL: 'my:channel',
   } as const
   ```

2. Add zod schema in `src/shared/ipc-schemas.ts`:
   ```typescript
   export const MyRequestSchema = z.object({...})
   export const MyResponseSchema = z.object({...})
   ```

3. Write handler in `src/main/ipc/my-handlers.ts`:
   ```typescript
   import { IPC_CHANNELS } from '@shared/ipc-channels'
   ipcMain.handle(IPC_CHANNELS.MY_CHANNEL, async (e, raw) => {
     const req = MyRequestSchema.parse(raw)  // validate input
     const result = await doWork(req)
     return MyResponseSchema.parse(result)   // validate output
   })
   ```

4. Register in `src/main/ipc/index.ts` (all handlers get wired up there).

5. Expose in preload `src/preload/index.ts`:
   ```typescript
   const api = {
     // ...
     myMethod: (req) => ipcRenderer.invoke('my:channel', req),
   }
   contextBridge.exposeInMainWorld('api', api)
   ```

6. Type in `src/preload/index.d.ts`:
   ```typescript
   interface Window {
     api: {
       // ...
       myMethod: (req: MyRequest) => Promise<MyResponse>
     }
   }
   ```

7. Use in renderer:
   ```typescript
   const result = await window.api.myMethod({ ... })
   ```

8. Add test: `src/main/ipc/my-handlers.test.ts`

9. **Update THIS doc** (IPC-SURFACE.md) with the new channel.

## Validation

All handlers should parse input with zod and parse output too. Protects against:
- Malformed requests (renderer bug or malicious)
- Contract drift (handler returns something unexpected)

Pattern:
```typescript
ipcMain.handle(CHANNEL, async (e, raw) => {
  const req = RequestSchema.parse(raw)      // throws on bad input
  const result = await doWork(req)
  return ResponseSchema.parse(result)       // throws on bad output
})
```

## Debugging IPC

- Enable IPC logging: set `DEBUG_IPC=1` env var → main process logs every channel call
- Check renderer console (DevTools): caught errors from rejected promises
- Check main process logs: `dnd-app/log.ts` writes to `%APPDATA%/dnd-vtt/logs/`
- Reproduce in a vitest: most `.test.ts(x)` for handlers mock ipcMain

## Common pitfalls

- **Forgetting preload** — adding a handler without exposing via `window.api` → renderer can't call it
- **Not zod-parsing** — silently passing bad data through
- **Sync handlers (`ipcMain.on`) vs async (`ipcMain.handle`)** — use `handle` for request/response, use `on` for one-way events
- **Storing functions in payload** — can't serialize across IPC boundary
