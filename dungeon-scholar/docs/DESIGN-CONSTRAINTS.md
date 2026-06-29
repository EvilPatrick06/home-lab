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
(did `dungeon-scholar-deploy.yml` actually republish? is `index.html` being served from a stale
HTTP cache?) **before** assuming an app bug. Do not add runtime caching for the
cross-origin Supabase/Oracle requests to "fix" it — those are deliberately
network-only (`vite.config.js`).


## Light-theme surfaces must route through theme vars (Phase 03, 2026-06-29)

The light theme (`html[data-theme="light"]` in `src/index.css`) inverts the Tailwind colour ramps, so `text-amber-50/100/200` resolve to **dark** ink. Any surface that hardcodes a dark `rgba(...)` background (instead of a `--panel-bg-*` / `--surface-*` var) therefore renders **dark-on-dark** in light theme. Rule: never hardcode a dark background under inverting `text-*` utilities. Route backgrounds through the theme vars:
- Panels: `linear-gradient(135deg, var(--panel-bg-<color>, <dark-fallback>) 0%, var(--panel-end, ...) 100%)` (see `OrnatePanel.jsx`).
- Inline surfaces: `rgba(var(--surface-<name>, <r, g, b>), <alpha>)`. Phase 03 added `--surface-rose/red/danger/known/locked` for previously-hardcoded surfaces.
- **Inverse case (Chat bubbles):** when the *background* is already theme-aware (lightens in light theme), the *text* must darken too — use an inverting `var(--color-amber-100)` / `text-amber-*` utility, NOT a fixed light hex like `#fef3c7`. A surface that is intentionally dark in both themes (e.g. the `isSearch` tome-search bubble, `rgba(0,0,0,...)` code blocks) keeps fixed light text.
