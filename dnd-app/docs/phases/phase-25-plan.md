# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 21 of the D&D VTT project.

Phase 21 covers **GitHub & Version Control** — `.gitignore`, branching, README, CI/CD, git hooks, and commit hygiene. The audit found `.gitignore` well-configured and commit history clean (conventional commits). The gaps are **no CI validation pipeline** (only a release workflow), **no pre-commit hooks**, **barebones README**, and **no branching strategy** (everything pushed to master).

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 21 is config/workflow changes. No Raspberry Pi involvement.

**Existing Files:**

| File | Status |
|------|--------|
| `.gitignore` | Well-configured — secrets, build artifacts, large files excluded |
| `.github/workflows/release.yml` | Windows release on tag push — functional |
| `README.md` | Barebones, inaccurate (lists `npm install dnd-vtt` instead of actual dev commands) |
| `CLAUDE.md` | Contains actual dev setup instructions |

**Missing Files:**

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | PR/push validation (tests, lint, typecheck) |
| `.husky/pre-commit` | Pre-commit hook for lint/format |
| `CONTRIBUTING.md` | Contribution guidelines |

---

## 📋 Core Objectives

| # | Issue | Priority |
|---|-------|----------|
| G1 | No CI validation pipeline (tests/lint/typecheck on push) | High |
| G2 | README is barebones and inaccurate | High |
| G3 | No pre-commit hooks | Medium |
| G4 | No branching strategy documented | Low |
| G5 | Phase research files cluttering root directory | Low |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: CI Validation Pipeline (G1)

**Step 1 — Create CI Workflow**
- Create `.github/workflows/ci.yml`:
  ```yaml
  name: CI
  on:
    push:
      branches: [master]
    pull_request:
      branches: [master]

  jobs:
    validate:
      runs-on: windows-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: npm
        - run: npm ci

        - name: Type Check
          run: npx tsc --noEmit

        - name: Lint
          run: npx biome check src/

        - name: Test
          run: npx vitest run --reporter=verbose
  ```
- This runs on every push to master and every PR targeting master
- Three validation steps: TypeScript compilation, Biome linting, Vitest tests
- Uses Windows runner to match the target platform

**Step 2 — Add Build Verification to CI**
- Add a build step after tests pass:
  ```yaml
        - name: Build
          run: npx electron-vite build

        - name: Verify Build Artifacts
          run: |
            if (!(Test-Path out/main/index.js)) { exit 1 }
            if (!(Test-Path out/renderer/index.html)) { exit 1 }
          shell: pwsh
  ```
- This catches build-time errors that tsc/vitest don't find (e.g., Vite config issues, missing imports in lazy-loaded routes)

### Sub-Phase B: README Overhaul (G2)

