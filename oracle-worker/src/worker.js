// Oracle proxy: forwards chat requests from dungeon-scholar to Groq.
// Adds the Groq API key server-side and applies abuse controls.
//
// Defenses (the Origin/token checks are browser-/owner-enforced, so the real
// guards are COST bounds):
//   - per-IP + global rate limiting, enforced by a single global Durable Object
//     (RateLimiter). Because every request routes to the same DO, the counters
//     are tenant-wide and persistent across Worker isolates / edge locations —
//     unlike a per-isolate in-memory Map, which resets per instance and per POP.
//     A cheap per-isolate in-memory backstop is kept as a first line of defence
//     (and a fail-safe if the DO is briefly unreachable).
//   - a hard max_tokens clamp + input-size caps to bound per-request spend.
//   - optional shared-secret gate (ORACLE_PROXY_TOKEN) + Referer cross-check.
// Stronger controls (a Groq spend cap/alert) require Groq dashboard config.
// See docs/logs/SECURITY-LOG.md + dungeon-scholar/docs/oracle-setup.md.

// Fork portability: ALLOWED_ORIGIN and MODEL are read from the environment
// (wrangler.toml [vars] / `wrangler secret`) at request time, falling back to
// these canonical-deploy defaults when unset — matching how GROQ_API_KEY and
// ORACLE_PROXY_TOKEN are already env-driven. A fork can point the worker at its
// own Pages origin / a different Groq model with zero source edits.
const DEFAULT_ALLOWED_ORIGIN = "https://evilpatrick06.github.io";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// ---------------------------------------------------------------------------
// Rate-limit configuration.  TUNE THESE if traffic patterns change.
//   Per-IP limits protect against a single abuser; the global ceiling caps
//   total Groq spend regardless of how many distinct IPs show up.
// ---------------------------------------------------------------------------
const LIMITS = {
  perIpPerMinute: 10,     // burst protection for a single client
  perIpPerDay: 100,       // daily cap per client
  globalPerMinute: 60,    // tenant-wide burst ceiling
  globalPerDay: 2000,     // tenant-wide daily ceiling (hard cost guard)
};

// Cheap per-isolate backstop (kept from the original implementation). This is
// intentionally generous; the authoritative limit is the Durable Object.
const ISOLATE_BACKSTOP_PER_MINUTE = 30;
const isolateHits = new Map();

// Per-request cost bounds.
const MAX_OUTPUT_TOKENS = 2048;     // clamp client-requested max_tokens
const MAX_MESSAGES = 40;            // reject oversized conversations
const MAX_TOTAL_CHARS = 24000;      // reject oversized input payloads

function isolateBackstop(ip) {
  const now = Date.now();
  const minuteAgo = now - 60 * 1000;
  const hits = (isolateHits.get(ip) || []).filter((t) => t > minuteAgo);
  if (hits.length >= ISOLATE_BACKSTOP_PER_MINUTE) return false;
  hits.push(now);
  isolateHits.set(ip, hits);
  // Evict idle IPs so the Map doesn't accumulate one permanent key per distinct
  // client IP for the isolate's lifetime (unbounded-growth fix, 2026-07-17).
  // A returning IP simply re-creates a fresh entry (the normal cold path).
  for (const [k, v] of isolateHits) {
    if (k !== ip && (v.length === 0 || v[v.length - 1] <= minuteAgo)) {
      isolateHits.delete(k);
    }
  }
  return true;
}

function corsHeaders(allowedOrigin, extra = {}) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    ...extra,
  };
}

function corsJson(allowedOrigin, obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders(allowedOrigin, { "Content-Type": "application/json" }),
  });
}

// ---------------------------------------------------------------------------
// Durable Object: one global instance holds all counters. Handlers on a DO
// run without interleaving for the same object, so read-modify-write of the
// stored counters is atomic — no lost updates under concurrency.
// ---------------------------------------------------------------------------
// How often the DO alarm sweeps stale per-IP rows (once a day is plenty: rows
// are tiny and the sweep only exists to stop unbounded growth, not for
// enforcement — window rollover already resets the counter values in place).
const IP_ROW_SWEEP_INTERVAL_MS = 86400000;

