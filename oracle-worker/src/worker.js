// Oracle proxy: forwards chat requests from dungeon-scholar to Groq.
// Adds the Groq API key server-side and applies per-IP rate limiting.

const ALLOWED_ORIGIN = "https://evilpatrick06.github.io";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// In-memory rate limit: 20 requests per IP per hour.
// Note: each Worker isolate has its own state — this is per-edge-location.
// Good enough for casual abuse; not bulletproof.
const RATE_LIMIT_PER_HOUR = 20;
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const hits = (rateLimitMap.get(ip) || []).filter(t => t > hourAgo);
  if (hits.length >= RATE_LIMIT_PER_HOUR) return false;
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return true;
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Origin check — blocks requests from anywhere except the Pages site
    const origin = request.headers.get("Origin");
    if (origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }

    // Rate limit by IP
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ALLOWED_ORIGIN } }
      );
    }

    // Parse the incoming request from the frontend (Anthropic-style format)
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Translate Anthropic format → OpenAI/Groq format
    const messages = [];
    if (body.system) messages.push({ role: "system", content: body.system });
    if (Array.isArray(body.messages)) {
      for (const m of body.messages) {
        if (m.role === "user" || m.role === "assistant") {
          messages.push({ role: m.role, content: m.content });
        }
      }
    }

    // Call Groq
    const groqResponse = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: body.max_tokens || 1000,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      return new Response(
        JSON.stringify({ error: "Upstream error", detail: errText }),
        { status: groqResponse.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ALLOWED_ORIGIN } }
      );
    }

    const groqData = await groqResponse.json();

    // Translate Groq response → Anthropic-shape so the frontend doesn't need changes
    const text = groqData.choices?.[0]?.message?.content || "";
    const anthropicShape = {
      content: [{ type: "text", text }],
    };

    return new Response(JSON.stringify(anthropicShape), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      },
    });
  },
};
