# BMO docs index

Reference documentation for the BMO Pi (voice assistant + Discord bots + DM engine + Pi infra). For the cross-domain logs (active bugs, suggestions, security, resolved) see the repo-root [`docs/`](../../docs/) — start with [`BMO-ISSUES-LOG.md`](../../docs/BMO-ISSUES-LOG.md) and [`BMO-SUGGESTIONS-LOG.md`](../../docs/BMO-SUGGESTIONS-LOG.md).

## Start here

New to the BMO codebase? Read in this order: **[ARCHITECTURE](#architecture) → [SERVICES](#services) → [SYSTEMD](#systemd) → [TROUBLESHOOTING](#troubleshooting)**. Before any refactor, read **[DESIGN-CONSTRAINTS](#design-constraints)**.

## The docs

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) <a id="architecture"></a> | System overview — the Pi 5 AI assistant + smart-home hub: components, data flow, deployment model. |
| [SERVICES.md](./SERVICES.md) <a id="services"></a> | The service modules in `bmo/pi/services/` (business logic used by agents + Flask routes). |
| [AGENTS.md](./AGENTS.md) | Catalog of BMO's runtime AI agents (28 routable) + the infra classes in `agents/`. |
| [SYSTEMD.md](./SYSTEMD.md) <a id="systemd"></a> | The systemd units (services + timers); unit files live in `bmo/pi/systemd/`. |
| [DEPLOY.md](./DEPLOY.md) | How to update BMO on the Pi from your laptop. |
| [DISASTER-RECOVERY.md](./DISASTER-RECOVERY.md) | Cold-restore runbook (fresh Pi from backup) + the backup-integrity check. |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) <a id="troubleshooting"></a> | Common failures + fixes (disk, audio, bots, services). |
| [DESIGN-CONSTRAINTS.md](./DESIGN-CONSTRAINTS.md) <a id="design-constraints"></a> | Design gotchas that look like bugs but are intentional — **read before refactors** touching hooks, cloud HTTP, package/module names, or shared 5e JSON. |
| [NETWORK_ACCESS.md](./NETWORK_ACCESS.md) | Travel- / IP-change-safe network access for the headless kiosk Pi. |
| [CLOUDFLARE_TUNNEL_SETUP.md](./CLOUDFLARE_TUNNEL_SETUP.md) | Setting up the Cloudflare tunnel (`bmo.mybmoai.work`). |
