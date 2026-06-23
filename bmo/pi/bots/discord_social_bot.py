"""Thin compatibility shim — the social bot now lives in `bots.social.bot`.

Relocated 2026-06-23 (BMO-SUGGESTIONS: split the 6.8k-line god-module into the
`bots/social/` subpackage; pure game/util logic lives in
`bots/social/games_logic.py`). This shim is kept so the systemd entry point
`python -m bots.discord_social_bot` and any `import bots.discord_social_bot`
continue to work unchanged. New code should import from `bots.social.bot`.
"""
from bots.social.bot import *  # noqa: F401,F403
from bots.social.bot import (  # explicit: entry points + names imported elsewhere
    SocialBot,
    start_social_bot,
    get_social_bot,
    main,
)

if __name__ == "__main__":
    main()
