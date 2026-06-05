# Issues Log — dnd-app

> **Active dnd-app bugs / tech debt / broken config — Electron VTT issues only.**
> Sibling logs:
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dnd-app/` (TS/React/Electron/Vite/biome/vitest/Pixi/peerjs/the 5e JSON content set) → here. `Domain: both` cross-cutting entries → mirror in BOTH `BMO-ISSUES-LOG.md` AND this file (small duplication is intentional; one fix removes both copies).

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **Single source of truth: the consolidated report.** All open dnd-app items
> (problems, debt, suggestions, security, future work, out-of-scope) now live in
> **`dnd-app/docs/phases/REVIEW-REPORT-2026-05-29.md`** — verified against the
> code on 2026-05-29. Do not re-log dnd-app items here; add them to that report.
>
> Quick map of what's open (full detail + file:line in the report):
> - Knip unused exports/types, accessibility polish, error-handling convention, CI dedupe, the cloud-relay live integration gap — see the report's open sections.
>
> **Verified RESOLVED (do not re-fix):** **20g** (renderer security events now route via the `LOG_SECURITY_EVENT` IPC channel — `ipc-channels.ts:257` + handler `main/ipc/index.ts:208` + call-site `network/security-audit.ts`); **LOG-11** (Tiny-creature cover now uses `MapToken.sizeCategory` — `types/map.ts:113` + `cover-calculator.ts` + tests); Phase 23f attunement (single-source via `state.magicItemAttuned` + `getEffectiveMagicItems`); multi-floor visibility (`currentFloor` wired); positional audio emitters (`updateEmitters` is called).

## Critical / High / Medium / Low

### [2026-06-02] CharacterSheet5ePage.test.tsx flakes (15s timeout) under CPU load

- **Category:** test, flake/debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Code
- **During:** P3 (AI memory/context) — gate run
- The two heavy render tests in `src/renderer/src/pages/CharacterSheet5ePage.test.tsx` ("renders the sheet for a saved character", "survives toolbar interactions without crashing or looping") intermittently hit the global `testTimeout: 15000` (vitest.config.ts) when the Pi is under concurrent load (multiple workflows/gates). Confirmed pre-existing + unrelated to the change under test (the page imports none of the AI files); a *different* one of the two fails across runs, and the failing duration is exactly 15038ms. They pass in isolation on an unloaded machine and in CI (faster, sharded — green for v2.4.29–v2.4.36). **Fix options:** split the "toolbar interactions" test, mock the heaviest child renders, or bump these two tests' per-test timeout. Not blocking releases (CI authoritative).

- **Category:** UX, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Code
- **During:** MP-5 (off-LAN self-host P2P)

**Description:**
`probeSignalingServer()` (`src/main/lan-discovery.ts:237`) only probes the Pi
PeerServer when the resolved base URL is `http:` (LAN); for an `https:` tunnel base
it reports `reachable: null` → the badge shows a muted "not applicable". Now that
the PeerServer is reachable off-LAN at `https://<host>/myapp/peerjs/id` (cloudflared
route + Access bypass), the probe could verify the tunnel too and show an honest
reachable/unreachable state off-LAN instead of "not applicable".

**Proposed fix / improvement:**
- [ ] In `probeSignalingServer`, for an `https:` base probe `https://<host>/myapp/peerjs/id` (port 443, no `:9000`); keep the `http:` LAN probe at `<host>:9000/myapp/peerjs/id`.
- [ ] Update `MultiplayerStatusSection` copy so the off-LAN state reads reachable/unreachable rather than "only checked on LAN".

**Related files:** `dnd-app/src/main/lan-discovery.ts:237`, `dnd-app/src/renderer/src/components/ui/MultiplayerStatusSection.tsx`

### [2026-06-01] Sound Pi-offload never warms on the normal startup path

- **Category:** performance, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Code
- **During:** SND-1 fix (re-bundling the sound MP3s)

**Description:**
`prewarmRemoteSounds()` — the only thing that warms the Pi sounds manifest and
populates the main-process disk cache — is called ONLY from the Settings
`reinit()` (`sound-manager.ts:360`). The normal startup path (`App.tsx:54`
`init()` + `use-game-effects.ts:126` `init()`) never warms it, so the Pi
sound-offload (the `cached file://` / `live Pi URL` precedence in
`resolveSoundUrl`) is effectively dormant: clips always fall back to the bundled
file unless the user happens to toggle a sound setting. Not user-facing after the
SND-1 re-bundle (sounds play from the bundled files), but the bandwidth-saving
offload + disk cache are unused on the normal path.

**Proposed fix / improvement:**
- [ ] Kick `prewarmRemoteSounds()` once at app start (App.tsx alongside `init()`, or inside `init()`).
- [ ] Optionally rebuild the sound pools when prewarm resolves so warmed clips prefer the cached/Pi URL.

**Related files:** `dnd-app/src/renderer/src/services/sound-manager.ts:289,352,360`, `dnd-app/src/renderer/src/App.tsx:54`, `dnd-app/src/renderer/src/services/library/remote-sounds.ts:139`, `dnd-app/src/renderer/src/hooks/use-game-effects.ts:126`

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
