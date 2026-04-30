# Dungeon Scholar — Accounts & Cloud Save Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-29-dungeon-scholar-accounts-design.md`

**Goal:** Add localStorage-backed always-on persistence (so refreshing the tab no longer wipes progress) and optional GitHub-OAuth-gated cloud sync via Supabase (so progress follows the user across devices).

**Architecture:** Two-layer persistence inside the existing React + Vite SPA. Local layer (`localStorage`, debounced ~500 ms) hydrates on every boot; cloud layer (Supabase Postgres `saves` row, debounced ~3 s) only engages when signed in. RLS policies keep users out of each other's rows. No new server: the Supabase JS SDK runs entirely in the browser, the existing `oracle-worker` is untouched.

**Tech Stack:** React 18, Vite 5, Tailwind, `@supabase/supabase-js` (new), Vitest + Testing Library + happy-dom (new — for unit/hook tests), GitHub Actions (existing deploy workflow).

---

## Important spec correction

The spec's redirect URL says `https://evilpatrick06.github.io/dungeon-scholar/`, but `dungeon-scholar/vite.config.js` sets `base: '/home-lab/'`. The actual live URL is `https://evilpatrick06.github.io/home-lab/`. **Use that URL** in all GitHub OAuth + Supabase redirect-URL configuration. The localhost dev URL stays `http://localhost:5173/`.

## Implementation phases at a glance

- **Phase A — Tooling & setup** (Tasks 1–3). Test infra, Supabase project + dashboard work, SDK install. Manual dashboard work in Task 2 is gated to be done once.
- **Phase B — Local-first persistence** (Tasks 4–6). **Shippable checkpoint at Task 6.** Solves the "tab refresh wipes progress" pain for *every* user. If cloud work stalls, this still lands a meaningful win.
- **Phase C — Auth + cloud sync** (Tasks 7–17). OAuth round-trip, cloud pull, merge chooser, debounced upsert + retry, profile UI.
- **Phase D — CI, docs, integration tests** (Tasks 18–20).

## File structure

```
dungeon-scholar/
├── .env.example                          ← NEW (env-var template)
├── .gitignore                            (existing — already covers *.local)
├── package.json                          ← MODIFY (deps + test script)
├── vite.config.js                        ← MODIFY (test config)
├── README.md                             ← MODIFY (account-setup section)
├── docs/
│   └── supabase-setup.md                 ← NEW (one-time dashboard checklist + SQL)
├── src/
│   ├── App.jsx                           ← MODIFY (slot in hook + new components)
│   ├── test-setup.js                     ← NEW (jest-dom matchers)
│   ├── services/
│   │   ├── supabase.js                   ← NEW (client singleton + auth helpers)
│   │   ├── persistence.js                ← NEW (localStorage layer + helpers)
│   │   ├── persistence.test.js           ← NEW
│   │   ├── cloudSync.js                  ← NEW (pull/push/delete + retry)
│   │   └── cloudSync.test.js             ← NEW
│   ├── hooks/
│   │   ├── useAuth.js                    ← NEW (auth-state subscription)
│   │   ├── usePlayerState.js             ← NEW (combines local + cloud)
│   │   └── usePlayerState.test.jsx       ← NEW
│   └── components/
│       ├── SignInButton.jsx              ← NEW
│       ├── ProfileChip.jsx               ← NEW
│       ├── SyncStatusDot.jsx             ← NEW
│       ├── AccountPanel.jsx              ← NEW
│       └── MergeChooser.jsx              ← NEW
.github/
└── workflows/
    └── deploy.yml                        ← MODIFY (test step + env vars)
```

Each new file has one responsibility:
- `services/` — pure logic, no React. Easy to unit-test.
- `hooks/` — React glue: subscriptions, effects, debouncing.
- `components/` — UI only. Components receive their data via props/hooks.

Existing `App.jsx` (4784 lines) is not refactored — just amended at well-defined slots.

---

# Phase A — Tooling & Supabase setup

## Task 1: Add Vitest + Testing Library + happy-dom

**Files:**
- Modify: `dungeon-scholar/package.json`
- Modify: `dungeon-scholar/vite.config.js`
- Create: `dungeon-scholar/src/test-setup.js`

- [ ] **Step 1: Install dev dependencies**

```bash
cd dungeon-scholar
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom happy-dom
```

Expected: deps appear in `package.json` `devDependencies`.

- [ ] **Step 2: Add `test` and `test:run` scripts to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 3: Update `vite.config.js` to include Vitest config**

Replace contents with:

```js
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/home-lab/',
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.js'],
    globals: true,
  },
})
```

- [ ] **Step 4: Create `src/test-setup.js`**

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Sanity-check Vitest runs (no tests yet)**

Run: `npm run test:run`
Expected: exits with "No test files found" — that's fine, it means Vitest is wired up.

- [ ] **Step 6: Commit**

```bash
git add dungeon-scholar/package.json dungeon-scholar/package-lock.json dungeon-scholar/vite.config.js dungeon-scholar/src/test-setup.js
git commit -m "chore(dungeon-scholar): add Vitest + Testing Library for unit tests"
```

---

## Task 2: Supabase project + GitHub OAuth — manual setup with checklist doc

This is a **one-time manual setup**. The doc gets committed; the actual dashboard work happens in the user's browser.

**Files:**
- Create: `dungeon-scholar/docs/supabase-setup.md`

- [ ] **Step 1: Create the setup doc**

```markdown
# Supabase + GitHub OAuth setup (one-time)

Follow this checklist once. After it's done, fill in `.env.local`
(see `.env.example`) and the app will be able to sign in.

## 1. Create Supabase project

1. Go to https://supabase.com → New Project.
2. Pick a name (e.g. `dungeon-scholar-prod`), strong DB password, region close to you.
3. Wait ~2 min for provisioning.

## 2. Run schema SQL

Supabase dashboard → SQL Editor → New query. Paste and run:

\`\`\`sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  github_login text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table saves (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  data         jsonb not null,
  updated_at   timestamptz not null default now(),
  schema_ver   int not null default 1
);

alter table profiles enable row level security;
alter table saves    enable row level security;

create policy "own profile" on profiles for all
  using (auth.uid() = id)        with check (auth.uid() = id);
create policy "own save"    on saves    for all
  using (auth.uid() = user_id)   with check (auth.uid() = user_id);
\`\`\`

## 3. Register a GitHub OAuth app

1. https://github.com/settings/developers → OAuth Apps → New.
2. Application name: \`Dungeon Scholar\`
3. Homepage URL: \`https://evilpatrick06.github.io/home-lab/\`
4. Authorization callback URL: copy from Supabase dashboard →
   Authentication → Providers → GitHub. It will look like
   \`https://<project-ref>.supabase.co/auth/v1/callback\`.
5. Click "Register application", then "Generate a new client secret".
6. Note the Client ID and Client secret.

## 4. Configure GitHub provider in Supabase

Supabase dashboard → Authentication → Providers → GitHub:
- Enabled: ON
- Paste Client ID + Client secret from step 3.
- Save.

## 5. Set redirect URLs

Supabase dashboard → Authentication → URL Configuration:
- **Site URL:** \`https://evilpatrick06.github.io/home-lab/\`
- **Redirect URLs (one per line):**
  \`\`\`
  https://evilpatrick06.github.io/home-lab/
  http://localhost:5173/
  \`\`\`
- Save.

## 6. Capture the project keys

Supabase dashboard → Project Settings → API:
- Project URL (something like \`https://xxx.supabase.co\`) → \`VITE_SUPABASE_URL\`
- \`anon\` public key (long JWT) → \`VITE_SUPABASE_PUBLISHABLE_KEY\`

Put both in \`dungeon-scholar/.env.local\` (gitignored — see \`.env.example\`).

## 7. Add the same values as GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → New repository secret:
- \`VITE_SUPABASE_URL\`
- \`VITE_SUPABASE_PUBLISHABLE_KEY\`

(The deploy workflow will inject these at build time.)
```