export class RateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { ip } = await request.json();
    const now = Date.now();
    const minuteWindow = Math.floor(now / 60000);
    const dayWindow = Math.floor(now / 86400000);

    // Storage-growth guard (2026-07-17): schedule a daily alarm that deletes
    // per-IP rows whose day window has passed. Without it every distinct
    // client IP leaves a permanent `ip:<addr>` row in the DO's SQLite storage.
    const existingAlarm = await this.state.storage.getAlarm();
    if (existingAlarm === null) {
      await this.state.storage.setAlarm(now + IP_ROW_SWEEP_INTERVAL_MS);
    }

    const decision = await this.state.storage.transaction(async (txn) => {
      // Global counters.
      const g = (await txn.get("global")) || {
        minuteWindow,
        minuteCount: 0,
        dayWindow,
        dayCount: 0,
      };
      if (g.minuteWindow !== minuteWindow) {
        g.minuteWindow = minuteWindow;
        g.minuteCount = 0;
      }
      if (g.dayWindow !== dayWindow) {
        g.dayWindow = dayWindow;
        g.dayCount = 0;
      }

      // Per-IP counters.
      const key = `ip:${ip}`;
      const c = (await txn.get(key)) || {
        minuteWindow,
        minuteCount: 0,
        dayWindow,
        dayCount: 0,
      };
      if (c.minuteWindow !== minuteWindow) {
        c.minuteWindow = minuteWindow;
        c.minuteCount = 0;
      }
      if (c.dayWindow !== dayWindow) {
        c.dayWindow = dayWindow;
        c.dayCount = 0;
      }

      // Evaluate limits BEFORE incrementing so a rejected request is not counted.
      let allowed = true;
      let reason = null;
      if (g.minuteCount >= LIMITS.globalPerMinute) {
        allowed = false;
        reason = "global-minute";
      } else if (g.dayCount >= LIMITS.globalPerDay) {
        allowed = false;
        reason = "global-day";
      } else if (c.minuteCount >= LIMITS.perIpPerMinute) {
        allowed = false;
        reason = "ip-minute";
      } else if (c.dayCount >= LIMITS.perIpPerDay) {
        allowed = false;
        reason = "ip-day";
      }

      if (allowed) {
        g.minuteCount += 1;
        g.dayCount += 1;
        c.minuteCount += 1;
        c.dayCount += 1;
        await txn.put("global", g);
        await txn.put(key, c);
      }

      return { allowed, reason };
    });

    return new Response(JSON.stringify(decision), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Daily sweep: drop per-IP rows from past day windows. Enforcement is
  // unaffected — a returning IP re-creates a fresh zeroed counter, which is
  // already the cold-start path. The global counter row is never deleted.
  async alarm() {
    const dayWindow = Math.floor(Date.now() / 86400000);
    const rows = await this.state.storage.list({ prefix: "ip:" });
    const stale = [];
    for (const [key, value] of rows) {
      if (!value || value.dayWindow !== dayWindow) stale.push(key);
    }
    // storage.delete accepts up to 128 keys per call.
    for (let i = 0; i < stale.length; i += 128) {
      await this.state.storage.delete(stale.slice(i, i + 128));
    }
    await this.state.storage.setAlarm(Date.now() + IP_ROW_SWEEP_INTERVAL_MS);
  }
}

