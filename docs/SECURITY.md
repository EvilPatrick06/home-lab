# Security Policy

## Reporting a vulnerability

If you find a security issue in this repo, please **do NOT** open a public GitHub issue. Instead:

1. Email the repo owner directly (see GitHub profile: [@EvilPatrick06](https://github.com/EvilPatrick06))
2. Title: `[SECURITY] <short description>`
3. Include:
   - Vulnerability description
   - Reproduction steps
   - Potential impact
   - Suggested fix (if known)
4. Give us ≥7 days to respond before disclosing publicly

## Supported versions

| Component | Version | Status |
|---|---|---|
| `dnd-app` | Current master | Supported |
| `bmo` | Current master | Supported |
| Older releases | — | Not supported; upgrade to master |

This is a solo project — patch speed depends on availability. Critical fixes will ship ASAP.

## Security posture

- **Private repo** — no general public access
- **`.gitignore`** has broad patterns for env files, PEM keys, OAuth tokens, credentials JSON, service accounts, private keys
- **BMO runs as user `patrick`** (not root) — services with minimal systemd hardening (room to improve, see [`./SECURITY-LOG.md`](./SECURITY-LOG.md))
- **No public internet exposure by default** — BMO runs on LAN only. Remote access via Cloudflare Tunnel or Tailscale (opt-in)
- **No auth on BMO HTTP API** — anyone on the LAN with port 5000 access can invoke anything. Fine for home use; harden before exposing

## Threat model

**In scope:**
- Accidental secret commits (→ "Handling leaked secrets" below)
- RCE via input injection in agent tool-calls (careful with `code_agent`, `terminal_service`)
- SSRF via user-provided URLs (e.g., image URLs)
- Insecure Discord bot permissions

**Out of scope:**
- Physical access to the Pi
- LAN trust boundary (assumed friendly LAN)
- Supply chain (npm/pip packages) — monitored via `npm audit`

## Handling leaked secrets (if it happens)

If you ever commit a secret accidentally:

1. **Rotate externally FIRST** — revoke the compromised credential at the provider (Anthropic console, Google Cloud Console, Discord Developer Portal, etc.) and generate a new one. Do this before touching git.
2. **Purge from history** (optional if private repo — preferred if ever public):
   ```bash
   # Install once
   sudo apt install git-filter-repo

   # Backup secret contents if still needed on disk
   mkdir -p ~/.secret-backup && cp <file> ~/.secret-backup/

   # Remove from all history
   git filter-repo --invert-paths --path <file> --force

   # filter-repo removes origin; re-add it
   git remote add origin https://github.com/<owner>/<repo>.git

   # Force-push cleaned history
   git push --force origin master

   # Restore the file locally (now gitignored)
   cp ~/.secret-backup/<file> <destination>
   ```
3. **Harden `.gitignore`** so the same pattern can't re-leak:
   ```bash
   echo "**/<file-pattern>" >> .gitignore
   git add .gitignore && git commit -m "chore: gitignore <pattern>"
   ```
4. **Verify** the file is now ignored:
   ```bash
   git check-ignore -v <file>
   ```
5. **Log the incident** in [`./SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored) with rotation status and what preventive measures were added — for future reference. Do **not** put secret values in the log itself.

## Recommendations (self-host)

1. **Run on a private LAN** or use Tailscale for access (not public IP + port forward)
2. **Don't commit `.env`** — audit `git status` before every commit
3. **Keep dependencies updated** — `npm audit`, `pip-audit`
4. **Use a firewall** — only allow trusted devices to port 5000
5. **Discord bot permissions** — grant minimum scopes (no `administrator`)
6. **Pre-commit secret scanning** — highly recommended. See [`./SECURITY-LOG.md`](./SECURITY-LOG.md) for tracking of this improvement.

## Secret handling conventions

- All secrets live in `.env` files (gitignored)
- `bmo/.env.template` documents required keys with empty values
- Secrets loaded at runtime via `dotenv`
- Never log secrets (use `***` redaction in debug output)
- Never send secrets to LLM providers in prompts
- Never store secrets in code comments, docs, or test fixtures
