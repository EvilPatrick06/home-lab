Tested: dnd-vtt v2.6.2 — 2026-06-24 — **MULTIPLAYER REPRO CONFIRMATION** (live two-window Cloud Relay)

> Live two-window confirmation pass against the BMO Socket.IO **Cloud Relay**,
> following up the same-day triage in
> [`QA-report-2026-06-24-multiplayer.md`](./QA-report-2026-06-24-multiplayer.md).
> That pass triaged user-reported symptoms read-only on the code; **this pass drove
> a real two-window web-build session** — a **DM window** plus a **distinct player
> window** — over the cloud relay to confirm or refute each suspected root cause and
> to pin the ones the triage flagged as "needs a live repro."
>
> **Test rig.** Two browser windows on the web build, both connected through the
> Socket.IO Cloud Relay. The cloud assigns **each connection a fresh
> `cloud-<uuid>`** that is **distinct from the persistent `dndapp:client-id`**
> (`getOrCreateClientId()`). Observations were taken from the relay banner, each
> window's rendered UI, and the `game:state-full` / event frames crossing the relay.
> Investigation remained read-only on the code; no app source was changed and nothing
> was deployed. This is **diagnosis only** — it re-scopes and confirms the existing
> multiplayer fix-phases for the planner/phase-maker; it does not implement them.

## Unifying root cause (lead finding)

**Cloud peer enrollment / roster churn.** The cloud joiner receives a fresh
`cloud-<uuid>` on every (re)connect and is **never (re)enrolled into the host's
authoritative peer roster.** This was confirmed live: the player shows
**relay-connected in the banner** yet is **ABSENT from the host's `game:state-full`
`peers[]`** (the roster is host-only), and after a round of reconnect churn **both
clients go split-brain** — each reporting **"1 connected."**

Because the unenrolled `cloud-<uuid>` peer is missing from the host roster, three
consequences follow directly:

- **(a) Readiness / enrollment gate never satisfied.** The Start control's gate never
  sees an enrolled + ready player, so **Start stays disabled — "Waiting for
  Players…"** even though a player is visibly connected.
- **(b) Per-recipient permission-filtered broadcasts drop the peer.** Filtered
  broadcasts (tokens / map / drawings **and** chat) are keyed on the roster, so the
  unenrolled `cloud-<uuid>` is **filtered out** and receives none of them.
- **(c) Split-brain.** Reconnect churn leaves each side believing it is the only
  member ("1 connected" each).

This enrollment/roster root cause is **distinct from, and additional to, the
PHASE-49 dispatch-bus gap** (relay inbound never feeding `onHostMessage` /
`onClientMessage`). Both are real; fixing either alone is insufficient (see **Phase
impact** below).

---

## Per-cluster results

### ROLES / host-UI (symptoms #1 / #2 / #4) — **NOT confirmed as host-UI loss; PHASE-52's `isHost`-reset hypothesis is INCORRECT**

- **Category:** bug (re-scope)
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** MP Repro (live two-window cloud)
- **During:** cloud lobby — DM expecting Start Game + chat controls; DM promoting a player

**Confirmed live:** `isHost` was **never cleared.** The host's `game:state-full`
consistently carried **`isHost:true, isDM:true`** throughout the session. The
**DM badge**, the moderation controls (**Slow mode / Files / Auto-mod**, and
**Kick / Ban / Make-DM**) and the **chat input** were **present the entire time.**
So the "host-only UI vanished" framing — and PHASE-52's hypothesis that a cloud
reconnect resets `isHost` — is **incorrect.**

- **#2 (no DM chat controls / input):** **did not reproduce.** Controls and input
  were present throughout.
- **#4 (promote/demote doesn't propagate):** **did not reproduce.**
  **Promote-to-Co-DM** and **Demote** both reflected on the player's card, with
  matching **`dm:promote-codm`** frames observed crossing the relay.
