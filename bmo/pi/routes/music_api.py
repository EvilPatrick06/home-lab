"""Music HTTP surface (/api/music/*).

Extracted from app.py 2026-06-10, PHASE-16 16D. The music service is resolved late via
`_music()` (so a failed init → None → AttributeError → Flask 500, the pre-extraction
behavior). Auto-unmute helpers come from services.voice.system_audio.
"""

import logging

from flask import Blueprint, jsonify, request

from services.bmo_logging import fail
from services.voice.system_audio import get_system_audio_state, unmute_sink

log = logging.getLogger("bmo")

music_bp = Blueprint("music", __name__, url_prefix="/api/music")


def _music():
    # app.py runs as __main__ (ExecStart: python app.py) and init_services() sets the
    # service singletons as __main__ globals. The route blueprints, though, reach this
    # module via `import app` — a SEPARATE module object whose `music` stays None, so
    # the HTTP endpoints would always 500. Prefer the live service from __main__,
    # falling back to app.music (which the test suite mocks; under pytest __main__ has
    # no `music`).
    import sys

    live = getattr(sys.modules.get("__main__"), "music", None)
    if live is not None:
        return live
    import app

    return app.music


@music_bp.before_request
def _require_music_service():
    # A failed service init leaves app.music = None; without this guard every route
    # would call a method on None → AttributeError → Flask 500 (the pre-extraction
    # behavior). Degrade to a clean JSON 503 so the dashboard shows "unavailable"
    # instead of spamming uncaught 500s.
    if _music() is None:
        return jsonify({"available": False, "error": "music service unavailable on this device"}), 503


@music_bp.route("/search")
def api_music_search():
    music = _music()
    query = request.args.get("q", "")
    if not query:
        return jsonify({"error": "No query"}), 400
    results = music.search(query)
    return jsonify(results)


@music_bp.route("/play", methods=["POST"])
def api_music_play():
    """Play a song or resume. Round 2 #2 (2026-05-17): returns the actual
    post-play state so callers can detect "ok=true but is_playing=false"
    failure modes (muted sink, no output device, VLC error).

    Round 2 L (2026-05-17): auto-unmute the sink before starting playback
    (user pressed play, intent is obvious). Opt out with {"no_unmute": true}
    in the body for the edge case where the user wants to queue silently."""
    music = _music()
    data = request.get_json(silent=True) or {}
    song = data.get("song")
    if not data.get("no_unmute"):
        unmute_sink()
    try:
        if song:
            music.play(song)
        else:
            music.play()  # Resume
    except Exception as e:
        return fail(log, e, 500, "music.play failed")
    # Read back state so the client doesn't have to poll separately to
    # detect silent-failure (audio sink muted, output device missing).
    try:
        state = music.get_state()
    except Exception:
        state = {}
    audio_state = get_system_audio_state()
    warning = None
    if audio_state["muted"]:
        warning = "system audio sink is muted — playback will be silent"
    elif state.get("is_playing") is False:
        warning = "playback did not start — check output device / VLC state"
    return jsonify({
        "ok": True,
        "is_playing": bool(state.get("is_playing")),
        "muted": audio_state["muted"],
        "volume": audio_state["volume"],
        "warning": warning,
    })


@music_bp.route("/play-queue", methods=["POST"])
def api_music_play_queue():
    """Play a queue of songs. Auto-unmutes sink (Round 2 L)."""
    music = _music()
    data = request.json or {}
    songs = data.get("songs", [])
    if not data.get("no_unmute"):
        unmute_sink()
    music.play_queue(songs)
    return jsonify({"ok": True})


@music_bp.route("/pause", methods=["POST"])
def api_music_pause():
    _music().pause()
    return jsonify({"ok": True})


@music_bp.route("/pause-only", methods=["POST"])
def api_music_pause_only():
    _music().pause_only()
    return jsonify({"ok": True})


@music_bp.route("/stop", methods=["POST"])
def api_music_stop():
    _music().stop()
    return jsonify({"ok": True})


@music_bp.route("/next", methods=["POST"])
def api_music_next():
    _music().next_track()
    return jsonify({"ok": True})


@music_bp.route("/previous", methods=["POST"])
def api_music_previous():
    _music().previous_track()
    return jsonify({"ok": True})


@music_bp.route("/seek", methods=["POST"])
def api_music_seek():
    data = request.json or {}
    _music().seek(data.get("position", 0))
    return jsonify({"ok": True})


@music_bp.route("/volume", methods=["POST"])
def api_music_volume():
    data = request.json or {}
    _music().set_volume(data.get("volume", data.get("level", 50)))
    return jsonify({"ok": True})


@music_bp.route("/state")
def api_music_state():
    return jsonify(_music().get_state())


@music_bp.route("/devices")
def api_music_devices():
    return jsonify(_music().get_devices())


@music_bp.route("/cast", methods=["POST"])
def api_music_cast():
    data = request.json or {}
    _music().set_output_device(data.get("device", "pi"))
    return jsonify({"ok": True})


@music_bp.route("/shuffle", methods=["POST"])
def api_music_shuffle():
    music = _music()
    music.shuffle = not music.shuffle
    return jsonify({"shuffle": music.shuffle})


@music_bp.route("/repeat", methods=["POST"])
def api_music_repeat():
    music = _music()
    cycle = {"off": "all", "all": "one", "one": "off"}
    music.repeat = cycle.get(music.repeat, "off")
    return jsonify({"repeat": music.repeat})


@music_bp.route("/autoplay", methods=["POST"])
def api_music_autoplay():
    music = _music()
    music.autoplay = not music.autoplay
    return jsonify({"autoplay": music.autoplay})


@music_bp.route("/queue/add", methods=["POST"])
def api_music_queue_add():
    music = _music()
    data = request.json or {}
    song = data.get("song")
    if not song:
        return jsonify({"error": "No song provided"}), 400
    music.add_to_queue(song)
    return jsonify({"ok": True, "queue_length": len(music.queue)})


@music_bp.route("/queue/remove", methods=["POST"])
def api_music_queue_remove():
    music = _music()
    data = request.json or {}
    index = data.get("index")
    if index is None:
        return jsonify({"error": "No index provided"}), 400
    if not music.remove_from_queue(index):
        return jsonify({"error": "Cannot remove that item"}), 400
    return jsonify({"ok": True, "queue_length": len(music.queue)})


@music_bp.route("/queue")
def api_music_queue():
    return jsonify(_music().get_queue())


@music_bp.route("/album/<browse_id>")
def api_music_album(browse_id):
    try:
        return jsonify(_music().get_album(browse_id))
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@music_bp.route("/playlist/<browse_id>")
def api_music_playlist(browse_id):
    try:
        return jsonify(_music().get_playlist(browse_id))
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@music_bp.route("/search/playlists")
def api_music_search_playlists():
    query = request.args.get("q", "")
    if not query:
        return jsonify([])
    try:
        return jsonify(_music().search_playlists(query))
    except Exception:
        log.exception("[music] Playlist search error")
        return jsonify([])


@music_bp.route("/history")
def api_music_history():
    return jsonify(_music().get_history())


@music_bp.route("/most-played")
def api_music_most_played():
    return jsonify(_music().get_most_played())


@music_bp.route("/lyrics/<video_id>")
def api_music_lyrics(video_id):
    try:
        return jsonify(_music().get_lyrics(video_id))
    except Exception:
        log.exception("lyrics fetch failed")
        return jsonify({"lyrics": None, "error": "lyrics unavailable"})


def register_music(flask_app):
    """Register the music blueprint. PHASE-16 16D."""
    flask_app.register_blueprint(music_bp)
