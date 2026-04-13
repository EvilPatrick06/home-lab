import unittest
from unittest.mock import MagicMock, patch

import vlc

from music_service import MusicService


class MusicRestoreBehaviorTests(unittest.TestCase):
    def _build_service(self, state):
        svc = MusicService.__new__(MusicService)
        svc._pending_restore = state
        svc.queue = []
        svc.queue_index = -1
        svc.current_song = None
        svc.shuffle = False
        svc.repeat = "off"
        svc.autoplay = True
        svc._output_device = "pi"
        svc._player = MagicMock()
        svc._player.get_state.return_value = vlc.State.Playing
        svc._player.get_time.return_value = 42000
        svc._playback_state_save_interval_sec = 5.0
        svc._last_playback_state_save_ts = 0.0
        svc._playback_intent = None
        svc._emit_state = MagicMock()
        svc._cast_pause = MagicMock()
        svc._cast_seek = MagicMock()
        svc._get_tv_cast = MagicMock(return_value=None)
        svc._restore_seek_position = MagicMock()
        svc._force_pause_after_restore = MagicMock()
        svc.play = MagicMock()
        svc.seek = MagicMock()
        svc._save_playback_state = MagicMock()
        return svc

    def test_restore_keeps_paused_state(self):
        queue = [{"videoId": "abc", "title": "Song", "duration_sec": 240}]
        state = {
            "queue": queue,
            "queue_index": 0,
            "was_paused": True,
            "was_playing": False,
            "position_sec": 37.5,
            "shuffle": True,
            "repeat": "all",
            "autoplay": False,
        }
        svc = self._build_service(state)

        svc.restore_playback()

        svc.play.assert_called_once_with(queue[0], add_to_queue=False)
        svc._restore_seek_position.assert_called_once_with(37.5)
        svc._force_pause_after_restore.assert_called_once()
        svc._save_playback_state.assert_called_once()
        self.assertEqual(svc.queue, queue)
        self.assertEqual(svc.queue_index, 0)
        self.assertTrue(svc.shuffle)
        self.assertEqual(svc.repeat, "all")
        self.assertFalse(svc.autoplay)

    def test_restore_playing_does_not_force_pause(self):
        queue = [{"videoId": "abc", "title": "Song", "duration_sec": 240}]
        state = {
            "queue": queue,
            "queue_index": 0,
            "was_paused": False,
            "was_playing": True,
            "position_sec": 12.0,
        }
        svc = self._build_service(state)

        svc.restore_playback()

        svc.play.assert_called_once_with(queue[0], add_to_queue=False)
        svc._restore_seek_position.assert_called_once_with(12.0)
        svc._force_pause_after_restore.assert_not_called()

    def test_restore_clamps_seek_to_duration(self):
        queue = [{"videoId": "abc", "title": "Song", "duration_sec": 200}]
        state = {
            "queue": queue,
            "queue_index": 0,
            "was_paused": False,
            "was_playing": True,
            "position_sec": 999.0,
        }
        svc = self._build_service(state)

        svc.restore_playback()

        svc._restore_seek_position.assert_called_once_with(199.0)

    @patch("music_service.time.sleep")
    @patch("music_service.time.time", side_effect=[0.0, 0.2, 0.4, 0.6, 0.8, 5.0, 16.0])
    def test_restore_seek_position_retries_until_target(self, _mock_time, _mock_sleep):
        svc = MusicService.__new__(MusicService)
        svc._output_device = "pi"
        svc._emit_state = MagicMock()
        svc._cast_seek = MagicMock()
        svc._player = MagicMock()
        svc._player.get_state.return_value = vlc.State.Playing
        svc._player.get_length.side_effect = [0, 0, 300000, 300000, 300000]
        svc._player.get_time.side_effect = [0, 0, 118500]

        svc._restore_seek_position(120.0)

        self.assertGreaterEqual(svc._player.set_time.call_count, 3)
        svc._cast_seek.assert_not_called()
        svc._emit_state.assert_called_once()

    @patch("music_service.time.time", return_value=1700000000.0)
    @patch("music_service.os.makedirs")
    @patch("music_service.json.dump")
    @patch("builtins.open", new_callable=unittest.mock.mock_open)
    def test_save_playback_state_persists_position_and_flags(self, _open_mock, _json_dump, _makedirs, _time_mock):
        svc = MusicService.__new__(MusicService)
        svc.queue = [{"videoId": "abc", "title": "Song", "stream_url": "temp"}]
        svc.queue_index = 0
        svc.shuffle = False
        svc.repeat = "off"
        svc.autoplay = True
        svc.current_song = svc.queue[0]
        svc._output_device = "pi"
        svc._player = MagicMock()
        svc._player.get_state.return_value = vlc.State.Paused
        svc._player.get_time.return_value = 90500
        svc._get_tv_cast = MagicMock(return_value=None)
        svc._playback_intent = None

        captured = {}

        def _capture(obj, _fh):
            captured.update(obj)

        _json_dump.side_effect = _capture

        svc._save_playback_state()

        self.assertEqual(captured["queue"][0]["videoId"], "abc")
        self.assertNotIn("stream_url", captured["queue"][0])
        self.assertEqual(captured["position_sec"], 90.5)
        self.assertEqual(captured["was_paused"], True)
        self.assertEqual(captured["was_playing"], False)
        self.assertEqual(captured["saved_at"], 1700000000.0)

    def test_pause_only_forces_pause_and_saves(self):
        svc = MusicService.__new__(MusicService)
        svc._output_device = "pi"
        svc._player = MagicMock()
        svc._cast_pause = MagicMock()
        svc._save_playback_state = MagicMock()
        svc._emit_state = MagicMock()
        svc._playback_intent = None

        svc.pause_only()

        svc._player.set_pause.assert_called_once_with(1)
        self.assertEqual(svc._playback_intent, "paused")
        svc._save_playback_state.assert_called_once()
        svc._emit_state.assert_called_once()

    def test_pause_toggles_from_paused_to_playing_for_pi(self):
        svc = MusicService.__new__(MusicService)
        svc._output_device = "pi"
        svc._player = MagicMock()
        svc._player.get_state.return_value = vlc.State.Paused
        svc._cast_pause = MagicMock()
        svc._cast_play = MagicMock()
        svc._save_playback_state = MagicMock()
        svc._emit_state = MagicMock()
        svc._playback_intent = "paused"

        svc.pause()

        svc._player.play.assert_called_once()
        svc._player.pause.assert_not_called()
        self.assertEqual(svc._playback_intent, "playing")
        svc._save_playback_state.assert_called_once()
        svc._emit_state.assert_called_once()

    def test_pause_toggles_from_playing_to_paused_for_pi(self):
        svc = MusicService.__new__(MusicService)
        svc._output_device = "pi"
        svc._player = MagicMock()
        svc._player.get_state.return_value = vlc.State.Playing
        svc._cast_pause = MagicMock()
        svc._cast_play = MagicMock()
        svc._save_playback_state = MagicMock()
        svc._emit_state = MagicMock()
        svc._playback_intent = "playing"

        svc.pause()

        svc._player.set_pause.assert_called_once_with(1)
        svc._player.play.assert_not_called()
        self.assertEqual(svc._playback_intent, "paused")
        svc._save_playback_state.assert_called_once()
        svc._emit_state.assert_called_once()

    @patch("music_service.time.time", return_value=1700000000.0)
    @patch("music_service.os.makedirs")
    @patch("music_service.json.dump")
    @patch("builtins.open", new_callable=unittest.mock.mock_open)
    def test_save_state_prefers_playback_intent_paused(self, _open_mock, _json_dump, _makedirs, _time_mock):
        svc = MusicService.__new__(MusicService)
        svc.queue = [{"videoId": "abc", "title": "Song"}]
        svc.queue_index = 0
        svc.shuffle = False
        svc.repeat = "off"
        svc.autoplay = True
        svc.current_song = svc.queue[0]
        svc._output_device = "pi"
        svc._player = MagicMock()
        svc._player.get_state.return_value = vlc.State.Playing
        svc._player.get_time.return_value = 93800
        svc._get_tv_cast = MagicMock(return_value=None)
        svc._playback_intent = "paused"

        captured = {}

        def _capture(obj, _fh):
            captured.update(obj)

        _json_dump.side_effect = _capture
        svc._save_playback_state()

        self.assertTrue(captured["was_paused"])
        self.assertFalse(captured["was_playing"])

    @patch("music_service.time.sleep")
    @patch("music_service.time.time", side_effect=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 5.0])
    def test_force_pause_after_restore_retries_until_paused(self, _mock_time, _mock_sleep):
        svc = MusicService.__new__(MusicService)
        svc._output_device = "pi"
        svc._emit_state = MagicMock()
        svc._cast_pause = MagicMock()
        svc._player = MagicMock()
        svc._player.get_state.side_effect = [
            vlc.State.Playing,
            vlc.State.Playing,
            vlc.State.Paused,
        ]

        svc._force_pause_after_restore()

        self.assertGreaterEqual(svc._player.set_pause.call_count, 3)
        svc._emit_state.assert_called_once()

    def test_get_state_honors_paused_intent_for_pi(self):
        svc = MusicService.__new__(MusicService)
        svc._output_device = "pi"
        svc._player = MagicMock()
        svc._player.get_state.return_value = vlc.State.Playing
        svc._player.get_time.return_value = 93000
        svc._player.get_length.return_value = 200000
        svc._volume = 50
        svc.queue = [{"videoId": "abc", "title": "Song"}]
        svc.queue_index = 0
        svc.shuffle = False
        svc.repeat = "off"
        svc.autoplay = True
        svc.current_song = svc.queue[0]
        svc._playback_intent = "paused"

        st = svc.get_state()

        self.assertFalse(st["is_playing"])
        self.assertEqual(st["position"], 93.0)


if __name__ == "__main__":
    unittest.main()
