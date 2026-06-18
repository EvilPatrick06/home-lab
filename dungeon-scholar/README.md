# Dungeon Scholar

A D&D-themed exam-prep study app — cybersecurity, IT, and CS certification material wrapped in a dungeon-delve gamification loop. Spaced repetition, timed full-length practice exams, rich-content question rendering (diagrams + code), forgetting-curve memory forecasts, optional cloud sync.

**Live site:** [https://EvilPatrick06.github.io/dungeon-scholar/](https://EvilPatrick06.github.io/dungeon-scholar/) (deployed automatically from `main` via GitHub Actions)

## What it does

- **Study modes** — flashcards, multiple-choice drills, timed full-length practice exams (Phase 26e).
- **Spaced repetition** — FSRS-inspired algorithm (Phase 26g) tracks per-card recall difficulty + ease + interval.
- **Memory forecasting** — forgetting-curve projection (Phase 26h) shows what's at risk of being forgotten next week.
- **Rich content** — Markdown questions render diagrams (Mermaid) and syntax-highlighted code blocks inline (Phase 26f).
- **Dungeon-delve gamification** — every correct streak advances the player through dungeon rooms; bosses gate harder material.
- **Cloud sync** (optional) — Supabase + GitHub OAuth. Without it, progress lives in `localStorage` and the sign-in button is hidden.

## Stack

React 19 · Vite ^7 · Tailwind CSS · Vitest · Supabase (optional). Deployed to GitHub Pages via the `deploy.yml` workflow.

> The vite version is pinned to `^7` because `@vitejs/plugin-react ^4.3.4` declares peer support only for vite 4–7. Dependabot bumps to vite 8 cause `npm ci` to reject the install during deploy — keep the pin until plugin-react ships a vite-8-compatible release.

---

## Using the app (no install needed)

It's a web app — just visit **[EvilPatrick06.github.io/dungeon-scholar](https://EvilPatrick06.github.io/dungeon-scholar/)** in any modern browser (Chrome, Firefox, Safari, Edge). Works on desktop and mobile. No download, no account required.

**Your first session:**
1. Open the site. You'll land on the deck picker — each deck is one certification or topic (Security+, Network+, CompTIA A+, etc.).
2. Pick a deck → **Study**. Cards appear one at a time; flip them or pick the right answer.
3. Your progress is saved locally in your browser. Closing the tab is fine — open it again later and pick up where you left off.

**Study modes:**
- **Flashcards** — flip-and-self-grade. Best for early learning.
- **Multiple choice** — drill mode, the algorithm tracks which cards you keep getting wrong.
- **Practice exam** — timed, full-length, mimics the real cert exam (Phase 26e).

**Memory forecast** — the dashboard shows a forgetting-curve projection of which cards you're about to forget. Review those first.

**Dungeon delve** — a correct-answer streak walks you through dungeon rooms; bosses gate harder material. It's the same study queue, just visualized as a D&D-style progression so it feels like a game.

**Cross-device sync (optional):**
- Click **Sign in with GitHub** in the top-right to sync progress across devices.
- Without sign-in, everything stays in your browser's `localStorage`. If you clear browsing data, progress is lost.
- The sign-in button only appears if cloud-sync is configured on the deployment — see `Cloud sync setup` below.

**Troubleshooting:**
- *"Site won't load"* — GitHub Pages can take a minute to warm up after a deploy. Refresh after ~30 s.
- *"My progress disappeared"* — you probably cleared browser data or switched devices without enabling cloud sync. There's no recovery without sync; sign in first to avoid this next time.
- *"Cards look wrong / clipped"* — try a hard refresh (Ctrl-Shift-R / Cmd-Shift-R) to bust the service-worker cache.

---

## Build from source (developers)

```bash
cd dungeon-scholar
npm install
npm run dev        # http://localhost:5173
```

## Build + test

```bash
npm run build              # production bundle into dist/
npm run preview            # serve the production bundle locally
npm test                   # vitest run
npm run test:watch         # vitest watch
```

## Cloud sync setup (optional)

Without configuration the app skips the sign-in button and runs as a pure local PWA — progress lives in `localStorage`. To enable cross-device sync:

1. Follow [`docs/supabase-setup.md`](./docs/supabase-setup.md) (~10 minutes of Supabase dashboard work).
2. Copy `.env.example` → `.env.local` and fill in the Supabase URL + anon key.
3. Add the same two values as repo secrets at **Settings → Secrets → Actions** so the deploy workflow picks them up.

The AI **Oracle** (free-text answer grading + Oracle chat) is separately optional — see [`docs/oracle-setup.md`](./docs/oracle-setup.md). Without it the app grades by local string matching and the chat defaults to Tome Search.

## Answer keys are not secret (by design)

Tomes are plain JSON — every `correctAnswer` / `acceptedAnswers` field ships in
readable text, both in the sample tome files in this repo and inside your
browser's `localStorage` / cloud save after import. Anyone using DevTools can
read the key for any question. That's fine for self-study; it makes the app
unsuitable for **proctored or graded exams** as-is. A "sealed tome" format
(server-held or encrypted keys) is tracked as future work — until it ships,
don't use Dungeon Scholar as an assessment platform.

## Deploy

Every push to `main` triggers `.github/workflows/deploy.yml`. First-time setup (only once per fork):

1. Update the `base` path in `vite.config.js` to match the repo name (currently `/dungeon-scholar/`). Both slashes matter.
2. **Settings → Pages → Build and deployment → Source = GitHub Actions**.

The build takes ~60–90 seconds. When it goes green, the site is live at `https://<user>.github.io/<repo>/`.

## Project structure

```
dungeon-scholar/
├── .github/workflows/deploy.yml   Pages deploy (runs test + build) on push to main
├── src/
│   ├── App.jsx                    Orchestration shell (state, effects, render switch)
│   ├── game/                      Game data + pure helpers — titles, quests, items,
│   │                              bestiary, difficulty, achievements, tome, defaultState
│   ├── features/                  One folder per area, each owns its screen(s):
│   │   ├── home/                  HomeScreen (+ AudioPanel, ThemePanel)
│   │   ├── study/                 Flashcards / Quiz / Lab / Chat / MistakeVault / DomainStudy
│   │   ├── library/               LibraryScreen + share/import/paste/metadata modals
│   │   ├── progression/           Shop / Inventory / Crafting / Bestiary / Stable /
│   │   │                          Spellbook / Calendar / Ascension / RunHistory
│   │   ├── quests/                QuestBoard
│   │   ├── tutorial/              WelcomeModal, TutorialPanel
│   │   └── player/                usePlayerActions hook (all player-state mutators)
│   ├── components/                Shared components (RichContent, ErrorBoundary, ...)
│   │   └── ui/                    Presentation primitives (OrnatePanel, badges, modals, ...)
│   ├── router/                    useHashRoute — hash-based navigation
│   ├── services/                  FSRS (srs), oracle grader, session resume, devotion, ...
│   ├── hooks/  audio/  prompts/   Custom hooks, sound engine, AI prompt templates
│   ├── main.jsx                   React entry
│   └── index.css                  Tailwind directives
├── docs/
├── index.html
├── package.json
├── vite.config.js                 Vite + Pages base path
└── postcss.config.js
```

**URLs are hash-based** (`#/shop`, `#/library`, …): the browser Back button navigates
inside the app, refreshing keeps your current screen, and a tome is deep-linkable via
`#/tome/<id>` (or `#/tome/<id>/<screen>`). Hash fragments are never sent to the server, so
this works on GitHub Pages under any base path with no `404.html` redirect. Every screen
except Home is `React.lazy`-loaded as its own chunk, keeping the initial bundle small.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Blank page after deploy | `base` in `vite.config.js` doesn't match the repo name | Update + redeploy |
| Tailwind classes not applying | `index.css` not imported in `main.jsx` | Already imported in the scaffold; re-add if you removed it |
| Build fails in Actions but works locally | Vite doesn't strip TS-style syntax in `.jsx` files | Run `npm run build` locally to repro and fix the imports |
| `npm ci` fails with `ERESOLVE could not resolve` on vite | Dependabot bumped vite past `^7` | Keep vite pinned to `^7` (see Stack note above) |

## Known limitations + future-ideas

- Active bugs / debt → [`../docs/ISSUES-LOG-DUNGEON-SCHOLAR.md`](../docs/ISSUES-LOG-DUNGEON-SCHOLAR.md)
- Future-ideas + design-gotchas → [`../docs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](../docs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)
- Resolved archive → [`../docs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](../docs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)

## License

ISC — inherited from the parent repo.
