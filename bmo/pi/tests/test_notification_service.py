"""PHASE-10 10C — NotificationService.add_system_notification (feed mirror)."""

from services.notification_service import NotificationService


def _svc():
    n = NotificationService(voice_pipeline=None, socketio=None)
    n._history = []
    return n


def test_add_system_notification_inserts_into_feed():
    n = _svc()
    assert n.add_system_notification(
        key="health:google_calendar",
        title="📅 Google Calendar",
        body="Calendar token expired — re-authorize required",
        severity="critical",
    ) is True
    hist = n.get_history()
    assert len(hist) == 1
    assert hist[0]["key"] == "health:google_calendar"
    assert hist[0]["system"] is True
    assert hist[0]["read"] is False


def test_add_system_notification_dedupes_by_key():
    n = _svc()
    n.add_system_notification(key="health:svc_bmo", title="BMO", body="down", severity="critical")
    n.add_system_notification(key="health:svc_bmo", title="BMO", body="still down", severity="critical")
    hist = n.get_history()
    assert len(hist) == 1  # refreshed in place, not stacked
    assert hist[0]["body"] == "still down"


def test_distinct_keys_stack():
    n = _svc()
    n.add_system_notification(key="health:a", title="A", body="x", severity="warning")
    n.add_system_notification(key="health:b", title="B", body="y", severity="warning")
    assert len(n.get_history()) == 2
