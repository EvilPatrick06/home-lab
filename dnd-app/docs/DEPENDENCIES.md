# dnd-app — dependency notes

Why the non-obvious dependency decisions are the way they are. Re-check this file when bumping deps.

## `package.json` `overrides`

These force a transitive (indirect) dependency to a specific version across the whole tree. Each line says *what asked for the old version* (via `npm explain`) and *why we pin*. Verified 2026-05-30.

| Override | Forces | Was (from) | Why | On bump |
|---|---|---|---|---|
| `uuid: ^14.0.0` | transitive uuid → 14.x | (older) | **Security** — GHSA-w5hq-g745-h8pq. dnd-app itself uses `crypto.randomUUID` (no direct uuid dep); this only floors dev-tree transitives. | Drop if no transitive pulls a vulnerable uuid. |
| `postcss: >=8.5.10` | postcss floor | `^8.5.6` from `vite` | **Security** — floor past the patched postcss line. | Keep ≥ the latest postcss advisory fix. |
| `minimatch: >=10.2.1` | minimatch floor | `^3.0.4` from `@electron/asar` | **Security + dedup** — the old 3.x line had a ReDoS; force modern minimatch. | Keep ≥ patched. |
| `semver: 7.7.4` | semver → 7.7.4 | `^6.3.1` from `@babel/core` | **Security + dedup** — pull babel's semver up to a single modern 7.x (old 6.x ReDoS). | Bump to the newest 7.x on dep bumps. |
| `scheduler: 0.27.0` | scheduler exact | `^0.27.0` from `react-dom` | **React version lock** — pin the exact `scheduler` React 19.2 expects; prevents version skew if a tool pulls a different scheduler. | Must track `react-dom`'s bundled scheduler version — update together. |
| `chalk: 4.1.2` | chalk → 4.1.2 | `^4.1.1` from `@electron/fuses` | **CJS compat** — chalk 5+ is ESM-only; keep a `require()`-able chalk for CJS tooling. | Don't bump to 5 unless all consumers are ESM. |
| `commander: 12.1.0` | commander → 12.1.0 | `^5.0.0` from `@electron/asar` | **Dedup** — collapse to one modern commander instead of an ancient 5.x. | Bump with the electron-builder/asar toolchain. |
| `fs-extra: 11.3.3` | fs-extra → 11.3.3 | `^9.0.1` from `@electron/fuses` | **Dedup** — one modern fs-extra across electron tooling. | Bump with electron tooling. |
| `entities: 4.5.0` | entities → 4.5.0 | `^7.0.1` from `happy-dom` | **Dedup/compat** — pin to the 4.x line shared with other parsers rather than letting happy-dom pull its own entities 7. Test-only dep (happy-dom is the vitest DOM). | Re-evaluate if happy-dom hard-requires entities 7. |

Rule of thumb: **CVE-floor** overrides (`uuid`, `postcss`, `minimatch`, `semver`) should be kept ≥ the latest advisory fix; **dedup/pin** overrides (`scheduler`, `chalk`, `commander`, `fs-extra`, `entities`) exist to avoid duplicate/incompatible copies and should be re-checked (and ideally removed) whenever the consumer named in the "Was (from)" column is upgraded.

## Electron upgrade cadence

Electron ships a new major roughly every ~8 weeks and supports the **latest 3 majors** (each major ≈ 6 months of support). Running an EOL major means no security patches.

- **Current:** Electron 42 (shipped v2.3.0, 2026-05-30). Supported through ~2026-10-20.
- **Cadence:** bump to a current major **before the running one hits EOL**. Don't chase every major — landing on the newest of the 3 supported majors buys the longest runway (we skipped 41 and went 40→42).
- **How:** `npm install electron@<latest>` → re-run `npm run postinstall` (so `@electron/rebuild`/`node-abi` pick up the new ABI) → 4-gate → **smoke-test the GUI** (map/dice WebGL render, AI streaming, P2P + cloud multiplayer, NSIS auto-update) since a Chromium major jump is runtime surface no static check covers → cut a release.
- The matching `node-abi` must know the new Electron's ABI; a current `npm install` usually dedupes it, else bump `node-abi`.

## Held dependency bumps (not safe yet)

- **vite 8 + @vitejs/plugin-react 6** — blocked by `electron-vite`: its vite peerDep tops out at `^7` and there is no stable `electron-vite` that allows Vite 8 (only `6.0.0-beta`). Adopting Vite 8 would mean running a pre-release build tool on the release pipeline. **Revisit when `npm view electron-vite dist-tags` shows a 6.x on `latest`**, then treat as bump-with-testing (Vite 8's Rolldown/Oxc output differs from Rollup/esbuild — full app + 6-asset-release verification required). (dungeon-scholar already runs Vite 8 — it has no electron-vite.)
