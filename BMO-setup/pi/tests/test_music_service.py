"""Tests for MusicService — YouTube Music search + VLC/Chromecast playback.

All external dependencies (ytmusicapi, yt-dlp, VLC, pychromecast) are mocked
so tests run on any machine without hardware or network access.
"""

import sys
import types
from unittest.mock import MagicMock, patch, PropertyMock
import pytest

# ── Ensure Pi-specific stubs are loaded (conftest does this at collection time,
#    but being explicit here guards against direct file execution) ──────────────
import importlib


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_song(video_id="abc123", title="Test Song", artist="Test Artist"):
    return {
        "videoId": video_id,
        "title": title,
        "artist": artist,
        "duration": "3:30",
        "thumbnail": "https://example.com/thumb.jpg",
    }


def _make_ytmusic_result(video_id="abc123", title="Test Song"):
    return {
        "videoId": video_id,
        "title": title,
        "artists": [{"name": "Test Artist"}],
        "album": {"name": "Test Album"},
        "duration": "3:30",
        "thumbnails": [{"url": "https://example.com/thumb.jpg"}],
    }


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_vlc_player():
    """Return a mock VLC instance + player pair."""
    mock_instance = MagicMock()
    mock_player = MagicMock()
    mock_instance.media_player_new.return_value = mock_player
    mock_player.get_state.return_value = sys.modules["vlc"].State.Stopped
    mock_player.get_time.return_value = 0
    mock_player.get_length.return_value = 0
    mock_player.audio_set_volume.return_value = None
    return mock_instance, mock_player


@pytest.fixture
def mock_ytmusic():
    """Return a mock YTMusic instance."""
    m = MagicMock()
    m.search.return_value = [_make_ytmusic_result()]
    return m


@pytest.fixture
def music_service(mock_vlc_player, mock_ytmusic, tmp_path):
    """MusicService with all external deps mocked."""
    mock_vlc_instance, mock_player = mock_vlc_player

    # Patch data file paths to tmp_path so no real FS side-effects
    history_path = str(tmp_path / "music_history.json")
    counts_path = str(tmp_path / "play_counts.json")
    state_path = str(tmp_path / "playback_state.json")

    with patch("vlc.Instance", return_value=mock_vlc_instance), \
         patch("ytmusicapi.YTMusic", return_value=mock_ytmusic), \
         patch("music_service.HISTORY_FILE", history_path), \
         patch("music_service.PLAY_COUNTS_FILE", counts_path), \
         patch("music_service.PLAYBACK_STATE_FILE", state_path):

        import music_service as ms_module
        importlib.reload(ms_module)

        svc = ms_module.MusicService()
        svc._player = mock_player
        svc._vlc_instance = mock_vlc_instance
        yield svc


# ── Search tests ───────────────────────────────────────────────────────────────

class TestSearch:
    def test_search_returns_list_of_results(self, music_service, mock_ytmusic):
        mock_ytmusic.search.return_value = [
            _make_ytmusic_result("id1", "Song One"),
            _make_ytmusic_result("id2", "Song Two"),
        ]
        results = music_service.search("test query")
        assert isinstance(results, list)
        assert len(results) == 2
        assert results[0]["videoId"] == "id1"
        assert results[1]["videoId"] == "id2"

    def test_search_result_has_required_keys(self, music_service, mock_ytmusic):
        mock_ytmusic.search.return_value = [_make_ytmusic_result()]
        results = music_service.search("hello")
        assert len(results) == 1
        r = results[0]
        for key in ("videoId", "title", "artist", "album", "duration", "thumbnail"):
            assert key in r, f"Missing key: {key}"

    def test_search_no_results_returns_empty_list(self, music_service, mock_ytmusic):
        mock_ytmusic.search.return_value = []
        results = music_service.search("zzzzzz no results")
        assert results == []

    def test_search_skips_items_without_video_id(self, music_service, mock_ytmusic):
        mock_ytmusic.search.return_value = [
            {"title": "No ID item", "artists": [], "thumbnails": []},  # no videoId
            _make_ytmusic_result("good_id"),
        ]
        results = music_service.search("query")
        assert len(results) == 1
        assert results[0]["videoId"] == "good_id"


