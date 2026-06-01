# dnd-app — open work

What still needs doing. NOT here: completed work (commits + GitHub releases), "needs testing/QA" items (the app is under test anyway), info/architecture notes, and things that are correct-by-design. Scope: dnd-app + the dnd-app↔BMO protocol overlap.

Everything actionable + worthwhile has been worked through; what remains is genuinely optional / opportunistic / a product decision.

---

- **Proxy renderer registry fetches through main IPC** (optional cleanup). `registry-client.ts` fetches `/api/games*` from the LAN Pi directly, which is why the document `connect-src` includes the `http:`/`ws:` scheme-sources. Moving the REST calls (announce/get/list/heartbeat/deregister) to main-process IPC (like cloud-sync) would let `connect-src` drop them. The current state is safe-ish (first-party bundled renderer, script-src locked, sandbox+contextIsolation on); this is a hardening nicety, and the SSE `/api/games/stream` is awkward to proxy. Left because it's a real integration change with multiplayer-discovery risk that isn't caught by the headless gates.
- **20 circular import cycles** (dpdm, non-blocking) — chip away when already editing those files; not worth a dedicated churn pass.
- **Managed/baked TURN server** (optional). Users can now add their own TURN via Settings → Multiplayer, and off-LAN routes through the Pi relay by default — so this only matters for someone who wants *serverless* off-LAN P2P behind symmetric NAT without configuring anything. Baking a managed TURN service carries cost + credential management.
- **Ship-thin installer** (product decision). The Pi `/api/sounds` endpoint + client seam are live, so the app *can* load the ~130 sound clips from the Pi. Actually dropping them from the installer shrinks the download but breaks sound when offline with no Pi — needs a download-on-first-run cache first. Your call.

> Swept + found non-actionable (correct-by-design, not listed above): the remaining ~83 inline styles are dynamic (PixiJS/drag/runtime-color/z-index), the eager-JSON imports are intentional sync-default + async-loader pairs, `useAsyncData` has no clean 1:1 fits left, and `DmAction` is deliberately the open wire shape (LLM/BMO output is untrusted; it's narrowed at runtime via `ValidatedDmAction`). Magic-numbers, biome config, rolldown config, throttle, number-input labels, cloud-backup polish, and the a11y color check are done.
