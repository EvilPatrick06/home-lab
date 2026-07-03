# Push resilience — pushing to origin when bmo is down

> How automation pushes work to `origin` (GitHub) **without depending on the Pi**.
> Added after the 2026-07-02 bmo outage, during which agents running off-Pi could
> not push because all GitHub write access lived on the Pi (its `gh` OAuth token +
> its checkouts).

## The problem

Today the repo authenticates to GitHub exclusively through the Pi:

- `origin` is HTTPS (`https://github.com/EvilPatrick06/home-lab.git`) and the
  credential helper is `gh auth git-credential`, backed by the Pi-resident
  `gh` OAuth token (`~/.config/gh/hosts.yml` on bmo).
- There were **no** deploy keys on the repo, and no off-Pi credential at all.

So when bmo is down, nothing else in the fleet can push — completed work piles up
unpushed on whatever machine did it.

## The mechanism — a dedicated write deploy key

A dedicated **ed25519 keypair** is registered on the GitHub repo as a
**read-write deploy key** (least privilege: it grants push/pull on
`EvilPatrick06/home-lab` *only* — unlike a PAT, it cannot touch other repos,
the API, or account settings).

| What | Where |
|---|---|
| Private key | bmo: `/home/patrick/.ssh/home-lab-push-key` (mode `0600`, **never** in the repo) |
| Public key | bmo: `/home/patrick/.ssh/home-lab-push-key.pub`, and reproduced below |
| GitHub registration | Repo → Settings → Deploy keys — id `156221116`, title *"home-lab automation push (off-Pi resilience)"*, read-write, added 2026-07-03 via `gh repo deploy-key add` |
| SSH alias on bmo | `Host github-homelab-push` in `~/.ssh/config` |
| Helper script | [`scripts/claude-tools/push-with-deploy-key.sh`](../scripts/claude-tools/push-with-deploy-key.sh) |

Public half (safe to publish; useful for verifying a copied key):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOJSpS45AipyFvIwiSLwqu9qL1p46ZJhHJd/y6B2vRXR home-lab-automation-push-2026-07
```

## ⏳ The one remaining human step

The private key was generated **on bmo** — the very machine whose outages this
guards against. For the mechanism to actually work during an outage, the key must
already live on the off-Pi host(s) that run automation (laptop / cloud agent).

**Do this once, now, while bmo is up:**

```bash
# from the laptop (or any off-Pi automation host):
scp patrick@bmo:~/.ssh/home-lab-push-key ~/.ssh/home-lab-push-key
chmod 600 ~/.ssh/home-lab-push-key
# verify:
ssh -i ~/.ssh/home-lab-push-key -o IdentitiesOnly=yes -T git@github.com
# expect: "Hi EvilPatrick06/home-lab! You've successfully authenticated..."
```

That's it. Nothing else needs configuring on GitHub — the key is already
registered read-write.

## How an off-Pi agent uses it

### Option A — the helper script (preferred inside a checkout)

`scripts/claude-tools/push-with-deploy-key.sh` wraps any git command with the
key and transparently rewrites the HTTPS origin URL to SSH, so the existing
remote config is untouched:

```bash
scripts/claude-tools/push-with-deploy-key.sh push origin auto/<agent-id>
scripts/claude-tools/push-with-deploy-key.sh fetch origin
```

Key path defaults to `~/.ssh/home-lab-push-key`; override with
`HOME_LAB_PUSH_KEY=/path/to/key`.

### Option B — raw `GIT_SSH_COMMAND` (no checkout / fresh clone)

```bash
export GIT_SSH_COMMAND='ssh -i ~/.ssh/home-lab-push-key -o IdentitiesOnly=yes'
git clone git@github.com:EvilPatrick06/home-lab.git
git -C home-lab push origin auto/<agent-id>
```

### Option C — SSH config alias (set up on bmo; replicate anywhere)

```
Host github-homelab-push
    HostName github.com
    User git
    IdentityFile ~/.ssh/home-lab-push-key
    IdentitiesOnly yes
```

then `git push github-homelab-push:EvilPatrick06/home-lab.git <branch>`.

## What the key can and cannot do

- **Can:** clone, fetch, and push any branch of `EvilPatrick06/home-lab` over
  SSH — including during a total bmo outage. Pushes trigger CI workflows
  normally, so the CI-gate + integrator flow in
  [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](AUTOMATED-AGENT-GIT-WORKFLOW.md) is
  unchanged: off-Pi agents push `auto/<agent-id>` branches exactly as before,
  just over SSH.
- **Cannot:** call the GitHub API. `gh run list`, `gh pr checks`, deploy-key
  management, etc. still need a `gh` token. During an outage an off-Pi agent can
  watch CI unauthenticated via the repo's public Actions page, or use its own
  `gh` login if one exists. The deploy key is a *push* lifeline, not a full `gh`
  replacement.
- **Existing auth is untouched:** the Pi keeps using the HTTPS remote +
  `gh auth git-credential`. The deploy key is additive.

## Rotation / revocation

1. Generate a replacement: `ssh-keygen -t ed25519 -C "home-lab-automation-push-<date>" -f ~/.ssh/home-lab-push-key.new -N ""`
2. Register it: `gh repo deploy-key add ~/.ssh/home-lab-push-key.new.pub -R EvilPatrick06/home-lab --allow-write --title "home-lab automation push (rotated <date>)"`
3. Remove the old one: `gh repo deploy-key list -R EvilPatrick06/home-lab`, then `gh repo deploy-key delete <old-id> -R EvilPatrick06/home-lab`
4. Swap files into place (`mv` new over old, keep `0600`) and re-copy to every off-Pi host (the one-step section above).

**Caveat — token coupling of `gh`-added keys:** GitHub associates deploy keys
added via `gh` with the OAuth token that added them. If that token is revoked or
the GitHub CLI app is de-authorized, GitHub deletes the key. If the key ever
disappears from Settings → Deploy keys, re-add the *same public key* by hand in
the web UI (Repo → Settings → Deploy keys → Add, tick *Allow write access*) —
that severs the token coupling; no keygen needed.

If the private key is ever exposed: delete the deploy key on GitHub immediately
(web UI or `gh repo deploy-key delete`) — that alone kills all access — then
rotate per the steps above.
