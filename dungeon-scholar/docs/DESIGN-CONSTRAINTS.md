# dungeon-scholar design constraints (do not "fix" these)

Canonical home for dungeon-scholar design gotchas + standing observations (durable knowledge, not backlog). **Read this before refactors.** Mirrors the BMO/dnd-app equivalents (`bmo/docs/DESIGN-CONSTRAINTS.md`, `dnd-app/docs/DESIGN-CONSTRAINTS.md`).

## 2026-06-24 — GitHub Pages controls `index.html` caching; SW + client recovery is our only lever (PHASE-01 F1c)

dungeon-scholar deploys to **GitHub Pages**, which sets the HTTP cache headers on
`index.html` and the published `assets/` — the app cannot send HTTP headers. So
the mitigation for a mid-session deploy swapping chunk hashes is **not** header
control; it is the SW precache (auto-revalidated) plus the PHASE-01 client
recovery: `lazyWithReload` + a `vite:preloadError` listener (01A), a chunk-aware
`ErrorBoundary` (01B), and a `controllerchange` reload handshake (01C), all
coordinated by one `ds:chunk-reload` sessionStorage one-shot guard.

If a "stale chunk after deploy" / failed-dynamic-import bug ever recurs, check
the **browser HTTP cache on `index.html`** and the **published `assets/` tree**
(did `deploy.yml` actually republish? is `index.html` being served from a stale
HTTP cache?) **before** assuming an app bug. Do not add runtime caching for the
cross-origin Supabase/Oracle requests to "fix" it — those are deliberately
network-only (`vite.config.js`).
