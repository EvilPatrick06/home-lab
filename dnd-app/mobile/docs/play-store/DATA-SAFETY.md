# Play Console — Data Safety form answers

Suggested answers for the Data Safety section. Verified against the build:
no analytics/ads/telemetry SDKs are present; Android permissions are `INTERNET`,
`ACCESS_NETWORK_STATE`, `RECORD_AUDIO`; the only network egress is peer-to-peer
multiplayer, the optional self-hosted backend, and loading the app shell/registry
from the host. Google holds you to these — re-verify before submitting.

> **GATE:** Submission is blocked by `SRD-AUDIT-2026-06-25.md`. These answers are
> ready, but do not submit until the IP blocker is resolved.

## Does your app collect or share any of the required user data types?

**Yes** (because of multiplayer), with these nuances:

| Data type | Collected | Shared | Purpose | Notes |
|---|---|---|---|---|
| Name / display name | Yes | Yes | App functionality (multiplayer) | Sent peer-to-peer to other players in the session you join. |
| In-app messages (chat) | Yes | Yes | App functionality | Peer-to-peer between players; not stored on a server we run. |
| App activity (in-game actions) | Yes | Yes | App functionality | Peer-to-peer game sync. |
| Other user content (characters, maps) | Yes | Yes | App functionality | Stored on-device; shared only with players you choose. |
| Audio (microphone) | Optional | Yes (live, P2P) | App functionality (voice chat) | Only if the user enables voice; streamed live to peers, never recorded or uploaded by the app. |

## Is all collected data encrypted in transit?

**Yes** - multiplayer uses WebRTC (DTLS/SRTP). Optional backend calls use HTTPS.

## Do you provide a way for users to request data deletion?

**Yes** - all data is on-device. Settings includes a wipe/reset, and uninstalling
deletes everything. There is no server-side account to delete. Data-deletion URL:
the privacy policy (https://bmo.mybmoai.work/DungeonTableOnline/privacy.html)
documents this.

## Declarations

- **No advertising or third-party analytics SDKs** are bundled (verified - none
  in package.json).
- **No data sold.**
- **No precise location** collected.
- **No in-app purchases** (free app).
- **AI providers:** only contacted if the user enables AI and supplies their own
  key/endpoint; declare "Data shared with third parties: optional, user-initiated"
  and reference the privacy policy.

> If you ship the optional AI/backend features enabled-by-default in a future
> build, revisit these answers.