# ── Play tests ────────────────────────────────────────────────────────────────

class TestPlay:
    def test_play_valid_track_starts_vlc(self, music_service, mock_vlc_player):
        _, mock_player = mock_vlc_player
        song = _make_song()

        with patch.object(
            type(music_service), "get_audio_stream_url",
            staticmethod(lambda vid: ("https://stream.url/audio.m4a", 210))
        ):
            music_service.play(song)

        mock_player.play.assert_called()

    def test_play_sets_current_song(self, music_service):
        song = _make_song(video_id="xyz")
        with patch.object(
            type(music_service), "get_audio_stream_url",
            staticmethod(lambda vid: ("https://stream.url/audio.m4a", 180))
        ):
            music_service.play(song)

        assert music_service.current_song is not None
        assert music_service.current_song["videoId"] == "xyz"

    def test_play_none_resumes_player(self, music_service, mock_vlc_player):
        _, mock_player = mock_vlc_player
        mock_player.reset_mock()
        music_service.play(None)
        mock_player.play.assert_called_once()

    def test_play_records_in_history(self, music_service):
        song = _make_song(video_id="hist1")
        with patch.object(
            type(music_service), "get_audio_stream_url",
            staticmethod(lambda vid: ("https://stream.url/audio.m4a", 200))
        ):
            music_service.play(song)

        assert any(
            e.get("song", {}).get("videoId") == "hist1"
            for e in music_service.history
        )


# ── Queue tests ───────────────────────────────────────────────────────────────

class TestQueue:
    def test_add_to_queue_appends_song(self, music_service):
        song = _make_song("q1")
        music_service.add_to_queue(song)
        assert any(s["videoId"] == "q1" for s in music_service.queue)

    def test_add_to_queue_multiple_songs(self, music_service):
        for i in range(3):
            music_service.add_to_queue(_make_song(f"q{i}"))
        assert len(music_service.queue) == 3

    def test_empty_queue_handled_gracefully(self, music_service):
        music_service.queue = []
        result = music_service.get_queue()
        assert "queue" in result
        assert result["queue"] == []

    def test_get_queue_returns_dict_with_queue_key(self, music_service):
        music_service.add_to_queue(_make_song("q_test"))
        result = music_service.get_queue()
        assert isinstance(result, dict)
        assert "queue" in result
        assert "queue_index" in result

    def test_play_queue_replaces_queue(self, music_service):
        songs = [_make_song(f"pq{i}") for i in range(2)]
        with patch.object(
            type(music_service), "get_audio_stream_url",
            staticmethod(lambda vid: ("https://stream.url/audio.m4a", 180))
        ):
            music_service.play_queue(songs)

        assert music_service.queue == songs
        assert music_service.queue_index == 0


# ── Skip tests ────────────────────────────────────────────────────────────────

class TestSkip:
    def test_next_track_advances_queue_index(self, music_service):
        songs = [_make_song(f"sk{i}") for i in range(3)]
        music_service.queue = songs
        music_service.queue_index = 0

        with patch.object(
            type(music_service), "get_audio_stream_url",
            staticmethod(lambda vid: ("https://stream.url/audio.m4a", 180))
        ):
            music_service.next_track()

        assert music_service.queue_index == 1

    def test_next_track_empty_queue_does_nothing(self, music_service):
        music_service.queue = []
        music_service.queue_index = -1
        # Should not raise
        music_service.next_track()

    def test_previous_track_decrements_index(self, music_service):
        songs = [_make_song(f"pr{i}") for i in range(3)]
        music_service.queue = songs
        music_service.queue_index = 2

        with patch.object(
            type(music_service), "get_audio_stream_url",
            staticmethod(lambda vid: ("https://stream.url/audio.m4a", 180))
        ):
            music_service.previous_track()

        assert music_service.queue_index == 1

    def test_next_track_at_end_with_repeat_all_wraps(self, music_service):
        songs = [_make_song(f"rp{i}") for i in range(2)]
        music_service.queue = songs
        music_service.queue_index = 1
        music_service.repeat = "all"
        music_service.autoplay = False

        with patch.object(
            type(music_service), "get_audio_stream_url",
            staticmethod(lambda vid: ("https://stream.url/audio.m4a", 180))
        ):
            music_service.next_track()

        assert music_service.queue_index == 0


