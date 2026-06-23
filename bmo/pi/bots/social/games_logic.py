"""Pure game/util logic extracted from the social bot (no discord coupling).

These were top-level helpers in the 6.8k-line bots/social/bot.py god-module.
Being pure (stdlib only) they are safe to extract and unit-test in isolation —
the bot imports them back. See BMO-SUGGESTIONS 2026-06-23 (split discord_social_bot.py).
"""
from __future__ import annotations

import random
import re
from typing import Optional

XP_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 6600, 7800, 9100, 10500]


def _parse_timestamp(ts: str) -> Optional[int]:
    """Parse '1:23' or '1:23:45' or '83' to seconds."""
    parts = ts.strip().split(":")
    try:
        if len(parts) == 1:
            return int(parts[0])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        return None
    return None


def _fuzzy_title_match(guess: str, answer: str, alt_answer: str = "") -> bool:
    """Check if a guess fuzzy-matches the answer title."""
    guess_clean = re.sub(r'[^\w\s]', '', guess.lower()).strip()
    answer_clean = re.sub(r'[^\w\s]', '', answer.lower()).strip()
    # Exact-ish match
    if guess_clean == answer_clean:
        return True
    # Answer contained in guess or vice versa
    if answer_clean in guess_clean or guess_clean in answer_clean:
        return True
    # Word overlap (at least 60% of answer words)
    answer_words = set(w for w in answer_clean.split() if len(w) > 2)
    guess_words = set(w for w in guess_clean.split() if len(w) > 2)
    if answer_words:
        overlap = len(answer_words & guess_words)
        if overlap >= max(1, len(answer_words) * 0.6):
            return True
    # Check alt title too
    if alt_answer:
        alt_clean = re.sub(r'[^\w\s]', '', alt_answer.lower()).strip()
        if alt_clean and (guess_clean == alt_clean or alt_clean in guess_clean
                          or guess_clean in alt_clean):
            return True
        alt_words = set(w for w in alt_clean.split() if len(w) > 2)
        if alt_words:
            overlap = len(alt_words & guess_words)
            if overlap >= max(1, len(alt_words) * 0.6):
                return True
    return False


def _days_in_month(month: int) -> int:
    """Return max days for a month (ignoring leap years for birthday validation)."""
    if month in (1, 3, 5, 7, 8, 10, 12):
        return 31
    elif month in (4, 6, 9, 11):
        return 30
    elif month == 2:
        return 29
    return 0


def _xp_level_for(xp: int) -> int:
    """Return the level for the given XP amount."""
    level = 1
    for i, threshold in enumerate(XP_THRESHOLDS):
        if xp >= threshold:
            level = i + 1
        else:
            break
    return level


def _xp_progress_bar(xp: int, level: int, width: int = 10) -> str:
    """Build a text XP progress bar like: ▰▰▰▰▱▱▱▱▱▱"""
    max_level = len(XP_THRESHOLDS)
    if level >= max_level:
        return "▰" * width + " MAX"
    current_threshold = XP_THRESHOLDS[level - 1]
    next_threshold = XP_THRESHOLDS[level]
    progress = xp - current_threshold
    needed = next_threshold - current_threshold
    ratio = max(0.0, min(progress / needed, 1.0)) if needed > 0 else 1.0
    filled = int(ratio * width)
    return "▰" * filled + "▱" * (width - filled)


_CARD_SUITS = ["♠️", "♥️", "♦️", "♣️"]


_CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]


def _new_deck() -> list[tuple[str, str]]:
    deck = [(r, s) for s in _CARD_SUITS for r in _CARD_RANKS]
    random.shuffle(deck)
    return deck


def _hand_value(hand: list[tuple[str, str]]) -> int:
    total = 0
    aces = 0
    for rank, _ in hand:
        if rank in ("J", "Q", "K"):
            total += 10
        elif rank == "A":
            total += 11
            aces += 1
        else:
            total += int(rank)
    while total > 21 and aces > 0:
        total -= 10
        aces -= 1
    return total


def _hand_str(hand: list[tuple[str, str]], hide_first: bool = False) -> str:
    if hide_first:
        return f"🂠 {hand[1][0]}{hand[1][1]}"
    return " ".join(f"{r}{s}" for r, s in hand)


def _parse_time_str(s: str) -> Optional[int]:
    """Parse time strings like '2h', '30m', '1h30m', '1d' -> seconds."""
    s = s.strip().lower()
    total = 0
    pattern = re.compile(r'(\d+)\s*([dhms])')
    matches = pattern.findall(s)
    if not matches:
        # Try bare number as minutes
        try:
            return int(s) * 60
        except ValueError:
            return None
    for amount, unit in matches:
        n = int(amount)
        if unit == 'd':
            total += n * 86400
        elif unit == 'h':
            total += n * 3600
        elif unit == 'm':
            total += n * 60
        elif unit == 's':
            total += n
    return total if total > 0 else None
