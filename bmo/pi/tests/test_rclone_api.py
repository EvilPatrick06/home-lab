"""Unit tests for routes.rclone_api — the D&D VTT cloud-backup API.

The rclone subprocess is replaced with an injected fake runner, so the suite
never shells out. Covers status/list parsing, the empty-folder case, campaign-id
validation (incl. path-traversal rejection), the backup upload → copyto path,
and the restore stream + 404.
"""

from __future__ import annotations

import io
import json

import pytest
from flask import Flask

from routes.rclone_api import register_rclone, reset_rclone_for_tests


def make_client(runner):
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_rclone(app, runner=runner)
    return app.test_client()


@pytest.fixture(autouse=True)
def _reset():
    yield
    reset_rclone_for_tests()


# --- status -----------------------------------------------------------------


def test_status_configured_when_remote_present():
    def runner(args, timeout):
        if args[0] == "listremotes":
            return 0, "gdrive:\nother:\n", ""
        if args[0] == "version":
            return 0, "rclone v1.60.1\n- os/version: debian\n", ""
        return 1, "", "unexpected"

    r = make_client(runner).get("/api/rclone/status")
    assert r.status_code == 200
    data = r.get_json()
    assert data["configured"] is True
    assert "gdrive" in data["remotes"]
    assert data["version"] == "rclone v1.60.1"
    assert data["error"] is None


def test_status_not_configured_when_remote_absent():
    def runner(args, timeout):
        if args[0] == "listremotes":
            return 0, "other:\n", ""
        return 0, "rclone v1.60.1\n", ""

    data = make_client(runner).get("/api/rclone/status").get_json()
    assert data["configured"] is False
    assert "not configured" in data["error"]


def test_status_handles_rclone_missing():
    def runner(args, timeout):
        return 127, "", "rclone not installed"

    data = make_client(runner).get("/api/rclone/status").get_json()
    assert data["configured"] is False
    assert "not installed" in data["error"]


# --- list -------------------------------------------------------------------


def test_list_parses_dirs_and_filters_bad_ids():
    def runner(args, timeout):
        assert args[0] == "lsjson"
        out = json.dumps(
            [
                {"Name": "camp-123", "Size": -1, "ModTime": "2026-05-31T00:00:00Z"},
                {"Name": "../evil", "Size": -1, "ModTime": "x"},  # filtered out
                {"Name": "abc_DEF", "Size": -1, "ModTime": "y"},
            ]
        )
        return 0, out, ""

    data = make_client(runner).get("/api/rclone/list").get_json()
    assert data["ok"] is True
    ids = {c["id"] for c in data["campaigns"]}
    assert ids == {"camp-123", "abc_DEF"}


def test_list_empty_when_folder_missing():
    def runner(args, timeout):
        return 3, "", "directory not found"

    data = make_client(runner).get("/api/rclone/list").get_json()
    assert data["ok"] is True
    assert data["campaigns"] == []


# --- backup -----------------------------------------------------------------


def test_backup_rejects_invalid_id():
    client = make_client(lambda a, t: (0, "", ""))
    r = client.post(
        "/api/rclone/backup",
        data={"campaign_id": "../../etc/passwd", "archive": (io.BytesIO(b"x"), "c.tar.gz")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 400
    assert "invalid" in r.get_json()["error"]


def test_backup_requires_archive_part():
    client = make_client(lambda a, t: (0, "", ""))
    r = client.post(
        "/api/rclone/backup", data={"campaign_id": "camp-1"}, content_type="multipart/form-data"
    )
    assert r.status_code == 400
    assert "archive" in r.get_json()["error"]


def test_backup_uploads_and_copies_to_remote():
    calls = []

    def runner(args, timeout):
        calls.append(args)
        return 0, "", ""

    client = make_client(runner)
    r = client.post(
        "/api/rclone/backup",
        data={"campaign_id": "camp-1", "archive": (io.BytesIO(b"hello-archive"), "c.tar.gz")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 200
    body = r.get_json()
    assert body["ok"] is True and body["campaignId"] == "camp-1"
    assert body["bytes"] == len(b"hello-archive")
    # rclone was called copyto <localtmp> gdrive:DND-VTT-Backups/camp-1/campaign.tar.gz
    copyto = [c for c in calls if c[0] == "copyto"]
    assert len(copyto) == 1
    assert copyto[0][2] == "gdrive:DND-VTT-Backups/camp-1/campaign.tar.gz"


def test_backup_reports_rclone_failure():
    def runner(args, timeout):
        return 1, "", "quota exceeded"

    client = make_client(runner)
    r = client.post(
        "/api/rclone/backup",
        data={"campaign_id": "camp-1", "archive": (io.BytesIO(b"x"), "c.tar.gz")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 502
    assert "quota" in r.get_json()["error"]


# --- restore ----------------------------------------------------------------


def test_restore_rejects_invalid_id():
    r = make_client(lambda a, t: (0, "", "")).get("/api/rclone/restore?campaignId=bad/id")
    assert r.status_code == 400


def test_restore_404_when_no_backup():
    def runner(args, timeout):
        return 3, "", "directory not found"

    r = make_client(runner).get("/api/rclone/restore?campaignId=camp-1")
    assert r.status_code == 404


def test_restore_streams_archive_bytes():
    def runner(args, timeout):
        # copyto gdrive:.../campaign.tar.gz <localtmp> — simulate the pull by
        # writing canned bytes to the local destination.
        if args[0] == "copyto" and args[1].startswith("gdrive:"):
            with open(args[2], "wb") as f:
                f.write(b"restored-bytes")
            return 0, "", ""
        return 1, "", "unexpected"

    r = make_client(runner).get("/api/rclone/restore?campaignId=camp-1")
    assert r.status_code == 200
    assert r.mimetype == "application/gzip"
    assert r.data == b"restored-bytes"
    assert "camp-1.tar.gz" in r.headers.get("Content-Disposition", "")
