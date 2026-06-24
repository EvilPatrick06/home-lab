# oracle-worker

Cloudflare Worker that backs the **Oracle** feature of
[`dungeon-scholar`](../dungeon-scholar/) (AI grading / chat). The browser app
never talks to the AI provider directly: it calls this Worker, which injects the
server-side Groq API key and applies abuse / cost controls before forwarding the
request upstream.

## What it does

- Proxies chat requests from dungeon-scholar to Groq (`llama-3.3-70b-versatile`),
  keeping the `GROQ_API_KEY` server-side instead of in the browser bundle.
- Enforces per-IP and tenant-wide rate limits via a single global Durable Object
  (`RateLimiter`), with a cheap per-isolate in-memory backstop.
- Clamps per-request cost: `max_tokens` ceiling and a max-messages cap.
- Optional shared-secret gate (`ORACLE_PROXY_TOKEN`) plus an `Origin` / `Referer`
  cross-check restricted to the deployed dungeon-scholar origin.

See `src/worker.js` for the request lifecycle and tunable limits, and
[`dungeon-scholar/docs/oracle-setup.md`](../dungeon-scholar/docs/oracle-setup.md)
for the end-to-end setup.

## Develop & deploy

Requires Node `>=22` (see root `.nvmrc`) and `wrangler` (a local devDependency).

```bash
npm ci
npm run check     # wrangler deploy --dry-run --outdir=dist (build, no publish)
npm run deploy    # wrangler deploy  (needs CLOUDFLARE_API_TOKEN)
npm test          # placeholder — no unit tests yet
```

Configuration lives in `wrangler.toml` (Worker name `dungeon-scholar-oracle`,
the `RateLimiter` Durable Object binding, and its SQLite migration). Secrets
(`GROQ_API_KEY`, optional `ORACLE_PROXY_TOKEN`) are set via
`wrangler secret put <NAME>`, never committed.

CI: `.github/workflows/oracle-worker-ci.yml` runs the dry-run build + tests on
every change; `.github/workflows/oracle-worker-deploy.yml` is a manual
(`workflow_dispatch`) deploy.