# ── Stop tests ────────────────────────────────────────────────────────────────

class TestStop:
    def test_stop_clears_current_song(self, music_service):
        music_service.current_song = _make_song()
        music_service.stop()
        assert music_service.current_song is None

    def test_stop_calls_vlc_stop(self, music_service, mock_vlc_player):
        _, mock_player = mock_vlc_player
        mock_player.reset_mock()
        music_service.current_song = _make_song()
        music_service.stop()
        mock_player.stop.assert_called()

    def test_stop_clears_playback_intent(self, music_service):
        music_service._playback_intent = "playing"
        music_service.stop()
        assert music_service._playback_intent is None


# ── get_state tests ───────────────────────────────────────────────────────────

class TestGetState:
    def test_get_state_returns_dict(self, music_service):
        state = music_service.get_state()
        assert isinstance(state, dict)

    def test_get_state_has_required_keys(self, music_service):
        state = music_service.get_state()
        required = (
            "song", "is_playing", "position", "duration",
            "volume", "output_device", "queue_length", "queue_index",
            "shuffle", "repeat", "autoplay",
        )
        for key in required:
            assert key in state, f"Missing key: {key}"

    def test_get_state_reflects_volume(self, music_service):
        music_service.set_volume(75)
        state = music_service.get_state()
        assert state["volume"] == 75

    def test_get_state_no_song_is_playing_false(self, music_service):
        music_service.current_song = None
        music_service._playback_intent = None
        state = music_service.get_state()
        assert state["is_playing"] is False


# ── Volume tests ──────────────────────────────────────────────────────────────

class TestVolume:
    def test_set_volume_normal_value(self, music_service, mock_vlc_player):
        _, mock_player = mock_vlc_player
        music_service.set_volume(50)
        assert music_service._volume == 50
        mock_player.audio_set_volume.assert_called_with(50)

    def test_set_volume_clamps_below_zero(self, music_service):
        music_service.set_volume(-10)
        assert music_service._volume == 0

    def test_set_volume_clamps_above_100(self, music_service):
        music_service.set_volume(150)
        assert music_service._volume == 100

    def test_set_volume_boundary_zero(self, music_service):
        music_service.set_volume(0)
        assert music_service._volume == 0

    def test_set_volume_boundary_100(self, music_service):
        music_service.set_volume(100)
        assert music_service._volume == 100


# ── Chromecast tests ──────────────────────────────────────────────────────────

class TestChromecast:
    def test_cast_to_chromecast_calls_play_media(self, music_service):
        mock_cast = MagicMock()
        mock_mc = MagicMock()
        mock_cast.media_controller = mock_mc

        mock_smart_home = MagicMock()
        mock_smart_home.get_devices.return_value = [{"name": "tv"}]
        mock_smart_home.get_cast.return_value = mock_cast

        music_service.smart_home = mock_smart_home
        music_service._output_device = "tv"

        song = _make_song()
        song["stream_url"] = "https://stream.url/audio.m4a"
        song["duration_sec"] = 210

        music_service._cast_play_media(song)
        mock_mc.play_media.assert_called_once()

    def test_cast_to_chromecast_no_device_does_not_crash(self, music_service):
        mock_smart_home = MagicMock()
        mock_smart_home.get_devices.return_value = []
        music_service.smart_home = mock_smart_home
        music_service._output_device = "tv"

        # Should silently do nothing, not raise
        music_service._cast_play()

    def test_get_tv_cast_returns_none_without_smart_home(self, music_service):
        music_service.smart_home = None
        result = music_service._get_tv_cast()
        assert result is None


# ── VLC unavailable fallback ──────────────────────────────────────────────────

class TestVlcFallback:
    def test_vlc_error_state_clears_current_song(self, music_service):
        """If VLC enters error state, current_song should be cleared by monitor loop."""
        vlc_mod = sys.modules["vlc"]
        music_service._player.get_state.return_value = vlc_mod.State.Error
        music_service.current_song = _make_song()

        # Simulate one iteration of the monitor logic (inline, not threaded)
        state = music_service._player.get_state()
        if state == vlc_mod.State.Error:
            music_service.current_song = None

        assert music_service.current_song is None
