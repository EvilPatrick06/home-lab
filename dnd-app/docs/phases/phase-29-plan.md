# Phase 29 — Roles + Permissions

> Replace every hardcoded "host" / "isCoDM" / role-string gate with a fully customizable permission matrix. Per-campaign role lists, custom roles, per-player overrides, view-as-role debug mode.
>
> Renumbered from "Phase A" in conversation planning.

---

## Context

Today, almost every gameplay gate in dnd-app is one of two literal checks: `networkRole === 'host'` (about half of them) or `localPlayer?.isCoDM` (a smaller set). Examples scattered across the codebase:

- `pages/InGamePage.tsx:51` — `isDM = networkRole === 'host'`
- `stores/network-store/index.ts:415-536 filterGameStateForRole` — host vs anyone-else
- `components/lobby/PlayerList.tsx` — Promote / Demote / Kick gated by `isHostView`
- Token visibility, fog brush, NPC stat blocks, journal write — all gated similarly
- Phase 17b (`v2.1.38`) partially fixed this by making CoDM equivalent to host for game-view purposes, but that was a bandage on the same `isHost` literal.

This means:

1. There's no way to give one player slightly elevated perms without making them a full CoDM.
2. Spectators have a single allowlist (`SPECTATOR_ALLOWED_TYPES` in `host-handlers.ts`) — no granularity.
3. Different campaigns can't have different role shapes (one casual game's "Player" might be allowed to manage NPCs; another's wouldn't).
4. Debugging "what does Player X see?" requires re-creating the lobby with their role; no in-place toggle.

Goal: data-driven permissions. The DM defines what each role can do, optionally per-player, optionally per-campaign. Every gate in the code becomes `hasPermission(peer, key, campaign)`.

This phase ships on the **existing P2P transport** — no network architecture changes. It's the foundation for Phase 30 (Player-as-Host rewrite) and Phase 31 (Live-state sync overhaul), but it's standalone-useful immediately.

---

## Sub-phase summary

| # | Sub-phase | Scope |
|---|-----------|-------|
| 29a | Permission key universe + `hasPermission` helper | Define ~50–80 permission keys grouped by category; ship the lookup helper |
| 29b | Built-in role defaults | DM, CoDM, Player, Spectator — stored as data, not constants |
| 29c | Custom roles per campaign | Editable role list; add / duplicate / delete; per-campaign storage |
| 29d | Per-player overrides | `playerOverrides[clientId] = { grant, deny }` with deny-beats-grant-beats-role priority |
| 29e | Codebase sweep — replace literal gates | The grind: every `role === 'host'` / `isCoDM` becomes a permission lookup |
| 29f | View-as-role debug mode | DM toggle: "view as Player X" honoring the matrix exactly |
| 29g | Permissions editor UI | Campaign Settings → Permissions tab. Matrix + override panel |
| 29h | Migration for existing campaigns | Inject defaults on load; preserve any in-flight `isCoDM` assignments |

