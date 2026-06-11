# PHASE-18 — dungeon-scholar security round

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Close every open dungeon-scholar security finding: stop production console logging of full Supabase error objects (H6) via a tiny prod-stripping logger module (L7), detect and loudly surface a missing Row-Level-Security configuration on forked Supabase projects (M11), move the hardcoded personal Cloudflare Worker Oracle endpoint into a `VITE_ORACLE_ENDPOINT` build variable so forks stop POSTing user answers to the owner's infrastructure (M9), add defense-in-depth CSP + Referrer-Policy meta tags to the production bundle (M8), warn forkers at startup when the Vite base path cannot match the Supabase OAuth redirect (L13), stop embedding the raw user UUID in the Realtime channel topic (L9), and document in the README that tome answer keys are intentionally client-readable (L10). All changes are client-side React/JS in `dungeon-scholar/` plus its docs and the shared `.github/workflows/deploy.yml`.

## Dependencies & cross-phase notes

- **No prerequisite phases.** PHASE-18 is in the independent 01–19 block of PHASE-INDEX.md.
- **PHASE-17 (ds-bug-round) touches overlapping files**: `dungeon-scholar/src/services/oracleGrader.js` (M6 greedy-regex fix at line 52, M2 AbortController at line 90 + `App.jsx:4354–4368`), `dungeon-scholar/src/services/persistence.js`, `dungeon-scholar/src/App.jsx` (several line ranges), `dungeon-scholar/src/audio/sound.js`. PHASE-18's oracleGrader change is confined to the endpoint constant at the top of the file and the early-return in `gradeAnswer` — it does not touch `extractJsonVerdict` (M6) or the `signal` plumbing (M2). If PHASE-17 has already landed when this phase executes, re-verify the line numbers cited below with the verification commands; the symbol names are stable anchors.
- **PHASE-19 (ds-a11y-ux-round)** owns the modal-a11y wrapper (H4) that will eventually cover `AccountPanel.jsx`; PHASE-18's edits to AccountPanel are limited to the two `console.error` call sites and do not change its modal markup.
- **PHASE-39/40/41** (ds architecture/PWA/sealed tomes) are downstream: PHASE-41 owns sealed/proctored tomes (F3) which the L10 README note references; PHASE-39 may move code out of `App.jsx`, so this phase's `App.jsx` additions (RLS banner wiring, Oracle chat endpoint usage) should stay small and import-based so they survive the later split.
- **`.github/workflows/deploy.yml` is shared repo infrastructure** (deploys dungeon-scholar to GitHub Pages). No other 2026-06-10 phase edits it; PHASE-17's H3 finding against it (`branches: [master]` only) is already fixed in the live tree (verified below).

## Verified findings

All verifications were run 2026-06-10 against the live tree at the repo root (`/home/patrick/home-lab/.claude/worktrees/ai-p6-roadmap` — substitute your checkout root). dungeon-scholar is React 19 + Vite 8 + Vitest 4 + Tailwind 4 + `@supabase/supabase-js` ^2 (`dungeon-scholar/package.json`), deployed to GitHub Pages by `.github/workflows/deploy.yml`.

### F1 (H6) — `console.error` ships full Supabase error objects in production

**Corrected claim.** Six production `console.*` sites exist (the audit cited only three, with two line numbers stale). Full inventory, verified:

| File:line | Call | Payload risk |
|---|---|---|
| `dungeon-scholar/src/components/AccountPanel.jsx:34` | `console.error(err)` in `doDeleteCloud` | full Supabase PostgrestError (may include user UUID, row data, response body) |
| `dungeon-scholar/src/components/AccountPanel.jsx:45` | `console.error(err)` in `doDeleteAccount` | same (audit said line 46 — actual is 45) |
| `dungeon-scholar/src/hooks/usePlayerState.js:348` | `console.error('Cloud pull failed:', err)` | full pull error (audit said line 314 — actual is 348) |
| `dungeon-scholar/src/App.jsx:1059` | `console.error('[Dungeon Scholar] ErrorBoundary caught:', error, info)` | full error + React componentStack |
| `dungeon-scholar/src/App.jsx:1380` | `console.error('OAuth callback exchange failed:', err)` | OAuth exchange error (may include token-endpoint response fragments) |
| `dungeon-scholar/src/components/SignInButton.jsx:18` | `console.error('Sign-in failed:', err)` | OAuth initiation error |

These objects can carry user UUIDs, JWT claim fragments, and response bodies, visible to shoulder-surfers and console-mirroring browser extensions in production. Fix: a logger module (F7/L7) that logs message-only via `console.warn` when `import.meta.env.PROD`, full objects in dev.

Verification:

```bash
grep -rn "console\." dungeon-scholar/src --include="*.js" --include="*.jsx" | grep -v test | grep -v "test-setup"
# → exactly the 6 lines tabulated above (plus an eslint-disable comment at App.jsx:1058)
sed -n '34p;45p' dungeon-scholar/src/components/AccountPanel.jsx   # both: } catch (err) { console.error(err); }
sed -n '348p' dungeon-scholar/src/hooks/usePlayerState.js          # console.error('Cloud pull failed:', err);
```

### F2 (M11) — no runtime RLS validation on Supabase saves

**Verified as reported.** `dungeon-scholar/src/services/cloudSync.js` (97 lines, read in full) contains `pullSave`, `pushSave`, `subscribeSaves`, `deleteCloudSave`, `deleteAccount`, `upsertProfile` — no RLS probe anywhere. `dungeon-scholar/docs/supabase-setup.md` step 2 (lines 29–56) includes the correct `alter table … enable row level security` + own-row policies SQL, but has **no verification step** — a fork that pastes a partial schema (omitting the `enable row level security` lines) gets a working app where every authenticated user can read/write every other user's `saves` row, silently.

Supabase semantics confirmed against the official docs (see Research notes): with RLS enabled and own-row policies, a cross-user `select` returns an **empty result set** (policies act as implicit `WHERE` clauses — no error); with RLS disabled, the anon/publishable key reads everything. So a reliable runtime probe is: after sign-in, `select user_id from saves where user_id <> <me> limit 1` — any row returned ⇒ RLS is off (or mis-policied). Known limitation: with zero other-user rows in the table the probe cannot detect the misconfiguration; document this.

Verification:

