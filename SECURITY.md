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

## Known security posture

- **Secrets purged from git history** on 2026-04-23 via `git filter-repo`. Old secrets rotated (see [`docs/SECRETS-ROTATION.md`](./docs/SECRETS-ROTATION.md)).
- **`.gitignore`** covers broad patterns for env files, PEM keys, OAuth tokens, credentials JSON.
- **BMO runs as user `patrick`** (not root) — services with minimal systemd hardening (room to improve).
- **No public internet exposure by default** — BMO runs on LAN only. Remote access via Cloudflare Tunnel or Tailscale (opt-in).
- **No auth on BMO HTTP API** — anyone on the LAN with port 5000 access can invoke anything. Fine for home use; dangerous if LAN is shared/public.

## Threat model

**In scope:**
- Leaked secrets in git (→ `docs/SECRETS-ROTATION.md`)
- RCE via input injection in agent tool-calls (careful with `code_agent`, `terminal_service`)
- SSRF via user-provided URLs (e.g., image URLs)
- Insecure Discord bot permissions

**Out of scope (currently):**
- Physical access to the Pi
- LAN trust boundary (assumed friendly LAN)
- Supply chain (npm/pip packages) — monitored via `npm audit`

## Recommendations

If you self-host BMO:

1. **Run on a private LAN** or use Tailscale for access (not public IP + port forward)
2. **Rotate leaked secrets** per [`docs/SECRETS-ROTATION.md`](./docs/SECRETS-ROTATION.md)
3. **Don't commit `.env`** — audit `git status` before every commit
4. **Keep dependencies updated** — `npm audit`, `pip-audit`
5. **Use a firewall** — only allow trusted devices to port 5000
6. **Discord bot permissions** — grant minimum scopes (no `administrator`)

## Secret handling

- All secrets live in `.env` files (gitignored)
- `.env.template` documents required keys without values
- Secrets loaded at runtime via `dotenv`
- Never log secrets (use `***` redaction in debug output)
- Never send secrets to LLM providers in prompts

## Known Issues

For non-security bugs, see [`docs/KNOWN-ISSUES.md`](./docs/KNOWN-ISSUES.md).

For security-specific issues that are non-critical, we log them here with tracking:

| Date | Issue | Severity | Status |
|---|---|---|---|
| 2026-04-23 | Leaked Anthropic/Google/TV secrets in git history | Critical | Purged + rotation required (pending user) |
| 2026-04-23 | No pre-commit secret scanner | Low | Tracked in KNOWN-ISSUES.md |
| 2026-04-23 | BMO HTTP API has no auth | Medium | Deferred; assumes trusted LAN |