8 sub-phases. Each ends with `lint + tsc-web + tsc-node + vitest` (4-gate). One release at the end: **v3.0.0** (major bump — large architectural change even though it's invisible at default settings).

---

## Sub-phase details

### 29a — Permission key universe + `hasPermission` helper

**Files (new):**
- `src/renderer/src/types/permissions.ts` — exports `Permission` (string union of all keys), `PermissionCategory` enum, `PERMISSION_GROUPS` (display grouping for UI), and a `getPermissionLabel(key) → string` helper.
- `src/renderer/src/services/permissions/has-permission.ts` — `hasPermission(peer: PeerInfo, key: Permission, campaign: Campaign | null): boolean`.

**Permission key universe (initial draft — likely 60–80 keys final):**

```
view_hidden_tokens
view_dm_only_stats
view_full_fog
view_hidden_npcs
view_dm_journal_entries
view_secret_handouts

move_own_token
move_any_token
add_token
remove_token
change_token_visibility
edit_token_hp
edit_token_conditions
edit_own_sheet
edit_any_sheet
view_any_sheet

roll_dice
roll_hidden_dice
see_hidden_dice
chat_send
chat_whisper
chat_clear
chat_file_upload

draw_visible
draw_dm_only
clear_drawings
place_pin
edit_fog
change_active_map
edit_map
edit_grid
edit_walls

manage_initiative
end_turn_any
end_turn_own
start_combat
end_combat
add_condition_any
remove_condition_any

add_npc
edit_npc
reveal_npc_field
manage_sidebar_entries
edit_party_inventory
edit_handouts
manage_journal

use_dm_tools
use_ai_dm
edit_campaign_settings
manage_homebrew
manage_audio
manage_calendar
manage_weather

kick_player
ban_player
timeout_player
mute_player_chat
promote_codm
demote_codm
change_player_role
transfer_host
end_session
```

**`hasPermission` algorithm:**

1. If `!peer` or `!campaign`, return false (be conservative).
2. Look up `playerOverrides[peer.clientId]` (added in 29d). If present and `deny.includes(key)`, return false. If `grant.includes(key)`, return true.
3. Find peer's role on the campaign. If role not found, return false.
4. Return `role.permissions.includes(key)`.

**Acceptance:**
- Helper compiles and runs against a mock campaign. Unit-tests cover deny>grant>role precedence, missing campaign, missing role, unknown permission key (returns false, doesn't throw).
- No existing code calls it yet (sweep happens in 29e).

---

### 29b — Built-in role defaults

**Files (new):**
- `src/renderer/src/data/builtin-roles.ts` — exports `BUILTIN_ROLES: Role[]` with:
  - **DM** — every permission in the universe.
  - **CoDM** — every permission except `promote_codm`, `demote_codm`, `transfer_host`, `ban_player`, `end_session`, `edit_campaign_settings`.
  - **Player** — `view_dm_only_stats` no; `view_hidden_tokens` no; `move_own_token`, `edit_own_sheet`, `roll_dice`, `chat_send`, `chat_whisper`, `draw_visible`, `view_any_sheet` (yes — see your party), `add_condition_any` (no), etc.
  - **Spectator** — `chat_send`, `chat_whisper`, `roll_dice`, and the view-only permissions. No write actions.

**Files (modify):**
- `src/renderer/src/types/campaign.ts` — add `Role` interface (`{ id, name, description?, color?, isBuiltIn, permissions: Permission[] }`) and `CampaignPermissions` (`{ roles: Role[], playerOverrides: Record<string, PlayerOverride> }`). Mark `Campaign.permissions?: CampaignPermissions` optional for backwards compat.

**Acceptance:**
- `BUILTIN_ROLES` import works from anywhere.
- A new campaign created today gets `BUILTIN_ROLES` copied into its `permissions.roles` so the DM can edit a per-campaign copy without affecting future campaigns.

---

### 29c — Custom roles per campaign

**Files (modify):**
- `src/renderer/src/stores/use-campaign-store.ts` — actions: `addRole(campaignId, role)`, `updateRole(campaignId, roleId, updates)`, `deleteRole(campaignId, roleId)`, `duplicateRole(campaignId, roleId)`. Built-in roles can be edited but not deleted (UI prevents deletion; store throws if attempted).
- `src/renderer/src/types/campaign.ts` — `Role.isBuiltIn: boolean` distinguishes built-ins from user-created. Built-ins keep stable ids (`'role-dm'`, `'role-codm'`, etc.).

**Acceptance:**
- DM can create a custom role "Apprentice DM" with any subset of permissions.
- DM can duplicate "Player" → "Senior Player" and tweak.
- Deleting a custom role that's currently assigned to a peer falls back the peer to the default "Player" role with a system chat message.

---

### 29d — Per-player overrides

**Files (modify):**
- `src/renderer/src/types/campaign.ts` — `PlayerOverride = { grant: Permission[], deny: Permission[] }`. `CampaignPermissions.playerOverrides: Record<string /* clientId */, PlayerOverride>`.
- `src/renderer/src/stores/use-campaign-store.ts` — `setPlayerOverride(campaignId, clientId, override)` and `clearPlayerOverride(campaignId, clientId)`.

**Priority (final):** explicit deny > explicit grant > role permission.

**Acceptance:**
- DM can grant `view_hidden_tokens` to one specific player without changing their role.
- DM can deny `chat_whisper` to a specific player even though their role has it.
- Setting both grant + deny for the same permission resolves to deny (with a UI warning in 29g).

---

### 29e — Codebase sweep — replace literal gates

The grind. Every `role === 'host'`, `isCoDM`, `isHost`, `peerInfo.isHost`, and similar literal becomes `hasPermission(peer, key, campaign)`.

**Touched files (incomplete list — sweep will find more):**
- `pages/InGamePage.tsx` — `isDM` derivation
- `pages/LobbyPage.tsx` — `isHost` references
- `stores/network-store/index.ts` — `filterGameStateForRole`, `transformUpdatePayloadForPeer`
- `stores/network-store/host-handlers.ts` — `SPECTATOR_ALLOWED_TYPES` becomes a derived list; per-message permission check at handler entry
- `network/host-connection.ts` — kick, ban, promote checks
- `components/lobby/PlayerList.tsx` — `isHostView`
- `components/game/dm/*` — every DM-only UI gate
- `components/game/overlays/*` — DM toolbar, FloatingDMPanel, EmptyCellContextMenu, etc.
- Chat commands (`services/chat-commands/*`) — DM-only commands
- Map event handlers — drawing, fog, wall placement

Each touched site documents which permission key replaced the literal check.

**Acceptance:**
- `git grep "role === 'host'"` returns zero hits in the gameplay surface (a few remaining are OK in network bootstrap paths where "the literal host" is a transport concept, not a role).
- `git grep "isCoDM"` returns zero hits in gameplay (the boolean still exists on PeerInfo for backwards compat during migration; future cleanup phase removes it).
- Existing vitest specs pass — Phase 17b's CoDM tests now go through the permission system but produce the same answers.

---

### 29f — View-as-role debug mode

**Files (modify):**
- `src/renderer/src/components/game/GameLayout.tsx` — extend the existing `viewMode` state. Today it's `'dm' | 'player'`; expand to `{ mode: 'self' | 'as-role'; targetRoleId?: string; targetPlayerId?: string }`.
- `src/renderer/src/services/permissions/has-permission.ts` — accept an optional `viewAs` override that masks the caller's real peer with a synthetic peer carrying the target role/overrides.
- New UI: dropdown in DMToolbar to pick "View as: Self / Player X / Spectator / [custom role]". When active, every `hasPermission` call across the renderer uses the override.

**Why this is huge for debugging:** instead of "what does Bob see?" requiring Bob to share his screen, the DM toggles a dropdown and the entire UI re-renders with Bob's exact permission set applied. Every gate hits the same way Bob's would.

**Acceptance:**
- Toggle to "View as Player X" → hidden tokens disappear, DM-only stats disappear, fog reveals as Player X would see, DM toolbar dims out, etc.
- Toggle back to Self → full DM view restored.
- A clear indicator at the top of the screen says "Viewing as Player X — click to exit" so the DM doesn't get stuck wondering why their tools are gone.

---

### 29g — Permissions editor UI

**Files (new):**
- `src/renderer/src/components/campaign/PermissionsEditor.tsx` — main editor. Lists campaign roles with their description + permission count. Click a role to expand a matrix view of every permission grouped by category, with checkboxes.
- `src/renderer/src/components/campaign/PlayerOverridesPanel.tsx` — per-player override surface. Lists each campaign player, expand to see per-permission switches (grant / role-default / deny).

**Files (modify):**
- `src/renderer/src/pages/CampaignDetailPage.tsx` (or wherever campaign settings live) — new "Permissions" tab.

**UX details:**
- Reset-to-defaults per role.
- Bulk actions on a role: "grant all in this category" / "deny all in this category".
- Conflict warning: if a player override sets both grant + deny for the same permission, surface a non-blocking warning (deny wins, but flag the contradiction).
- Search box for permission keys (~80 keys gets unwieldy without one).

**Acceptance:**
- DM can create / edit / delete custom roles, see the live matrix, save back to the campaign.
- DM can set per-player overrides for any campaign player.
- Changes save to disk and propagate to all peers via the existing campaign update broadcast.

---

### 29h — Migration for existing campaigns

**Files (modify):**
- `src/main/io/campaign-io.ts` (or equivalent load path) — on campaign load, if `campaign.permissions` is missing, inject a copy of `BUILTIN_ROLES` and an empty `playerOverrides`.
- Preserve any in-flight `isCoDM` flag on lobby players: a player flagged `isCoDM === true` gets their role set to `'role-codm'` on first migration.

**Acceptance:**
- Loading a pre-permissions save works exactly as it did before — DM has all perms, CoDM-flagged players have CoDM perms.
- Subsequent saves include the new `permissions` field so future loads skip migration.

---

## Cross-cutting decisions

- **Custom roles are per-campaign only.** No global role library. Cleaner data model, no cross-campaign coupling. If the DM wants to reuse a role across campaigns, they duplicate it manually.
- **Contradictory overrides warn-but-allow.** DM can construct weird combinations on purpose (e.g., grant `edit_any_sheet` but deny `view_any_sheet`). UI surfaces a warning chip; deny still wins.
- **Built-in roles are editable but not deletable.** Reset-to-defaults restores their original permission set.
- **Migration is one-way.** Once a campaign has `permissions` populated, the old `isCoDM` boolean stops being consulted. Removed entirely in a follow-up cleanup phase.

---

## Verification — end-to-end test plan

After **29a-d**: unit tests on `hasPermission` cover precedence, missing data, custom roles, overrides.

After **29e**: existing Phase 17b CoDM acceptance tests pass (CoDM still has DM-equivalent perms because the built-in CoDM role includes all the same keys). Existing kick/ban/promote tests pass.

After **29f**: DM toggles "View as Player X" and the map fog reveals, DM toolbar hides, hidden tokens vanish. Toggle off → full DM view.

After **29g**: DM creates a custom "Senior Player" role with `manage_initiative` granted. Assigns Bob to that role. Bob can now advance initiative. Bob's role-default kick action stays disabled.

After **29h**: Loading a Phase 17 save with a CoDM-flagged player → that player loads with the `role-codm` role. No regression.

---

## Critical files (multi-touch hotspots)

- `src/renderer/src/types/permissions.ts` *(new)*
- `src/renderer/src/services/permissions/has-permission.ts` *(new)*
- `src/renderer/src/data/builtin-roles.ts` *(new)*
- `src/renderer/src/types/campaign.ts`
- `src/renderer/src/stores/use-campaign-store.ts`
- `src/renderer/src/stores/network-store/index.ts` — `filterGameStateForRole`, sendMessage routing
- `src/renderer/src/stores/network-store/host-handlers.ts` — spectator allowlist becomes derived
- `src/renderer/src/network/host-connection.ts` — kick/ban/promote
- `src/renderer/src/components/campaign/PermissionsEditor.tsx` *(new)*
- `src/renderer/src/components/campaign/PlayerOverridesPanel.tsx` *(new)*
- Plus ~20–30 component files touched in the 29e sweep

---

## Commit cadence

```
29a — feat(perm): permission key universe + hasPermission helper
29b — feat(perm): built-in role defaults (DM / CoDM / Player / Spectator)
29c — feat(perm): custom roles per campaign (add / edit / delete / duplicate)
29d — feat(perm): per-player overrides (grant / deny beyond role)
29e — refactor(dnd-app): replace literal role checks with hasPermission across gameplay
29f — feat(dnd-app): view-as-role debug mode in GameLayout
29g — feat(dnd-app): Permissions editor + Player Overrides panel
29h — feat(perm): migration for pre-permissions campaigns
```

Each must pass:
```
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

One release: **v3.0.0** cut after 29h lands. Major version bump because while the default behavior is unchanged, the underlying model is a fundamental rewrite.

---

## Estimated scope

6–8 working sessions. The most time-consuming sub-phases are 29a (deciding the permission key universe — has to be done thoughtfully so we don't have to re-shape it later), 29e (sweep grind), and 29g (UI surface for a ~80-permission matrix is non-trivial).

This phase ships independently of Phase 30/31/32. Even if Phase 30 (Player-as-Host rewrite) is deferred indefinitely, Phase 29 is fully usable.

---

## Open questions (locked before starting)

1. **Custom roles per-campaign only** — confirmed.
2. **Contradictory combinations warn-but-allow** — confirmed.