**Step 3 — Rewrite README.md**
- Replace the current barebones README with a comprehensive project README:
  ```markdown
  # D&D Virtual Tabletop

  A desktop D&D 5e (2024) Virtual Tabletop built with Electron, React, and PixiJS. Features an AI Dungeon Master, peer-to-peer multiplayer, dynamic maps with fog of war, and a complete character builder.

  ## Quick Start

  ```bash
  npm install
  npm run dev
  ```

  ## Build

  ```bash
  npm run build:win    # Windows installer
  npm run build:mac    # macOS (requires macOS)
  npm run build:linux  # Linux AppImage/deb
  ```

  ## Tech Stack

  - **Runtime:** Electron 40
  - **Frontend:** React 19, TypeScript 5.9, Tailwind CSS v4
  - **Map Engine:** PixiJS 8 (2D), Three.js (3D dice)
  - **State:** Zustand v5
  - **Networking:** PeerJS (WebRTC P2P)
  - **AI:** Ollama (local), Claude, OpenAI, Gemini
  - **Build:** electron-vite, electron-builder

  ## Project Structure

  ```
  src/
    main/       # Electron main process (AI, storage, IPC)
    preload/    # Preload bridge (context isolation)
    renderer/   # React app (components, stores, services)
    shared/     # Shared types and constants
  BMO-setup/    # Raspberry Pi backend (Discord bot, voice, agents)
  ```

  ## Environment Variables

  AI API keys are configured in-app via Settings > AI Provider.
  No `.env` file is required for basic development.

  For Discord integration:
  - `BMO_PI_URL` — Raspberry Pi backend URL (default: `http://bmo.local:5000`)

  ## Testing

  ```bash
  npm test              # Run all tests
  npx vitest run        # Run once
  npx vitest --ui       # Interactive UI
  ```

  ## License

  D&D content used under the SRD 5.2 Creative Commons Attribution 4.0 License.
  See the About page in-app for full licensing details.
  ```
- Ensure the README matches current project reality (commands from `package.json`, actual structure)

### Sub-Phase C: Pre-Commit Hooks (G3)

**Step 4 — Install Husky**
- Run: `npm install --save-dev husky`
- Initialize: `npx husky init`
- This creates `.husky/` directory with a sample pre-commit hook

**Step 5 — Configure Pre-Commit Hook**
- Create `.husky/pre-commit`:
  ```bash
  #!/usr/bin/env sh
  . "$(dirname -- "$0")/_/husky.sh"

  # Run Biome on staged files only (fast)
  npx biome check --staged --no-errors-on-unmatched src/

  # Type check (full project, ~10-15s)
  npx tsc --noEmit
  ```
- This prevents commits with lint errors or type errors
- `--staged` flag on Biome only checks files being committed (fast)
- `tsc --noEmit` is slower but catches cross-file type issues

**Step 6 — Add lint-staged for Performance (Optional)**
- If the full `tsc --noEmit` is too slow for pre-commit:
  ```bash
  npm install --save-dev lint-staged
  ```
  ```json
  // package.json
  "lint-staged": {
    "src/**/*.{ts,tsx}": ["biome check --fix"]
  }
  ```
  ```bash
  # .husky/pre-commit
  npx lint-staged
  ```
- This only runs Biome on staged files, keeping pre-commit under 3 seconds

### Sub-Phase D: Branching Strategy (G4)

**Step 7 — Document Branching Convention**
- Add to README or create `CONTRIBUTING.md`:
  ```markdown
  ## Branching Strategy

  - `master` — stable, release-ready code
  - `feature/*` — new features (e.g., `feature/bastion-bp-system`)
  - `fix/*` — bug fixes (e.g., `fix/exhaustion-long-rest`)
  - `refactor/*` — code cleanup (e.g., `refactor/unify-settings-store`)

  ### Workflow
  1. Create a feature/fix branch from `master`
  2. Make changes, commit with conventional commit messages
  3. Push and create a Pull Request
  4. CI runs automatically on the PR
  5. Merge to `master` after review
  ```
- This is a documented convention, not enforced by tooling. Branch protection rules can be added later on GitHub.

### Sub-Phase E: Workspace Cleanup (G5)

**Step 8 — Add Phase Research Files to .gitignore**
- The Phase analysis files (`Phase1_GeminiPro.md`, `Phase2_ClaudeOpus.md`, etc.) and plan files (`Phase1_Plan.md`, etc.) clutter the root
- Add to `.gitignore`:
  ```
  # Phase research and plan files
  Phase*_*.md
  ```
- Or move them to a dedicated directory: `docs/research/`
- These are research artifacts, not part of the application source

**Step 9 — Update Release Workflow**
- Open `.github/workflows/release.yml`
- Ensure it runs the full build chain including `prerelease` and `build:index`:
  ```yaml
  - name: Build and Release
    run: npm run release
    env:
      GH_TOKEN: ${{ secrets.GH_TOKEN }}
  ```
- Verify that the `release` script in `package.json` (fixed in Phase 19 Step 4) includes `prerelease` and `build:index`

---

## ⚠️ Constraints & Edge Cases

### CI Pipeline
- **Windows runner**: The CI must use `windows-latest` because the app targets Windows and uses Windows-specific dependencies. If Mac/Linux builds are added (Phase 19), add matrix builds.
- **npm ci**: Use `npm ci` (not `npm install`) in CI for reproducible builds from `package-lock.json`.
- **Test timeout**: Vitest tests may timeout on slower CI runners. Set `--timeout 30000` if needed.
- **Biome config**: Ensure `biome.json` exists at the project root. If Biome is configured via `package.json`, that works too.

### Pre-Commit Hooks
- **Husky requires `.git` directory**: Only works in git repos. `npx husky init` will fail if not a git repo.
- **Skip hooks**: Developers can bypass with `git commit --no-verify` for emergency commits. This is acceptable — CI catches issues on push.
- **Performance**: `tsc --noEmit` on the full project takes 10-15 seconds. If this is too slow, remove it from pre-commit and rely on CI for type checking.

### README
- **Keep it concise**: The README should be a quick-start guide, not full documentation. Link to `CLAUDE.md` for detailed developer setup if needed.
- **Do NOT include API keys or secrets** in the README. Reference in-app settings for AI provider configuration.

### Branching
- **Solo developer workflow**: The branching strategy is advisory. For a solo project, direct pushes to master are common. The value is in establishing the pattern for when contributors join.
- **Branch protection**: Can be enabled on GitHub: require CI to pass before merging to master. This is a GitHub settings change, not a code change.

Begin implementation now. Start with Sub-Phase A (Steps 1-2) for the CI pipeline — this is the highest-impact change for code quality assurance. Then Sub-Phase B (Step 3) for the README rewrite. Sub-Phase C (Steps 4-6) for pre-commit hooks is quick to set up.