async function checkGlobalLimit(env, ip) {
  // Returns { allowed, reason }. Fails open only if the DO is unreachable, in
  // which case the per-isolate backstop above is the remaining guard.
  try {
    const id = env.RATE_LIMITER.idFromName("global");
    const stub = env.RATE_LIMITER.get(id);
    const res = await stub.fetch("https://rate-limiter/check", {
      method: "POST",
      body: JSON.stringify({ ip }),
    });
    return await res.json();
  } catch (err) {
    return { allowed: true, reason: "do-unavailable" };
  }
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
    const model = env.ORACLE_MODEL || DEFAULT_MODEL;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(allowedOrigin, {
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Oracle-Token",
          "Access-Control-Max-Age": "86400",
        }),
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Origin check (browser-enforced) + Referer cross-check as defense-in-depth.
    const origin = request.headers.get("Origin");
    if (origin !== allowedOrigin) {
      return new Response("Forbidden", { status: 403 });
    }
    const referer = request.headers.get("Referer");
    if (referer) {
      let refererOrigin;
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        return new Response("Forbidden", { status: 403 });
      }
      if (refererOrigin !== allowedOrigin) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // Optional shared-secret gate. Off by default; if the owner sets the
    // ORACLE_PROXY_TOKEN Wrangler secret, callers must echo it in X-Oracle-Token.
    if (env.ORACLE_PROXY_TOKEN) {
      if (request.headers.get("X-Oracle-Token") !== env.ORACLE_PROXY_TOKEN) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    // 1) Cheap per-isolate backstop.
    if (!isolateBackstop(ip)) {
      return corsJson(allowedOrigin, { error: "Rate limit exceeded. Try again later." }, 429);
    }

    // 2) Authoritative global, persistent rate limit (Durable Object).
    const limit = await checkGlobalLimit(env, ip);
    if (!limit.allowed) {
      return corsJson(allowedOrigin, { error: "Rate limit exceeded. Try again later." }, 429);
    }

    // Parse the incoming request from the frontend (Anthropic-style format)
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Bound input size to cap per-request cost. Only STRING content is
    // supported (the frontend always sends strings): a non-string content or
    // system (e.g. a huge array of text parts) would count as 0 chars here yet
    // be forwarded verbatim below, bypassing MAX_TOTAL_CHARS entirely — so
    // reject it outright instead of skipping it in the accounting.
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    if (body.system != null && typeof body.system !== "string") {
      return corsJson(allowedOrigin, { error: "Invalid request." }, 400);
    }
    let totalChars = typeof body.system === "string" ? body.system.length : 0;
    for (const m of rawMessages) {
      if (m?.content != null && typeof m.content !== "string") {
        return corsJson(allowedOrigin, { error: "Invalid request." }, 400);
      }
      if (typeof m?.content === "string") totalChars += m.content.length;
    }
    if (rawMessages.length > MAX_MESSAGES || totalChars > MAX_TOTAL_CHARS) {
      return corsJson(allowedOrigin, { error: "Request too large." }, 413);
    }

    // Translate Anthropic format -> OpenAI/Groq format
    const messages = [];
    if (body.system) messages.push({ role: "system", content: body.system });
    for (const m of rawMessages) {
      if (m.role === "user" || m.role === "assistant") {
        messages.push({ role: m.role, content: m.content });
      }
    }

    // Clamp the output budget so a client can't request a huge generation.
    // Bounded BOTH ways: Math.min alone let truthy negative/fractional values
    // (e.g. -5, 0.5) through to Groq verbatim, which 400s them AFTER the
    // request already consumed a rate-limit slot. Floor + a lower bound of 1
    // normalizes them before the upstream call (2026-07-17 fix).
    const requestedTokens = Math.floor(Number(body.max_tokens)) || 1000;
    const maxTokens = Math.min(Math.max(1, requestedTokens), MAX_OUTPUT_TOKENS);

    // Call Groq. fetch() REJECTS (rather than resolving !ok) on network-level
    // failures — DNS, TLS, connection reset — and an unhandled rejection here
    // would surface as a runtime 500 with NO CORS headers, which the browser
    // reports as an opaque CORS error. Catch it and answer in the same shape
    // as an HTTP-level upstream failure (2026-07-17 fix). groqResponse.json()
    // is inside the same guard for a malformed upstream body.
    let groqResponse;
    let groqData;
    try {
      groqResponse = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      });

      if (!groqResponse.ok) {
        // Do NOT echo the raw upstream body to the browser — it can carry request
        // IDs, org/account identifiers, and provider-specific error schema useful
        // for fingerprinting. Log it server-side; return a generic message + the
        // upstream status code only.
        const errText = await groqResponse.text();
        console.error("Oracle upstream error", groqResponse.status, errText);
        return corsJson(allowedOrigin, { error: "Upstream error" }, groqResponse.status);
      }

      groqData = await groqResponse.json();
    } catch (err) {
      console.error("Oracle upstream fetch failed", err?.message || err);
      return corsJson(allowedOrigin, { error: "Upstream error" }, 502);
    }

    // Translate Groq response -> Anthropic-shape so the frontend doesn't change
    const text = groqData.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
      headers: corsHeaders(allowedOrigin, { "Content-Type": "application/json" }),
    });
  },
};
