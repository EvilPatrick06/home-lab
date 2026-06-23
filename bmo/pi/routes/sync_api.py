"""routes/sync_api.py — per-user cloud-sync HTTP API (the account sync hub).

All routes require a valid account bearer token (services.auth_guard.require_user);
the user id is derived from the verified JWT (``g.bmo_claims['sub']``) — NEVER
from the request — so users are isolated by construction.

Routes (under /api/sync):
- GET    /manifest                 → {objects: [{domain,id,hash,version,mtime,size,deleted}]}
- GET    /object?domain=&id=       → the entity blob (octet-stream) + X-Sync-* headers
- POST   /object  (multipart)      → store a blob (LWW by version); enforces quota + size
- DELETE /object?domain=&id=&version= → tombstone the entity (LWW by version)

Storage + conflict resolution live in services.sync_store; the durable Drive
mirror is debounced in services.sync_mirror.
"""

from __future__ import annotations

import os

from flask import Blueprint, Response, g, jsonify, request

from services import accounts, sync_mirror, sync_store
from services.auth_guard import require_user
from services.bmo_logging import _s, get_logger

log = get_logger("sync_api")

sync_bp = Blueprint("sync", __name__, url_prefix="/api/sync")

# Per-entity body cap (raised for the /object POST only, like the rclone backup
# route); the app-wide 32 MiB guard stays everywhere else.
MAX_ENTITY_BYTES = int(os.environ.get("BMO_SYNC_MAX_ENTITY", str(64 * 1024 * 1024)))


def _uid() -> str:
    return str(g.bmo_claims.get("sub"))


def _bad(msg: str, code: int = 400):
    return jsonify({"ok": False, "error": msg}), code


@sync_bp.route("/manifest", methods=["GET"])
@require_user
def manifest():
    return jsonify({"objects": sync_store.get_manifest(_uid())})


@sync_bp.route("/object", methods=["GET"])
@require_user
def get_object():
    domain = request.args.get("domain", "")
    entity_id = request.args.get("id", "")
    if not sync_store.valid_domain(domain) or not sync_store.valid_entity_id(entity_id):
        return _bad("invalid domain or id")
    meta = sync_store.get_meta(_uid(), domain, entity_id)
    if not meta or meta["deleted"]:
        return _bad("not found", 404)
    blob = sync_store.get_blob(_uid(), domain, entity_id)
    if blob is None:
        return _bad("not found", 404)
    return Response(
        blob,
        mimetype="application/octet-stream",
        headers={
            "X-Sync-Version": str(meta["version"]),
            "X-Sync-Hash": meta["hash"] or "",
            "X-Sync-Mtime": str(meta["mtime"]),
        },
    )


@sync_bp.route("/object", methods=["POST"])
@require_user
def put_object():
    # Raise the body cap for THIS request only.
    request.max_content_length = MAX_ENTITY_BYTES + 1024 * 1024
    domain = (request.form.get("domain") or "").strip()
    entity_id = request.form.get("id") or ""
    if not sync_store.valid_domain(domain) or not sync_store.valid_entity_id(entity_id):
        return _bad("invalid domain or id")
    try:
        version = int(request.form.get("version", "0"))
        mtime = float(request.form.get("mtime", "0"))
    except (TypeError, ValueError):
        return _bad("invalid version/mtime")
    content_hash = request.form.get("hash") or None
    f = request.files.get("blob")
    if f is None:
        return _bad("missing 'blob' file part")
    blob = f.read()
    if len(blob) > MAX_ENTITY_BYTES:
        return _bad("entity too large", 413)

    user = g.bmo_user
    existing = sync_store.get_meta(_uid(), domain, entity_id)
    old_size = existing["size"] if existing and not existing["deleted"] else 0
    projected = int(user["used_bytes"]) - int(old_size) + len(blob)
    if projected > int(user["quota_bytes"]):
        return jsonify(
            {"ok": False, "error": "quota_exceeded", "quota_bytes": user["quota_bytes"], "used_bytes": user["used_bytes"]}
        ), 413

    res = sync_store.put_object(_uid(), domain, entity_id, version, mtime, content_hash, blob)
    if res["accepted"]:
        accounts.add_used_bytes(_uid(), res["delta"])
        sync_mirror.schedule(_uid())
        log.info("[sync] put %s/%s v%d (%d bytes) user=%s", _s(domain), _s(entity_id), version, len(blob), _s(_uid()))
    return jsonify({"ok": True, "accepted": res["accepted"], "winner": res["winner"]})


@sync_bp.route("/object", methods=["DELETE"])
@require_user
def delete_object():
    domain = (request.args.get("domain") or "").strip()
    entity_id = request.args.get("id") or ""
    if not sync_store.valid_domain(domain) or not sync_store.valid_entity_id(entity_id):
        return _bad("invalid domain or id")
    try:
        version = int(request.args.get("version", "0"))
    except (TypeError, ValueError):
        return _bad("invalid version")
    res = sync_store.delete_object(_uid(), domain, entity_id, version)
    if res["accepted"]:
        accounts.add_used_bytes(_uid(), res["delta"])
        sync_mirror.schedule(_uid())
    return jsonify({"ok": True, "accepted": res["accepted"], "winner": res["winner"]})


def register_sync(
    flask_app, *, base_dir: str | None = None, db_path: str | None = None, mirror_enabled: bool = True, mirror_runner=None
) -> None:
    """Mount the sync blueprint. Tests pass throwaway paths + disable the mirror."""
    if base_dir is not None or db_path is not None:
        sync_store.configure(base_dir=base_dir, db_path=db_path)
    sync_mirror.configure(enabled=mirror_enabled, runner=mirror_runner)
    flask_app.register_blueprint(sync_bp)
