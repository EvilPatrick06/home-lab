"""Debug Gemini 3 Flash streaming to understand thinking model SSE format. Run manually."""
import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

_PI_ROOT = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, _PI_ROOT)
load_dotenv(Path(_PI_ROOT) / ".env")


def main() -> None:
    key = os.environ.get("GEMINI_API_KEY", "")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-3-flash-preview:streamGenerateContent?key={key}&alt=sse"
    )

    payload = {
        "contents": [{"role": "user", "parts": [{"text": "Do you ever get lonely?"}]}],
        "systemInstruction": {"parts": [{"text": "You are BMO, a friendly AI. Short punchy responses. No markdown."}]},
        "generationConfig": {"temperature": 0.8, "maxOutputTokens": 2048},
    }

    r = requests.post(url, json=payload, timeout=30, stream=True)
    event_num = 0
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        event_num += 1
        data = json.loads(line[6:])
        candidates = data.get("candidates", [])
        for c in candidates:
            parts = c.get("content", {}).get("parts", [])
            finish = c.get("finishReason", "")
            for p in parts:
                has_thought = "thoughtSignature" in p
                has_text = "text" in p
                text_val = p.get("text", "")[:120] if has_text else ""
                print(f"Event {event_num}: thought={has_thought} text={has_text} finish={finish}")
                if has_text and not has_thought:
                    print(f"  -> {text_val}")
        usage = data.get("usageMetadata")
        if usage:
            print(f"  Usage: {json.dumps(usage)}")


if __name__ == "__main__":
    main()
