"""routes/rclone_api.py — D&D VTT cloud-backup HTTP API.

The dnd-app cannot store Google Drive credentials, so campaign backups go
through the Pi: the app uploads a gzip archive of one campaign's data, BMO
stages it and `rclone copyto`s it to
`<remote>:DND-VTT-Backups/<campaignId>/campaign.tar.gz`; restore streams it back
for the app to unpack. rclone + the `gdrive:` remote already live on the Pi (the
same remote BMO's own 3 AM backup uses, but a separate top-level folder).

Routes (all under /api/rclone):
- GET  /status                  → {configured, remotes, version, error}
- GET  /list                    → {ok, campaigns: [{id, size, modified}]}
- POST /backup   (multipart)    → upload + push one campaign archive
- GET  /restore?campaignId=     → stream that campaign's archive back

Why purpose-built routes (not a generic "run rclone" endpoint): the only
operations exposed are copyto-into / copyto-out-of a slug-validated per-campaign
path under one fixed backup folder, plus listremotes/version/lsjson. rclone is
invoked with a FIXED argv via subprocess (no shell), so there is no command- or
path-injection surface. The upload body cap is raised for the /backup route only
(BMO_MAX_BACKUP_SIZE, default 512 MiB) via Werkzeug's per-request
max_content_length, leaving the app-wide 32 MiB OOM guard intact everywhere else.

Auth/exposure mirrors the rest of the BMO API: LAN-open, and off-LAN gated by
the Cloudflare Access service token (validated at the tunnel; cloudflared dials
localhost so the request is trusted-localhost to BMO's optional API-key gate).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from collections.abc import Iterator

from flask import Blueprint, Response, jsonify, request

from services.bmo_logging import _s, fail, get_logger

log = get_logger("rclone_api")

rclone_bp = Blueprint("rclone", __name__, url_prefix="/api/rclone")

# The rclone remote + top-level folder campaign backups live under. The remote
# is overridable for tests / alternate configs; the folder is fixed so the
# slug-validated campaign id is the only client-controlled path segment.
REMOTE = os.environ.get("BMO_VTT_BACKUP_REMOTE", "gdrive")
BACKUP_ROOT = "DND-VTT-Backups"
ARCHIVE_NAME = "campaign.tar.gz"

# Campaign ids are uuids / slugs — letters, digits, dash, underscore only. This
# is the ONLY client-controlled path segment, so it must reject `.`/`/` (no
# traversal) and stay bounded.
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

# Body cap for /backup only (Werkzeug 3.1 per-request override). Archives carry
# a campaign's JSON + assets, which can exceed the app-wide 32 MiB guard.
MAX_BACKUP_BYTES = int(os.environ.get("BMO_MAX_BACKUP_SIZE", str(512 * 1024 * 1024)))
# rclone transfer timeout (copyto can be slow for large archives over the
# upstream link); the status/list probes get a short ceiling.
RCLONE_TIMEOUT = int(os.environ.get("BMO_RCLONE_TIMEOUT", "300"))
STATUS_TIMEOUT = 15

# Injectable for tests so the suite never shells out to a real rclone.
_runner = None  # type: ignore[var-annotated]


def _rclone(args: list[str], timeout: int) -> tuple[int, str, str]:
    """Run `rclone <args>` with a FIXED argv (no shell). Returns (rc, out, err)."""
    if _runner is not None:
        return _runner(args, timeout)
    try:
        proc = subprocess.run(
            ["rclone", *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return proc.returncode, proc.stdout, proc.stderr
    except FileNotFoundError:
        return 127, "", "rclone not installed"
    except subprocess.TimeoutExpired:
        return 124, "", f"rclone timed out after {timeout}s"


def _valid_id(cid: str) -> bool:
    return bool(_ID_RE.match(cid or ""))


def _remote_path(cid: str) -> str:
    return f"{REMOTE}:{BACKUP_ROOT}/{cid}/{ARCHIVE_NAME}"


@rclone_bp.route("/status", methods=["GET"])
def rclone_status() -> Response:
    """Is rclone configured with the backup remote? (drives the app's 'Check
    Status' button)."""
    rc, out, err = _rclone(["listremotes"], STATUS_TIMEOUT)
    if rc != 0:
        return jsonify(
            {"configured": False, "remotes": [], "error": err.strip() or f"rclone exit {rc}"}
        )
    remotes = [r.strip().rstrip(":") for r in out.splitlines() if r.strip()]
    vrc, vout, _ = _rclone(["version"], STATUS_TIMEOUT)
    version = vout.splitlines()[0].strip() if vrc == 0 and vout else None
    configured = REMOTE in remotes
    return jsonify(
        {
            "configured": configured,
            "remotes": remotes,
            "version": version,
            "error": None if configured else f"remote '{REMOTE}' not configured on the Pi",
        }
    )


@rclone_bp.route("/list", methods=["GET"])
def rclone_list():
    """List campaigns that have a backup on the remote."""
    rc, out, err = _rclone(["lsjson", "--dirs-only", f"{REMOTE}:{BACKUP_ROOT}"], RCLONE_TIMEOUT)
    if rc != 0:
        low = err.lower()
        # The backup folder doesn't exist until the first backup — that's an
        # empty list, not an error.
        if "directory not found" in low or "not found" in low:
            return jsonify({"ok": True, "campaigns": []})
        return jsonify({"ok": False, "campaigns": [], "error": err.strip() or f"rclone exit {rc}"}), 502
    try:
        entries = json.loads(out or "[]")
    except json.JSONDecodeError:
        entries = []
    campaigns = [
        {"id": e.get("Name"), "size": e.get("Size", -1), "modified": e.get("ModTime")}
        for e in entries
        if isinstance(e, dict) and _valid_id(e.get("Name", ""))
    ]
    return jsonify({"ok": True, "campaigns": campaigns})


@rclone_bp.route("/backup", methods=["POST"])
def rclone_backup():
    """Receive one campaign's gzip archive and push it to the remote."""
    # Raise the body cap for THIS request only; the app-wide 32 MiB guard stays.
    request.max_content_length = MAX_BACKUP_BYTES
    cid = (request.form.get("campaign_id") or request.args.get("campaignId") or "").strip()
    if not _valid_id(cid):
        return jsonify({"ok": False, "error": "invalid or missing campaign_id"}), 400
    archive = request.files.get("archive")
    if archive is None:
        return jsonify({"ok": False, "error": "missing 'archive' file part"}), 400
    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(prefix=f"vttbk_{cid}_", suffix=".tar.gz")
        os.close(fd)
        archive.save(tmp)  # Werkzeug spooled the upload to disk; copy to a known path.
        size = os.path.getsize(tmp)
        rc, _out, err = _rclone(["copyto", tmp, _remote_path(cid)], RCLONE_TIMEOUT)
        if rc != 0:
            log.warning("[rclone] backup of %s failed: %s", _s(cid), _s(err.strip()))
            return jsonify({"ok": False, "error": err.strip() or f"rclone exit {rc}"}), 502
        log.info("[rclone] backed up campaign %s (%d bytes)", _s(cid), size)
        return jsonify({"ok": True, "campaignId": cid, "bytes": size})
    except OSError as e:
        log.warning("[rclone] backup of %s errored", _s(cid))
        return fail(log, e, 500)
    finally:
        if tmp and os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


@rclone_bp.route("/restore", methods=["GET"])
def rclone_restore():
    """Pull one campaign's archive from the remote and stream it back."""
    cid = (request.args.get("campaignId") or request.args.get("campaign_id") or "").strip()
    if not _valid_id(cid):
        return jsonify({"ok": False, "error": "invalid or missing campaignId"}), 400
    fd, tmp = tempfile.mkstemp(prefix=f"vttrs_{cid}_", suffix=".tar.gz")
    os.close(fd)
    rc, _out, err = _rclone(["copyto", _remote_path(cid), tmp], RCLONE_TIMEOUT)
    if rc != 0:
        try:
            os.remove(tmp)
        except OSError:
            pass
        low = err.lower()
        if "not found" in low:  # object/directory not found = no backup yet
            return jsonify({"ok": False, "error": "no backup found for this campaign"}), 404
        return jsonify({"ok": False, "error": err.strip() or f"rclone exit {rc}"}), 502

    try:
        size = os.path.getsize(tmp)
    except OSError:
        size = None

    def _stream_and_cleanup() -> Iterator[bytes]:
        # Stream from disk in chunks (bounded memory) and delete the temp file
        # once fully sent — reliable cleanup without the send_file/after-request
        # ordering gotcha on streamed responses.
        try:
            with open(tmp, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    yield chunk
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass

    headers = {"Content-Disposition": f'attachment; filename="{cid}.tar.gz"'}
    if size is not None:
        headers["Content-Length"] = str(size)
    return Response(_stream_and_cleanup(), mimetype="application/gzip", headers=headers)


def register_rclone(flask_app, runner=None) -> None:
    """Wire the cloud-backup blueprint into the Flask app. `runner` overrides the
    rclone subprocess shim (tests inject a fake; production uses real rclone)."""
    global _runner
    _runner = runner
    flask_app.register_blueprint(rclone_bp)


def reset_rclone_for_tests() -> None:
    """Test-only — drop the injected runner."""
    global _runner
    _runner = None
