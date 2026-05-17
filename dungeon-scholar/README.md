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

## Quick start

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

## Deploy

Every push to `main` triggers `.github/workflows/deploy.yml`. First-time setup (only once per fork):

1. Update the `base` path in `vite.config.js` to match the repo name (currently `/dungeon-scholar/`). Both slashes matter.
2. **Settings → Pages → Build and deployment → Source = GitHub Actions**.

The build takes ~60–90 seconds. When it goes green, the site is live at `https://<user>.github.io/<repo>/`.

## Project structure

```
dungeon-scholar/
├── .github/workflows/deploy.yml   Pages deploy on push to main
├── src/
│   ├── App.jsx                    Top-level app
│   ├── components/                UI components (StudyDeck, ExamRunner, MemoryForecast, ...)
│   ├── data/                      Question banks (per-exam JSON)
│   ├── lib/                       FSRS scheduler, forgetting-curve math, supabase client
│   ├── main.jsx                   React entry
│   └── index.css                  Tailwind directives
├── docs/
│   └── supabase-setup.md          One-time Supabase dashboard walkthrough
├── tests/                         Vitest specs (FSRS, memory math, exam-runner state)
├── index.html
├── package.json
├── vite.config.js                 Vite + Pages base path
├── tailwind.config.js
└── postcss.config.js
```

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