```bash
grep -n "rls\|row level\|relrowsecurity\|neq(" dungeon-scholar/src/services/cloudSync.js   # → no output
grep -n "enable row level security" dungeon-scholar/docs/supabase-setup.md                  # → lines 46-47 (schema SQL only)
grep -n "verify\|Verify" dungeon-scholar/docs/supabase-setup.md                             # → no verification section
```

### F3 (M9) — Oracle endpoint hardcoded as a personal Cloudflare Worker URL — in TWO places

**Corrected claim.** The audit cited only `oracleGrader.js:5`. There is a **second hardcoded copy** in the Oracle chat feature:

- `dungeon-scholar/src/services/oracleGrader.js:5` — `const ORACLE_ENDPOINT = 'https://dungeon-scholar-oracle.patrick-home-lab.workers.dev';` (used by `gradeAnswer` at line 108 for Lab/Quiz/Dungeon fill-blank grading).
- `dungeon-scholar/src/App.jsx:6234` — `const response = await fetch("https://dungeon-scholar-oracle.patrick-home-lab.workers.dev", { … })` inside the Oracle chat `send()` (chat mode state `const [mode, setMode] = useState('oracle')` at `App.jsx:6046`).

Both POST an Anthropic-Messages-shaped body (`model`, `max_tokens`, `system`, `messages`) with user answers / chat text to the owner's Worker. Consequences for forks: user data goes to the owner's infra and quota; the URL in every bundle doxxes owner infrastructure (DoS surface). `dungeon-scholar/.env.example` exists (5 lines, Supabase vars only — no Oracle var). `.github/workflows/deploy.yml` injects only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_BASE` at build — no Oracle var. No Worker documentation exists anywhere (`grep -rni "worker\|oracle" dungeon-scholar/README.md dungeon-scholar/docs/` → only an unrelated "service-worker cache" line in the README).

**Additional time-critical fact found during verification:** both call sites send `model: "claude-sonnet-4-20250514"` (`App.jsx:6238`, `oracleGrader.js:112`). Per Anthropic's published deprecations, `claude-sonnet-4-20250514` **retires 2026-06-15** (days away) — after that the Worker's upstream calls 404 and the Oracle silently falls back to string-matching forever. The replacement alias is `claude-sonnet-4-6`. Since this phase already rewrites both request bodies' surrounding code, the model string swap lands here.

GitHub Actions semantics confirmed (see Research notes): an unset secret evaluates to an **empty string** and secrets are **not passed to workflows triggered from forks** — so wiring `VITE_ORACLE_ENDPOINT: ${{ secrets.VITE_ORACLE_ENDPOINT }}` gives forks an empty endpoint (Oracle disabled, local fallback) automatically, with zero fork-side action.

Verification:

```bash
grep -rn "workers.dev" dungeon-scholar/src/        # → oracleGrader.js:5 AND App.jsx:6234
grep -n "claude-sonnet" dungeon-scholar/src/services/oracleGrader.js dungeon-scholar/src/App.jsx
# → oracleGrader.js:112 and App.jsx:6238, both "claude-sonnet-4-20250514"
cat dungeon-scholar/.env.example                   # → only VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
grep -n "VITE_" .github/workflows/deploy.yml       # → VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_BASE only
```

### F4 (M8) — no CSP meta tag, no Referrer-Policy

**Verified as reported.** `dungeon-scholar/index.html` is 12 lines: charset + viewport + title only. No CSP, no referrer meta. Today's concrete exposure is low (no `dangerouslySetInnerHTML` in src — verified by grep; Oracle JSON is parsed, never HTML-interpreted), but CSP catches future regressions and GitHub Pages **cannot set custom HTTP response headers**, so a `<meta http-equiv>` tag is the only delivery mechanism available.

External origins the production app legitimately contacts (full inventory from grep of `src/`):

- `https://<ref>.supabase.co` (REST auth/data) and `wss://<ref>.supabase.co` (Realtime websocket) — env-dependent, so wildcard `https://*.supabase.co wss://*.supabase.co`.
- The Oracle endpoint — after F3 this is env-configurable; default owner host matches `https://*.workers.dev`. The build can additionally whitelist the exact origin parsed from `VITE_ORACLE_ENDPOINT`.
- `https://avatars.githubusercontent.com` — `user.avatarUrl` rendered by `AccountPanel.jsx:60` and `ProfileChip.jsx` (`img-src`).
- `data:` URIs — SVG noise background at `App.jsx:2932` (CSS `background-image: url("data:image/svg+xml,…")` ⇒ governed by `img-src`).
- KaTeX is lazy-imported locally (`RichContent.jsx:26-27` imports `katex` + `katex/dist/katex.min.css` from node_modules); its fonts are emitted as same-origin Vite assets ⇒ `font-src 'self' data:`.
- `URL.createObjectURL` at `App.jsx:10058` is a download anchor (`a[download]`), not a fetch/navigation — not governed by CSP fetch directives.
- Tailwind 4 runtime + React inline `style={{…}}` attributes require `style-src 'unsafe-inline'`.

Constraints confirmed (see Research notes): `frame-ancestors`, `report-uri`, and `sandbox` are ignored in meta-delivered CSP; the meta tag must be in `<head>`; `'self'` in `connect-src` covers same-origin `ws:`/`wss:` secure upgrades. Vite's dev server (HMR websocket, injected module scripts) must NOT be constrained — inject the CSP **only at build time** via a `transformIndexHtml` plugin with `apply: 'build'`, keeping dev untouched. The Referrer-Policy meta (`<meta name="referrer" content="strict-origin-when-cross-origin">`) is harmless in dev and goes straight into `index.html`.

Verification:

```bash
cat dungeon-scholar/index.html                                       # 12 lines, no CSP/referrer meta
grep -rn "dangerouslySetInnerHTML" dungeon-scholar/src/              # → no output
grep -rn "avatars.githubusercontent\|avatarUrl" dungeon-scholar/src/components/AccountPanel.jsx | head -2
grep -n "transformIndexHtml\|http-equiv" dungeon-scholar/vite.config.js dungeon-scholar/index.html  # → no output
```

### F5 (L13) — `redirectTo` BASE_URL mismatch is not surfaced to forkers

