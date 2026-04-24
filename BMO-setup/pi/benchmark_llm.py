"""Benchmark LLM streaming vs non-streaming."""
import time, os, sys
sys.path.insert(0, '/home/patrick/bmo')
from dotenv import load_dotenv
load_dotenv('/home/patrick/bmo/.env')

import cloud_providers
cloud_providers.GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

msgs = [
    {"role": "system", "content": "You are a helpful assistant. Always give thorough, detailed responses."},
    {"role": "user", "content": "Explain the water cycle in detail, covering evaporation, condensation, precipitation, and collection."},
]

for model_name in ["gemini-3-flash", "gemini-2.5-flash", "gemini-3.1-pro"]:
    print(f"\n=== {model_name} ===")

    # Non-streaming
    start = time.time()
    r = cloud_providers.gemini_chat(msgs, model=model_name, temperature=0.8, max_tokens=1024)
    full_time = time.time() - start
    print(f"  Non-stream: {full_time:.2f}s, {len(r)} chars")

    # Streaming
    start = time.time()
    first_token_time = None
    first_sentence_time = None
    total_text = ""
    chunk_count = 0
    for chunk in cloud_providers.gemini_chat_stream(msgs, model=model_name, temperature=0.8, max_tokens=1024):
        if first_token_time is None:
            first_token_time = time.time() - start
        total_text += chunk
        chunk_count += 1
        if first_sentence_time is None and '.' in total_text:
            first_sentence_time = time.time() - start
    stream_time = time.time() - start
    ft = first_token_time or 0
    fs = first_sentence_time or 0
    print(f"  Stream: first_tok={ft:.2f}s, first_sent={fs:.2f}s, total={stream_time:.2f}s, chunks={chunk_count}, {len(total_text)} chars")
