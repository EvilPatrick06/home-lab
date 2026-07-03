"""Cloud API Providers — Gemini, Claude, Groq, Fish Audio, Google Vision.

Replaces GPU server with cloud API calls (Gemini, Claude, Groq, Fish Audio, Google Vision).
Each provider is a thin wrapper around the vendor's REST API.
"""

import base64
import json
import os
import shlex
import time
from typing import Optional

import requests

# Gevent: `os.system("curl …")` below is intentional — gevent patches subprocess/requests;
# do not replace with subprocess.run or requests without load-testing voice/STT paths.
# See bmo/docs/DESIGN-CONSTRAINTS.md

# Persistent HTTP sessions for connection reuse (avoids TCP+TLS handshake per call)
_groq_session = requests.Session()
_fish_session = requests.Session()
_gemini_session = requests.Session()
_claude_session = requests.Session()

# ── API Keys (from environment / .env) ─────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
FISH_AUDIO_API_KEY = os.environ.get("FISH_AUDIO_API_KEY", "")
GOOGLE_VISION_API_KEY = os.environ.get("GOOGLE_VISION_API_KEY", "")

# ── Model Configuration ───────────────────────────────────────────────────

# Primary agent model (smart home, general conversation)
PRIMARY_MODEL = os.environ.get("BMO_PRIMARY_MODEL", "gemini-3.1-pro")
# Router model (intent classification, simple commands)
ROUTER_MODEL = os.environ.get("BMO_ROUTER_MODEL", "gemini-3-flash")
# D&D Dungeon Master model (narrative, roleplay)
DND_MODEL = os.environ.get("BMO_DND_MODEL", "claude-opus-4.6")

# Gemini API base URL
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
# Anthropic API base URL
ANTHROPIC_BASE = "https://api.anthropic.com/v1"
# Groq API base URL
GROQ_BASE = "https://api.groq.com/openai/v1"
# Fish Audio API base URL
FISH_AUDIO_BASE = "https://api.fish.audio/v1"


# ── curl secret hygiene (PHASE-15 15D) ─────────────────────────────────────
# Every secret-bearing curl option (Authorization headers, key-bearing URLs) goes into a
# 0600 temp CONFIG FILE passed via -K, so it never appears in /proc/<pid>/cmdline. `fail`
# makes HTTP >= 400 exit 22 so callers raise instead of treating an error body as payload.