**Verified as reported.** `dungeon-scholar/src/services/supabase.js:29` builds the OAuth redirect as `window.location.origin + import.meta.env.BASE_URL` inside `signInWithGitHub()`. `vite.config.js` sets `base` from `process.env.VITE_BASE || '/dungeon-scholar/'` (line 11). When the configured base does not match the path the app is actually served from (fork renamed the repo but kept `VITE_BASE=/home-lab/`, or vice versa), the app half-loads from the correct path but `redirectTo` points elsewhere ⇒ Supabase rejects the OAuth redirect with a generic error, with no diagnostic. There is no startup check anywhere (`grep -n "BASE_URL" dungeon-scholar/src -r` → only `supabase.js:29`). Note the related H1/H2 audit findings (owner-specific base/docs) are **already fixed** in the live tree — `vite.config.js` defaults to `/dungeon-scholar/` with a `VITE_BASE` override, and `docs/supabase-setup.md` uses placeholders + a worked example — so L13's remaining gap is purely the missing runtime diagnostic.

The reliable detectable signal: on a `*.github.io` host the first path segment **must** equal the Vite base (GitHub Pages serves project sites under `/<repo>/`); on any host, `location.pathname` should start with `BASE_URL`. Either failing ⇒ emit one `console.warn` (via the F1 logger, message-only — no secrets involved) naming the expected fix (`VITE_BASE`, `vite.config.js` base, Supabase redirect URL list).

Verification:

```bash
sed -n '24,32p' dungeon-scholar/src/services/supabase.js     # redirectTo: window.location.origin + import.meta.env.BASE_URL
sed -n '7,13p' dungeon-scholar/vite.config.js                # const BASE = process.env.VITE_BASE || '/dungeon-scholar/'
grep -rn "BASE_URL" dungeon-scholar/src/                     # → only supabase.js:29
```

### F6 (L9) — Realtime channel name embeds the raw user UUID

