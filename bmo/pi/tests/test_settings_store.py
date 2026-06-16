"""PHASE-16 16A — services/settings_store.py dotted get/set on data/settings.json."""

import os

from services import settings_store


def test_set_get_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "SETTINGS_PATH", str(tmp_path / "settings.json"))
    settings_store.save_setting("volume.music", 42)
    assert settings_store.load_setting("volume.music") == 42


def test_default_on_missing_key(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "SETTINGS_PATH", str(tmp_path / "settings.json"))
    settings_store.save_setting("volume.music", 42)
    assert settings_store.load_setting("volume.system", 25) == 25


def test_default_on_missing_file(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "SETTINGS_PATH", str(tmp_path / "nope.json"))
    assert settings_store.load_setting("anything", "fallback") == "fallback"


def test_nested_key_creation(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "SETTINGS_PATH", str(tmp_path / "settings.json"))
    settings_store.save_setting("a.b.c", "deep")
    settings_store.save_setting("a.b.d", "sibling")
    assert settings_store.load_setting("a.b.c") == "deep"
    assert settings_store.load_setting("a.b.d") == "sibling"  # sibling not clobbered


def test_settings_path_resolves_under_bmo_pi_data():
    # __file__ is bmo/pi/services/settings_store.py → path must be bmo/pi/data/settings.json.
    assert settings_store.SETTINGS_PATH.endswith(os.path.join("pi", "data", "settings.json"))