- [ ] **Step 2: Commit**

```bash
git add dungeon-scholar/docs/supabase-setup.md
git commit -m "docs(dungeon-scholar): one-time Supabase + GitHub OAuth setup checklist"
```

- [ ] **Step 3 (manual, can be deferred until Task 14): Actually do the setup**

Follow the checklist in `dungeon-scholar/docs/supabase-setup.md`. Save the
URL + anon key into `dungeon-scholar/.env.local` (created in Task 3).

**This step does not require a commit** — it's dashboard work.

---

## Task 3: Add Supabase JS SDK + env-var scaffolding

**Files:**
- Modify: `dungeon-scholar/package.json`
- Create: `dungeon-scholar/.env.example`

- [ ] **Step 1: Install the SDK**

```bash
cd dungeon-scholar
npm install @supabase/supabase-js
```

- [ ] **Step 2: Create `.env.example`**

```
# Copy this file to .env.local (which is gitignored) and fill in real values.
# Both must come from Supabase dashboard → Project Settings → API.

VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...your-anon-public-key...
```

- [ ] **Step 3: Verify `.gitignore` covers `.env.local`**

Run: `grep -E '\\*\\.local|\\.env' dungeon-scholar/.gitignore`
Expected: `*.local` is listed (already true). No edit required.

- [ ] **Step 4: Commit**

```bash
git add dungeon-scholar/package.json dungeon-scholar/package-lock.json dungeon-scholar/.env.example
git commit -m "chore(dungeon-scholar): add @supabase/supabase-js + env-var scaffolding"
```

---

# Phase B — Local-first persistence (shippable checkpoint at Task 6)

## Task 4: `persistence.js` — TDD

Pure functions. No React, no Supabase. Hydrate from / save to `localStorage`, plus a "has meaningful data" guard used by the merge-chooser logic later.

**Files:**
- Create: `dungeon-scholar/src/services/persistence.test.js`
- Create: `dungeon-scholar/src/services/persistence.js`

- [ ] **Step 1: Write the failing test**

```js
// dungeon-scholar/src/services/persistence.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  hasMeaningfulData,
  STORAGE_KEY,
  CURRENT_SCHEMA_VER,
  migrateIfNeeded,
} from './persistence.js';

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadFromLocalStorage returns null when key absent', () => {
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('round-trips a state object', () => {
    const state = { level: 5, totalXp: 200, library: [{ id: 'a' }] };
    saveToLocalStorage(state);
    expect(loadFromLocalStorage()).toEqual(state);
  });

  it('returns null on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{bad json');
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('hasMeaningfulData is false for default-shaped state', () => {
    expect(hasMeaningfulData({ level: 1, totalXp: 0, library: [] })).toBe(false);
    expect(hasMeaningfulData(null)).toBe(false);
    expect(hasMeaningfulData(undefined)).toBe(false);
  });

  it('hasMeaningfulData is true when level > 1', () => {
    expect(hasMeaningfulData({ level: 2, totalXp: 0, library: [] })).toBe(true);
  });

  it('hasMeaningfulData is true when there is at least one tome', () => {
    expect(hasMeaningfulData({ level: 1, totalXp: 0, library: [{ id: 'a' }] })).toBe(true);
  });

  it('hasMeaningfulData is true when totalXp > 0', () => {
    expect(hasMeaningfulData({ level: 1, totalXp: 1, library: [] })).toBe(true);
  });

  it('migrateIfNeeded is a no-op for current schema version', () => {
    const state = { level: 3, library: [] };
    expect(migrateIfNeeded(state, CURRENT_SCHEMA_VER)).toBe(state);
  });

  it('migrateIfNeeded returns the state unchanged for unknown future versions (forward-compat)', () => {
    const state = { level: 3, library: [] };
    expect(migrateIfNeeded(state, CURRENT_SCHEMA_VER + 1)).toBe(state);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dungeon-scholar && npm run test:run -- persistence`
Expected: FAIL with "Cannot find module './persistence.js'".

- [ ] **Step 3: Write the implementation**

```js
// dungeon-scholar/src/services/persistence.js
export const STORAGE_KEY = 'dungeon-scholar:save:v1';
export const CURRENT_SCHEMA_VER = 1;

export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveToLocalStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or unavailable — silent. Cloud / Export still work.
  }
}

export function hasMeaningfulData(state) {
  if (!state) return false;
  if ((state.level ?? 1) > 1) return true;
  if ((state.totalXp ?? 0) > 0) return true;
  if (Array.isArray(state.library) && state.library.length > 0) return true;
  return false;
}

export function migrateIfNeeded(state, schemaVer) {
  // v1 is current. No migrations defined yet. Future versions add cases here.
  return state;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- persistence`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dungeon-scholar/src/services/persistence.js dungeon-scholar/src/services/persistence.test.js
git commit -m "feat(dungeon-scholar): localStorage persistence layer with schema-version stub"
```

---

## Task 5: `usePlayerState` hook — local-only — TDD

The hook wraps `useState`, hydrates from `localStorage` on mount, and writes a debounced (~500 ms) save on every change. Cloud is added in a later task.

**Files:**
- Create: `dungeon-scholar/src/hooks/usePlayerState.test.jsx`
- Create: `dungeon-scholar/src/hooks/usePlayerState.js`

- [ ] **Step 1: Write the failing test**

```jsx
// dungeon-scholar/src/hooks/usePlayerState.test.jsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayerState } from './usePlayerState.js';
import { STORAGE_KEY, loadFromLocalStorage } from '../services/persistence.js';

const DEFAULT = { level: 1, totalXp: 0, library: [] };

describe('usePlayerState — local-only behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates from localStorage on mount when present', () => {
    const stored = { level: 7, totalXp: 500, library: [{ id: 'a' }] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => usePlayerState(DEFAULT));
    expect(result.current[0]).toEqual(stored);
  });

  it('falls back to default when localStorage is empty', () => {
    const { result } = renderHook(() => usePlayerState(DEFAULT));
    expect(result.current[0]).toEqual(DEFAULT);
  });

  it('debounces writes — multiple rapid setState calls collapse into one write', () => {
    const { result } = renderHook(() => usePlayerState(DEFAULT));

    act(() => {
      result.current[1]({ level: 2, totalXp: 10, library: [] });
      result.current[1]({ level: 3, totalXp: 20, library: [] });
      result.current[1]({ level: 4, totalXp: 30, library: [] });
    });

    // Before the debounce window elapses, nothing should be written.
    expect(loadFromLocalStorage()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    // After the window, the latest state is written.
    expect(loadFromLocalStorage()).toEqual({ level: 4, totalXp: 30, library: [] });
  });

  it('flushes a pending write on beforeunload', () => {
    const { result } = renderHook(() => usePlayerState(DEFAULT));

    act(() => {
      result.current[1]({ level: 9, totalXp: 99, library: [] });
    });

    // Synthesize a beforeunload event before the debounce fires.
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(loadFromLocalStorage()).toEqual({ level: 9, totalXp: 99, library: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- usePlayerState`
Expected: FAIL with "Cannot find module './usePlayerState.js'".

- [ ] **Step 3: Write the implementation**

```js
// dungeon-scholar/src/hooks/usePlayerState.js
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  migrateIfNeeded,
  CURRENT_SCHEMA_VER,
} from '../services/persistence.js';

const LOCAL_DEBOUNCE_MS = 500;

export function usePlayerState(defaultState) {
  // Hydrate synchronously so React's first paint already has the saved state.
  // migrateIfNeeded is a no-op for v1 but the call site is established for
  // future schema versions.
  const [state, setStateInternal] = useState(() => {
    const stored = loadFromLocalStorage();
    return stored ? migrateIfNeeded(stored, CURRENT_SCHEMA_VER) : defaultState;
  });

  // Track latest state for the debounced flusher and beforeunload handler.
  const latestRef = useRef(state);
  const timeoutRef = useRef(null);

  const flushLocal = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    saveToLocalStorage(latestRef.current);
  }, []);

  const setState = useCallback((next) => {
    setStateInternal((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      latestRef.current = resolved;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        saveToLocalStorage(latestRef.current);
        timeoutRef.current = null;
      }, LOCAL_DEBOUNCE_MS);

      return resolved;
    });
  }, []);

  // Flush on tab close.
  useEffect(() => {
    const onUnload = () => flushLocal();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      flushLocal();
    };
  }, [flushLocal]);

  return [state, setState];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- usePlayerState`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dungeon-scholar/src/hooks/usePlayerState.js dungeon-scholar/src/hooks/usePlayerState.test.jsx
git commit -m "feat(dungeon-scholar): usePlayerState hook with debounced local persistence"
```

