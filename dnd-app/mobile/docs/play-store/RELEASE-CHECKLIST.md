# Android Release Checklist

End-to-end steps to take the Expo app from source to the Play Store.

## 0. One-time setup

- [ ] `cd .. && npm install` (root deps) and `npm install` here (mobile deps).
- [ ] `npx expo install --fix` to align native module versions with the SDK.
- [ ] `eas login` and `eas init` (writes `extra.eas.projectId`).
- [ ] Create a Google Play Console developer account ($25 one-time) and a new app.
- [ ] Create a Play **service account** JSON for `eas submit` (Play Console →
      API access) and store it as an EAS secret, not in git.

## 1. Pre-flight gates

- [ ] Complete [IP-CONTENT-REVIEW.md](./IP-CONTENT-REVIEW.md) (blocking).
- [ ] Host [PRIVACY-POLICY.md](./PRIVACY-POLICY.md) at a public URL; set it in
      `app.config.ts` extra + the Play listing.
- [ ] Set a real support email.
- [ ] `npm run typecheck` and `npm run lint` clean.

## 2. Build the embedded bundle

- [ ] `npm run build:embed` (builds `../dist-embed`, stages `assets/embed/`).
- [ ] Decide embed delivery (offline bundle vs deployed URL) and set
      `extra.embedUrl` accordingly.

## 3. Internal testing

- [ ] `npm run build:android:preview` → install the APK on a device, smoke test:
  - [ ] Main menu, Characters (create/list), Settings persist.
  - [ ] Library loads in the WebView.
  - [ ] Host/join a session; map pinch-zoom, token drag, dice roll.
  - [ ] Bridge: character/settings reads come from the native store.
- [ ] Fix issues; iterate.

## 4. Production build + submit

- [ ] Bump `version` / `versionCode` (or rely on `autoIncrement`).
- [ ] `npm run build:android:production` → AAB.
- [ ] Complete Play Console: store listing (STORE-LISTING.md), graphics, content
      rating (IARC), Data Safety (DATA-SAFETY.md), target audience.
- [ ] `npm run submit:android` (uploads to the **internal** track as a draft).
- [ ] Promote internal → closed → open/production after testing.

## 5. CI (optional, future)

Mirror the desktop release automation: a GitHub workflow that runs
`build:embed`, then `eas build --non-interactive` on a tag, gated on the
`dnd-app CI` check (parallels `dnd-web-deploy.yml`).
