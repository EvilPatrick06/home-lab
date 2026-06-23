"""Unit tests for the pure game/util logic extracted from the social bot."""

from bots.social.games_logic import (
    _parse_timestamp,
    _parse_time_str,
    _fuzzy_title_match,
    _days_in_month,
    _xp_level_for,
    _xp_progress_bar,
    _new_deck,
    _hand_value,
    _hand_str,
    XP_THRESHOLDS,
)


def test_parse_timestamp_forms():
    assert _parse_timestamp("83") == 83
    assert _parse_timestamp("1:23") == 83
    assert _parse_timestamp("1:23:45") == 5025
    assert _parse_timestamp("nope") is None


def test_parse_time_str_forms():
    assert _parse_time_str("30m") == 1800
    assert _parse_time_str("2h") == 7200
    assert _parse_time_str("1h30m") == 5400
    assert _parse_time_str("1d") == 86400
    assert _parse_time_str("45") == 2700  # bare number = minutes
    assert _parse_time_str("xyz") is None


def test_fuzzy_title_match():
    assert _fuzzy_title_match("the matrix", "The Matrix!") is True
    assert _fuzzy_title_match("matrix", "The Matrix") is True
    assert _fuzzy_title_match("totally different", "The Matrix") is False
    assert _fuzzy_title_match("naruto", "Boruto", alt_answer="Naruto") is True


def test_days_in_month():
    assert _days_in_month(1) == 31
    assert _days_in_month(4) == 30
    assert _days_in_month(2) == 29
    assert _days_in_month(13) == 0


def test_xp_level_and_bar():
    assert _xp_level_for(0) == 1
    assert _xp_level_for(100) == 2
    assert _xp_level_for(10**9) == len(XP_THRESHOLDS)
    bar = _xp_progress_bar(150, 2)
    assert "▰" in bar or "▱" in bar
    assert _xp_progress_bar(10**9, len(XP_THRESHOLDS)).endswith("MAX")


def test_blackjack_logic():
    deck = _new_deck()
    assert len(deck) == 52
    assert len(set(deck)) == 52
    assert _hand_value([("A", "♠️"), ("K", "♥️")]) == 21
    assert _hand_value([("A", "♠️"), ("A", "♥️"), ("9", "♦️")]) == 21  # one ace soft
    assert _hand_value([("K", "♠️"), ("Q", "♥️"), ("2", "♦️")]) == 22
    s = _hand_str([("A", "♠️"), ("K", "♥️")], hide_first=True)
    assert "🂠" in s