def _curl_cfg_quote(value: str) -> str:
    """Quote a value for a curl config file (escape backslash + double quote)."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _run_curl_config(option_lines: list[str], label: str) -> None:
    """Run curl with every option in a 0600 temp config file (-K).

    Keeps secrets out of /proc/<pid>/cmdline. `fail` → HTTP >= 400 exits 22 so the caller
    raises. os.system is intentional — see bmo/docs/DESIGN-CONSTRAINTS.md (gevent leaves it
    unpatched; subprocess/requests are monkey-patched).
    """
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".curlcfg", delete=False, mode="w") as cf:
        cf.write("\n".join(["fail", "silent", "show-error", *option_lines]) + "\n")
        cfg_path = cf.name  # mkstemp semantics: created 0600
    try:
        ret = os.system(f"curl -K {shlex.quote(cfg_path)} 2>/dev/null")  # nosec B605
        if ret != 0:
            code = os.waitstatus_to_exitcode(ret)
            raise RuntimeError(f"{label} curl failed (exit {code}; 22 = HTTP error >= 400)")
    finally:
        try:
            os.remove(cfg_path)
        except OSError:
            pass

# Fish Audio voice model ID (set after creating BMO voice clone)
FISH_AUDIO_VOICE_ID = os.environ.get("FISH_AUDIO_VOICE_ID", "94b4570683534e37993fdffbd47d084b")

# ── Gemini Provider ───────────────────────────────────────────────────────


def _gemini_model_id(model: str) -> str:
    """Map friendly names to Gemini API model IDs."""
    mapping = {
        "gemini-3.1-pro": "gemini-3.1-pro-preview",
        "gemini-3-pro": "gemini-3-pro-preview",
        "gemini-3-flash": "gemini-3-flash-preview",
        "gemini-3-flash-lite": "gemini-3.1-flash-lite-preview",
        "gemini-2.5-pro": "gemini-2.5-pro",
        "gemini-2.5-flash": "gemini-2.5-flash",
        "gemini-2.0-flash": "gemini-2.0-flash",
    }
    return mapping.get(model, model)


def _gemini_thinking_budget(model: str) -> int | None:
    """Return thinkingBudget for a model, or None to use default.

    All Flash models: disable thinking (budget=0) — faster for voice pipeline.
    Thinking adds 10-15s latency for no benefit on conversational tasks.
    """
    if "flash" in model:
        return 0
    return None


def gemini_chat(messages: list[dict], model: str = "",
                temperature: float = 0.8, max_tokens: int = 2048) -> str:
    """Chat with Gemini API. Accepts OpenAI-style messages."""
    model = model or PRIMARY_MODEL
    model_id = _gemini_model_id(model)

    # Convert OpenAI-style messages to Gemini format
    system_instruction = None
    contents = []
    for msg in messages:
        role = msg["role"]
        if role == "system":
            if system_instruction is None:
                system_instruction = msg["content"]
        else:
            gemini_role = "model" if role == "assistant" else "user"
            contents.append({
                "role": gemini_role,
                "parts": [{"text": msg["content"]}],
            })

    gen_config = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
    }
    thinking_budget = _gemini_thinking_budget(model)
    if thinking_budget is not None:
        gen_config["thinkingConfig"] = {"thinkingBudget": thinking_budget}

    payload = {
        "contents": contents,
        "generationConfig": gen_config,
    }
    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}],
        }

    # Key goes in the x-goog-api-key header, never the URL query string, so it
    # cannot leak into request URLs surfaced by exceptions / logs (CWE-312/532).
    url = f"{GEMINI_BASE}/models/{model_id}:generateContent"

    # Retry on transient 500 errors (Gemini preview models can be flaky)
    last_err = None
    for attempt in range(3):
        try:
            r = _gemini_session.post(url, json=payload, headers={"x-goog-api-key": GEMINI_API_KEY}, timeout=120)
            r.raise_for_status()
            break
        except requests.exceptions.HTTPError as e:
            if r.status_code >= 500 and attempt < 2:
                time.sleep(1 * (attempt + 1))
                last_err = e
                continue
            raise
    else:
        raise last_err  # type: ignore[misc]

    data = r.json()
    candidates = data.get("candidates", [])
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        return "".join(p.get("text", "") for p in parts)
    return ""


def gemini_chat_stream(messages: list[dict], model: str = "",
                       temperature: float = 0.8, max_tokens: int = 2048):
    """Stream Gemini response, yielding text chunks as they arrive.

    Uses subprocess curl to bypass gevent monkey-patching, which causes
    requests.post() to be starved by the SocketIO event loop (~17s delay).
    Curl runs as a native OS process, unaffected by gevent.
    """
    import time as _time

    model = model or PRIMARY_MODEL
    model_id = _gemini_model_id(model)

    system_instruction = None
    contents = []
    for msg in messages:
        role = msg["role"]
        if role == "system":
            if system_instruction is None:
                system_instruction = msg["content"]
        else:
            gemini_role = "model" if role == "assistant" else "user"
            contents.append({
                "role": gemini_role,
                "parts": [{"text": msg["content"]}],
            })

    gen_config = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
    }
    thinking_budget = _gemini_thinking_budget(model)
    if thinking_budget is not None:
        gen_config["thinkingConfig"] = {"thinkingBudget": thinking_budget}

    payload = {
        "contents": contents,
        "generationConfig": gen_config,
    }
    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}],
        }

    url = f"{GEMINI_BASE}/models/{model_id}:streamGenerateContent?key={GEMINI_API_KEY}&alt=sse"

    import tempfile

    # Write payload to temp file to avoid shell escaping issues with large JSON
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as pf:
        json.dump(payload, pf)
        payload_path = pf.name

    out_path = payload_path + ".out"

    try:
        _t0 = _time.time()
        # PHASE-15 15D — the key-bearing URL moves into the 0600 -K config file (no longer on
        # the cmdline); `fail` turns HTTP >= 400 into a RuntimeError. os.system stays (gevent).
        _run_curl_config([
            f"url = {_curl_cfg_quote(url)}",
            'request = "POST"',
            'header = "Content-Type: application/json"',
            f"data = {_curl_cfg_quote('@' + payload_path)}",
            f"output = {_curl_cfg_quote(out_path)}",
        ], label="Gemini stream")
        _t1 = _time.time()
        print(f"[timing] gemini curl took {_t1 - _t0:.2f}s")

        with open(out_path, "r") as f:
            for line in f:
                line = line.rstrip("\n\r")
                if not line or not line.startswith("data: "):
                    continue
                try:
                    data = json.loads(line[6:])
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            text = part.get("text", "")
                            if text:
                                yield text
                except (json.JSONDecodeError, KeyError):
                    continue
    finally:
        for p in (payload_path, out_path):
            try:
                os.remove(p)
            except OSError:
                pass


# ── Anthropic (Claude) Provider ───────────────────────────────────────────


def _claude_model_id(model: str) -> str:
    """Map friendly names to Claude API model IDs."""
    mapping = {
        "claude-opus-4.6": "claude-opus-4-6",
        "claude-opus-4": "claude-opus-4-20250514",
        "claude-sonnet-4.6": "claude-sonnet-4-6",
        "claude-sonnet-4": "claude-sonnet-4-20250514",
        "claude-haiku-4.5": "claude-haiku-4-5-20241022",
    }
    return mapping.get(model, model)


def claude_chat(messages: list[dict], model: str = "",
                temperature: float = 0.8, max_tokens: int = 2048) -> str:
    """Chat with Claude API. Accepts OpenAI-style messages."""
    model = model or DND_MODEL
    model_id = _claude_model_id(model)

    system_text = None
    api_messages = []
    for msg in messages:
        if msg["role"] == "system":
            # Keep only the first system message (agent instructions).
            # Later ones (e.g. from compact) would overwrite and break the Code Agent.
            if system_text is None:
                system_text = msg["content"]
        else:
            api_messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })

    payload = {
        "model": model_id,
        "messages": api_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if system_text:
        payload["system"] = system_text

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    # Extended output (128K) for long Code Agent / DM responses (2026)
    if max_tokens > 8192:
        headers["anthropic-beta"] = "output-128k-2025-02-19"

    try:
        r = _post_with_retry(_claude_session, f"{ANTHROPIC_BASE}/messages",
                             json=payload, headers=headers, timeout=120)
    except requests.exceptions.HTTPError as e:
        resp = getattr(e, "response", None)
        err_body = (getattr(resp, "text", "") or "")[:2000] or "(no body)"
        print(f"[claude] API error {getattr(resp, 'status_code', '?')}: {err_body}")
        raise

    data = r.json()
    content_blocks = data.get("content", [])
    return "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")


# ── Unified LLM Router ───────────────────────────────────────────────────


def _post_with_retry(session, url, *, json=None, headers=None, timeout=120,
                     max_retries=3, backoff=1.0):
    """POST with bounded retry on transient failures (HTTP 5xx, connection
    errors, timeouts); returns the Response after raise_for_status(). Non-5xx
    HTTP errors raise immediately. Shared so transient handling is uniform
    across providers (previously only gemini_chat retried). (BMO-SUGGESTIONS.)"""
    last_err = None
    for attempt in range(max_retries):
        try:
            r = session.post(url, json=json, headers=headers, timeout=timeout)
            r.raise_for_status()
            return r
        except requests.exceptions.HTTPError as e:
            status = getattr(getattr(e, "response", None), "status_code", 0) or 0
            if status >= 500 and attempt < max_retries - 1:
                last_err = e
                time.sleep(backoff * (attempt + 1))
                continue
            raise
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            if attempt < max_retries - 1:
                last_err = e
                time.sleep(backoff * (attempt + 1))
                continue
            raise
    raise last_err  # type: ignore[misc]


def _provider_of(model: str) -> str:
    """Vendor that serves a model name (used for cross-vendor failover)."""
    if model.startswith("claude"):
        return "claude"
    if model.startswith("llama") or model.startswith("mixtral") or model.startswith("groq-"):
        return "groq"
    return "gemini"


def _cloud_dispatch(messages: list[dict], model: str,
                    temperature: float, max_tokens: int) -> str:
    provider = _provider_of(model)
    if provider == "claude":
        return claude_chat(messages, model, temperature, max_tokens)
    if provider == "groq":
        return groq_llm_chat(messages, model, temperature, max_tokens)
    return gemini_chat(messages, model, temperature, max_tokens)


def cloud_chat(messages: list[dict], model: str = "",
               temperature: float = 0.8, max_tokens: int = 2048) -> str:
    """Route chat to the correct cloud provider based on model name.

    Optional cross-vendor failover: set BMO_LLM_FAILOVER_MODEL to a model on a
    DIFFERENT vendor and a failed primary call retries once on that fallback.
    Unset (default) preserves single-provider behaviour exactly, so DM/Code-Agent
    determinism is unchanged unless the owner opts in. (BMO-SUGGESTIONS.)
    """
    model = model or PRIMARY_MODEL
    try:
        return _cloud_dispatch(messages, model, temperature, max_tokens)
    except Exception as primary_err:
        fallback = (os.environ.get("BMO_LLM_FAILOVER_MODEL") or "").strip()
        if fallback and _provider_of(fallback) != _provider_of(model):
            try:
                print(f"[cloud_chat] primary {model} failed ({primary_err}); "
                      f"failing over to {fallback}")
                from services import metrics_counters
                metrics_counters.incr("llm_failover_total")
                return _cloud_dispatch(messages, fallback, temperature, max_tokens)
            except Exception:
                raise primary_err
        raise


# ── Groq LLM (Llama, Mixtral) ───────────────────────────────────────────

_groq_llm_session = requests.Session()


def groq_llm_chat(messages: list[dict], model: str = "llama-3.3-70b-versatile",
                  temperature: float = 0.8, max_tokens: int = 2048) -> str:
    """Chat with Groq LLM API. OpenAI-compatible endpoint."""
    # Strip "groq-" prefix if present
    if model.startswith("groq-"):
        model = model[5:]

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    r = _post_with_retry(_groq_llm_session, f"{GROQ_BASE}/chat/completions",
                         json=payload, headers=headers, timeout=60)
    data = r.json()
    return data["choices"][0]["message"]["content"]


def groq_llm_chat_stream(messages: list[dict], model: str = "llama-3.3-70b-versatile",
                         temperature: float = 0.8, max_tokens: int = 2048):
    """Stream Groq LLM response, yielding text chunks."""
    if model.startswith("groq-"):
        model = model[5:]

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    r = _groq_llm_session.post(f"{GROQ_BASE}/chat/completions",
                                json=payload, headers=headers, timeout=60, stream=True)
    r.raise_for_status()

    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        data_str = line[6:]
        if data_str.strip() == "[DONE]":
            break
        try:
            data = json.loads(data_str)
            delta = data["choices"][0].get("delta", {})
            text = delta.get("content", "")
            if text:
                yield text
        except (json.JSONDecodeError, KeyError, IndexError):
            continue


# ── Groq STT (Whisper) ───────────────────────────────────────────────────


def groq_stt(audio_bytes: bytes, language: str = "en", prompt: str = "") -> dict:
    """Transcribe audio using Groq Whisper Large-v3 Full.

    Args:
        audio_bytes: WAV/MP3/FLAC audio data
        language: Language code (default: "en")

    Returns:
        {"text": "transcribed text", "language": "en", "duration": 5.2}
    """
    # PHASE-15 15D — os.system curl (gevent design constraint); the Bearer key moves into a
    # 0600 -K config file (off the cmdline) + `fail` raises on HTTP >= 400.
    import tempfile
    import time as _time

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    out_path = tmp_path + ".json"

    try:
        form_lines = [
            f"form = {_curl_cfg_quote(f'file=@{tmp_path};type=audio/wav')}",
            'form = "model=whisper-large-v3"',
            f"form = {_curl_cfg_quote('language=' + language)}",
            'form = "response_format=verbose_json"',
        ]
        if prompt:
            form_lines.append(f"form = {_curl_cfg_quote('prompt=' + prompt)}")
        _t0 = _time.time()
        _run_curl_config([
            f"url = {_curl_cfg_quote(GROQ_BASE + '/audio/transcriptions')}",
            'request = "POST"',
            f"header = {_curl_cfg_quote('Authorization: Bearer ' + GROQ_API_KEY)}",
            *form_lines,
            f"output = {_curl_cfg_quote(out_path)}",
        ], label="Groq STT")
        _t1 = _time.time()

        with open(out_path, "r") as f:
            data = json.loads(f.read())
        print(f"[timing] groq_stt curl took {_t1 - _t0:.2f}s")
        return {
            "text": data.get("text", ""),
            "language": data.get("language", language),
            "duration": data.get("duration", 0),
            "segments": data.get("segments", []),
        }
    finally:
        for p in (tmp_path, out_path):
            try:
                os.remove(p)
            except OSError:
                pass


# ── Fish Audio TTS ───────────────────────────────────────────────────────


def fish_audio_tts(text: str, voice_id: str = "",
                   format: str = "mp3", speed: float = 1.0,
                   pitch: int = 0) -> bytes:
    """Generate speech using Fish Audio API.

    Args:
        text: Text to speak
        voice_id: Fish Audio voice model ID (defaults to BMO voice)
        format: Output format ("wav", "mp3", "opus")
        speed: Speech speed multiplier (default 1.0)
        pitch: Pitch shift in semitones (default 0)

    Returns:
        Audio bytes
    """
    voice_id = voice_id or FISH_AUDIO_VOICE_ID

    payload = {
        "text": text,
        "reference_id": voice_id,
        "format": format,
    }

    if speed != 1.0 or pitch != 0:
        payload["prosody"] = {}
        if speed != 1.0:
            payload["prosody"]["speed"] = speed
        if pitch != 0:
            payload["prosody"]["pitch"] = pitch

    # PHASE-15 15D — os.system curl bypasses gevent monkey-patching; secrets go in a 0600
    # -K config file (never on the cmdline) and `fail` turns HTTP >= 400 into a RuntimeError.
    import tempfile
    import time as _time

    # Write payload and capture binary output to temp files
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as pf:
        json.dump(payload, pf)
        payload_path = pf.name

    out_path = payload_path + ".audio"

    try:
        _t0 = _time.time()
        _run_curl_config([
            f"url = {_curl_cfg_quote(FISH_AUDIO_BASE + '/tts')}",
            'request = "POST"',
            f"header = {_curl_cfg_quote('Authorization: Bearer ' + FISH_AUDIO_API_KEY)}",
            'header = "Content-Type: application/json"',
            'header = "model: s1"',
            f"data = {_curl_cfg_quote('@' + payload_path)}",
            f"output = {_curl_cfg_quote(out_path)}",
        ], label="Fish Audio")
        _t1 = _time.time()

        with open(out_path, "rb") as f:
            audio_data = f.read()
        print(f"[timing] fish_audio_tts curl took {_t1 - _t0:.2f}s ({len(audio_data)} bytes)")
        return audio_data
    finally:
        for p in (payload_path, out_path):
            try:
                os.remove(p)
            except OSError:
                pass


# ── Google Cloud Vision ──────────────────────────────────────────────────


def google_vision_detect(image_bytes: bytes,
                         features: Optional[list[str]] = None) -> dict:
    """Detect objects/labels/text in an image using Google Cloud Vision API.

    Args:
        image_bytes: JPEG/PNG image data
        features: List of detection types. Options:
            "LABEL_DETECTION", "OBJECT_LOCALIZATION", "TEXT_DETECTION",
            "FACE_DETECTION", "LANDMARK_DETECTION"

    Returns:
        Raw Vision API response with annotations
    """
    if features is None:
        features = ["LABEL_DETECTION", "OBJECT_LOCALIZATION", "TEXT_DETECTION"]

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "requests": [{
            "image": {"content": b64_image},
            "features": [{"type": f, "maxResults": 20} for f in features],
        }]
    }

    url = f"https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_VISION_API_KEY}"
    r = requests.post(url, json=payload, timeout=30)
    r.raise_for_status()

    data = r.json()
    responses = data.get("responses", [{}])
    return responses[0] if responses else {}


def google_vision_describe(image_bytes: bytes) -> str:
    """Get a human-readable description of an image.

    Uses label + object detection, then formats into natural language.
    """
    result = google_vision_detect(
        image_bytes,
        features=["LABEL_DETECTION", "OBJECT_LOCALIZATION"],
    )

    labels = [a["description"] for a in result.get("labelAnnotations", [])]
    objects = [a["name"] for a in result.get("localizedObjectAnnotations", [])]

    parts = []
    if objects:
        parts.append(f"Objects detected: {', '.join(objects[:10])}")
    if labels:
        parts.append(f"Scene labels: {', '.join(labels[:10])}")

    return ". ".join(parts) if parts else "No objects or labels detected."
