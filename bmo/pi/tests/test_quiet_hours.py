"""Regression tests for the shared quiet-hours / bedtime speaking policy.

Locks in: env-configurable window (BMO_QUIET_HOURS_*), the wrapping window,
the critical-kind bypass, the bedtime-scene override, and the notification
service gating a night-time announcement (stored, not spoken).
"""
import importlib

import pytest


@pytest.fixture
def qh(monkeypatch):
    # Clean env so tests are deterministic regardless of the host's settings.
    for k in ("BMO_QUIET_HOURS_START", "BMO_QUIET_HOURS_END", "BMO_QUIET_HOURS_ENABLED"):
        monkeypatch.delenv(k, raising=False)
    import services.quiet_hours as m
    importlib.reload(m)
    # Neutralize settings.json fallback so only env/default drive the window.
    monkeypatch.setattr(m, "_settings_window", lambda: (None, None, True))
    return m


class TestWindow:
    def test_default_window_is_23_to_7(self, qh):
        start, end, enabled = qh.get_window()
        assert (start, end, enabled) == (23, 7, True)

    def test_env_overrides_window(self, qh, monkeypatch):
        monkeypatch.setenv("BMO_QUIET_HOURS_START", "22")
        monkeypatch.setenv("BMO_QUIET_HOURS_END", "6")
        assert qh.get_window()[:2] == (22, 6)

    def test_wrapping_window_covers_midnight(self, qh, monkeypatch):
        monkeypatch.setenv("BMO_QUIET_HOURS_START", "22")
        monkeypatch.setenv("BMO_QUIET_HOURS_END", "7")
        assert qh.in_quiet_window(now_hour=3) is True     # deep night
        assert qh.in_quiet_window(now_hour=23) is True    # just after start
        assert qh.in_quiet_window(now_hour=6) is True      # just before end
        assert qh.in_quiet_window(now_hour=12) is False    # midday
        assert qh.in_quiet_window(now_hour=7) is False     # end is exclusive

    def test_non_wrapping_window(self, qh, monkeypatch):
        monkeypatch.setenv("BMO_QUIET_HOURS_START", "1")
        monkeypatch.setenv("BMO_QUIET_HOURS_END", "5")
        assert qh.in_quiet_window(now_hour=3) is True
        assert qh.in_quiet_window(now_hour=6) is False
        assert qh.in_quiet_window(now_hour=0) is False

    def test_disabled_window_never_quiet(self, qh, monkeypatch):
        monkeypatch.setenv("BMO_QUIET_HOURS_ENABLED", "0")
        assert qh.in_quiet_window(now_hour=3) is False


class TestMaySpeak:
    def test_notification_suppressed_at_night(self, qh, monkeypatch):
        monkeypatch.setenv("BMO_QUIET_HOURS_START", "22")
        monkeypatch.setenv("BMO_QUIET_HOURS_END", "7")
        assert qh.may_speak("notification", now_hour=3) is False

    def test_notification_allowed_by_day(self, qh, monkeypatch):
        monkeypatch.setenv("BMO_QUIET_HOURS_START", "22")
        monkeypatch.setenv("BMO_QUIET_HOURS_END", "7")
        assert qh.may_speak("notification", now_hour=14) is True

    @pytest.mark.parametrize("kind", ["alarm", "timer", "emergency", "critical"])
    def test_critical_kinds_bypass_quiet_hours(self, qh, monkeypatch, kind):
        monkeypatch.setenv("BMO_QUIET_HOURS_START", "22")
        monkeypatch.setenv("BMO_QUIET_HOURS_END", "7")
        assert qh.may_speak(kind, now_hour=3) is True

    def test_bedtime_scene_forces_quiet_regardless_of_hour(self, qh, monkeypatch):
        monkeypatch.setenv("BMO_QUIET_HOURS_ENABLED", "0")  # window off

        class _Scene:
            def get_active(self):
                return "bedtime"

        assert qh.is_quiet_now(scene_service=_Scene(), now_hour=14) is True
        assert qh.may_speak("notification", scene_service=_Scene(), now_hour=14) is False
        # Critical still bypasses even the bedtime scene.
        assert qh.may_speak("alarm", scene_service=_Scene(), now_hour=14) is True


class TestNotificationServiceGate:
    def _make_service(self, monkeypatch, quiet):
        import services.quiet_hours as m
        importlib.reload(m)
        monkeypatch.setattr(m, "may_speak", lambda *a, **k: not quiet)
        from services.notification_service import NotificationService

        spoken = []

        class _Voice:
            _scene_service = None

            def speak(self, text, **kw):
                spoken.append(text)

        svc = NotificationService(voice_pipeline=_Voice())
        svc._enabled = True
        return svc, spoken

    def test_night_notification_stored_but_not_spoken(self, monkeypatch):
        svc, spoken = self._make_service(monkeypatch, quiet=True)
        svc._handle_notification("Discord", "Ping", "hey", "phone", "dev", "n1")
        assert spoken == []                       # not announced
        assert any(n["title"] == "Ping" for n in svc._history)  # but stored

    def test_day_notification_is_spoken(self, monkeypatch):
        svc, spoken = self._make_service(monkeypatch, quiet=False)
        svc._handle_notification("Discord", "Ping", "hey", "phone", "dev", "n2")
        assert len(spoken) == 1
        assert any(n["title"] == "Ping" for n in svc._history)
