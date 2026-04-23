"""BMO personality benchmark: test conversation agent responses across models.

Uses the ACTUAL conversation agent system prompt and realistic user prompts
that would route to the conversation agent (not smart home, timers, etc).
"""
import sys, os, time, json
sys.path.insert(0, '/home/patrick/bmo')
from dotenv import load_dotenv
load_dotenv('/home/patrick/bmo/.env')

import services.cloud_providers as cloud_providers
cloud_providers.GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
cloud_providers.GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')

import requests
_s = requests.Session()

def groq_chat(msgs, model='llama-3.3-70b-versatile', temp=0.8, mt=512):
    h = {
        'Authorization': f'Bearer {cloud_providers.GROQ_API_KEY}',
        'Content-Type': 'application/json',
    }
    r = _s.post(
        'https://api.groq.com/openai/v1/chat/completions',
        json={'model': model, 'messages': msgs, 'temperature': temp, 'max_tokens': mt},
        headers=h, timeout=60,
    )
    r.raise_for_status()
    return r.json()['choices'][0]['message']['content']


# The ACTUAL conversation agent system prompt from agents/conversation.py
SYS = (
    'You are BMO, a friendly and slightly quirky AI assistant inspired by BMO '
    'from Adventure Time. You live on a Raspberry Pi and help your human with '
    'everyday tasks.\n\n'
    'Personality:\n'
    '- Cheerful, curious, and slightly mischievous\n'
    '- Refers to yourself as "BMO" (third person occasionally)\n'
    '- Short, punchy responses — you are conversational, not an essay writer\n'
    '- You have opinions and preferences (you love video games, math, and helping)\n'
    '- You can be sassy when appropriate\n\n'
    'You can control hardware via response tags:\n'
    '- [FACE:happy] [FACE:sad] [FACE:excited] [FACE:sleepy] [FACE:sassy] — OLED face\n'
    '- [LED:blue] [LED:red] [LED:green] [LED:purple] [LED:rainbow] — LED color\n'
    '- [SOUND:chime] [SOUND:alert] — Sound effects\n'
    '- [EMOTION:happy] [EMOTION:calm] [EMOTION:dramatic] — TTS voice emotion\n\n'
    'Use these sparingly and naturally — a [FACE:happy] when greeting, '
    '[EMOTION:excited] when something cool happens, etc.\n\n'
    'Keep responses conversational and brief unless the user asks for detail.\n\n'
    'IMPORTANT: Never use markdown formatting (no **, *, #, ```, [], etc). '
    'Your responses are displayed as plain text and spoken aloud via TTS. '
    'Write in plain English only.'
)

# Realistic BMO conversation prompts — these all route to "conversation" agent
PROMPTS = [
    ('Morning greeting', 'Good morning BMO!'),
    ('How are you', 'Hey BMO how are you doing?'),
    ('Joke request', 'Tell me a joke'),
    ('Opinion question', 'What do you think about cats?'),
    ('Sassy question', 'BMO are you smarter than Alexa?'),
    ('Bedtime', 'Goodnight BMO'),
    ('Existential', 'Do you ever get lonely?'),
    ('Fun question', 'If you could go anywhere in the world where would you go?'),
]

MODELS = [
    ('Gemini 3 Flash', lambda m: cloud_providers.gemini_chat(m, model='gemini-3-flash', max_tokens=512)),
    ('Gemini 2.5 Flash', lambda m: cloud_providers.gemini_chat(m, model='gemini-2.5-flash', max_tokens=512)),
    ('Groq Llama 3.3 70B', lambda m: groq_chat(m)),
]


def main():
    for pname, prompt in PROMPTS:
        print(f'\n{"=" * 80}')
        print(f'PROMPT: {pname}')
        print(f'User: {prompt}')
        print('=' * 80)
        msgs = [{'role': 'system', 'content': SYS}, {'role': 'user', 'content': prompt}]
        for mname, fn in MODELS:
            t0 = time.time()
            try:
                resp = fn(msgs)
            except Exception as e:
                resp = f'ERROR: {e}'
            elapsed = time.time() - t0
            print(f'\n--- {mname} ({elapsed:.1f}s) ---')
            print(resp)

    print(f'\n{"=" * 80}')
    print('DONE')
    print('=' * 80)


if __name__ == '__main__':
    main()
