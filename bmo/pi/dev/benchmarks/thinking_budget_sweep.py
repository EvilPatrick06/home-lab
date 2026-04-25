"""Sweep Gemini 3 Flash thinking budgets for speed/quality. Run manually (live API)."""
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

_PI_ROOT = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, _PI_ROOT)
load_dotenv(Path(_PI_ROOT) / ".env")

key = os.environ.get("GEMINI_API_KEY", "")
base = "https://generativelanguage.googleapis.com/v1beta"

SYSTEM = (
    "You are BMO, a friendly and slightly quirky AI assistant inspired by BMO "
    "from Adventure Time. You live on a Raspberry Pi. Cheerful, curious, slightly "
    "mischievous. Short punchy responses. You can use [FACE:x] [LED:x] [EMOTION:x] tags. "
    "No markdown. Plain English only."
)

PROMPTS = [
    "Good morning BMO!",
    "BMO are you smarter than Alexa?",
    "Do you ever get lonely?",
    "Tell me a joke",
]

BUDGETS = [0, 128, 256, 512, None]  # None = default (no thinkingConfig)


def run_prompt(prompt, budget):
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "generationConfig": {
            "temperature": 0.8,
            "maxOutputTokens": 2048,
        },
    }
    if budget is not None:
        payload["generationConfig"]["thinkingConfig"] = {"thinkingBudget": budget}

    url = f"{base}/models/gemini-3-flash-preview:generateContent?key={key}"
    t0 = time.time()
    r = requests.post(url, json=payload, timeout=30)
    elapsed = time.time() - t0

    data = r.json()
    text = ""
    for c in data.get("candidates", []):
        for p in c.get("content", {}).get("parts", []):
            if "text" in p:
                text += p["text"]

    usage = data.get("usageMetadata", {})
    thought_tokens = usage.get("thoughtsTokenCount", 0)
    output_tokens = usage.get("candidatesTokenCount", 0)

    return elapsed, text, thought_tokens, output_tokens


def main():
    for prompt in PROMPTS:
        print(f'\n{"=" * 80}')
        print(f"User: {prompt}")
        print("=" * 80)
        for budget in BUDGETS:
            label = f"budget={budget}" if budget is not None else "default"
            elapsed, text, thoughts, output = run_prompt(prompt, budget)
            print(f"\n  [{label}] {elapsed:.1f}s (think={thoughts}, out={output})")
            print(f"  {text}")

    print(f'\n{"=" * 80}')
    print("DONE")


if __name__ == "__main__":
    main()