**Verified as reported, with one precision.** `dungeon-scholar/src/services/cloudSync.js:54` — `supabase.channel(\`saves:${userId}\`)`. The channel topic (visible in Supabase Realtime metadata/inspector and any topic-level logging) carries the raw auth UUID. The fix is to hash the UUID before composing the topic. Precision: the `postgres_changes` filter on line 57 (`filter: \`user_id=eq.${userId}\``) **must keep the raw UUID** — the server needs it to filter rows; it travels over the authenticated WSS connection and is not part of the topic name. Only the topic string is in scope. A synchronous non-cryptographic hash (FNV-1a 32-bit) is sufficient: the topic is a label, not a secret-keyed value, and `subscribeSaves` is synchronous (no room for `crypto.subtle`'s async digest without changing the hook contract at `usePlayerState.js:359`).

Verification:

```bash
sed -n '51,58p' dungeon-scholar/src/services/cloudSync.js
# 53:  const channel = supabase
# 54:    .channel(`saves:${userId}`)
# 57:      { event: '*', schema: 'public', table: 'saves', filter: `user_id=eq.${userId}` },
```

### F7 (L7) — no logger module for prod-stripped error messages

**Verified as reported.** `ls dungeon-scholar/src/services/` → no `logger.js`; `grep -rn "import.meta.env.PROD" dungeon-scholar/src/` → no output (the only env reads are the two Supabase vars + `BASE_URL` in `supabase.js`). Lands together with F1 (the logger is the H6 fix vehicle). Vitest 4's `vi.stubEnv('PROD', true)` mutates `import.meta.env.PROD` (boolean-typed for PROD/DEV/SSR) and `vi.unstubAllEnvs()` restores — so the logger can read the env at call time and be tested without dynamic imports (see Research notes).

### F8 (L10) — tome JSON answer keys are client-readable; README does not say so

**Corrected claim.** The audit said keys are "publicly readable in bundle". Precisely: the three sample tomes (`dungeon-scholar/tome-aws-clf-c02.json`, `tome-ccst-cybersecurity.json`, `tome-security-plus-sy0-701.json`) sit at the package root of the public repo — they are **not** imported into the Vite bundle (no `import`/`fetch` of them anywhere in `src/`; users import tomes by file/paste/share-code via the Hash sigil UI, `App.jsx:10054+`). Once imported, the full tome JSON — including every `correctAnswer`/`acceptedAnswers` field (e.g. `tome-security-plus-sy0-701.json:1186`) — lives in plaintext in `localStorage` and the Supabase `saves` row, readable via DevTools. This is intentional (client-only app) but undisclosed: `dungeon-scholar/README.md` (127 lines, read in full) never mentions it. Fix is docs-only: a short "Answer keys are not secret" section in the README, pointing at the sealed-tomes future work (F3, owned by PHASE-41).

Verification:

```bash
grep -rn "tome-aws\|tome-security\|tome-ccst" dungeon-scholar/src/ | grep -v test   # → no output (not bundled)
grep -n "correctAnswer" dungeon-scholar/tome-security-plus-sy0-701.json | head -2   # → answer keys in plaintext
grep -in "answer key\|proctor\|cheat" dungeon-scholar/README.md                     # → no output
```

## Sub-phases

Run `cd dungeon-scholar` for all npm/npx commands below. Targeted checks are cheap single-file vitest runs / builds, NOT the full gate (rule 5).

### 18A — logger module + convert all six console sites (F1/H6 + F7/L7)

**Objective:** ship `src/services/logger.js` and route every production `console.*` call through it; prod = message-only `console.warn`, dev = full objects on `console.error`.

**Files:** new `dungeon-scholar/src/services/logger.js`, new `dungeon-scholar/src/services/logger.test.js`, edit `dungeon-scholar/src/components/AccountPanel.jsx`, `dungeon-scholar/src/components/SignInButton.jsx`, `dungeon-scholar/src/hooks/usePlayerState.js`, `dungeon-scholar/src/App.jsx`.

**Steps:**

1. Create `src/services/logger.js`:

   ```js
   // Production-safe logging. In PROD builds, errors are logged message-only via
   // console.warn so Supabase error objects (user UUIDs, JWT fragments, response
   // bodies) never reach the console. In dev, full objects go to console.error.
   const PREFIX = '[Dungeon Scholar]';

   export function errorMessageOf(err) {
     if (err == null) return 'unknown error';
     if (typeof err === 'string') return err;
     if (typeof err.message === 'string' && err.message) return err.message;
     try { return String(err); } catch { return 'unknown error'; }
   }

   export function logError(context, err) {
     if (import.meta.env.PROD) {
       // eslint-disable-next-line no-console
       console.warn(`${PREFIX} ${context}: ${errorMessageOf(err)}`);
     } else {
       // eslint-disable-next-line no-console
       console.error(`${PREFIX} ${context}:`, err);
     }
   }

   export function logWarn(context, detail = '') {
     // eslint-disable-next-line no-console
     console.warn(`${PREFIX} ${context}${detail ? `: ${detail}` : ''}`);
   }
   ```

   `import.meta.env.PROD` is read at call time (not module scope) so `vi.stubEnv` works with static imports.
2. Convert the six sites (keep surrounding logic identical):
   - `AccountPanel.jsx:34` → `} catch (err) { logError('Delete cloud save failed', err); }`; `:45` → `} catch (err) { logError('Delete account failed', err); }`; add `import { logError } from '../services/logger.js';`.
   - `SignInButton.jsx:18` → `logError('Sign-in failed', err);` + import.
   - `usePlayerState.js:348` → `logError('Cloud pull failed', err);` + import (`from '../services/logger.js'`).
   - `App.jsx:1380` (OAuth callback catch) → `logError('OAuth callback exchange failed', err);`.
   - `App.jsx:1059` (`componentDidCatch`) → `logError('ErrorBoundary caught', error);` and in dev additionally log `info.componentStack`: replace the body with `logError('ErrorBoundary caught', error); if (!import.meta.env.PROD) { console.error(info?.componentStack); }` (keep/move the existing `// eslint-disable-next-line no-console` as needed). Add `import { logError } from './services/logger.js';` to App.jsx.
3. Write `src/services/logger.test.js` (vitest, colocated, mirrors `supabase.test.js` conventions): spy `console.warn`/`console.error` with `vi.spyOn`; cases: (a) `vi.stubEnv('PROD', true)` ⇒ `logError('ctx', new Error('boom'))` calls `console.warn` once with a string containing `ctx: boom` and never calls `console.error`; (b) the warn-string does not contain other enumerable payload (construct an error-like `{ message: 'boom', secret: 'uuid-123' }` and assert the logged string excludes `uuid-123`); (c) `vi.stubEnv('PROD', false)` ⇒ `console.error` called with the original object reference; (d) `errorMessageOf` handles `null`, string, `{message}`, and message-less objects. Use `afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); })`.

**Targeted check:** `npx vitest run src/services/logger.test.js src/hooks/usePlayerState.test.jsx`.

**Acceptance:** `grep -rn "console\." dungeon-scholar/src --include="*.js" --include="*.jsx" | grep -v test | grep -v logger.js | grep -v "eslint-disable"` returns only the dev-only componentStack line in App.jsx (or nothing); logger tests green; existing usePlayerState tests still green.

### 18B — Oracle endpoint → `VITE_ORACLE_ENDPOINT` (F3/M9), both call sites, model bump, Worker stub doc

**Objective:** no hardcoded Worker URL anywhere in `src/`; empty/unset env ⇒ Oracle silently disabled (string-match fallback for grading, Tome Search fallback for chat); owner deploy keeps the Oracle via a repo secret; a documented Worker stub lets forks self-host; both request bodies use the non-retired `claude-sonnet-4-6` model alias.

**Files:** `dungeon-scholar/src/services/oracleGrader.js`, `dungeon-scholar/src/services/oracleGrader.test.js`, `dungeon-scholar/src/App.jsx` (chat `send()` ~6234 and mode default ~6046), `dungeon-scholar/.env.example`, `.github/workflows/deploy.yml`, new `dungeon-scholar/docs/oracle-setup.md`, `dungeon-scholar/README.md` (pointer).

**Steps:**

1. In `oracleGrader.js`, replace line 5 with call-time config helpers and export them:

   ```js
   // The Oracle endpoint is deployment-specific. Unset/empty ⇒ Oracle features
   // are disabled and grading falls back to local string matching. See
   // docs/oracle-setup.md for hosting your own proxy Worker.
   export const ORACLE_MODEL = 'claude-sonnet-4-6';

   export function getOracleEndpoint() {
     const raw = import.meta.env.VITE_ORACLE_ENDPOINT;
     const url = typeof raw === 'string' ? raw.trim() : '';
     return /^https?:\/\//.test(url) ? url : '';
   }

   export function isOracleConfigured() {
     return getOracleEndpoint() !== '';
   }
   ```

2. In `gradeAnswer` (currently fetches at line 108): before the fetch, add `const endpoint = getOracleEndpoint(); if (!endpoint) { return fallbackResult({ userAnswer, expectedAnswer, acceptedAnswers, reason: 'Oracle not configured' }); }` (after the empty-answer guard so empty answers still short-circuit as `source: 'local'`). Fetch `endpoint` instead of the constant, and change `model: 'claude-sonnet-4-20250514'` → `model: ORACLE_MODEL`. The existing fallback badge UI ("Tome match (Oracle silent)", `App.jsx:5595/5994`) already renders `source: 'fallback'` with the reason in its `title` — no UI change needed.
3. In `App.jsx` Oracle chat: add `getOracleEndpoint, isOracleConfigured, ORACLE_MODEL` to the existing `from './services/oracleGrader.js'` import (line 25). At line 6046 change the default mode to `useState(isOracleConfigured() ? 'oracle' : 'search')`. In `send()` (~6228), before `setLoading(true)`/the fetch: if `mode !== 'search' && !isOracleConfigured()`, push `{ role: 'system_notice', content: 'The Oracle is not configured on this deployment. Falling back to Tome Search.' }` + `renderSearchResults(query)` into chat history (same shape as the existing fallback path at the bottom of `send()`) and return. Replace the hardcoded URL at 6234 with `getOracleEndpoint()` and the model string at 6238 with `ORACLE_MODEL`.
4. `.env.example`: append

   ```bash
   # Optional. URL of your Oracle proxy Worker (AI grading + Oracle chat).
   # Leave unset to disable the Oracle — the app falls back to local string
   # matching / Tome Search. See docs/oracle-setup.md to host your own.
   VITE_ORACLE_ENDPOINT=
   ```

5. `.github/workflows/deploy.yml`: in the `npm run build` step `env:` block add `VITE_ORACLE_ENDPOINT: ${{ secrets.VITE_ORACLE_ENDPOINT }}` with a comment that forks without the secret build with the Oracle disabled (unset secrets render as empty strings; fork-triggered workflows never receive secrets). **User action after merge:** add repo secret `VITE_ORACLE_ENDPOINT=https://dungeon-scholar-oracle.patrick-home-lab.workers.dev` so the owner deploy keeps its Oracle — record this in the Completed section when the sub-phase lands.
6. New `dungeon-scholar/docs/oracle-setup.md`: explain the proxy's purpose (keeps the Anthropic API key out of the client; the browser POSTs an Anthropic Messages body, the Worker adds auth), then a complete stub:

   ```js
   // wrangler deploy — set ANTHROPIC_API_KEY via `wrangler secret put ANTHROPIC_API_KEY`
   const ALLOWED_ORIGIN = 'https://<your-username>.github.io';
   const CORS = {
     'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
     'Access-Control-Allow-Methods': 'POST,OPTIONS',
     'Access-Control-Allow-Headers': 'Content-Type',
     'Access-Control-Max-Age': '86400',
     'Vary': 'Origin',
   };

   export default {
     async fetch(request, env) {
       if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
       if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS });
       const upstream = await fetch('https://api.anthropic.com/v1/messages', {
         method: 'POST',
         headers: {
           'content-type': 'application/json',
           'x-api-key': env.ANTHROPIC_API_KEY,
           'anthropic-version': '2023-06-01',
         },
         body: await request.text(),
       });
       return new Response(upstream.body, {
         status: upstream.status,
         headers: { ...CORS, 'content-type': 'application/json' },
       });
     },
   };
   ```

   Document: restrict `ALLOWED_ORIGIN` to the deployed Pages origin; the client sends `model: claude-sonnet-4-6` (note the old dated id `claude-sonnet-4-20250514` retires 2026-06-15); add rate limiting (Workers rate-limit bindings or a daily budget cap) since the endpoint is publicly callable from the configured origin; set `VITE_ORACLE_ENDPOINT` in `.env.local` + as a repo Actions secret; if the Worker is hosted off `*.workers.dev`, the CSP `connect-src` automatically whitelists the exact origin parsed from `VITE_ORACLE_ENDPOINT` at build (18F).
7. README "Cloud sync setup" area: add one line pointing optional Oracle setup at `docs/oracle-setup.md`.
8. Update `oracleGrader.test.js`: add `beforeEach(() => vi.stubEnv('VITE_ORACLE_ENDPOINT', 'https://oracle.test.example'))` + `afterEach(() => vi.unstubAllEnvs())` around the `gradeAnswer` describe block so the existing fetch-path tests keep exercising the Oracle path. New tests: (a) unset/empty env ⇒ `gradeAnswer` returns `source: 'fallback'`, `fallbackReason: 'Oracle not configured'`, and `fetchImpl` is **not** called; (b) `fetchImpl` receives the stubbed endpoint as its first argument; (c) request body `model` is `'claude-sonnet-4-6'`; (d) `isOracleConfigured()` false for empty/whitespace/garbage (`'not a url'`), true for `https://…`.

**Targeted check:** `npx vitest run src/services/oracleGrader.test.js` and `grep -rn "workers.dev\|claude-sonnet-4-20250514" dungeon-scholar/src/` → no output.

**Acceptance:** no hardcoded Worker URL or dated model id in `src/`; grading and chat degrade gracefully when unconfigured (badge/notice paths reachable); deploy workflow injects the secret; `docs/oracle-setup.md` exists with the stub + CORS + rate-limit guidance; all oracleGrader tests green.

### 18C — runtime RLS exposure probe + critical banner (F2/M11)

**Objective:** after sign-in, probe whether other users' `saves` rows are readable; if so, render a persistent critical banner; add verification SQL to the setup doc.

**Files:** `dungeon-scholar/src/services/cloudSync.js`, `dungeon-scholar/src/services/cloudSync.test.js`, new `dungeon-scholar/src/components/RlsWarningBanner.jsx`, new `dungeon-scholar/src/components/RlsWarningBanner.test.jsx`, `dungeon-scholar/src/App.jsx`, `dungeon-scholar/docs/supabase-setup.md`.

**Steps:**

1. Add to `cloudSync.js`:

   ```js
   /**
    * Probe for a missing-RLS misconfiguration: with correct own-row policies a
    * cross-user select returns zero rows (policies are implicit WHERE clauses);
    * any row coming back means RLS is disabled or mis-policied and every
    * authenticated user can read everyone's saves. Read-only and cheap (limit 1).
    * Limitation: cannot detect the problem before a second user has a row.
    */
   export async function checkRlsExposure(userId) {
     if (!supabase || !userId) return { checked: false, exposed: false };
     try {
       const { data, error } = await supabase
         .from('saves')
         .select('user_id')
         .neq('user_id', userId)
         .limit(1);
       if (error) return { checked: false, exposed: false };
       return { checked: true, exposed: Array.isArray(data) && data.length > 0 };
     } catch {
       return { checked: false, exposed: false };
     }
   }
   ```

2. `cloudSync.test.js`: extend the `vi.mock('./supabase.js', …)` factory's `from()` return with a `select → neq → limit` chain (add `const neq = vi.fn(); const limit = vi.fn();` alongside the existing fn spies; have `select` return `{ eq: …existing…, neq: (...a) => { neq(...a); return { limit: (...b) => { limit(...b); return limitResult(); } }; } }` where `limitResult` is a resettable `vi.fn`). Tests: rows ⇒ `{checked:true, exposed:true}`; empty array ⇒ `{checked:true, exposed:false}`; error object ⇒ `{checked:false}`; `neq` called with `('user_id', 'u1')`.
3. New `src/components/RlsWarningBanner.jsx` — small presentational component matching house style (amber/red bordered, italic), fixed to the top, `role="alert"`:

   ```jsx
   export function RlsWarningBanner({ onDismiss }) {
     return (
       <div role="alert" className="fixed top-0 inset-x-0 z-50 px-4 py-3 text-sm italic text-red-100 border-b-2 border-red-700" style={{ background: 'rgba(80, 10, 10, 0.97)' }}>
         <strong>⚠ Cloud misconfiguration:</strong> this Supabase project lets signed-in users read other users&apos; saves —
         Row Level Security is not active on the <code>saves</code> table. Cloud sync is unsafe until it is fixed.
         Run the verification SQL in <code>docs/supabase-setup.md</code> (step 8).
         {onDismiss && (
           <button onClick={onDismiss} className="ml-3 underline text-red-200" aria-label="Dismiss warning">Dismiss</button>
         )}
       </div>
     );
   }
   ```

   Colocated test: renders the alert role + saves-table copy; Dismiss fires `onDismiss`.
4. Wire in `App.jsx` (`DungeonScholarApp`, user available from `useAuth()` at line 1343): add `const [rlsExposed, setRlsExposed] = useState(false);` and

   ```jsx
   useEffect(() => {
     if (!user?.id) { setRlsExposed(false); return; }
     let active = true;
     checkRlsExposure(user.id).then((r) => { if (active && r.checked) setRlsExposed(r.exposed); }).catch(() => {});
     return () => { active = false; };
   }, [user?.id]);
   ```

   Import `checkRlsExposure` alongside the existing `cloudSync.js` imports. Render `{rlsExposed && <RlsWarningBanner onDismiss={() => setRlsExposed(false)} />}` adjacent to the `sync.mergeRequired && <MergeChooser …>` block (~`App.jsx:2944`). The probe is read-only, so StrictMode double-invocation is harmless. Dismissal is session-local only (re-probes on next sign-in/reload) — the banner is a misconfiguration alarm, not a setting.
5. `docs/supabase-setup.md`: append a step **8. Verify Row Level Security** with:

   ```sql
   select c.relname as table, c.relrowsecurity as rls_enabled
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('profiles', 'saves');
   ```

   Both rows must show `rls_enabled = t`; if not, re-run the `alter table … enable row level security;` lines from step 2. Mention the in-app red banner as the runtime symptom of getting this wrong, and that the banner can only fire once a second user's row exists.

**Targeted check:** `npx vitest run src/services/cloudSync.test.js src/components/RlsWarningBanner.test.jsx`.

**Acceptance:** probe function + tests green; banner component + test green; App wiring compiles (covered by build in 18F's check / end-of-phase vitest); setup doc has the verification SQL.

### 18D — startup base-path/redirect diagnostic (F5/L13)

**Objective:** one dev-and-prod `console.warn` at startup when `BASE_URL` cannot match the served path, naming the fix.

**Files:** `dungeon-scholar/src/services/supabase.js`, `dungeon-scholar/src/services/supabase.test.js`, `dungeon-scholar/src/App.jsx` (one call).

**Steps:**

1. Add to `supabase.js` a pure, testable helper + a thin runner:

   ```js
   import { logWarn } from './logger.js';

   /**
    * Returns a human-readable mismatch description, or null when the base looks
    * right. On *.github.io, Pages serves project sites under /<repo>/, so the
    * first path segment must equal the Vite base; elsewhere the served path
    * must start with the base. A mismatch breaks the OAuth redirectTo
    * (window.location.origin + BASE_URL) with an opaque Supabase error.
    */
   export function detectBaseMismatch({ hostname, pathname, baseUrl }) {
     if (!baseUrl || baseUrl === '/') return null; // dev server / root deploys
     const normBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
     if (hostname.endsWith('.github.io')) {
       const firstSegment = `/${pathname.split('/')[1] || ''}/`;
       if (firstSegment !== normBase) {
         return `app is served from "${firstSegment}" but built with base "${normBase}"`;
       }
       return null;
     }
     if (!pathname.startsWith(normBase) && `${pathname}/` !== normBase) {
       return `app is served from "${pathname}" which is outside the built base "${normBase}"`;
     }
     return null;
   }

   export function warnIfBaseMismatch() {
     const mismatch = detectBaseMismatch({
       hostname: window.location.hostname,
       pathname: window.location.pathname,
       baseUrl: import.meta.env.BASE_URL,
     });
     if (mismatch) {
       logWarn(
         'Base path mismatch',
         `${mismatch}. GitHub OAuth sign-in will fail (redirectTo = origin + base). ` +
         'Fix: set VITE_BASE (deploy.yml / .env.local) or vite.config.js base to "/<repo-name>/", ' +
         'and list the same URL in Supabase → Authentication → URL Configuration.'
       );
     }
   }
   ```

2. Call it once on mount in `App.jsx` — inside the existing OAuth-callback effect (~line 1378): `warnIfBaseMismatch();` before `consumeOAuthCallback()…`. Add to the existing `./services/supabase.js` import list.
3. `supabase.test.js`: unit tests for `detectBaseMismatch` (pure — no jsdom navigation needed): github.io match (`hostname:'user.github.io', pathname:'/dungeon-scholar/', baseUrl:'/dungeon-scholar/'` ⇒ null), github.io mismatch (`pathname:'/home-lab/'`, `baseUrl:'/dungeon-scholar/'` ⇒ string mentioning both), non-github host prefix match/mismatch, root base ⇒ null, deep path under the base ⇒ null (`pathname:'/dungeon-scholar/some/route'`).

**Targeted check:** `npx vitest run src/services/supabase.test.js`.

**Acceptance:** helper covered by tests including both host classes; the warn path uses `logWarn` (message-only, no objects); a correct deployment logs nothing.

### 18E — hash the Realtime channel topic (F6/L9)

**Objective:** channel topic no longer contains the raw UUID; the `postgres_changes` filter (server-required) is untouched.

**Files:** `dungeon-scholar/src/services/cloudSync.js`, `dungeon-scholar/src/services/cloudSync.test.js`.

**Steps:**

1. Add a synchronous FNV-1a 32-bit hash and use it in `subscribeSaves`:

   ```js
   /** FNV-1a 32-bit, base36. Label obfuscation for channel topics — the topic
    *  appears in Realtime metadata/inspector; the raw UUID stays only in the
    *  postgres_changes filter, which the server requires. Not cryptographic. */
   export function hashChannelTopic(s) {
     let h = 0x811c9dc5;
     for (let i = 0; i < s.length; i++) {
       h ^= s.charCodeAt(i);
       h = Math.imul(h, 0x01000193);
     }
     return (h >>> 0).toString(36);
   }
   ```

   Line 54 becomes `.channel(\`saves:${hashChannelTopic(userId)}\`)`. Line 57's `filter` stays as-is, with the comment above explaining why.
2. `cloudSync.test.js`: extend the supabase mock with a `channel` spy (`channel: (name) => { channelSpy(name); return { on: () => ({ subscribe: () => ({}) }) }; }`, plus `removeChannel: vi.fn()`). Tests: `hashChannelTopic` is deterministic, differs for two UUIDs, output matches `/^[a-z0-9]+$/`, and `subscribeSaves('u1', cb)` calls `channel()` with a name that does **not** contain `u1` but starts with `saves:`.

**Targeted check:** `npx vitest run src/services/cloudSync.test.js`.

**Acceptance:** `grep -n 'channel(`saves:' dungeon-scholar/src/services/cloudSync.js` shows the hashed form; tests green; Realtime dedup logic in `usePlayerState` is unaffected (it keys on `updatedAt`/content hashes, not the channel name — `usePlayerState.js:356-377`).

### 18F — CSP meta (build-only) + Referrer-Policy (F4/M8)

**Objective:** production `dist/index.html` carries a CSP meta tag scoped to the app's real origins; every build (and dev) carries `strict-origin-when-cross-origin` referrer policy; dev server/HMR untouched.

**Files:** `dungeon-scholar/index.html`, `dungeon-scholar/vite.config.js`.

**Steps:**

1. `index.html` `<head>`: add `<meta name="referrer" content="strict-origin-when-cross-origin" />` after the viewport meta.
2. `vite.config.js`: add a build-only plugin (Vite `transformIndexHtml` with `apply: 'build'` — never runs under `vite dev`, so the HMR websocket and dev module scripts stay unconstrained):

   ```js
   // CSP is injected at build time only. GitHub Pages cannot set HTTP response
   // headers, so a <meta http-equiv> tag is the only delivery option; meta-CSP
   // ignores frame-ancestors/report-uri/sandbox (browser limitation). Dev is
   // exempt so Vite HMR (ws://localhost) keeps working.
   const oracleOrigin = (() => {
     try { return new URL(process.env.VITE_ORACLE_ENDPOINT || '').origin; } catch { return ''; }
   })();

   const CSP = [
     "default-src 'self'",
     "script-src 'self'",
     "style-src 'self' 'unsafe-inline'", // Tailwind runtime + React style={{}} attributes
     "img-src 'self' data: https://avatars.githubusercontent.com", // GH avatars + data: SVG noise bg
     "font-src 'self' data:", // KaTeX fonts are bundled same-origin
     `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.workers.dev${oracleOrigin ? ` ${oracleOrigin}` : ''}`,
     "object-src 'none'",
     "base-uri 'self'",
     "form-action 'self'",
   ].join('; ');

   const cspPlugin = () => ({
     name: 'dungeon-scholar:csp-meta',
     apply: 'build',
     transformIndexHtml(html) {
       return {
         html,
         tags: [{
           tag: 'meta',
           attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
           injectTo: 'head-prepend',
         }],
       };
     },
   });
   ```

   Register as `plugins: [react(), cspPlugin()]`.
3. Manual origin audit is already encoded above (Verified findings F4). If a future fork hosts its Oracle on a custom domain, the `oracleOrigin` clause whitelists it automatically at build via `VITE_ORACLE_ENDPOINT`; note this in `docs/oracle-setup.md` (one line, done in 18B step 6).

**Targeted check:**

```bash
cd dungeon-scholar && npm run build \
  && grep -o 'http-equiv="Content-Security-Policy"' dist/index.html \
  && grep -o 'name="referrer"' dist/index.html
```

Then `npx vitest run src/services/supabase.test.js` (smoke that config change broke nothing in test env — vitest uses the same config file).

**Acceptance:** build succeeds; `dist/index.html` contains both meta tags with the directive set above; `vite dev` HTML (`curl -s localhost:5173 | grep -c Content-Security-Policy` → 0) has no CSP (verify only if a dev server is convenient; the `apply: 'build'` flag is the guarantee). Post-release runtime retest of auth/Realtime/Oracle on the deployed site is a noted follow-up in the release/commit notes (CSP violations appear as console errors), not a gate.

### 18G — README answer-key disclosure (F8/L10)

**Objective:** the README explicitly tells users the answer keys are client-readable.

**Files:** `dungeon-scholar/README.md`.

**Steps:**

1. Add a short section after "Cloud sync setup (optional)" (before "Deploy"):

   ```markdown
   ## Answer keys are not secret (by design)

   Tomes are plain JSON — every `correctAnswer` / `acceptedAnswers` field ships in
   readable text, both in the sample tome files in this repo and inside your
   browser's `localStorage` / cloud save after import. Anyone using DevTools can
   read the key for any question. That's fine for self-study; it makes the app
   unsuitable for **proctored or graded exams** as-is. A "sealed tome" format
   (server-held or encrypted keys) is tracked as future work — until it ships,
   don't use Dungeon Scholar as an assessment platform.
   ```

**Targeted check:** `grep -n "Answer keys are not secret" dungeon-scholar/README.md`.

**Acceptance:** section present; no code changes.

## Research notes

- **CSP via meta tag.** MDN documents `<meta http-equiv="Content-Security-Policy">` as a supported delivery channel with the same directive syntax as the header; `frame-ancestors`, `report-uri`/`report-to`, and `sandbox` are not enforceable from meta and must be omitted; meta must live in `<head>`; HTTP-header delivery is preferred where the host allows it — GitHub Pages does not allow custom response headers, so meta is the only option there. `'self'` in `connect-src` permits same-origin `ws:`/`wss:` (secure-upgrade matching), but the app's websocket (Supabase Realtime) is cross-origin, so explicit `wss://*.supabase.co` is required regardless. Sources: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy , https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/http-equiv . Injecting at build only (Vite `transformIndexHtml`, `apply: 'build'`) avoids breaking dev HMR — alternative considered and rejected: a static meta in `index.html` with `ws://localhost:*` carve-outs (pollutes prod policy, brittle across dev ports).
- **Referrer-Policy.** `strict-origin-when-cross-origin` is the modern browser default but declaring it pins the behavior on older engines and documents intent; deliverable as `<meta name="referrer">`. Source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy .
- **Supabase RLS.** Official docs confirm: RLS policies act as implicit `WHERE` clauses, so unauthorized rows are silently absent (empty result, not an error) — this is what makes the `neq(user_id).limit(1)` probe sound (any row returned ⇒ no effective RLS); RLS "must always be enabled on any tables stored in an exposed schema" and the anon/publishable key relies entirely on RLS as the security boundary. Source: https://supabase.com/docs/guides/database/postgres/row-level-security . Verification SQL uses `pg_class.relrowsecurity` (PostgreSQL catalog; standard check). Alternative considered: a server-side `security definer` RPC that checks `pg_class` — rejected as it requires forks to install extra SQL, while the cross-user select probe needs nothing beyond the existing schema.
- **GitHub Actions secrets.** Unset secrets evaluate to an empty string (no workflow error), and secrets are not passed to workflows triggered from forked repositories — so `VITE_ORACLE_ENDPOINT: ${{ secrets.VITE_ORACLE_ENDPOINT }}` self-disables on forks with no configuration. Source: https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions .
- **Vite env variables.** Only `VITE_`-prefixed vars are exposed to client code via `import.meta.env`; values are statically replaced at build time, hence build-time injection through the workflow `env:` block. Source: https://vite.dev/guide/env-and-mode .
- **Vitest env stubbing.** `vi.stubEnv(name, value)` mutates both `process.env` and `import.meta.env` (boolean-typed for `PROD`/`DEV`/`SSR`); `vi.unstubAllEnvs()` restores originals — used in `afterEach` throughout the new tests. Reading `import.meta.env.PROD` at call time (not module scope) keeps static imports stubbable. Source: https://vitest.dev/api/vi.html .
- **Cloudflare Worker CORS proxy.** Canonical pattern from Cloudflare's example: answer `OPTIONS` preflight with `Access-Control-Allow-Origin`/`-Methods`/`-Headers` + `Access-Control-Max-Age` + `Vary: Origin`; restrict the allowed origin rather than `*`. Source: https://developers.cloudflare.com/workers/examples/cors-header-proxy/ .
- **Anthropic Messages API (for the Worker stub doc).** Endpoint `POST https://api.anthropic.com/v1/messages`; required headers `content-type: application/json`, `x-api-key`, `anthropic-version: 2023-06-01`. The model id currently hardcoded in both call sites, `claude-sonnet-4-20250514`, is deprecated with retirement 2026-06-15; the current Sonnet alias is `claude-sonnet-4-6` (aliases carry no date suffix). Sources: https://platform.claude.com/docs/en/about-claude/models/migration-guide , https://platform.claude.com/docs/en/about-claude/models/overview .
- **Realtime topic hashing.** FNV-1a 32-bit chosen over `crypto.subtle.digest('SHA-256', …)` because `subscribeSaves` is synchronous (its return value — the unsubscribe closure — is consumed synchronously by the `useEffect` at `usePlayerState.js:359-377`); the topic is a namespacing label, not an authenticator, so a non-cryptographic hash is adequate and collision risk across a single user's own devices is irrelevant (same input ⇒ same topic is exactly the desired property).

## Test plan

Per sub-phase (cheap, targeted — rule 5):

- 18A — new `src/services/logger.test.js`; re-run `src/hooks/usePlayerState.test.jsx`.
- 18B — updated `src/services/oracleGrader.test.js` (env-stubbed existing path + 4 new cases).
- 18C — updated `src/services/cloudSync.test.js` (probe ×4); new `src/components/RlsWarningBanner.test.jsx`.
- 18D — updated `src/services/supabase.test.js` (`detectBaseMismatch` ×6).
- 18E — updated `src/services/cloudSync.test.js` (hash + topic-name assertions).
- 18F — `npm run build` + grep `dist/index.html` for both meta tags.
- 18G — grep only (docs).

End of phase: the standard 4-gate from `dnd-app/` (`npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run`) — expected trivially green since no dnd-app file is touched — **plus** the dungeon-scholar gates: `cd dungeon-scholar && npx vitest run` (full suite) and `npm run build` (catches vite.config.js/CSP-plugin and App.jsx integration breakage that unit tests cannot). No Pi code is touched, so no pytest.

## Acceptance criteria

- [ ] `grep -rn "console\." dungeon-scholar/src --include="*.js" --include="*.jsx" | grep -v test | grep -v logger.js` → no raw production console sites remain (dev-only componentStack branch excepted).
- [ ] `dungeon-scholar/src/services/logger.js` exists; in PROD it logs message-only strings via `console.warn` (proven by logger.test.js).
- [ ] `grep -rn "workers.dev" dungeon-scholar/src/` → empty; `grep -rn "claude-sonnet-4-20250514" dungeon-scholar/` → empty; `VITE_ORACLE_ENDPOINT` present in `.env.example` and `deploy.yml`; `dungeon-scholar/docs/oracle-setup.md` exists with the CORS-restricted Worker stub.
- [ ] With no `VITE_ORACLE_ENDPOINT`: `gradeAnswer` returns the string-match fallback without a network call, and the Oracle chat defaults to Tome Search with a clear notice (tests prove the grader; chat path code-reviewed + covered by build).
- [ ] `checkRlsExposure` exported from cloudSync.js with tests; signed-in exposure renders `RlsWarningBanner` (`role="alert"`); `docs/supabase-setup.md` has the `relrowsecurity` verification SQL step.
- [ ] `dist/index.html` (after `npm run build`) contains the CSP meta with `connect-src` covering Supabase https+wss, workers.dev, and the configured Oracle origin; `index.html` contains the referrer meta; dev HTML carries no CSP.
- [ ] `warnIfBaseMismatch` runs once at startup; `detectBaseMismatch` unit-tested for github.io and non-github hosts; correct deployments log nothing.
- [ ] Realtime channel topic is `saves:<fnv1a-base36>`; the `postgres_changes` filter still uses the raw UUID; subscribe/dedup behavior unchanged.
- [ ] README contains the "Answer keys are not secret" section referencing the future sealed-tome work.
- [ ] End-of-phase gates green: dnd-app 4-gate + `dungeon-scholar` full `npx vitest run` + `npm run build`.
- [ ] User-action item recorded: owner must add the `VITE_ORACLE_ENDPOINT` repo secret for the owner deploy to keep its Oracle.

## Out of scope

- Oracle grading AbortController / setState-after-unmount (M2) and the `extractJsonVerdict` greedy regex (M6) — PHASE-17, same file (`oracleGrader.js`), different functions.
- Modal a11y wrapper covering AccountPanel/MergeChooser/PromptModal (H4) and all a11y/UX items — PHASE-19.
- Sealed/proctored tomes with hidden answer keys (F3) — PHASE-41 (L10 here is the disclosure only).
- Per-tome encrypted notes (F5), cloudSync conflict-branch tests (L18), tome import size cap (L14) — PHASE-40.
- `App.jsx` feature-module split / router — PHASE-39 (this phase deliberately keeps its App.jsx additions small and import-based).
- Any change to the owner's actual Cloudflare Worker code (it lives outside this repo); `docs/oracle-setup.md` documents the stub for forks and for the owner's reference.
- localStorage quota failure surfacing (M10) — PHASE-17 (`persistence.js` / `sound.js`).

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