---

## Task 6: Wire `usePlayerState` into `App.jsx` — Phase B ships here

**Files:**
- Modify: `dungeon-scholar/src/App.jsx` (around line 596)

- [ ] **Step 1: Add import**

In `App.jsx`, after the existing React import (line 1), add:

```js
import { usePlayerState } from './hooks/usePlayerState.js';
```

- [ ] **Step 2: Replace `useState(DEFAULT_STATE)`**

Find line 596:

```js
const [playerState, setPlayerState] = useState(DEFAULT_STATE);
```

Replace with:

```js
const [playerState, setPlayerState] = usePlayerState(DEFAULT_STATE);
```

- [ ] **Step 3: Manual smoke test**

Run: `cd dungeon-scholar && npm run dev`
- Open `http://localhost:5173/home-lab/`.
- Skip the tutorial, gain some XP (or just create a tome).
- Refresh the page.
- Expected: state persists across refresh.

- [ ] **Step 4: Verify build still works**

Run: `npm run build`
Expected: clean build, no errors.

- [ ] **Step 5: Run unit tests one more time**

Run: `npm run test:run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add dungeon-scholar/src/App.jsx
git commit -m "feat(dungeon-scholar): persist player state to localStorage

Replaces useState(DEFAULT_STATE) with usePlayerState. Refreshing the
tab no longer wipes progress. Ships independently — cloud sync
follows in subsequent commits."
```

> **🎉 Phase B shipped.** At this point the app's biggest pain — losing progress on refresh — is solved for every user, signed in or not. Safe to push and pause cloud work here if needed.

---

# Phase C — Auth + cloud sync

## Task 7: Supabase client singleton + auth helpers (with `consumeOAuthCallback` TDD)

**Files:**
- Create: `dungeon-scholar/src/services/supabase.js`
- Create: `dungeon-scholar/src/services/supabase.test.js`

- [ ] **Step 1: Write the file**

```js
// dungeon-scholar/src/services/supabase.js
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// In dev/CI without env vars, we still want the bundle to build/import
// without throwing — the SDK calls just fail at runtime when the user
// tries to sign in, which is the right blast radius.
export const supabase = (url && key)
  ? createClient(url, key, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // we handle exchange manually in App.jsx
      },
    })
  : null;

export function isSupabaseConfigured() {
  return supabase !== null;
}

export async function signInWithGitHub() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    },
  });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Inspect the current URL for an OAuth ?code=...&state=... pair.
 * If found, exchange it for a session and strip the params.
 * Returns true if a callback was consumed.
 */
export async function consumeOAuthCallback() {
  if (!supabase) return false;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return false;
  await supabase.auth.exchangeCodeForSession(window.location.search);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.toString());
  return true;
}
```

- [ ] **Step 2: Write a failing test for `consumeOAuthCallback`**

```js
// dungeon-scholar/src/services/supabase.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const exchangeCodeForSession = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: (...a) => exchangeCodeForSession(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null } }),
    },
  }),
}));

// Stub env so the module sees a configured client.
import.meta.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-key';

const { consumeOAuthCallback } = await import('./supabase.js');

describe('consumeOAuthCallback', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
  });

  it('returns false when no code param is present', async () => {
    window.history.replaceState({}, '', '/home-lab/');
    const result = await consumeOAuthCallback();
    expect(result).toBe(false);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges and strips ?code & ?state when present', async () => {
    window.history.replaceState({}, '', '/home-lab/?code=abc&state=xyz&keep=this');
    const result = await consumeOAuthCallback();
    expect(result).toBe(true);
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toContain('code=');
    expect(window.location.search).not.toContain('state=');
    expect(window.location.search).toContain('keep=this'); // unrelated params untouched
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm run test:run -- supabase`
Expected: both tests PASS (the implementation written in Step 1 already satisfies them).

If the import.meta.env mutation in the test file is awkward in your Vitest version, set those values via a `vi.stubEnv(...)` call inside `beforeEach` instead.

- [ ] **Step 4: Commit**

```bash
git add dungeon-scholar/src/services/supabase.js dungeon-scholar/src/services/supabase.test.js
git commit -m "feat(dungeon-scholar): Supabase client singleton + GitHub OAuth helpers"
```

---

## Task 8: `useAuth` hook — TDD

Single source of truth for "is the user signed in, and what's their profile."

**Files:**
- Create: `dungeon-scholar/src/hooks/useAuth.test.jsx`
- Create: `dungeon-scholar/src/hooks/useAuth.js`

- [ ] **Step 1: Write the failing test**

```jsx
// dungeon-scholar/src/hooks/useAuth.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

let authChangeCb = null;
const mockGetSession = vi.fn();

vi.mock('../services/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb) => {
        authChangeCb = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
  isSupabaseConfigured: () => true,
}));

import { useAuth } from './useAuth.js';

describe('useAuth', () => {
  beforeEach(() => {
    authChangeCb = null;
    mockGetSession.mockReset();
  });

  it('starts with null user and resolves to session user', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', user_metadata: { user_name: 'gavin', avatar_url: 'a.png' } } } },
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));
    expect(result.current.user.githubLogin).toBe('gavin');
    expect(result.current.user.avatarUrl).toBe('a.png');
  });

  it('updates user when onAuthStateChange fires SIGNED_IN', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user).toBeNull());

    act(() => {
      authChangeCb('SIGNED_IN', { user: { id: 'u2', user_metadata: { user_name: 'pat' } } });
    });

    await waitFor(() => expect(result.current.user?.id).toBe('u2'));
  });

  it('clears user on SIGNED_OUT', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u3', user_metadata: { user_name: 'pat' } } } },
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.id).toBe('u3'));

    act(() => {
      authChangeCb('SIGNED_OUT', null);
    });

    await waitFor(() => expect(result.current.user).toBeNull());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- useAuth`
Expected: FAIL with "Cannot find module './useAuth.js'".

- [ ] **Step 3: Write the implementation**

```js
// dungeon-scholar/src/hooks/useAuth.js
import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';

function projectUser(rawUser) {
  if (!rawUser) return null;
  const meta = rawUser.user_metadata || {};
  return {
    id: rawUser.id,
    githubLogin: meta.user_name || meta.preferred_username || null,
    avatarUrl: meta.avatar_url || null,
  };
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(projectUser(data.session?.user));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(projectUser(session?.user));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- useAuth`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dungeon-scholar/src/hooks/useAuth.js dungeon-scholar/src/hooks/useAuth.test.jsx
git commit -m "feat(dungeon-scholar): useAuth hook over Supabase session state"
```

---

## Task 9: `cloudSync.js` — pull/push/delete — TDD

Pure functions wrapping the Supabase client. Mocked in tests.

**Files:**
- Create: `dungeon-scholar/src/services/cloudSync.test.js`
- Create: `dungeon-scholar/src/services/cloudSync.js`

- [ ] **Step 1: Write the failing test**

```js
// dungeon-scholar/src/services/cloudSync.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const maybeSingle = vi.fn();
const del = vi.fn();

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: (...a) => { select(...a); return { eq: (...b) => { eq(...b); return { maybeSingle: () => maybeSingle() }; } }; },
      upsert: (...a) => { upsert(...a); return Promise.resolve({ error: null }); },
      delete: () => ({ eq: (...a) => { del(...a); return Promise.resolve({ error: null }); } }),
    })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
  },
  isSupabaseConfigured: () => true,
}));

