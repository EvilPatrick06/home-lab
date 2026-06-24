"""PHASE-01 01A — ListService resolves items by id (dashboard) and text (voice)."""

import pytest

from services import list_service
from services.list_service import ListService


@pytest.fixture()
def svc(tmp_path, monkeypatch):
    monkeypatch.setattr(list_service, "DATA_DIR", str(tmp_path), raising=False)
    monkeypatch.setattr(list_service, "LISTS_FILE", str(tmp_path / "lists.json"), raising=False)
    return ListService()


def test_check_and_remove_by_id(svc):
    item = svc.add_item("groceries", "milk")
    item_id = item["id"]
    # dashboard addresses items by id
    assert svc.check_item("groceries", item_id, done=True) is True
    assert svc.get_all_lists()["groceries"]["items"][0]["done"] is True
    assert svc.remove_item("groceries", item_id) is True
    assert svc.get_all_lists()["groceries"]["items"] == []


def test_text_fallback_preserved(svc):
    svc.add_item("todo", "buy eggs")
    # voice passes spoken text — exact and substring both still resolve
    assert svc.check_item("todo", "buy eggs", done=True) is True
    assert svc.get_all_lists()["todo"]["items"][0]["done"] is True
    assert svc.check_item("todo", "eggs", done=False) is True
    assert svc.get_all_lists()["todo"]["items"][0]["done"] is False


def test_not_found_returns_false(svc):
    svc.add_item("todo", "buy eggs")
    assert svc.check_item("todo", "deadbeef") is False
    assert svc.remove_item("todo", "deadbeef") is False
    assert svc.check_item("nope", "anything") is False
    assert svc.remove_item("nope", "anything") is False


def test_id_match_takes_priority_over_text(svc):
    a = svc.add_item("l", "apple")
    svc.add_item("l", a["id"])  # an item whose TEXT equals another item id
    # resolving by the id must hit the id-owner, not the text-collision item
    assert svc.remove_item("l", a["id"]) is True
    remaining = svc.get_all_lists()["l"]["items"]
    assert len(remaining) == 1
    assert remaining[0]["text"] == a["id"]
