# Secrets Rotation Checklist

Leaked secrets MUST be rotated (not just removed). Once a secret touches a public git repo, assume it's compromised.

## Background: the 2026-04-23 purge

On 2026-04-23, the following secrets were committed to `master` (public):

- `ANTHROPIC_API_KEY` (in `.env` at repo root)
- `GOOGLE_CLIENT_SECRET` `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`
- `GOOGLE_ACCESS_TOKEN` / `GOOGLE_REFRESH_TOKEN`
- TV device RSA private key (`tv_key.pem`)
- TV device cert (`tv_cert.pem`)

History was purged via `git filter-repo` and force-pushed. GitHub holds on to orphan objects for a while (eventual GC) but active refs are clean.

**Even after the purge, treat these as compromised** — anyone who cloned/forked during the exposure window has them.

## Rotate checklist (run all of these)

### 1. Anthropic API Key

1. Go to https://console.anthropic.com/settings/keys
2. Find the leaked key (starts with `sk-ant-api03-hgeRDw...`) — revoke it
3. Create new key
4. Update `/home/patrick/DnD/.env` on Pi: `ANTHROPIC_API_KEY=sk-ant-...new...`
5. Update any laptop `.env` (dnd-app development)
6. Restart BMO: `sudo systemctl restart bmo`

### 2. Google OAuth (Calendar)

Leaked items: `client_secret`, `access_token`, `refresh_token`, `client_id` (client_id is public-ish, no need to rotate)

1. Go to https://console.cloud.google.com/apis/credentials (project: `focal-shadow-415419`)
2. Find the OAuth 2.0 Client ID `112208691375-bbmhka4dmarmd9m4qlu7b9jjvog7cn9b`
3. Click **Reset Secret** — generates a new client_secret
4. Update `/home/patrick/DnD/bmo/config/.env`:
   - `GOOGLE_CLIENT_SECRET=GOCSPX-...new...`
5. Revoke existing token at https://myaccount.google.com/permissions
   - Find "BMO" (or your OAuth app name) → Remove Access
6. Re-authorize BMO:
   ```bash
   cd /home/patrick/DnD/bmo/pi
   ./venv/bin/python services/authorize_calendar.py
   # Follow URL, sign in, grant permissions
   # Fresh token.json is written
   ```
7. Also update `/home/patrick/DnD/bmo/pi/config/credentials.json` with new client_secret (it mirrors `.env`)
8. Restart BMO: `sudo systemctl restart bmo`

### 3. TV Device RSA Key

The `tv_key.pem` + `tv_cert.pem` were for ADB-over-network to a specific TV. Lower risk (only usable against that TV), but still regenerate:

1. On the Pi:
   ```bash
   cd /home/patrick/DnD/bmo/pi
   openssl req -newkey rsa:2048 -nodes \
     -keyout tv_key.pem \
     -x509 -days 365 \
     -subj "/CN=BMO-Pi-TV" \
     -out tv_cert.pem
   ```
2. Re-pair with TV:
   - On TV: Developer Options → Revoke ADB authorizations
   - On Pi: `adb connect <tv-ip>:5555` — TV will prompt for pairing
3. Verify: `adb devices` shows the TV as authorized

### 4. Discord Bot Tokens (if you use them)

If you had `DISCORD_DM_BOT_TOKEN` or `DISCORD_SOCIAL_BOT_TOKEN` set in any leaked `.env`:

1. Go to https://discord.com/developers/applications
2. For each bot, click **Bot** → **Reset Token**
3. Copy new token, update `.env`
4. Restart: `sudo systemctl restart bmo-dm-bot bmo-social-bot`

### 5. Other API keys (as applicable)

Check `bmo/pi/.env` for any of these — rotate at the provider if they were ever committed:

- `GEMINI_API_KEY` — https://aistudio.google.com/apikey (revoke old, create new)
- `GROQ_API_KEY` — https://console.groq.com/keys
- `FISH_AUDIO_API_KEY` — https://fish.audio/account/api-keys
- `GOOGLE_VISION_API_KEY` — Google Cloud Console
- `CF_TUNNEL_TOKEN` — Cloudflare Zero Trust → Tunnels → regenerate

## Preventing re-leak

After rotation, confirm your `.gitignore` handles all cases:

```bash
cd /home/patrick/DnD
# These should all be IGNORED:
for f in .env BMO-setup/config/.env bmo/pi/.env bmo/pi/config/credentials.json bmo/pi/config/token.json bmo/pi/tv_cert.pem bmo/pi/tv_key.pem; do
  git check-ignore -v "$f" 2>&1
done
```

If any file returns nothing, that file is NOT ignored — add a rule to `.gitignore`.

## Future: pre-commit secret scanning

Strongly recommended — see entry in [`KNOWN-ISSUES.md`](./KNOWN-ISSUES.md) for setting up `gitleaks` pre-commit hook.

Quick install:
```bash
# Install gitleaks
brew install gitleaks    # or apt / scoop / etc.

# Add to .githooks/pre-commit:
#!/bin/bash
gitleaks protect --staged --redact --verbose

# Enable:
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

## Verification (after rotation)

```bash
# BMO should have no auth errors:
journalctl -u bmo --since "5 min ago" --no-pager | grep -i "auth\|invalid_grant\|unauthoriz\|401\|403"
# → empty = good

# DnD app should connect to BMO:
curl -sf http://bmo.local:5000/health
# → {"status":"ok"}

# Google Calendar should populate:
curl -sf http://bmo.local:5000/api/calendar/events
# → returns events, not auth error
```

## Incident log

| Date | What leaked | Rotation status | Notes |
|---|---|---|---|
| 2026-04-23 | Anthropic key, Google OAuth, TV RSA key | Pending user action | Purge via git-filter-repo done; user must rotate all. |
