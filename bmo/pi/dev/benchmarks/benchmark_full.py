"""Full pipeline benchmark: LLM (streaming) -> TTS (WAV + MP3) for multiple models.

Tests Gemini 3 Flash, Gemini 2.5 Flash, and Groq Llama 3.3 70B
with identical prompts. Measures timestamps for each stage.
No audio playback — just timing.
"""
import json
import os
import sys
import time

_PI_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, _PI_ROOT)
from dotenv import load_dotenv

load_dotenv(os.path.join(_PI_ROOT, ".env"))

import services.cloud_providers as cloud_providers
cloud_providers.GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
cloud_providers.FISH_AUDIO_API_KEY = os.environ.get('FISH_AUDIO_API_KEY', '')
cloud_providers.GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')

import requests
_groq_llm_session = requests.Session()

# ── Groq LLM wrapper ──────────────────────────────────────────────

def groq_chat(messages, model="llama-3.3-70b-versatile", temperature=0.8, max_tokens=1024):
    """Non-streaming Groq LLM call."""
    headers = {
        "Authorization": f"Bearer {cloud_providers.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    r = _groq_llm_session.post("https://api.groq.com/openai/v1/chat/completions",
                                json=payload, headers=headers, timeout=60)
    r.raise_for_status()
    data = r.json()
    return data["choices"][0]["message"]["content"]


def groq_chat_stream(messages, model="llama-3.3-70b-versatile", temperature=0.8, max_tokens=1024):
    """Streaming Groq LLM call, yields text chunks."""
    headers = {
        "Authorization": f"Bearer {cloud_providers.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    r = _groq_llm_session.post("https://api.groq.com/openai/v1/chat/completions",
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


# ── TTS helpers ────────────────────────────────────────────────────

def tts_benchmark(text, fmt="wav"):
    """Generate TTS, return (audio_bytes, elapsed_seconds)."""
    start = time.time()
    audio = cloud_providers.fish_audio_tts(text, format=fmt)
    elapsed = time.time() - start
    return audio, elapsed


import re

def split_sentences(text, max_chars=200):
    """Split into sentence-sized TTS chunks."""
    if len(text) <= max_chars:
        return [text]
    chunks = []
    current = ""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    for s in sentences:
        if len(current) + len(s) + 1 <= max_chars:
            current = (current + " " + s).strip() if current else s
        else:
            if current:
                chunks.append(current)
            current = s
    if current:
        chunks.append(current)
    return chunks or [text]


# ── Test prompts ───────────────────────────────────────────────────

SYSTEM_PROMPT = "You are BMO, a cute and friendly AI assistant who lives on a Raspberry Pi. You speak in a warm, playful tone. Keep responses concise but helpful."

TEST_PROMPTS = [
    {
        "name": "Short casual",
        "user": "Hey BMO, how are you doing today?",
    },
    {
        "name": "Medium question",
        "user": "What's the best way to organize a small home office? Give me some practical tips.",
    },
    {
        "name": "Longer conversational",
        "user": "I'm thinking about starting a new hobby. I like building things with my hands, being creative, and I have a budget of about $100 to start. What would you recommend and why?",
    },
    {
        "name": "Technical question",
        "user": "Explain how Wi-Fi works in simple terms that a kid could understand.",
    },
]

# ── Models to test ────────────────────────────────────────────────

MODELS = [
    {
        "name": "Gemini 3 Flash",
        "stream_fn": lambda msgs: cloud_providers.gemini_chat_stream(msgs, model="gemini-3-flash", max_tokens=1024),
    },
    {
        "name": "Gemini 2.5 Flash",
        "stream_fn": lambda msgs: cloud_providers.gemini_chat_stream(msgs, model="gemini-2.5-flash", max_tokens=1024),
    },
    {
        "name": "Groq Llama 3.3 70B",
        "stream_fn": lambda msgs: groq_chat_stream(msgs, model="llama-3.3-70b-versatile", max_tokens=1024),
    },
]

# ── Run benchmark ──────────────────────────────────────────────────

def run_one(model_cfg, prompt_cfg):
    """Run one LLM+TTS test, return timing dict."""
    msgs = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt_cfg["user"]},
    ]

    # Stream LLM
    t0 = time.time()
    first_token_t = None
    first_sentence_t = None
    full_text = ""
    chunk_count = 0
    try:
        for chunk in model_cfg["stream_fn"](msgs):
            now = time.time()
            if first_token_t is None:
                first_token_t = now - t0
            full_text += chunk
            chunk_count += 1
            if first_sentence_t is None and re.search(r'[.!?]\s', full_text):
                first_sentence_t = now - t0
    except Exception as e:
        return {"error": str(e)}

    llm_total = time.time() - t0

    if not full_text:
        return {"error": "empty response"}

    # TTS — generate for each sentence chunk, both WAV and MP3
    sentences = split_sentences(full_text)
    tts_results = {}
    for fmt in ["wav", "mp3"]:
        fmt_t0 = time.time()
        first_chunk_t = None
        total_bytes = 0
        for i, sentence in enumerate(sentences):
            audio_bytes, elapsed = tts_benchmark(sentence, fmt=fmt)
            total_bytes += len(audio_bytes)
            if first_chunk_t is None:
                first_chunk_t = time.time() - fmt_t0
        fmt_total = time.time() - fmt_t0
        tts_results[fmt] = {
            "first_chunk": first_chunk_t,
            "total": fmt_total,
            "total_bytes": total_bytes,
            "num_chunks": len(sentences),
        }

    return {
        "llm_first_token": first_token_t,
        "llm_first_sentence": first_sentence_t or llm_total,
        "llm_total": llm_total,
        "llm_chunks": chunk_count,
        "llm_chars": len(full_text),
        "response_preview": full_text[:120],
        "tts": tts_results,
        "sentences": len(sentences),
        # End-to-end: LLM first sentence + TTS first chunk (streaming pipeline)
        "e2e_streaming_wav": (first_sentence_t or llm_total) + tts_results["wav"]["first_chunk"],
        "e2e_streaming_mp3": (first_sentence_t or llm_total) + tts_results["mp3"]["first_chunk"],
        # End-to-end: LLM full + TTS full (non-streaming pipeline)
        "e2e_sync_wav": llm_total + tts_results["wav"]["total"],
        "e2e_sync_mp3": llm_total + tts_results["mp3"]["total"],
    }


