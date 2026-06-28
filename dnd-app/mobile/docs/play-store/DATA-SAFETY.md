# Play Console — Data Safety form answers

Suggested answers for the Data Safety section. Verify against the final build
before submitting (Google holds you to these).

## Does your app collect or share any of the required user data types?

**Yes** (because of multiplayer), with these nuances:

| Data type | Collected | Shared | Purpose | Notes |
|---|---|---|---|---|
| Name / display name | Yes | Yes | App functionality (multiplayer) | Sent peer-to-peer to other players in the session you join. |
| In-app messages (chat) | Yes | Yes | App functionality | Peer-to-peer between players; not stored on a server we run. |
| App activity (in-game actions) | Yes | Yes | App functionality | Peer-to-peer game sync. |
| Other user content (characters, maps) | Yes | Yes | App functionality | Stored on-device; shared only with players you choose. |

## Is all collected data encrypted in transit?

**Yes** — multiplayer uses WebRTC (DTLS/SRTP). Optional backend calls use HTTPS.

## Do you provide a way for users to request data deletion?

**Yes** — uninstalling deletes all on-device data; Settings includes a wipe/reset.

## Declarations

- **No advertising or third-party analytics SDKs** are bundled.
- **AI providers:** only contacted if the user enables AI and supplies their own
  key/endpoint; declare "Data shared with third parties: optional, user-initiated"
  and reference the privacy policy.
- **No data sold.**
- **No precise location** collected.

> If you ship the optional AI/backend features enabled-by-default in a future
> build, revisit these answers.
