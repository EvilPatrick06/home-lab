# Oracle setup (optional)

The **Oracle** powers two features: AI grading of free-text Lab/Quiz answers
(`gradeAnswer`) and the Oracle chat mode. Both are *optional* — leave
`VITE_ORACLE_ENDPOINT` unset and the app falls back to local string matching
(grading) and Tome Search (chat). Nothing breaks; you just don't get AI.

## Why a proxy Worker?

The browser must never hold an Anthropic API key. Instead the client POSTs an
Anthropic **Messages**-shaped body (`model`, `max_tokens`, `system`, `messages`)
to a small Cloudflare Worker you host; the Worker adds the `x-api-key` header and
forwards the request to `https://api.anthropic.com/v1/messages`. The key lives
only in the Worker's secret store.

## Worker stub

```js
// wrangler deploy — set the key with: wrangler secret put ANTHROPIC_API_KEY
const ALLOWED_ORIGIN = 'https://<your-username>.github.io'; // restrict to your Pages origin
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS });
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: await request.text(),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...CORS, 'content-type': 'application/json' },
    });
  },
};
```

## Notes

- **Restrict the origin.** Set `ALLOWED_ORIGIN` to your exact deployed Pages
  origin (not `*`) — the endpoint is publicly callable from whatever origin you
  allow.
- **Model.** The client sends `model: claude-sonnet-4-6`. The old dated id
  `claude-sonnet-4-20250514` retired 2026-06-15 — don't pin it in the Worker.
- **Rate-limit it.** Because the configured origin can call it freely, add a
  Workers rate-limit binding or a daily budget cap so a runaway tab (or anyone
  on your origin) can't burn your Anthropic quota.
- **Wire the URL in two places:** `.env.local` (`VITE_ORACLE_ENDPOINT=https://your-worker.workers.dev`)
  for local dev, and a repo **Actions secret** named `VITE_ORACLE_ENDPOINT` for
  the GitHub Pages deploy (see `.github/workflows/deploy.yml`).
- **CSP.** If you host the Worker off `*.workers.dev` (a custom domain), the
  build automatically whitelists the exact origin parsed from
  `VITE_ORACLE_ENDPOINT` in the production CSP `connect-src` — no manual CSP edit
  needed.
