# Dungeon Scholar

A D&D-themed exam-prep study app — cybersecurity, IT, and CS certification material wrapped in a dungeon-delve gamification loop. Spaced repetition, timed full-length practice exams, rich-content question rendering (diagrams + code), forgetting-curve memory forecasts, optional cloud sync.

**Live site:** [https://evilpatrick06.github.io/home-lab/](https://evilpatrick06.github.io/home-lab/) (deployed automatically from `main` via GitHub Actions)

## What it does

- **Study modes** — flashcards, multiple-choice drills, timed full-length practice exams (Phase 26e).
- **Spaced repetition** — FSRS-inspired algorithm (Phase 26g) tracks per-card recall difficulty + ease + interval.
- **Memory forecasting** — forgetting-curve projection (Phase 26h) shows what's at risk of being forgotten next week.
- **Rich content** — Markdown questions render diagrams (Mermaid) and syntax-highlighted code blocks inline (Phase 26f).
- **Dungeon-delve gamification** — every correct streak advances the player through dungeon rooms; bosses gate harder material.
- **Cloud sync** (optional) — Supabase + GitHub OAuth. Without it, progress lives in `localStorage` and the sign-in button is hidden.

## Stack

React 19 · Vite ^8 · `@vitejs/plugin-react` ^6 · Tailwind CSS · Vitest · `vite-plugin-pwa` (installable offline PWA) · Supabase (optional). Deployed to GitHub Pages via the `dungeon-scholar-deploy.yml` workflow.

---

## Using the app (no install needed)

It's a web app — just visit **[evilpatrick06.github.io/home-lab](https://evilpatrick06.github.io/home-lab/)** in any modern browser (Chrome, Firefox, Safari, Edge). Works on desktop and mobile. No download, no account required.

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

## Install as an app (offline)

Dungeon Scholar is an installable, offline-first PWA. After the first load it
runs without a network connection — all local study (flashcards, quizzes,
practice exams, the dungeon delve, your `localStorage` progress) keeps working
on a plane, a subway, or a dead Wi-Fi connection.

**Android / desktop Chrome / Edge:** an **Install** prompt appears in the
address bar (or the browser menu → *Install Dungeon Scholar*). Installing adds a
standalone window / home-screen icon with no browser chrome.

**iOS Safari:** there's no automatic prompt — tap the **Share** button →
**Add to Home Screen**. The icon then launches the app full-screen like a native
app.

**Share a tome into the app (Web Share Target):** once installed on Chromium-based Android (or desktop Chrome/Edge), Dungeon Scholar registers as a share target — share a `.json` tome (or shared text) from another app or the OS share sheet and pick **Dungeon Scholar** to import it straight into your library. *Platform support is Chromium/Android only; iOS Safari and Firefox ignore the share target harmlessly.*

**Offline + updates:**
- Works offline after the first visit; the app shell and tomes are cached by the
  service worker.
- Updates apply automatically: after a new deploy, the next launch picks up the
  new version (auto-update on reload — no manual cache-busting needed).
- **Local study works fully offline. Cloud sync resumes automatically when
  you're back online** — Supabase sync and the AI Oracle are network-only by
  design (they're cross-origin and never cached), so they pause offline and
  catch up on reconnect.

> **iOS installed-PWA caveat:** an installed PWA on iOS gets its own isolated
> cookie jar separate from Safari. GitHub sign-in (cloud sync) will therefore
> prompt once *inside* the installed app even if you're already signed in in
> Safari. After that first sign-in it persists via `localStorage`, so you only
> see the prompt once.

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
unsuitable for **proctored or graded exams** as-is — unless you **seal** the
tome first (see below).

### Sealed tomes

**What sealing does.** Sealing encrypts the tome's entire study content —
flashcards, quiz, labs, and knowledge base — with **AES-256-GCM**. The key is
derived from a proctor passphrase via **PBKDF2-HMAC-SHA-256 at 600,000
iterations**. Only the metadata (title, domain) and per-section item counts stay
public; the answers are unreadable in the repo, in `localStorage`, in the cloud
save row, in exports, and in share codes. Even view-source on the encrypted file
reveals nothing but ciphertext.

**Proctor workflow.** Open **Library → Share (on the tome) → "Seal for proctored
use"**, choose a passphrase (≥ 8 characters, entered twice), and click **Seal &
download**. You get a `<tome>-sealed.json` file. Distribute that sealed file (or
the equivalent sealed share code) to students. The library entry on your own
machine is *not* modified — sealing is an export operation, so you keep your
plain working copy.

**Student flow.** A student imports the sealed tome like any other. It shows a
🔒 lock and cannot be studied until they enter the proctor passphrase to unlock
it. Unlocking decrypts the content **in memory only** for that session — nothing
unencrypted is written back to disk or the cloud — and the tome **re-locks on
refresh**, so the passphrase is needed again next session.

**Honest limits.** Sealing protects content **at rest** and from casual
inspection / view-source — it is **not DRM**. While a tome is *unlocked*, its
decrypted content lives in page memory and React state, so a determined student
with DevTools open *can* read it during an active unlocked session. Use sealing
to stop answer keys leaking through files, share codes, and the repo — not to
guarantee a student never sees the plaintext on their own machine. The
passphrase is **unrecoverable by design**: lose it and the sealed content is
gone for good.

## Deploy

Every push to `main` triggers `.github/workflows/dungeon-scholar-deploy.yml`. First-time setup (only once per fork):

> **Note:** this repo (the `home-lab` monorepo) deploys under `/home-lab/` via the `VITE_BASE=/home-lab/` build secret, so the live URL is `https://evilpatrick06.github.io/home-lab/`. A fork renamed to `dungeon-scholar` gets the zero-config `/dungeon-scholar/` base in `vite.config.js` instead — the two are not contradictory.

1. Update the `base` path in `vite.config.js` to match the repo name (currently `/dungeon-scholar/`). Both slashes matter.
2. **Settings → Pages → Build and deployment → Source = GitHub Actions**.

The build takes ~60–90 seconds. When it goes green, the site is live at `https://<user>.github.io/<repo>/`.

## Project structure

```
dungeon-scholar/
├── .github/workflows/dungeon-scholar-deploy.yml   Pages deploy (runs test + build) on push to main
├── src/
│   ├── App.jsx                    Orchestration shell (state, effects, render switch)
│   ├── game/                      Game data + pure helpers — titles, quests, items,
│   │                              bestiary, difficulty, achievements, tome, defaultState, starterDecks
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
│   │   ├── dungeon/               Canvas crawler subsystem — DungeonExplore render loop,
│   │   │                          tileRenderer, dungeonLogic, input/state hooks, map data
│   │   └── ui/                    Presentation primitives (OrnatePanel, badges, modals, ...)
│   ├── router/                    useHashRoute — hash-based navigation
│   ├── services/                  FSRS (srs), oracle grader, session resume, devotion, ...
│   │   └── locales/               en/es i18n string bundles
│   ├── utils/                     Cross-cutting helpers (date, lazyWithReload, ...)
│   ├── hooks/  audio/  prompts/   Custom hooks, sound engine, AI prompt templates
│   ├── main.jsx                   React entry
│   ├── sw.js                      Service worker (injectManifest PWA offline cache)
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

## Known limitations + future-ideas

- Active bugs / debt → [`../docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md`](../docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md)
- Future-ideas + design-gotchas → [`../docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](../docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)
- Resolved archive → [`../docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](../docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)

## License

ISC. See [`LICENSE`](./LICENSE).