- **#1 (no Start Game button):** **mischaracterised — it is a READINESS gate, not a
  missing control.** The Start control **exists** in the DOM
  (`aria-label="Start game session"`) but renders **disabled / "Waiting for
  Players…"** until the host confirms color **and** marks ready **AND** a player is
  ready / enrolled. Reconnect churn **resets the host's `isReady`** (observed
  `game:state-full` `isReady:false`) — **without** clearing `isHost`. With the
  player also unenrolled (lead finding), the gate can never clear.

**→ Re-scope PHASE-52** from "`isHost` reset / host-UI loss" to **"cloud peer
enrollment & readiness resilience"**: the real defect is host `isReady` being reset
by reconnect churn plus the player never being enrolled/ready — not `isHost`.

---

### TOKEN DIVERGENCE (symptom #7) — **CONFIRMED**

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** MP Repro (live two-window cloud)
- **During:** cloud game — DM moving/placing tokens, map and drawing changes; both windows exchanging chat

**Confirmed live.** The mechanism is the per-recipient permission filter at
**`broadcaster.ts:81-89`**, which ships a per-recipient `replace` keyed on the
recipient's roster `clientId`. The unenrolled **`cloud-<uuid>`** peer is dropped by
`permissionFilter`, so the player receives a filtered/empty view while the DM sees
the full board — **views diverge.**

The same filter starves **chat**: **`chat:message` frames are emitted but neither
side renders the other's** — the host even **re-broadcast the player's frame with
`exclude_peer_id`** — while **presence / role / ready events DO cross.** That split
(control-plane events cross, filtered payloads don't) is the signature of an
enrollment/roster filter problem, not a transport outage.

**→ Tie PHASE-51's fix to enrollment:** re-enroll cloud peers into the roster on
join/reconnect, **and/or key the permission filter on the stable
`dndapp:client-id`, not the ephemeral `cloud-<uuid>`.** Resolving the filter keying
without enrollment (or vice versa) leaves the divergence in place.

---

### LOBBY CHAT (symptom #3) — **CONFIRMED broken both directions**

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** MP Repro (live two-window cloud)
- **During:** cloud lobby — DM and player typing chat both directions

**Confirmed broken in both directions**, with the **same enrollment root cause** as
token divergence (the unenrolled `cloud-<uuid>` is filtered out of the per-recipient
broadcast), **plus** the **PHASE-49 dispatch-bus bridge gap** (relay inbound never
feeding `onHostMessage` / `onClientMessage`). Both contribute; both must be fixed.

Additional observation: the relay registry **intermittently reported "No cloud
registry connected,"** consistent with the reconnect flakiness that drives the
roster churn — i.e. the same churn that resets host `isReady` and re-issues a fresh
`cloud-<uuid>`.

---

### #5 (DM clicking a player PC → "no character found") — **NOT TESTABLE this run**

- **Category:** test-gap
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** MP Repro (live two-window cloud)

**Not testable this run** — the player window had **no character** selected/created,
so the DM-clicks-player-PC path could not be exercised. Carries over untested
(see PHASE-50 below).

---

## Phase impact

- **PHASE-49 (dispatch-bus gap)** — **still valid**, but **not sufficient alone.**
  Even with the bus fed, **enrollment churn would still filter chat** out of the
  per-recipient broadcast for the unenrolled `cloud-<uuid>`. The **enrollment fix is
  also required** alongside PHASE-49.
- **PHASE-51 (token/state divergence)** — **CONFIRMED.** Root cause is the
  **unenrolled peer** being dropped by the `broadcaster.ts:81-89` permission filter.
  Tie the fix to enrollment / stable-client-id keying.
- **PHASE-52 (roles / host-UI)** — **must be re-scoped.** `isHost` is fine — the real
  defect is the host's **`isReady` being reset** by reconnect churn **plus player
  enrollment churn.** Re-scope to "cloud peer enrollment & readiness resilience."
- **PHASE-50 (#5, DM clicking player PC)** — **untested live** this run (player had no
  character); still needs a live repro with a player character present.
- **PHASE-53 (local TURN)** — **not exercised** this run; the **cloud path** was tested,
  not local/direct P2P. No new data either way.