def main():
    print("=" * 80)
    print("BMO FULL PIPELINE BENCHMARK")
    print("LLM (streaming) -> Fish Audio TTS (WAV + MP3)")
    print("=" * 80)

    for prompt_cfg in TEST_PROMPTS:
        print(f"\n{'─' * 80}")
        print(f"PROMPT: \"{prompt_cfg['name']}\"")
        print(f"  User: {prompt_cfg['user']}")
        print(f"{'─' * 80}")

        for model_cfg in MODELS:
            print(f"\n  [{model_cfg['name']}]")
            result = run_one(model_cfg, prompt_cfg)

            if "error" in result:
                print(f"    ERROR: {result['error']}")
                continue

            print(f"    LLM first token:    {result['llm_first_token']:.2f}s")
            print(f"    LLM first sentence: {result['llm_first_sentence']:.2f}s")
            print(f"    LLM total:          {result['llm_total']:.2f}s  ({result['llm_chars']} chars, {result['llm_chunks']} chunks)")
            print(f"    Response: \"{result['response_preview']}...\"")
            print(f"    Sentences for TTS:  {result['sentences']}")

            for fmt in ["wav", "mp3"]:
                tts = result["tts"][fmt]
                print(f"    TTS {fmt.upper():3s}: first_chunk={tts['first_chunk']:.2f}s, total={tts['total']:.2f}s, {tts['total_bytes']//1024}KB ({tts['num_chunks']} chunks)")

            print("    ── End-to-end (time to first audio) ──")
            print(f"    Streaming + WAV: {result['e2e_streaming_wav']:.2f}s")
            print(f"    Streaming + MP3: {result['e2e_streaming_mp3']:.2f}s")
            print(f"    Sync + WAV:      {result['e2e_sync_wav']:.2f}s")
            print(f"    Sync + MP3:      {result['e2e_sync_mp3']:.2f}s")

    print(f"\n{'=' * 80}")
    print("BENCHMARK COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
