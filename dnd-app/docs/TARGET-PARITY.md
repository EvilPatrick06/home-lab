# Target Parity Matrix

> Which features actually work on each of the four renderer build targets.

The same `src/renderer` tree is shipped to **four** targets, each reaching
native / main-process capability through a different `window.api` shim:

| Target | Entry / shim | How `window.api` is provided |
| --- | --- | --- |
| **Desktop** (Electron) | `src/preload/index.ts` | Real preload bridge → Electron main process (full native access). |
| **Web SPA** | `src/web/main.web.tsx` → `src/web/web-api.ts` | Browser shim: IndexedDB + the BMO Pi backend; desktop-only calls are capability-gated no-ops. |
| **Embed** | `src/web/main.embed.tsx` → `src/web/install-embed-api.ts` | The web shim reused inside an embedded WebView (sets `__DTO_EMBED__`); host-frame constrained. |
| **Mobile** (Expo) | `mobile/` → `mobile/src/bridge/native-bridge.ts` | React-Native bridge around the embed bundle; native storage adapter, no Electron main process. |

Cell legend:

- **full** — the real capability is present and works.
- **partial** — works but with reduced scope (e.g. via the Pi backend, or host-frame limited).
- **noop** — a safe capability-gated no-op; the UI degrades gracefully (feature is absent, nothing throws).
- **N/A** — not applicable / not reachable on that target.

> This is a first-pass, hand-maintained map seeded from the four `window.api`
> surfaces (`src/preload/index.ts`, `src/web/web-api.ts`, `install-embed-api.ts`,
> and the mobile `native-bridge.ts`). When you add or gate a capability in any
> shim, update the matching row here. A follow-up idea (logged) is a small script
> that diffs the shim method sets so a capability silently missing on one target
> gets flagged automatically.

## Capability matrix

| Capability | Desktop | Web SPA | Embed | Mobile |
| --- | --- | --- | --- | --- |
| Character / campaign / bastion storage | full | full (IndexedDB) | full (IndexedDB) | full (native storage adapter) |
| Version history / restore (`.versions/`) | full | noop (empty-history envelope) | noop | noop |
| Bundled 5e game data (`game.load*`) | full | full (static bundle fetch) | full | full |
| Library / sounds / registry (BMO Pi) | full | partial (Pi backend) | partial (Pi backend) | partial (Pi backend) |
| Cloud sync / account | full | partial (Pi backend) | partial | partial |
| File open/save dialogs | full (native dialogs) | partial (File System Access + download) | partial (host-gated) | partial (native share/pick) |
| Raw filesystem read/write | full | partial (FS Access; scan degrades) | noop | partial |
| Fullscreen toggle | full | partial (Fullscreen API) | partial (host-frame gated) | N/A |
| Auto-updater | full | noop (web auto-updates on deploy) | noop | noop (store/EAS updates) |
| Native crash capture | full | noop | noop | partial (platform crash reporting) |
| LAN / Bonjour (mDNS) discovery | full | noop (browsers can't mDNS; off-LAN uses the Pi) | noop | noop |
| WebRTC peer connect (host/join) | full | full | full | full |
| TURN relay | full | partial (Pi TURN) | partial | partial |
| AI DM backend (routing) | full | partial (not yet fully bridged) | partial | partial |
| Local Ollama provider | full | noop (not reachable from browser) | noop | noop |
| Remote AI providers (API-key) | full | full (Pi backend) | full | full |
| AI image generation | full | noop (rejects: unavailable in web build) | noop | noop |
| TTS / narration through BMO | full | partial (Pi backend) | partial | partial |
| Discord integration | full | N/A | N/A | N/A |
| Plugin install (filesystem scan) | full | noop (rejects: unavailable in web build) | noop | noop |
| Book / PDF import | full | noop (rejects: unavailable in web build) | noop | partial |
| Log folder open | full | noop | noop | noop |

> Rows marked **noop** on web/embed/mobile are the capabilities that live behind
> a `Promise.resolve(...)` / `Promise.reject(new Error('… not available in the
> web build'))` / capability-gated stub in the corresponding shim — read
> `src/web/web-api.ts`'s header for the routing summary, and the individual
> method bodies for the exact degradation of any single cell.

## See also

- `src/preload/index.ts` — desktop preload bridge (the canonical `window.api` shape).
- `src/web/web-api.ts` — web shim (its header documents the routing model).
- `src/web/install-embed-api.ts` — embed shim.
- `mobile/src/bridge/native-bridge.ts` — mobile bridge.
- `docs/WEB-VERSION-PLAN.md` — web build feasibility / parity plan.