import { pullSave, pushSave, deleteCloudSave } from './cloudSync.js';

describe('cloudSync', () => {
  beforeEach(() => {
    upsert.mockReset();
    select.mockReset();
    eq.mockReset();
    maybeSingle.mockReset();
    del.mockReset();
  });

  it('pullSave returns null when row absent', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const result = await pullSave('u1');
    expect(result).toBeNull();
  });

  it('pullSave returns the cloud blob when present', async () => {
    const data = { level: 7, library: [] };
    maybeSingle.mockResolvedValueOnce({
      data: { data, updated_at: '2026-04-29T10:00:00Z', schema_ver: 1 },
      error: null,
    });
    const result = await pullSave('u1');
    expect(result).toEqual({ data, updatedAt: '2026-04-29T10:00:00Z', schemaVer: 1 });
  });

  it('pushSave upserts the blob with user_id, schema_ver, and updated_at', async () => {
    const blob = { level: 4 };
    await pushSave('u1', blob);
    const arg = upsert.mock.calls[0][0];
    expect(arg.user_id).toBe('u1');
    expect(arg.data).toBe(blob);
    expect(arg.schema_ver).toBe(1);
    expect(typeof arg.updated_at).toBe('string');
  });

  it('deleteCloudSave deletes by user_id', async () => {
    await deleteCloudSave('u1');
    expect(del).toHaveBeenCalledWith('user_id', 'u1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- cloudSync`
Expected: FAIL with "Cannot find module './cloudSync.js'".

- [ ] **Step 3: Write the implementation**

```js
// dungeon-scholar/src/services/cloudSync.js
import { supabase } from './supabase.js';
import { CURRENT_SCHEMA_VER } from './persistence.js';

/**
 * Pull the current cloud save for a user.
 * Returns { data, updatedAt, schemaVer } or null if no row exists.
 */
export async function pullSave(userId) {
  const { data, error } = await supabase
    .from('saves')
    .select('data, updated_at, schema_ver')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { data: data.data, updatedAt: data.updated_at, schemaVer: data.schema_ver };
}

/**
 * Upsert the player state for a user. Caller is responsible for
 * ensuring `userId` matches the authenticated user.
 */
export async function pushSave(userId, blob) {
  const { error } = await supabase.from('saves').upsert({
    user_id: userId,
    data: blob,
    updated_at: new Date().toISOString(),
    schema_ver: CURRENT_SCHEMA_VER,
  });
  if (error) throw error;
}

/** Delete only the cloud save row. Profile remains. */
export async function deleteCloudSave(userId) {
  const { error } = await supabase.from('saves').delete().eq('user_id', userId);
  if (error) throw error;
}

/** Delete both rows for the user (account deletion). */
export async function deleteAccount(userId) {
  const { error: e1 } = await supabase.from('saves').delete().eq('user_id', userId);
  const { error: e2 } = await supabase.from('profiles').delete().eq('id', userId);
  if (e1) throw e1;
  if (e2) throw e2;
}

/** Upsert a profile row from the user's GitHub metadata (idempotent). */
export async function upsertProfile(userId, githubLogin, avatarUrl) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    github_login: githubLogin,
    avatar_url: avatarUrl,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- cloudSync`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dungeon-scholar/src/services/cloudSync.js dungeon-scholar/src/services/cloudSync.test.js
git commit -m "feat(dungeon-scholar): cloudSync helpers — pull/push/delete saves"
```

---

## Task 10: `SignInButton` component + slot into `Manage Your Saga` panel

**Files:**
- Create: `dungeon-scholar/src/components/SignInButton.jsx`
- Modify: `dungeon-scholar/src/App.jsx` (HomeScreen signature line 1953, panel line 2064)

- [ ] **Step 1: Create the component**

```jsx
// dungeon-scholar/src/components/SignInButton.jsx
import React, { useState } from 'react';
import { Github } from 'lucide-react';
import { signInWithGitHub, isSupabaseConfigured } from '../services/supabase.js';

export function SignInButton() {
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured()) return null;

  const onClick = async () => {
    setBusy(true);
    try {
      await signInWithGitHub();
      // Browser navigates away; if it doesn't, re-enable the button.
      setTimeout(() => setBusy(false), 4000);
    } catch (err) {
      console.error('Sign-in failed:', err);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={onClick}
        disabled={busy}
        className="px-4 py-2 rounded flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic disabled:opacity-60"
        style={{ background: 'rgba(31, 12, 41, 0.7)' }}
      >
        <Github className="w-4 h-4" /> {busy ? 'Connecting…' : 'Sign in with GitHub to sync'}
      </button>
      <span className="text-[11px] text-amber-700 italic pl-1">
        Optional — your progress is already saved on this device.
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Render it in HomeScreen's `Manage Your Saga` panel**

In `App.jsx`, at line 1953, add an import after the existing imports near the top of the file:

```js
import { SignInButton } from './components/SignInButton.jsx';
```

Then in the `Manage Your Saga` `OrnatePanel` (line 2064-2088), add `<SignInButton />` before the `Begin Anew` button. The result:

```jsx
        <OrnatePanel color="amber">
          <h3 className="text-lg font-bold mb-3 text-amber-300 flex items-center gap-2 italic">
            <Settings className="w-5 h-5" /> ⚔ Manage Your Saga ⚔
          </h3>
          <div className="flex flex-wrap gap-3">
            {/* existing Preserve Journal / Restore Journal / Replay Tutorial buttons unchanged */}
            <button onClick={onExportProgress} ...>...</button>
            <button onClick={onImportProgress} ...>...</button>
            {playerState.tutorialCompleted && (
              <button onClick={onRestartTutorial} ...>...</button>
            )}
            <SignInButton />
            <button onClick={onResetProgress} ...>...</button>
          </div>
        </OrnatePanel>
```

(Show only the inserted `<SignInButton />` line in the diff. Preserve all existing buttons.)

- [ ] **Step 3: Manual smoke test (no real OAuth yet — button just renders + alerts)**

Run: `npm run dev`
- Settings panel shows the sign-in button + tagline.
- Clicking it opens the GitHub OAuth dialog (assumes `.env.local` is filled in per Task 2). If not configured, the button is hidden — also acceptable for this checkpoint.

- [ ] **Step 4: Commit**

```bash
git add dungeon-scholar/src/components/SignInButton.jsx dungeon-scholar/src/App.jsx
git commit -m "feat(dungeon-scholar): SignInButton in Manage Your Saga panel"
```

---

## Task 11: OAuth callback handler in `App.jsx`

**Files:**
- Modify: `dungeon-scholar/src/App.jsx`

- [ ] **Step 1: Add import**

```js
import { consumeOAuthCallback } from './services/supabase.js';
```

- [ ] **Step 2: Add a one-time effect at the top of the component body**

In `DungeonScholarApp` (line 594), add this effect right after the existing `useState` declarations and before the welcome-modal effect:

```jsx
  useEffect(() => {
    consumeOAuthCallback().catch((err) => {
      console.error('OAuth callback exchange failed:', err);
    });
  }, []);
```

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
- Click **Sign in with GitHub**.
- Approve on github.com.
- Land back at `localhost:5173/home-lab/?code=...&state=...`.
- After mount, the URL strips to `localhost:5173/home-lab/` and console shows no errors.
- Verify session via dev tools → Application → Local Storage → look for a key like `sb-<project>-auth-token`.

- [ ] **Step 4: Commit**

```bash
git add dungeon-scholar/src/App.jsx
git commit -m "feat(dungeon-scholar): consume OAuth callback and strip query params"
```

---

## Task 12: Cloud-pull-on-sign-in — silent branches only — TDD

Three of the four sign-in scenarios from spec §7.2 are silent (empty/empty, empty/local, cloud/empty). The fourth (both have data) needs the merge chooser, added in Task 13–14.

**Files:**
- Modify: `dungeon-scholar/src/hooks/usePlayerState.js`
- Modify: `dungeon-scholar/src/hooks/usePlayerState.test.jsx`

- [ ] **Step 1: Add new tests for the silent branches**

Append to `usePlayerState.test.jsx`:

```jsx
import { hasMeaningfulData } from '../services/persistence.js';

vi.mock('../services/cloudSync.js', () => ({
  pullSave: vi.fn(),
  pushSave: vi.fn(() => Promise.resolve()),
  upsertProfile: vi.fn(() => Promise.resolve()),
}));

import { pullSave, pushSave, upsertProfile } from '../services/cloudSync.js';

const USER = { id: 'u1', githubLogin: 'pat', avatarUrl: 'a.png' };

describe('usePlayerState — sign-in branches (silent)', () => {
  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
    upsertProfile.mockReset();
  });

  it('empty cloud + empty local → no-op (no merge chooser, nothing pushed)', async () => {
    pullSave.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalledWith('u1'));
    expect(pushSave).not.toHaveBeenCalled();
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('cloud has data + empty local → cloud overwrites local silently', async () => {
    pullSave.mockResolvedValueOnce({
      data: { level: 5, totalXp: 100, library: [{ id: 'a' }] },
      updatedAt: '2026-04-29T00:00:00Z', schemaVer: 1,
    });
    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(result.current[0].level).toBe(5));
    expect(pushSave).not.toHaveBeenCalled();
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('empty cloud + local has data → local pushed to cloud silently', async () => {
    localStorage.setItem('dungeon-scholar:save:v1',
      JSON.stringify({ level: 3, totalXp: 50, library: [] }));
    pullSave.mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pushSave).toHaveBeenCalled());
    const [pushedUid, pushedBlob] = pushSave.mock.calls[0];
    expect(pushedUid).toBe('u1');
    expect(pushedBlob.level).toBe(3);
    expect(result.current[2].mergeRequired).toBe(false);
  });

  it('cloud has data + local has data → mergeRequired flag goes true', async () => {
    localStorage.setItem('dungeon-scholar:save:v1',
      JSON.stringify({ level: 3, totalXp: 50, library: [{ id: 'b' }] }));
    pullSave.mockResolvedValueOnce({
      data: { level: 7, totalXp: 200, library: [{ id: 'a' }] },
      updatedAt: '2026-04-29T00:00:00Z', schemaVer: 1,
    });

    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(result.current[2].mergeRequired).toBe(true));
    expect(pushSave).not.toHaveBeenCalled();
    // local hasn't changed yet — chooser will resolve.
    expect(result.current[0].level).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify they fail**

Run: `npm run test:run -- usePlayerState`
Expected: FAIL — the hook doesn't accept a user arg or expose `mergeRequired`.

- [ ] **Step 3: Extend the hook**

Replace `usePlayerState.js` with:

```js
// dungeon-scholar/src/hooks/usePlayerState.js
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  hasMeaningfulData,
  migrateIfNeeded,
  CURRENT_SCHEMA_VER,
} from '../services/persistence.js';
import { pullSave, pushSave, upsertProfile } from '../services/cloudSync.js';

const LOCAL_DEBOUNCE_MS = 500;

/**
 * Combined local + cloud persistence hook.
 *
 * @param defaultState  initial blob if nothing is stored anywhere
 * @param user          { id, githubLogin, avatarUrl } | null
 * @returns [state, setState, sync]
 *   sync = {
 *     mergeRequired: boolean,
 *     localPreview, cloudPreview,    // previews while merge pending
 *     resolveMerge: ('local' | 'cloud' | 'cancel') => void,
 *     status: 'idle' | 'saving' | 'error' | 'offline',
 *   }
 */
export function usePlayerState(defaultState, user = null) {
  const [state, setStateInternal] = useState(() => {
    const stored = loadFromLocalStorage();
    return stored ? migrateIfNeeded(stored, CURRENT_SCHEMA_VER) : defaultState;
  });

  const [mergeRequired, setMergeRequired] = useState(false);
  const [localPreview, setLocalPreview] = useState(null);
  const [cloudPreview, setCloudPreview] = useState(null);
  const [status, setStatus] = useState('idle');

  const latestRef = useRef(state);
  const localTimeoutRef = useRef(null);

  const flushLocal = useCallback(() => {
    if (localTimeoutRef.current) {
      clearTimeout(localTimeoutRef.current);
      localTimeoutRef.current = null;
    }
    saveToLocalStorage(latestRef.current);
  }, []);

  const setState = useCallback((next) => {
    setStateInternal((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      latestRef.current = resolved;

      if (localTimeoutRef.current) clearTimeout(localTimeoutRef.current);
      localTimeoutRef.current = setTimeout(() => {
        saveToLocalStorage(latestRef.current);
        localTimeoutRef.current = null;
      }, LOCAL_DEBOUNCE_MS);

      return resolved;
    });
  }, []);

  // beforeunload flush
  useEffect(() => {
    const onUnload = () => flushLocal();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      flushLocal();
    };
  }, [flushLocal]);

  // Sign-in handler: pull cloud, decide branch.
  useEffect(() => {
    if (!user) {
      setMergeRequired(false);
      setLocalPreview(null);
      setCloudPreview(null);
      return;
    }
    let active = true;

    (async () => {
      try {
        // Best-effort profile upsert; ignore errors (profile is cosmetic).
        upsertProfile(user.id, user.githubLogin, user.avatarUrl).catch(() => {});

        const cloud = await pullSave(user.id);
        if (!active) return;

        // Migrate cloud data to current shape at pull time. v1 is a no-op,
        // but future versions will normalize old rows here so downstream
        // code only has to handle one shape.
        const cloudData = cloud ? migrateIfNeeded(cloud.data, cloud.schemaVer) : null;
        const local = latestRef.current;
        const cloudHasData = cloudData && hasMeaningfulData(cloudData);
        const localHasData = hasMeaningfulData(local);

        if (!cloudHasData && !localHasData) return;
        if (cloudHasData && !localHasData) {
          // Cloud wins silently.
          latestRef.current = cloudData;
          setStateInternal(cloudData);
          saveToLocalStorage(cloudData);
          return;
        }
        if (!cloudHasData && localHasData) {
          // Local wins silently — push to cloud.
          await pushSave(user.id, local);
          return;
        }
        // Both have data — surface the chooser.
        setLocalPreview(local);
        setCloudPreview(cloudData);
        setMergeRequired(true);
      } catch (err) {
        console.error('Cloud pull failed:', err);
        setStatus('offline');
      }
    })();

    return () => { active = false; };
  }, [user]);

  const resolveMerge = useCallback(async (choice) => {
    if (!user) return;
    if (choice === 'cancel') {
      setMergeRequired(false);
      setLocalPreview(null);
      setCloudPreview(null);
      return;
    }
    if (choice === 'local') {
      try { await pushSave(user.id, latestRef.current); } catch (err) { setStatus('offline'); }
    } else if (choice === 'cloud' && cloudPreview) {
      // cloudPreview is already migrated to the current shape (done at pull time).
      latestRef.current = cloudPreview;
      setStateInternal(cloudPreview);
      saveToLocalStorage(cloudPreview);
    }
    setMergeRequired(false);
    setLocalPreview(null);
    setCloudPreview(null);
  }, [user, cloudPreview]);

  const sync = { mergeRequired, localPreview, cloudPreview, resolveMerge, status };
  return [state, setState, sync];
}
```

- [ ] **Step 4: Run test to verify they pass**

Run: `npm run test:run -- usePlayerState`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dungeon-scholar/src/hooks/usePlayerState.js dungeon-scholar/src/hooks/usePlayerState.test.jsx
git commit -m "feat(dungeon-scholar): cloud pull on sign-in; silent merge for unambiguous cases"
```

---

## Task 13: `MergeChooser` modal component

**Files:**
- Create: `dungeon-scholar/src/components/MergeChooser.jsx`

- [ ] **Step 1: Write the component**

```jsx
// dungeon-scholar/src/components/MergeChooser.jsx
import React from 'react';

function summarize(state) {
  if (!state) return { level: 1, tomes: 0, totalCorrect: 0, totalXp: 0 };
  return {
    level: state.level ?? 1,
    tomes: Array.isArray(state.library) ? state.library.length : 0,
    totalCorrect: state.totalCorrect ?? 0,
    totalXp: state.totalXp ?? 0,
  };
}

function Card({ heading, state, onPick, pickLabel, pickColor }) {
  const s = summarize(state);
  return (
    <div className="flex-1 p-4 rounded border-2 border-amber-700"
         style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
      <div className="text-xs text-amber-700 tracking-[0.3em] mb-2">{heading}</div>
      <div className="text-amber-200 text-lg font-bold italic">Level {s.level}</div>
      <div className="text-sm text-amber-300 mt-2">📚 {s.tomes} tomes</div>
      <div className="text-sm text-amber-300">🎯 {s.totalCorrect} victories</div>
      <div className="text-sm text-amber-300">⭐ {s.totalXp.toLocaleString()} total XP</div>
      <button
        onClick={onPick}
        title="The other side will be replaced."
        className={`mt-4 w-full px-3 py-2 rounded border-2 italic text-sm hover:opacity-90 ${pickColor}`}
      >
        {pickLabel}
      </button>
    </div>
  );
}

export function MergeChooser({ localState, cloudState, onResolve }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="max-w-2xl w-[92%] p-6 rounded border-2 border-amber-600"
           style={{ background: 'rgba(20, 12, 6, 0.97)' }}>
        <h2 className="text-xl font-bold text-amber-300 italic mb-2">
          ⚔ Two Journals Discovered ⚔
        </h2>
        <p className="text-sm text-amber-200/80 italic mb-5">
          Thy progress lives in two places. Choose which to keep — the other will be replaced.
        </p>
        <div className="flex flex-col md:flex-row gap-3">
          <Card
            heading="THIS DEVICE"
            state={localState}
            pickLabel="Use this device's progress"
            pickColor="border-amber-700 text-amber-200 bg-amber-900/30"
            onPick={() => onResolve('local')}
          />
          <Card
            heading="YOUR CLOUD"
            state={cloudState}
            pickLabel="Use my cloud progress"
            pickColor="border-purple-700 text-purple-200 bg-purple-900/30"
            onPick={() => onResolve('cloud')}
          />
        </div>
        <button
          onClick={() => onResolve('cancel')}
          className="mt-5 w-full px-3 py-2 rounded border-2 border-stone-700 text-stone-300 italic text-sm hover:bg-stone-900/40"
        >
          Cancel sign-in (keep this device unchanged)
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dungeon-scholar/src/components/MergeChooser.jsx
git commit -m "feat(dungeon-scholar): MergeChooser modal showing both saves' summaries"
```

---

## Task 14: Wire `useAuth` + `MergeChooser` into `App.jsx`

**Files:**
- Modify: `dungeon-scholar/src/App.jsx`

- [ ] **Step 1: Add imports near the top**

```js
import { useAuth } from './hooks/useAuth.js';
import { signOut } from './services/supabase.js';
import { MergeChooser } from './components/MergeChooser.jsx';
```

- [ ] **Step 2: Use the hook + extend `usePlayerState` call**

In `DungeonScholarApp` (line 594), after the existing `useState` declarations:

```jsx
  const { user } = useAuth();
```

Modify the line that uses `usePlayerState` (was changed in Task 6) to:

```jsx
  const [playerState, setPlayerState, sync] = usePlayerState(DEFAULT_STATE, user);
```

- [ ] **Step 3: Render `MergeChooser` near the top of the return**

Inside the main `return (` of `DungeonScholarApp`, just inside the root `<div>` (around line 1247), add:

```jsx
      {sync.mergeRequired && (
        <MergeChooser
          localState={sync.localPreview}
          cloudState={sync.cloudPreview}
          onResolve={async (choice) => {
            if (choice === 'cancel') {
              await signOut();
            }
            sync.resolveMerge(choice);
          }}
        />
      )}
```

(Cancel signs out per spec §7.2 — "Cancel" leaves no changes and ends the sign-in attempt.)

- [ ] **Step 4: Manual integration test**

Run: `npm run dev`
- Sign in fresh → no chooser, profile syncs forward.
- In a second browser, sign in as the same user → no chooser (cloud wins silently because new browser has empty local).
- In that second browser, generate progress, sign out (sign-out button arrives in Task 17 — for now you can manually clear `localStorage` then `supabase.auth.signOut()` from devtools, OR sign in on a third device with stale local data).
- The chooser should appear when both sides have meaningful data.

- [ ] **Step 5: Commit**

```bash
git add dungeon-scholar/src/App.jsx
git commit -m "feat(dungeon-scholar): show merge chooser on sign-in conflict"
```

---

## Task 15: Steady-state cloud sync — debounced upsert + retry/backoff — TDD

**Files:**
- Modify: `dungeon-scholar/src/hooks/usePlayerState.js`
- Modify: `dungeon-scholar/src/hooks/usePlayerState.test.jsx`

- [ ] **Step 1: Add tests for the steady-state path**

Append to `usePlayerState.test.jsx`:

```jsx
describe('usePlayerState — steady-state cloud writes', () => {
  beforeEach(() => {
    localStorage.clear();
    pullSave.mockReset();
    pushSave.mockReset();
  });

  it('debounces cloud writes ~3 s and pushes the latest state', async () => {
    pullSave.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());

    pushSave.mockResolvedValue();

    act(() => {
      result.current[1]({ level: 2, totalXp: 1, library: [] });
      result.current[1]({ level: 3, totalXp: 2, library: [] });
      result.current[1]({ level: 4, totalXp: 3, library: [] });
    });

    // Local fires at 500 ms; cloud fires at 3 s.
    act(() => { vi.advanceTimersByTime(600); });
    // Cloud has not yet fired.
    const cloudCallsBeforeWindow = pushSave.mock.calls.length;

    act(() => { vi.advanceTimersByTime(3500); });
    expect(pushSave.mock.calls.length).toBeGreaterThan(cloudCallsBeforeWindow);
    const lastPush = pushSave.mock.calls.at(-1)[1];
    expect(lastPush.level).toBe(4);
  });

  it('flips status to "saving" then back to "idle" on success', async () => {
    pullSave.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());
    pushSave.mockResolvedValue();

    act(() => { result.current[1]({ level: 5, totalXp: 1, library: [] }); });
    act(() => { vi.advanceTimersByTime(3500); });
    await waitFor(() => expect(result.current[2].status).toBe('idle'));
  });

  it('retries on push failure with backoff and ends in "offline"', async () => {
    pullSave.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePlayerState(DEFAULT, USER));
    await waitFor(() => expect(pullSave).toHaveBeenCalled());
    pushSave.mockRejectedValue(new Error('net'));

    act(() => { result.current[1]({ level: 5, totalXp: 1, library: [] }); });
    // Initial attempt at t≈3s, then retries at +1s, +4s, +16s.
    act(() => { vi.advanceTimersByTime(3500); });
    act(() => { vi.advanceTimersByTime(1100); });
    act(() => { vi.advanceTimersByTime(4100); });
    act(() => { vi.advanceTimersByTime(16100); });
    await waitFor(() => expect(result.current[2].status).toBe('offline'));
    expect(pushSave.mock.calls.length).toBeGreaterThanOrEqual(4); // 1 initial + 3 retries
  });
});
```

- [ ] **Step 2: Run test to verify they fail**

Run: `npm run test:run -- usePlayerState`
Expected: FAIL — no cloud debounce yet.

- [ ] **Step 3: Extend the hook**

Add at the top of `usePlayerState.js`:

```js
const CLOUD_DEBOUNCE_MS = 3000;
const RETRY_DELAYS_MS = [1000, 4000, 16000];
```

Inside the hook body, add three refs:

```js
  const cloudTimeoutRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
```

Add a `pushNow` function:

```js
  const pushNow = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    setStatus('saving');
    try {
      await pushSave(u.id, latestRef.current);
      setStatus('idle');
      retryAttemptRef.current = 0;
    } catch (err) {
      const next = retryAttemptRef.current;
      if (next < RETRY_DELAYS_MS.length) {
        retryAttemptRef.current = next + 1;
        setStatus('saving');
        setTimeout(() => { pushNow(); }, RETRY_DELAYS_MS[next]);
      } else {
        setStatus('offline');
        retryAttemptRef.current = 0;
      }
    }
  }, []);
```

In the `setState` callback, after the local debounce setup, add a cloud-debounce schedule:

```js
      // Schedule cloud write only when signed in.
      if (userRef.current) {
        if (cloudTimeoutRef.current) clearTimeout(cloudTimeoutRef.current);
        cloudTimeoutRef.current = setTimeout(() => {
          cloudTimeoutRef.current = null;
          pushNow();
        }, CLOUD_DEBOUNCE_MS);
      }
```

In the `beforeunload` effect, add cloud flush:

```js
    const onUnload = () => {
      flushLocal();
      // Best-effort sync flush — `keepalive` would be nice but Supabase
      // SDK doesn't expose it; on tab close we just race the request.
      if (cloudTimeoutRef.current) {
        clearTimeout(cloudTimeoutRef.current);
        cloudTimeoutRef.current = null;
        pushNow();
      }
    };
```

When the user changes (sign-out), reset retry state and abort pending cloud write:

```js
  useEffect(() => {
    if (!user && cloudTimeoutRef.current) {
      clearTimeout(cloudTimeoutRef.current);
      cloudTimeoutRef.current = null;
    }
    retryAttemptRef.current = 0;
  }, [user]);
```

- [ ] **Step 4: Run test to verify they pass**

Run: `npm run test:run -- usePlayerState`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dungeon-scholar/src/hooks/usePlayerState.js dungeon-scholar/src/hooks/usePlayerState.test.jsx
git commit -m "feat(dungeon-scholar): debounced cloud upsert with retry/backoff"
```

---

## Task 16: `SyncStatusDot` + `ProfileChip` + slot into header

**Files:**
- Create: `dungeon-scholar/src/components/SyncStatusDot.jsx`
- Create: `dungeon-scholar/src/components/ProfileChip.jsx`
- Modify: `dungeon-scholar/src/App.jsx` (header area around line 1343)

- [ ] **Step 1: Create `SyncStatusDot.jsx`**

```jsx
// dungeon-scholar/src/components/SyncStatusDot.jsx
import React from 'react';

const COLORS = {
  idle: '#10b981',     // green
  saving: '#f59e0b',   // amber, will pulse via class
  error: '#ef4444',    // red
  offline: '#ef4444',  // red
};

const TITLES = {
  idle: 'Synced',
  saving: 'Saving…',
  error: 'Sync error — will retry',
  offline: 'Offline — will retry',
};

export function SyncStatusDot({ status }) {
  const color = COLORS[status] || COLORS.idle;
  const title = TITLES[status] || TITLES.idle;
  const pulse = status === 'saving';
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-block w-2 h-2 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}
```

- [ ] **Step 2: Create `ProfileChip.jsx`**

```jsx
// dungeon-scholar/src/components/ProfileChip.jsx
import React from 'react';
import { SyncStatusDot } from './SyncStatusDot.jsx';

export function ProfileChip({ user, syncStatus, onOpen }) {
  if (!user) return null;
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 px-2 py-1 rounded border border-amber-800 hover:bg-amber-900/20 italic"
      title="Account"
    >
      {user.avatarUrl && (
        <img
          src={user.avatarUrl}
          alt=""
          className="w-6 h-6 rounded-full border border-amber-700"
        />
      )}
      <span className="text-sm text-amber-200">@{user.githubLogin || 'scholar'}</span>
      <SyncStatusDot status={syncStatus} />
    </button>
  );
}
```

- [ ] **Step 3: Slot the chip into the header**

In `App.jsx` near line 1404 (the closing `</div>` of the header's right-hand stats row), add the chip just above:

```jsx
            {user && (
              <ProfileChip
                user={user}
                syncStatus={sync.status}
                onOpen={() => setShowAccountPanel(true)}
              />
            )}
```

Add the import near the top of the file:

```js
import { ProfileChip } from './components/ProfileChip.jsx';
```

Add the state at the top of `DungeonScholarApp` body:

```js
  const [showAccountPanel, setShowAccountPanel] = useState(false);
```

(`<AccountPanel>` itself comes in Task 17; this just stages the open state.)

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
- Signed in → chip + dot visible at the header. Dot is green.
- Edit a tome → dot pulses amber briefly, returns to green.
- Disable network and edit → dot turns red within ~25 s.

- [ ] **Step 5: Commit**

```bash
git add dungeon-scholar/src/components/SyncStatusDot.jsx dungeon-scholar/src/components/ProfileChip.jsx dungeon-scholar/src/App.jsx
git commit -m "feat(dungeon-scholar): profile chip + sync status indicator in header"
```

---

## Task 17: `AccountPanel` modal — sign out + delete cloud save + delete account

**Files:**
- Create: `dungeon-scholar/src/components/AccountPanel.jsx`
- Modify: `dungeon-scholar/src/App.jsx`

- [ ] **Step 1: Create the component**

```jsx
// dungeon-scholar/src/components/AccountPanel.jsx
import React, { useState } from 'react';
import { LogOut, Cloud, CloudOff, Trash2 } from 'lucide-react';
import { signOut } from '../services/supabase.js';
import { deleteCloudSave, deleteAccount } from '../services/cloudSync.js';

function relativeTimeFrom(date) {
  if (!date) return 'never';
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} hr ago`;
}

export function AccountPanel({ user, syncStatus, lastSyncedAt, onClose, onAfterDeleteCloud, onAfterDeleteAccount }) {
  const [confirmKind, setConfirmKind] = useState(null); // 'cloud' | 'account' | null
  const [typedConfirm, setTypedConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const doSignOut = async () => {
    setBusy(true);
    await signOut();
    onClose();
  };

  const doDeleteCloud = async () => {
    setBusy(true);
    try {
      await deleteCloudSave(user.id);
      onAfterDeleteCloud?.();
      setConfirmKind(null);
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  const doDeleteAccount = async () => {
    setBusy(true);
    try {
      await deleteAccount(user.id);
      await signOut();
      onAfterDeleteAccount?.();
      onClose();
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  const statusText = {
    idle: lastSyncedAt ? `Synced ${relativeTimeFrom(lastSyncedAt)}` : 'Synced',
    saving: 'Saving…',
    error: 'Sync error — will retry',
    offline: 'Offline — will retry',
  }[syncStatus] || 'Synced';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="max-w-md w-[92%] p-6 rounded border-2 border-amber-600" style={{ background: 'rgba(20, 12, 6, 0.97)' }}>
        <div className="flex items-center gap-3 mb-4">
          {user.avatarUrl && <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full border-2 border-amber-700" />}
          <div>
            <div className="text-lg italic text-amber-200">@{user.githubLogin}</div>
            <div className="text-xs text-amber-700 italic">{statusText}</div>
          </div>
        </div>

        {!confirmKind && (
          <div className="flex flex-col gap-3">
            <button onClick={doSignOut} disabled={busy} className="w-full px-3 py-2 rounded border-2 border-amber-700 text-amber-200 italic text-sm hover:bg-amber-900/30 flex items-center gap-2">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
            <button onClick={() => setConfirmKind('cloud')} disabled={busy} className="w-full px-3 py-2 rounded border-2 border-orange-700 text-orange-200 italic text-sm hover:bg-orange-900/30 flex items-center gap-2">
              <CloudOff className="w-4 h-4" /> Delete cloud save (keep this device)
            </button>
            <button onClick={() => setConfirmKind('account')} disabled={busy} className="w-full px-3 py-2 rounded border-2 border-red-800 text-red-300 italic text-sm hover:bg-red-900/30 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete account
            </button>
            <button onClick={onClose} className="mt-2 text-xs text-amber-700 italic hover:text-amber-500">Close</button>
          </div>
        )}

        {confirmKind === 'cloud' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-amber-200 italic">
              This wipes thy cloud save. Local progress remains. Thou mayest re-sync from this device afterward.
            </p>
            <button onClick={doDeleteCloud} disabled={busy} className="w-full px-3 py-2 rounded border-2 border-orange-700 text-orange-200 italic text-sm hover:bg-orange-900/30">Yes, delete cloud save</button>
            <button onClick={() => setConfirmKind(null)} className="text-xs text-amber-700 italic hover:text-amber-500">Cancel</button>
          </div>
        )}

        {confirmKind === 'account' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-amber-200 italic">
              This deletes thy account and cloud save. Local progress remains.
              Type <code className="text-red-300">{user.githubLogin}</code> to confirm.
            </p>
            <input value={typedConfirm} onChange={e => setTypedConfirm(e.target.value)} className="px-2 py-1 rounded border border-red-700 bg-red-900/30 text-red-100 text-sm italic" />
            <button
              onClick={doDeleteAccount}
              disabled={busy || typedConfirm !== user.githubLogin}
              className="w-full px-3 py-2 rounded border-2 border-red-800 text-red-300 italic text-sm hover:bg-red-900/30 disabled:opacity-50"
            >
              Permanently delete account
            </button>
            <button onClick={() => { setConfirmKind(null); setTypedConfirm(''); }} className="text-xs text-amber-700 italic hover:text-amber-500">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render `AccountPanel` in `App.jsx`**

Add the import:

```js
import { AccountPanel } from './components/AccountPanel.jsx';
```

In the main `return` of `DungeonScholarApp`, near the `<MergeChooser>` block, add:

```jsx
      {showAccountPanel && (
        <AccountPanel
          user={user}
          syncStatus={sync.status}
          lastSyncedAt={null}
          onClose={() => setShowAccountPanel(false)}
          onAfterDeleteCloud={() => { /* keep local; cloud will repopulate on next change */ }}
          onAfterDeleteAccount={() => { /* signed out via signOut(); local survives */ }}
        />
      )}
```

(`lastSyncedAt` is wired through later if needed — for v1 we can pass `null` and rely on the relative-status text from `sync.status`.)

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
- Click profile chip → modal opens.
- Sign out → modal closes, chip disappears, app falls back to local-only.
- Sign back in, click profile chip → Delete cloud save → confirm → row gone in Supabase dashboard, local progress unchanged.
- Sign in again, Delete account → type username → confirm → both rows gone, signed out, local progress preserved.

- [ ] **Step 4: Commit**

```bash
git add dungeon-scholar/src/components/AccountPanel.jsx dungeon-scholar/src/App.jsx
git commit -m "feat(dungeon-scholar): account panel with sign-out and destructive actions"
```

---

# Phase D — CI, docs, integration tests

## Task 18: CI — run tests + inject Supabase env vars at build

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Edit the workflow**

After the `npm ci` step, add a test step. After `npm run build`, add an `env:` block. Final shape of the `build` job:

```yaml
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./dungeon-scholar
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: dungeon-scholar/package-lock.json
      - run: npm ci
      - run: npm run test:run
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dungeon-scholar/dist
```

- [ ] **Step 2: Verify locally that the test command works**

Run: `cd dungeon-scholar && npm run test:run`
Expected: all tests PASS in <30 s.

- [ ] **Step 3: Commit and push so CI runs**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(dungeon-scholar): run unit tests; inject Supabase env at build"
git push
```

- [ ] **Step 4: Verify CI is green**

Open GitHub Actions tab in browser, confirm both `build` and `deploy` jobs pass.
If `VITE_SUPABASE_*` aren't set as repo secrets yet (Task 2 step 7), the build will succeed but the deployed bundle will have no Supabase client. Add the secrets and re-run.

---

## Task 19: README updates

**Files:**
- Modify: `dungeon-scholar/README.md`

- [ ] **Step 1: Add an "Accounts & cloud sync" section after the existing setup**

Append after the "Run it locally first" section:

```markdown
## Accounts & cloud sync (optional)

Dungeon Scholar saves your progress to your browser's localStorage automatically — no setup required.

For optional **cloud sync** across devices, the project uses Supabase + GitHub OAuth. To enable it on a fork:

1. Follow `docs/supabase-setup.md` (one-time dashboard work, ~10 minutes).
2. Copy `.env.example` → `.env.local` and fill in the two values from your Supabase project.
3. Add the same two values as repo secrets at **Settings → Secrets and variables → Actions** so deploys pick them up.

If `.env.local` is missing, the app skips the sign-in button and runs as a pure local app.
```

- [ ] **Step 2: Commit**

```bash
git add dungeon-scholar/README.md
git commit -m "docs(dungeon-scholar): document accounts & cloud-sync setup"
```

---

## Task 20: Manual integration test pass

**Files:**
- (no code changes; record results in the existing `docs/ISSUES-LOG-DNDAPP.md` or `docs/SUGGESTIONS-LOG-DNDAPP.md` only if defects found)

- [ ] **Step 1: Run the spec §11.2 checklist**

Walk through each item against a real free-tier Supabase project and the deployed Pages site:

- [ ] Full GitHub OAuth round-trip from `localhost:5173/home-lab/`.
- [ ] Full GitHub OAuth round-trip from the deployed Pages site.
- [ ] Sign in with mismatched local/cloud → chooser appears; "Use this device" branch behaves correctly; "Use cloud" branch behaves correctly; Cancel signs out and changes nothing.
- [ ] Two browsers signed in as the same user → second device pulls the first's progress on next boot.
- [ ] **RLS bypass test:** in browser devtools console with the live `supabase` instance, run:
  ```js
  await window.__supabase__.from('saves').select().neq('user_id', YOUR_UID);
  ```
  *Expected: empty array.* And:
  ```js
  await window.__supabase__.from('saves').update({ data: 'pwn' }).neq('user_id', YOUR_UID);
  ```
  *Expected: zero rows updated.*
  (To make `__supabase__` available temporarily, you can paste the import in the console or expose it from `supabase.js` behind an `import.meta.env.DEV` guard for the duration of the test.)
- [ ] Delete cloud save → row gone, local survives, can re-sync from local.
- [ ] Delete account → both `profiles` and `saves` rows gone; signed out; local survives.
- [ ] Token-expiry simulation: GitHub Settings → Applications → Authorized OAuth Apps → revoke. Next refresh fails → status indicator goes red, signed-out banner appears.

- [ ] **Step 2: Log any findings**

If any check fails, append to `docs/ISSUES-LOG-DNDAPP.md` per the log instructions (see project's `docs/LOG-INSTRUCTIONS.md`). If all pass, no logging needed.

- [ ] **Step 3 (optional): Tag a release**

```bash
git tag -a dungeon-scholar-v0.2.0 -m "Accounts + cloud sync"
git push --tags
```

---

## Out-of-scope reminders (DO NOT IMPLEMENT)

Per spec §3 these are explicitly **not** in this plan and should not be added:
- Real-time concurrent editing across devices.
- Cross-tab live sync within one browser.
- Friends, leaderboards, shared tomes.
- Email magic-link or password fallback.
- Server-side validation / sanitization.
- A custom data-export endpoint.

If a refactor of `App.jsx` looks tempting while editing it, resist — the spec deliberately keeps the file mostly intact.
