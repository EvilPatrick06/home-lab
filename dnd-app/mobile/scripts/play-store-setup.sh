#!/usr/bin/env bash
# One-time Play Store / EAS setup. Run from mobile/ after `npm install`.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Checking embed bundle…"
if [[ ! -f assets/embed.zip ]]; then
  npm run build:embed
fi

echo "==> EAS login (opens browser — complete in your terminal)…"
npx eas login

echo "==> Linking Expo project…"
npx eas init

echo "==> Preview APK (internal testing, cloud build)…"
echo "    Run when ready:  npm run build:android:preview"
echo ""
echo "==> Production AAB + Play submit…"
echo "    1. Complete docs/play-store/IP-CONTENT-REVIEW.md (blocking)"
echo "    2. Host PRIVACY-POLICY.md at a public URL; set in app.config.ts extra"
echo "    3. npm run build:android:production"
echo "    4. npm run submit:android   (requires Play Console service account JSON)"
