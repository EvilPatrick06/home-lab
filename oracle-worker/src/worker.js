// Oracle proxy: forwards chat requests from dungeon-scholar to Groq.
// Adds the Groq API key server-side and applies abuse controls.

const ALLOWED_ORIGIN = "https://evilpatrick06.github.io";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// Abuse controls. NOTE: the Origin header is browser-enforced only, and a token
// baked into a public SPA is not a real authentication secret — so the primary
// defenses here are COST bounds: a hard max_tokens clamp, an input-size cap, a
// per-IP rate limit, and a coarse per-isolate global circuit-breaker. Stronger
// controls (a globally-persistent rate limit via Durable Objects/KV, and a Groq
// spend cap/alert) require Cloudflare/Groq dashboard config — they cannot be set
// from worker code. See docs/SECURITY-LOG.md + dungeon-scholar/docs/oracle-setup.md.
const RATE_LIMIT_PER_HOUR = 20;     // per source IP
const GLOBAL_LIMIT_PER_HOUR = 600;  // per isolate, across all IPs (backstop)
const MAX_OUTPUT_TOKENS = 2048;     // clamp client-requested max_tokens
const MAX_MESSAGES = 40;            // reject oversized conversations
const MAX_TOTAL_CHARS = 24000;      // reject oversized input payloads

const rateLimitMap = new Map();
let globalHits = [];

function withinHour(arr) {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return arr.filter(t => t > hourAgo);
}

function checkRateLimit(ip) {
  globalHits = withinHour(globalHits);
  if (globalHits.length >= GLOBAL_LIMIT_PER_HOUR) return false;
  const hits = withinHour(rateLimitMap.get(ip) || []);
  if (hits.length >= RATE_LIMIT_PER_HOUR) return false;
  const now = Date.now();
  hits.push(now);
  rateLimitMap.set(ip, hits);
  globalHits.push(now);
  return true;
}

function corsJson(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ALLOWED_ORIGIN },
  });
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Oracle-Token",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Origin check (browser-enforced) + Referer cross-check as defense-in-depth.
    const origin = request.headers.get("Origin");
    if (origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }
    const referer = request.headers.get("Referer");
    if (referer && !referer.startsWith(ALLOWED_ORIGIN)) {
      return new Response("Forbidden", { status: 403 });
    }

    // Optional shared-secret gate. Off by default; if the owner sets the
    // ORACLE_PROXY_TOKEN Wrangler secret, callers must echo it in X-Oracle-Token.
    if (env.ORACLE_PROXY_TOKEN) {
      if (request.headers.get("X-Oracle-Token") !== env.ORACLE_PROXY_TOKEN) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // Rate limit (per IP + global isolate backstop)
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(ip)) {
      return corsJson({ error: "Rate limit exceeded. Try again later." }, 429);
    }

    // Parse the incoming request from the frontend (Anthropic-style format)
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Bound input size to cap per-request cost.
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    let totalChars = typeof body.system === "string" ? body.system.length : 0;
    for (const m of rawMessages) {
      if (typeof m?.content === "string") totalChars += m.content.length;
    }
    if (rawMessages.length > MAX_MESSAGES || totalChars > MAX_TOTAL_CHARS) {
      return corsJson({ error: "Request too large." }, 413);
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
    const maxTokens = Math.min(Number(body.max_tokens) || 1000, MAX_OUTPUT_TOKENS);

    // Call Groq
    const groqResponse = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      return corsJson({ error: "Upstream error", detail: errText }, groqResponse.status);
    }

    const groqData = await groqResponse.json();

    // Translate Groq response -> Anthropic-shape so the frontend doesn't change
    const text = groqData.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      },
    });
  },
};
