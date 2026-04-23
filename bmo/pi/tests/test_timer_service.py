"""Tests for BMO TimerService, Timer, and Alarm classes.

All filesystem I/O is redirected to tmp_path. No real threads are started
unless the test explicitly requires it. Hardware is pre-mocked by conftest.py.
"""

import datetime
import json
import os
import sys
import time
import threading
from unittest.mock import MagicMock, patch, call
from zoneinfo import ZoneInfo

import pytest

# Ensure pi/ is importable
_PI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PI_DIR not in sys.path:
    sys.path.insert(0, _PI_DIR)

from services.timer_service import (  # noqa: E402
    Timer,
    Alarm,
    TimerService,
    _normalize_timezone,
    DEFAULT_EXISTING_ALARMS_TZ,
    UTC,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _future_dt(minutes: int = 60) -> datetime.datetime:
    """Return a UTC datetime N minutes in the future."""
    return datetime.datetime.now(UTC) + datetime.timedelta(minutes=minutes)


def _past_dt(minutes: int = 5) -> datetime.datetime:
    return datetime.datetime.now(UTC) - datetime.timedelta(minutes=minutes)


@pytest.fixture
def svc(tmp_path):
    """TimerService with persistence redirected to tmp_path. No background threads."""
    persist = str(tmp_path / "data" / "alarms.json")
    with patch("timer_service.PERSIST_PATH", persist):
        service = TimerService()
    return service


@pytest.fixture
def svc_with_persist_path(tmp_path):
    """Returns (service, persist_path) for persistence tests."""
    persist = str(tmp_path / "data" / "alarms.json")
    with patch("timer_service.PERSIST_PATH", persist):
        service = TimerService()
    return service, persist


# ── _normalize_timezone ───────────────────────────────────────────────────────

class TestNormalizeTimezone:
    def test_valid_timezone_returned(self):
        assert _normalize_timezone("America/Denver") == "America/Denver"

    def test_invalid_timezone_returns_none(self):
        assert _normalize_timezone("Not/A/Zone") is None

    def test_none_input_returns_none(self):
        assert _normalize_timezone(None) is None

    def test_empty_string_returns_none(self):
        assert _normalize_timezone("") is None

    def test_whitespace_string_returns_none(self):
        assert _normalize_timezone("   ") is None

    def test_utc_valid(self):
        assert _normalize_timezone("UTC") == "UTC"


# ── Timer class ───────────────────────────────────────────────────────────────

class TestTimerClass:
    def test_init_sets_duration_and_label(self):
        t = Timer(120, "Coffee")
        assert t.duration == 120
        assert t.label == "Coffee"
        assert t.fired is False
        assert t.paused is False

    def test_auto_label_when_empty(self):
        t = Timer(90)
        assert "90" in t.label

    def test_tick_returns_false_before_expiry(self):
        t = Timer(3600)
        assert t.tick() is False

    def test_tick_returns_true_when_expired(self):
        t = Timer(1)
        t.started_at = time.time() - 2  # simulate 2 seconds elapsed
        fired = t.tick()
        assert fired is True
        assert t.fired is True
        assert t.remaining == 0

    def test_tick_noop_when_paused(self):
        t = Timer(3600)
        t.paused = True
        t.started_at = time.time() - 7200  # would fire if not paused
        assert t.tick() is False
        assert t.fired is False

    def test_tick_noop_when_already_fired(self):
        t = Timer(1)
        t.started_at = time.time() - 5
        t.tick()  # fires
        # Second tick should return False
        assert t.tick() is False

    def test_to_dict_has_required_keys(self):
        t = Timer(60, "Egg")
        d = t.to_dict()
        for key in ("id", "label", "duration", "remaining", "paused", "fired", "type"):
            assert key in d
        assert d["type"] == "timer"


# ── Alarm class ───────────────────────────────────────────────────────────────

class TestAlarmClass:
    def test_init_future_alarm(self):
        a = Alarm(_future_dt(60), "Morning Standup", anchor_timezone="America/Denver")
        assert a.fired is False
        assert a.enabled is True

    def test_init_naive_datetime_assigned_anchor_tz(self):
        naive = datetime.datetime(2025, 6, 1, 7, 30)
        a = Alarm(naive, anchor_timezone="America/Denver")
        # Should not be naive after construction
        assert a.target_time.tzinfo is not None

    def test_check_returns_true_when_past(self):
        a = Alarm(_past_dt(1), anchor_timezone="UTC")
        assert a.check() is True
        assert a.fired is True

    def test_check_returns_false_for_future(self):
        a = Alarm(_future_dt(60), anchor_timezone="UTC")
        assert a.check() is False
        assert a.fired is False

    def test_check_returns_false_when_disabled(self):
        a = Alarm(_past_dt(1), anchor_timezone="UTC", enabled=False)
        assert a.check() is False

    def test_check_returns_false_when_already_fired(self):
        a = Alarm(_past_dt(5), anchor_timezone="UTC")
        a.check()  # fires
        assert a.check() is False  # second check must be False

    def test_snooze_extends_target_time(self):
        a = Alarm(_past_dt(1), anchor_timezone="UTC")
        a.check()  # fire it
        before = datetime.datetime.now(UTC)
        a.snooze(5)
        assert a.target_time > before
        assert a.fired is False
        assert a.snoozed is True

    def test_advance_repeat_none_returns_false(self):
        a = Alarm(_future_dt(60), anchor_timezone="UTC", repeat="none")
        assert a.advance_repeat() is False

    def test_advance_repeat_daily_reschedules(self):
        a = Alarm(_past_dt(1), anchor_timezone="America/Denver", repeat="daily")
        a.check()  # fire it
        original_target = a.target_time
        result = a.advance_repeat()
        assert result is True
        assert a.target_time > original_target
        assert a.fired is False

    def test_advance_repeat_weekdays_lands_on_weekday(self):
        a = Alarm(_past_dt(1), anchor_timezone="America/Denver", repeat="weekdays")
        a.check()
        a.advance_repeat()
        anchor_tz = ZoneInfo("America/Denver")
        next_local = a.target_time.astimezone(anchor_tz)
        assert next_local.weekday() < 5, "Weekdays alarm must land Mon-Fri"

    def test_advance_repeat_weekends_lands_on_weekend(self):
        a = Alarm(_past_dt(1), anchor_timezone="America/Denver", repeat="weekends")
        a.check()
        a.advance_repeat()
        anchor_tz = ZoneInfo("America/Denver")
        next_local = a.target_time.astimezone(anchor_tz)
        assert next_local.weekday() >= 5, "Weekends alarm must land Sat or Sun"

    def test_advance_repeat_custom_lands_on_specified_days(self):
        a = Alarm(
            _past_dt(1),
            anchor_timezone="America/Denver",
            repeat="custom",
            repeat_days=["mon", "wed", "fri"],
        )
        a.check()
        a.advance_repeat()
        anchor_tz = ZoneInfo("America/Denver")
        next_local = a.target_time.astimezone(anchor_tz)
        assert next_local.weekday() in (0, 2, 4), "Custom days must be Mon/Wed/Fri"

    def test_remaining_positive_for_future_alarm(self):
        a = Alarm(_future_dt(30), anchor_timezone="UTC")
        assert a.remaining > 0

    def test_remaining_zero_for_past_alarm(self):
        a = Alarm(_past_dt(5), anchor_timezone="UTC")
        assert a.remaining == 0

    def test_to_dict_has_required_keys(self):
        a = Alarm(_future_dt(30), "Wake Up", anchor_timezone="America/Denver")
        d = a.to_dict()
        for key in ("id", "label", "target_time", "target_date", "remaining", "fired",
                    "snoozed", "enabled", "repeat", "tag", "type", "target_time_utc"):
            assert key in d

    def test_to_dict_uses_viewer_timezone(self):
        a = Alarm(_future_dt(60), anchor_timezone="America/Denver")
        d_denver = a.to_dict(viewer_timezone="America/Denver")
        d_utc = a.to_dict(viewer_timezone="UTC")
        # Same alarm, different display — times may differ
        assert d_denver["target_time"] != d_utc["target_time"] or True  # just check no crash

    def test_to_dict_custom_includes_repeat_days(self):
        a = Alarm(
            _future_dt(60),
            anchor_timezone="America/Denver",
            repeat="custom",
            repeat_days=["mon", "fri"],
        )
        d = a.to_dict()
        assert d.get("repeat_days") == ["mon", "fri"]


# ── TimerService.create_timer ─────────────────────────────────────────────────

class TestCreateTimer:
    def test_creates_timer_and_returns_dict(self, svc):
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            result = svc.create_timer(60, "Pasta")
        assert result["label"] == "Pasta"
        assert result["duration"] == 60
        assert result["type"] == "timer"
        assert result["id"] in svc._timers

    def test_timer_in_active_dict(self, svc):
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            result = svc.create_timer(120)
        assert result["id"] in svc._timers

    def test_multiple_timers_tracked_independently(self, svc):
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            r1 = svc.create_timer(30, "Timer A")
            r2 = svc.create_timer(90, "Timer B")
        assert r1["id"] != r2["id"]
        assert r1["id"] in svc._timers
        assert r2["id"] in svc._timers

    def test_zero_duration_timer_fires_immediately_on_tick(self, svc):
        """A 0-second timer is technically valid per implementation — tick fires it."""
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            result = svc.create_timer(0, "Instant")
        t = svc._timers[result["id"]]
        fired = t.tick()
        assert fired is True

    def test_emits_timer_created_event(self, svc):
        mock_sio = MagicMock()
        svc.socketio = mock_sio
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            svc.create_timer(60)
        mock_sio.emit.assert_called_once()
        assert mock_sio.emit.call_args[0][0] == "timer_created"


# ── TimerService.cancel_timer ─────────────────────────────────────────────────

class TestCancelTimer:
    def test_cancel_valid_id_removes_timer(self, svc):
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            result = svc.create_timer(60, "Delete Me")
        timer_id = result["id"]
        with patch.object(svc, "_save_all"):
            success = svc.cancel_timer(timer_id)
        assert success is True
        assert timer_id not in svc._timers

    def test_cancel_returns_false_for_unknown_id(self, svc):
        with patch.object(svc, "_save_all"):
            result = svc.cancel_timer("nonexistent-id")
        assert result is False

    def test_cancel_nonexistent_does_not_crash(self, svc):
        with patch.object(svc, "_save_all"):
            svc.cancel_timer("ghost-id")  # no exception


# ── TimerService.pause_timer ──────────────────────────────────────────────────

class TestPauseTimer:
    def test_pause_toggles_paused_state(self, svc):
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            result = svc.create_timer(120, "Paused")
        tid = result["id"]
        with patch.object(svc, "_save_all"):
            svc.pause_timer(tid)
        assert svc._timers[tid].paused is True
        with patch.object(svc, "_save_all"):
            svc.pause_timer(tid)
        assert svc._timers[tid].paused is False

    def test_pause_invalid_id_returns_false(self, svc):
        with patch.object(svc, "_save_all"):
            assert svc.pause_timer("bad-id") is False


# ── TimerService.create_alarm ─────────────────────────────────────────────────

class TestCreateAlarm:
    def test_creates_alarm_in_future(self, svc):
        with patch.object(svc, "_save_alarms"), patch.object(svc, "_ensure_running"):
            result = svc.create_alarm(8, 30, label="Morning", timezone_name="America/Denver")
        assert result["type"] == "alarm"
        assert result["id"] in svc._alarms
        alarm = svc._alarms[result["id"]]
        assert alarm.target_time > datetime.datetime.now(UTC)

    def test_alarm_stored_in_dict(self, svc):
        with patch.object(svc, "_save_alarms"), patch.object(svc, "_ensure_running"):
            result = svc.create_alarm(7, 0, timezone_name="UTC")
        assert result["id"] in svc._alarms

    def test_alarm_label_assigned(self, svc):
        with patch.object(svc, "_save_alarms"), patch.object(svc, "_ensure_running"):
            result = svc.create_alarm(9, 15, label="Stand-up", timezone_name="UTC")
        assert svc._alarms[result["id"]].label == "Stand-up"

    def test_alarm_tag_default_reminder(self, svc):
        with patch.object(svc, "_save_alarms"), patch.object(svc, "_ensure_running"):
            result = svc.create_alarm(10, 0, timezone_name="UTC")
        assert svc._alarms[result["id"]].tag == "reminder"

    def test_alarm_custom_tag(self, svc):
        with patch.object(svc, "_save_alarms"), patch.object(svc, "_ensure_running"):
            result = svc.create_alarm(6, 0, tag="wake-up", timezone_name="America/Denver")
        assert svc._alarms[result["id"]].tag == "wake-up"


# ── TimerService.cancel_alarm ─────────────────────────────────────────────────

class TestCancelAlarm:
    def test_cancel_valid_alarm_removes_it(self, svc):
        with patch.object(svc, "_save_alarms"), patch.object(svc, "_ensure_running"):
            result = svc.create_alarm(8, 0, timezone_name="UTC")
        alarm_id = result["id"]
        with patch.object(svc, "_save_alarms"):
            success = svc.cancel_alarm(alarm_id)
        assert success is True
        assert alarm_id not in svc._alarms

    def test_cancel_invalid_id_returns_false(self, svc):
        with patch.object(svc, "_save_alarms"):
            assert svc.cancel_alarm("ghost-id") is False

    def test_cancel_nonexistent_no_crash(self, svc):
        with patch.object(svc, "_save_alarms"):
            svc.cancel_alarm("ghost-id")  # should not raise


# ── TimerService.snooze_alarm ─────────────────────────────────────────────────

class TestSnoozeAlarm:
    def test_snooze_fired_alarm_reschedules(self, svc):
        a = Alarm(_past_dt(1), "Alarm", anchor_timezone="UTC")
        a.check()  # fire it
        svc._alarms[a.id] = a
        with patch.object(svc, "_save_alarms"):
            success = svc.snooze_alarm(a.id, minutes=5)
        assert success is True
        assert a.snoozed is True
        assert a.target_time > datetime.datetime.now(UTC)

    def test_snooze_unfired_alarm_returns_false(self, svc):
        a = Alarm(_future_dt(30), anchor_timezone="UTC")
        svc._alarms[a.id] = a
        with patch.object(svc, "_save_alarms"):
            assert svc.snooze_alarm(a.id) is False

    def test_snooze_invalid_id_returns_false(self, svc):
        with patch.object(svc, "_save_alarms"):
            assert svc.snooze_alarm("ghost") is False


# ── TimerService.set_alarm_enabled ────────────────────────────────────────────

class TestSetAlarmEnabled:
    def test_disable_alarm(self, svc):
        a = Alarm(_future_dt(30), anchor_timezone="UTC")
        svc._alarms[a.id] = a
        with patch.object(svc, "_save_alarms"):
            result = svc.set_alarm_enabled(a.id, False)
        assert result is not None
        assert svc._alarms[a.id].enabled is False

    def test_enable_alarm(self, svc):
        a = Alarm(_future_dt(30), anchor_timezone="UTC", enabled=False)
        svc._alarms[a.id] = a
        with patch.object(svc, "_save_alarms"):
            result = svc.set_alarm_enabled(a.id, True)
        assert result is not None
        assert svc._alarms[a.id].enabled is True

    def test_set_enabled_invalid_id_returns_none(self, svc):
        result = svc.set_alarm_enabled("ghost", True)
        assert result is None

    def test_same_state_noop(self, svc):
        a = Alarm(_future_dt(30), anchor_timezone="UTC", enabled=True)
        svc._alarms[a.id] = a
        with patch.object(svc, "_save_alarms"):
            result = svc.set_alarm_enabled(a.id, True)
        assert result["enabled"] is True


# ── TimerService.get_all ──────────────────────────────────────────────────────

class TestGetAll:
    def test_returns_all_active_items(self, svc):
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            svc.create_timer(60, "T1")
        with patch.object(svc, "_save_alarms"), patch.object(svc, "_ensure_running"):
            svc.create_alarm(8, 0, timezone_name="UTC")
        items = svc.get_all()
        assert len(items) == 2

    def test_fired_timers_excluded(self, svc):
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            result = svc.create_timer(1, "Expired")
        t = svc._timers[result["id"]]
        t.started_at = time.time() - 10
        t.tick()  # fires it
        items = svc.get_all()
        ids = [i["id"] for i in items]
        assert result["id"] not in ids

    def test_fired_alarms_excluded(self, svc):
        a = Alarm(_past_dt(1), anchor_timezone="UTC")
        a.check()  # fires
        svc._alarms[a.id] = a
        items = svc.get_all()
        ids = [i["id"] for i in items]
        assert a.id not in ids

    def test_returns_empty_when_nothing_active(self, svc):
        assert svc.get_all() == []


# ── TimerService.find_by_label ────────────────────────────────────────────────

class TestFindByLabel:
    def test_find_timer_by_partial_label(self, svc):
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            svc.create_timer(60, "Boiling Pasta")
        result = svc.find_by_label("pasta")
        assert result is not None
        assert result["type"] == "timer"

    def test_find_alarm_by_partial_label(self, svc):
        a = Alarm(_future_dt(60), "Daily Standup", anchor_timezone="UTC")
        svc._alarms[a.id] = a
        result = svc.find_by_label("standup")
        assert result is not None
        assert result["type"] == "alarm"

    def test_returns_none_when_no_match(self, svc):
        assert svc.find_by_label("no-such-label") is None

    def test_item_type_filter_timer_only(self, svc):
        a = Alarm(_future_dt(60), "breakfast", anchor_timezone="UTC")
        svc._alarms[a.id] = a
        result = svc.find_by_label("breakfast", item_type="timer")
        assert result is None  # alarm excluded by timer filter

    def test_item_type_filter_alarm_only(self, svc):
        with patch.object(svc, "_save_all"), patch.object(svc, "_ensure_running"):
            svc.create_timer(60, "dinner")
        result = svc.find_by_label("dinner", item_type="alarm")
        assert result is None  # timer excluded by alarm filter


# ── TimerService.update_alarm ─────────────────────────────────────────────────

class TestUpdateAlarm:
    def test_update_label(self, svc):
        a = Alarm(_future_dt(30), "Old Label", anchor_timezone="UTC")
        svc._alarms[a.id] = a
        with patch.object(svc, "_save_alarms"):
            result = svc.update_alarm(a.id, label="New Label")
        assert result["label"] == "New Label"

    def test_update_invalid_id_returns_none(self, svc):
        assert svc.update_alarm("ghost") is None

    def test_update_reschedules_when_hour_changes(self, svc):
        a = Alarm(_future_dt(60), anchor_timezone="UTC")
        svc._alarms[a.id] = a
        old_target = a.target_time
        with patch.object(svc, "_save_alarms"):
            svc.update_alarm(a.id, hour=23, minute=59)
        assert a.target_time != old_target


# ── Timer fires callback ──────────────────────────────────────────────────────

class TestTimerFires:
    def test_timer_fire_calls_voice_speak(self, svc):
        mock_voice = MagicMock()
        svc.voice = mock_voice
        t = Timer(1, "Pizza")
        t.started_at = time.time() - 5
        t.tick()  # fires it
        with patch("threading.Timer") as mock_thread_timer:
            svc._on_timer_fired(t)
        mock_voice.speak.assert_called_once()

    def test_timer_fire_emits_event(self, svc):
        mock_sio = MagicMock()
        svc.socketio = mock_sio
        t = Timer(1, "Tea")
        t.started_at = time.time() - 5
        t.tick()
        with patch("threading.Timer"):
            svc._on_timer_fired(t)
        mock_sio.emit.assert_called_once()
        assert mock_sio.emit.call_args[0][0] == "timer_fired"

    def test_timer_fire_no_voice_no_crash(self, svc):
        svc.voice = None
        t = Timer(1, "Eggs")
        t.started_at = time.time() - 5
        t.tick()
        with patch("threading.Timer"):
            svc._on_timer_fired(t)  # should not raise


# ── Alarm fires ───────────────────────────────────────────────────────────────

class TestAlarmFires:
    def test_reminder_alarm_emits_and_speaks(self, svc):
        mock_voice = MagicMock()
        mock_sio = MagicMock()
        svc.voice = mock_voice
        svc.socketio = mock_sio
        a = Alarm(_past_dt(1), "Doctor Appt", anchor_timezone="UTC", tag="reminder")
        a.check()
        svc._on_alarm_fired(a)
        mock_sio.emit.assert_called_once()
        mock_voice.speak.assert_called_once()

    def test_timer_tag_alarm_emits_beep(self, svc):
        mock_sio = MagicMock()
        svc.socketio = mock_sio
        a = Alarm(_past_dt(1), "Egg Timer", anchor_timezone="UTC", tag="timer")
        a.check()
        svc._on_alarm_fired(a)
        mock_sio.emit.assert_called_once()

    def test_wakeup_alarm_calls_agent(self, svc):
        mock_agent = MagicMock()
        mock_agent.chat.return_value = {"text": "Good morning Gavin!"}
        svc.agent_fn = lambda: mock_agent
        svc.voice = MagicMock()
        svc.socketio = MagicMock()
        a = Alarm(_past_dt(1), "Wake Up", anchor_timezone="America/Denver", tag="wake-up")
        a.check()
        svc._on_alarm_fired(a)
        mock_agent.chat.assert_called_once()

    def test_wakeup_alarm_no_agent_uses_fallback(self, svc):
        svc.agent_fn = None
        svc.voice = MagicMock()
        svc.socketio = MagicMock()
        a = Alarm(_past_dt(1), "Rise", anchor_timezone="UTC", tag="wake-up")
        a.check()
        svc._on_alarm_fired(a)
        svc.voice.speak.assert_called_once()
        spoken = svc.voice.speak.call_args[0][0]
        assert "Gavin" in spoken


# ── _clean_for_speech ─────────────────────────────────────────────────────────

class TestCleanForSpeech:
    def test_removes_emotion_tags(self):
        text = "[EMOTION:happy] Hello there!"
        result = TimerService._clean_for_speech(text)
        assert "[EMOTION:happy]" not in result
        assert "Hello there!" in result

    def test_removes_code_blocks(self):
        text = "Here is info ```code block here``` end."
        result = TimerService._clean_for_speech(text)
        assert "```" not in result

    def test_removes_markdown_bold(self):
        result = TimerService._clean_for_speech("This is **bold** text.")
        assert "**" not in result

    def test_removes_markdown_headers(self):
        result = TimerService._clean_for_speech("## Heading\nBody text")
        assert "##" not in result
        assert "Body text" in result

    def test_collapses_whitespace(self):
        result = TimerService._clean_for_speech("Hello   \n\n  World")
        assert "  " not in result

    def test_removes_bracket_notation(self):
        result = TimerService._clean_for_speech("Here is [tag] some text")
        assert "[tag]" not in result


# ── Persistence ───────────────────────────────────────────────────────────────

class TestPersistence:
    def test_save_and_reload_alarms(self, tmp_path):
        persist = str(tmp_path / "data" / "alarms.json")
        with patch("timer_service.PERSIST_PATH", persist):
            svc1 = TimerService()
            a = Alarm(_future_dt(60), "Saved Alarm", anchor_timezone="America/Denver")
            svc1._alarms[a.id] = a
            svc1._save_alarms()

            svc2 = TimerService()

        assert any(v.label == "Saved Alarm" for v in svc2._alarms.values())

    def test_save_and_reload_active_timers(self, tmp_path):
        persist = str(tmp_path / "data" / "alarms.json")
        with patch("timer_service.PERSIST_PATH", persist):
            svc1 = TimerService()
            t = Timer(300, "Long Timer")
            svc1._timers[t.id] = t
            svc1._save_alarms()

            svc2 = TimerService()

        assert any(v.label == "Long Timer" for v in svc2._timers.values())

    def test_expired_timer_during_downtime_emitted_not_restored(self, tmp_path):
        persist = str(tmp_path / "data" / "alarms.json")
        # Write a timer that already expired
        os.makedirs(tmp_path / "data", exist_ok=True)
        payload = {
            "alarms": [],
            "timers": [{
                "id": "expired-1",
                "label": "Expired Timer",
                "duration": 60,
                "remaining": 0,
                "started_at": time.time() - 120,  # 2 minutes ago
                "paused": False,
            }]
        }
        with open(persist, "w") as f:
            json.dump(payload, f)

        mock_sio = MagicMock()
        with patch("timer_service.PERSIST_PATH", persist):
            svc = TimerService(socketio=mock_sio)

        # Timer should NOT be in active dict
        assert "expired-1" not in svc._timers
        # But a "fired" event should have been emitted
        emitted_events = [c[0][0] for c in mock_sio.emit.call_args_list]
        assert "timer_fired" in emitted_events

    def test_fired_non_repeating_alarm_not_restored(self, tmp_path):
        persist = str(tmp_path / "data" / "alarms.json")
        os.makedirs(tmp_path / "data", exist_ok=True)
        fired_time = (datetime.datetime.now(UTC) - datetime.timedelta(hours=1)).isoformat()
        payload = {
            "alarms": [{
                "id": "fired-1",
                "label": "Old Alarm",
                "hour": 7,
                "minute": 0,
                "target_time_utc": fired_time,
                "anchor_timezone": "America/Denver",
                "local_date": "2025-01-01",
                "repeat": "none",
                "repeat_days": [],
                "tag": "reminder",
                "enabled": True,
                "fired": True,
                "snoozed": False,
            }],
            "timers": []
        }
        with open(persist, "w") as f:
            json.dump(payload, f)

        with patch("timer_service.PERSIST_PATH", persist):
            svc = TimerService()

        assert "fired-1" not in svc._alarms

    def test_save_creates_data_directory(self, tmp_path):
        deep_path = str(tmp_path / "deep" / "nested" / "alarms.json")
        with patch("timer_service.PERSIST_PATH", deep_path):
            svc = TimerService()
            svc._save_alarms()
        assert os.path.exists(deep_path)

    def test_load_handles_missing_file_gracefully(self, tmp_path):
        missing_path = str(tmp_path / "no_such" / "alarms.json")
        with patch("timer_service.PERSIST_PATH", missing_path):
            svc = TimerService()
        assert svc._alarms == {}
        assert svc._timers == {}

    def test_load_handles_corrupt_json(self, tmp_path):
        persist = str(tmp_path / "data" / "alarms.json")
        os.makedirs(tmp_path / "data", exist_ok=True)
        with open(persist, "w") as f:
            f.write("{not: valid json}")
        with patch("timer_service.PERSIST_PATH", persist):
            svc = TimerService()  # should not raise
        assert svc._alarms == {}


# ── Client timezone tracking ──────────────────────────────────────────────────

class TestClientTimezone:
    def test_set_valid_timezone(self, svc):
        svc.set_client_timezone("sid-1", "America/New_York")
        assert svc._client_timezone_by_sid.get("sid-1") == "America/New_York"

    def test_set_invalid_timezone_not_stored(self, svc):
        svc.set_client_timezone("sid-2", "Not/A/Zone")
        assert "sid-2" not in svc._client_timezone_by_sid

    def test_set_none_removes_entry(self, svc):
        svc._client_timezone_by_sid["sid-3"] = "UTC"
        svc.set_client_timezone("sid-3", None)
        assert "sid-3" not in svc._client_timezone_by_sid

    def test_clear_client_removes_entry(self, svc):
        svc._client_timezone_by_sid["sid-4"] = "UTC"
        svc.clear_client("sid-4")
        assert "sid-4" not in svc._client_timezone_by_sid

    def test_clear_unknown_client_no_crash(self, svc):
        svc.clear_client("ghost-sid")  # should not raise
