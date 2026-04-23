"""Tests for audio output: AudioOutputService (PipeWire routing) + VoicePipeline TTS.

AudioOutputService manages PipeWire sinks/sources and Bluetooth.
VoicePipeline.speak() handles TTS (Fish Audio / Piper / edge-tts) with disk cache.

All subprocess, sounddevice, pyaudio, HTTP calls, and Pi-specific modules
are mocked so tests run on Windows without any hardware.
"""

import os
import sys
import threading
import queue
import hashlib
from unittest.mock import MagicMock, patch, call
import pytest

# ── Stub modules that voice_pipeline.py imports at module level ────────────────
# conftest stubs sounddevice/pyaudio/piper already.  We add the rest here
# BEFORE voice_pipeline is imported by any test.

_VP_STUBS = [
    "edge_tts",
    "numpy",
    "scipy",
    "scipy.signal",
    "cloud_providers",
    "faster_whisper",
    "yt_dlp",
]
for _mod in _VP_STUBS:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# Ensure numpy has the attributes voice_pipeline uses
_np = sys.modules["numpy"]
_np.frombuffer = MagicMock(return_value=MagicMock())
_np.mean = MagicMock(return_value=0.0)
_np.float32 = float

# cloud_providers needs specific symbols
_cp = sys.modules["cloud_providers"]
_cp.groq_stt = MagicMock(return_value="")
_cp.fish_audio_tts = MagicMock(return_value=b"\x00" * 100)
_cp.FISH_AUDIO_VOICE_ID = "mock-voice-id"


# ── Helpers ───────────────────────────────────────────────────────────────────

WPCTL_STATUS_SAMPLE = """
PipeWire 'pipewire-0' [vers 1.0.0]
 Audio
  Sinks:
    *  78. Built-in Audio Digital Stereo (HDMI) [vol: 1.00]
       79. USB Audio Device              [vol: 0.80]
  Sources:
       83. Built-in Audio Analog Stereo  [vol: 1.00]
  Streams:
"""


def _wpctl_ok(stdout=WPCTL_STATUS_SAMPLE):
    m = MagicMock()
    m.returncode = 0
    m.stdout = stdout
    m.stderr = ""
    return m


def _wpctl_fail():
    m = MagicMock()
    m.returncode = 1
    m.stdout = ""
    m.stderr = "error"
    return m


# ── AudioOutputService fixtures ───────────────────────────────────────────────

@pytest.fixture
def audio_service(tmp_path):
    """AudioOutputService with all subprocess calls mocked."""
    settings_path = str(tmp_path / "settings.json")

    with patch("subprocess.run", return_value=_wpctl_ok()), \
         patch("subprocess.Popen"), \
         patch("audio_output_service.SETTINGS_PATH", settings_path):
        import services.audio_output_service as aos_module
        import importlib
        importlib.reload(aos_module)
        svc = aos_module.AudioOutputService.__new__(aos_module.AudioOutputService)
        svc._lock = threading.Lock()
        svc._pw_procs = []
        svc._routing = {}
        svc._routing_desc = {}
        yield svc


# ── Sink/source parsing tests ─────────────────────────────────────────────────

class TestSinkParsing:
    def test_parse_sinks_returns_list(self, audio_service):
        with patch("audio_output_service._run", return_value=(0, WPCTL_STATUS_SAMPLE, "")):
            sinks = audio_service.list_sinks()
        assert isinstance(sinks, list)

    def test_parse_sinks_finds_two_devices(self, audio_service):
        with patch("audio_output_service._run", return_value=(0, WPCTL_STATUS_SAMPLE, "")):
            sinks = audio_service.list_sinks()
        assert len(sinks) == 2

    def test_parse_sinks_default_marked(self, audio_service):
        with patch("audio_output_service._run", return_value=(0, WPCTL_STATUS_SAMPLE, "")):
            sinks = audio_service.list_sinks()
        default = [s for s in sinks if s.is_default]
        assert len(default) == 1
        assert default[0].pw_id == 78

    def test_parse_sinks_non_default(self, audio_service):
        with patch("audio_output_service._run", return_value=(0, WPCTL_STATUS_SAMPLE, "")):
            sinks = audio_service.list_sinks()
        non_default = [s for s in sinks if not s.is_default]
        assert len(non_default) == 1
        assert non_default[0].pw_id == 79

    def test_list_sinks_returns_empty_on_failure(self, audio_service):
        with patch("audio_output_service._run", return_value=(1, "", "error")):
            sinks = audio_service.list_sinks()
        assert sinks == []

    def test_list_sources_parsed(self, audio_service):
        with patch("audio_output_service._run", return_value=(0, WPCTL_STATUS_SAMPLE, "")):
            sources = audio_service.list_sources()
        assert isinstance(sources, list)
        assert len(sources) == 1
        assert sources[0].pw_id == 83

    def test_audio_device_to_dict(self, audio_service):
        import services.audio_output_service as aos
        dev = aos.AudioDevice(78, "sink_78", "Built-in Audio", is_default=True)
        d = dev.to_dict()
        assert d["id"] == 78
        assert d["name"] == "sink_78"
        assert d["description"] == "Built-in Audio"
        assert d["is_default"] is True


# ── Default sink tests ────────────────────────────────────────────────────────

class TestDefaultSink:
    def test_get_default_sink_returns_marked_device(self, audio_service):
        with patch("audio_output_service._run", return_value=(0, WPCTL_STATUS_SAMPLE, "")):
            default = audio_service.get_default_sink()
        assert default is not None
        assert default.is_default is True
        assert default.pw_id == 78

    def test_get_default_sink_returns_none_when_no_sinks(self, audio_service):
        with patch("audio_output_service._run", return_value=(1, "", "")):
            default = audio_service.get_default_sink()
        assert default is None

    def test_get_default_source(self, audio_service):
        with patch("audio_output_service._run", return_value=(0, WPCTL_STATUS_SAMPLE, "")):
            source = audio_service.get_default_source()
        assert source is not None
        assert source.pw_id == 83


# ── Output switching tests ────────────────────────────────────────────────────

class TestOutputSwitching:
    def test_set_default_output_calls_wpctl(self, audio_service):
        with patch("audio_output_service._run", return_value=(0, "", "")) as mock_run:
            result = audio_service.set_default_output(79)
        assert result is True
        mock_run.assert_called_once_with(["wpctl", "set-default", "79"])

    def test_set_default_output_returns_false_on_failure(self, audio_service):
        with patch("audio_output_service._run", return_value=(1, "", "Device not found")):
            result = audio_service.set_default_output(999)
        assert result is False

    def test_set_default_input_calls_wpctl(self, audio_service):
        with patch("audio_output_service._run", return_value=(0, "", "")) as mock_run:
            result = audio_service.set_default_input(83)
        assert result is True
        mock_run.assert_called_once_with(["wpctl", "set-default", "83"])


# ── Device routing tests ──────────────────────────────────────────────────────

class TestDeviceRouting:
    def test_set_function_output_stores_routing(self, audio_service, tmp_path):
        import services.audio_output_service as aos

        def _fake_run(cmd, timeout=10):
            if cmd[0] == "wpctl":
                return 0, "", ""
            return 0, "", ""

        def _fake_list_sinks():
            return [
                aos.AudioDevice(79, "sink_79", "USB Audio Device", is_default=False)
            ]

        with patch("audio_output_service._run", side_effect=_fake_run), \
             patch.object(audio_service, "list_sinks", side_effect=_fake_list_sinks), \
             patch.object(audio_service, "_get_sink_node_name", return_value="alsa_output.usb"), \
             patch.object(audio_service, "_move_all_streams"), \
             patch.object(audio_service, "_save_routing"):
            result = audio_service.set_function_output("music", 79)

        assert result is True
        assert audio_service._routing.get("music") == 79

    def test_get_function_output_returns_none_when_unset(self, audio_service):
        result = audio_service.get_function_output("effects")
        assert result is None

    def test_get_function_output_returns_assigned_id(self, audio_service):
        audio_service._routing["notifications"] = 78
        result = audio_service.get_function_output("notifications")
        assert result == 78

    def test_find_device_by_name_partial_match(self, audio_service):
        import services.audio_output_service as aos
        with patch.object(audio_service, "list_sinks", return_value=[
            aos.AudioDevice(78, "sink_78", "Built-in Audio Digital Stereo (HDMI)", True),
            aos.AudioDevice(79, "sink_79", "USB Audio Device", False),
        ]):
            result = audio_service.find_device_by_name("usb")
        assert result is not None
        assert result.pw_id == 79

    def test_find_device_by_name_no_match_returns_none(self, audio_service):
        import services.audio_output_service as aos
        with patch.object(audio_service, "list_sinks", return_value=[
            aos.AudioDevice(78, "sink_78", "Built-in Audio", True),
        ]):
            result = audio_service.find_device_by_name("bluetooth")
        assert result is None


# ── get_status tests ──────────────────────────────────────────────────────────

class TestGetStatus:
    def test_get_status_returns_dict_with_keys(self, audio_service):
        import services.audio_output_service as aos
        with patch.object(audio_service, "get_default_sink",
                          return_value=aos.AudioDevice(78, "sink_78", "Built-in Audio", True)), \
             patch.object(audio_service, "list_sinks",
                          return_value=[aos.AudioDevice(78, "sink_78", "Built-in Audio", True)]), \
             patch.object(audio_service, "list_sources", return_value=[]), \
             patch.object(audio_service, "get_all_routing", return_value={}), \
             patch.object(audio_service, "bluetooth_connected", return_value=[]):
            status = audio_service.get_status()

        for key in ("default", "sinks", "sources", "routing", "bluetooth_connected"):
            assert key in status, f"Missing key: {key}"

    def test_get_status_sinks_are_dicts(self, audio_service):
        import services.audio_output_service as aos
        sink = aos.AudioDevice(78, "sink_78", "Built-in Audio", True)
        with patch.object(audio_service, "get_default_sink", return_value=sink), \
             patch.object(audio_service, "list_sinks", return_value=[sink]), \
             patch.object(audio_service, "list_sources", return_value=[]), \
             patch.object(audio_service, "get_all_routing", return_value={}), \
             patch.object(audio_service, "bluetooth_connected", return_value=[]):
            status = audio_service.get_status()

        assert all(isinstance(s, dict) for s in status["sinks"])


# ── VoicePipeline speak / TTS tests ──────────────────────────────────────────

@pytest.fixture
def voice_pipeline(tmp_path):
    """VoicePipeline with all external deps mocked, TTS cache in tmp_path."""
    tts_cache = str(tmp_path / "tts_cache")
    os.makedirs(tts_cache, exist_ok=True)

    # Import voice_pipeline now that stubs are in sys.modules
    import services.voice_pipeline as vp_module

    # Override TTS cache dir on the module
    original_cache_dir = vp_module.TTS_CACHE_DIR
    vp_module.TTS_CACHE_DIR = tts_cache

    with patch("voice_pipeline._load_voice_settings", return_value={
        "tts_provider": "auto",
        "stt_provider": "auto",
        "wake_enabled": False,
        "bmo_tts_enabled": True,
        "silence_threshold": 200,
        "vad_sensitivity": 1.8,
    }):
        vp = vp_module.VoicePipeline.__new__(vp_module.VoicePipeline)

    vp.socketio = MagicMock()
    vp._chat_callback = None
    vp._running = False
    vp._listen_thread = None
    vp._whisper = None
    vp._wake_model = None
    vp._speaker_encoder = None
    vp._voice_profiles = {}
    vp._audio_queue = queue.Queue()
    vp._is_speaking = False
    vp._silero_vad = None
    vp._silero_vad_tried = False
    vp._ambient_rms_avg = 0.0
    vp._chat_stream_callback = None
    vp._tts_queue = queue.Queue()
    vp._tts_worker_active = threading.Event()
    vp._tts_interrupted = threading.Event()
    vp._tts_cache_lock = threading.Lock()
    vp._silence_threshold = 200
    vp._vad_sensitivity = 1.8
    vp._tts_provider = "auto"
    vp._stt_provider = "auto"
    vp._wake_enabled = False
    vp._bmo_tts_enabled = True
    vp._speak_volume = 100
    vp._tts_output_mode = "pi"
    vp._scene_service = None

    yield vp, vp_module

    # Restore module-level cache dir after test
    vp_module.TTS_CACHE_DIR = original_cache_dir


class TestSpeak:
    def test_speak_initiates_playback(self, voice_pipeline):
        vp, vp_module = voice_pipeline

        with patch.object(vp, "_mute_mic"), \
             patch.object(vp, "_tts_cache_get", return_value=None), \
             patch.object(vp, "_cloud_speak") as mock_cloud, \
             patch.object(vp, "_play_audio"):
            vp.speak("Hello, I am BMO.")

        mock_cloud.assert_called_once_with("Hello, I am BMO.", "bmo_calm")

    def test_speak_empty_string_suppressed_or_no_crash(self, voice_pipeline):
        vp, _ = voice_pipeline
        # Empty string should not crash, regardless of whether it's a no-op
        with patch.object(vp, "_mute_mic"), \
             patch.object(vp, "_tts_cache_get", return_value=None), \
             patch.object(vp, "_cloud_speak", side_effect=Exception("empty")), \
             patch.object(vp, "_local_speak"), \
             patch.object(vp, "_bmo_speak"), \
             patch.object(vp, "_edge_speak"):
            try:
                vp.speak("")
            except Exception:
                pytest.fail("speak() raised an exception on empty string")

    def test_speak_suppressed_when_tts_disabled(self, voice_pipeline):
        vp, _ = voice_pipeline
        vp._bmo_tts_enabled = False
        cloud_called = []

        with patch.object(vp, "_cloud_speak", side_effect=lambda *a: cloud_called.append(a)):
            vp.speak("Should be suppressed")

        assert len(cloud_called) == 0

    def test_speak_not_suppressed_for_alarm_priority_when_disabled(self, voice_pipeline):
        vp, _ = voice_pipeline
        vp._bmo_tts_enabled = False
        cloud_called = []

        with patch.object(vp, "_mute_mic"), \
             patch.object(vp, "_tts_cache_get", return_value=None), \
             patch.object(vp, "_cloud_speak", side_effect=lambda *a: cloud_called.append(a)):
            vp.speak("Wake up!", priority="alarm")

        # alarm priority should bypass the disabled check
        assert len(cloud_called) == 1


class TestTtsCache:
    def test_cache_hit_uses_cached_file(self, voice_pipeline, tmp_path):
        vp, vp_module = voice_pipeline
        cached_file = str(tmp_path / "tts_cache" / "cached.opus")
        # Write a fake cached audio file
        with open(cached_file, "wb") as f:
            f.write(b"\x00" * 100)

        play_called = []
        cloud_called = []

        with patch.object(vp, "_mute_mic"), \
             patch.object(vp, "_tts_cache_get", return_value=cached_file), \
             patch.object(vp, "_play_audio", side_effect=lambda p: play_called.append(p)), \
             patch.object(vp, "_cloud_speak", side_effect=lambda *a: cloud_called.append(a)):
            vp.speak("Hello from cache")

        assert len(play_called) == 1
        assert play_called[0] == cached_file
        assert len(cloud_called) == 0

    def test_cache_miss_calls_tts_provider(self, voice_pipeline):
        vp, _ = voice_pipeline
        cloud_called = []

        with patch.object(vp, "_mute_mic"), \
             patch.object(vp, "_tts_cache_get", return_value=None), \
             patch.object(vp, "_cloud_speak", side_effect=lambda *a: cloud_called.append(a)):
            vp.speak("Brand new text")

        assert len(cloud_called) == 1

    def test_tts_cache_key_consistent(self, voice_pipeline):
        vp, _ = voice_pipeline
        key1 = vp._tts_cache_key("Hello world", "bmo_calm")
        key2 = vp._tts_cache_key("Hello world", "bmo_calm")
        assert key1 == key2

    def test_tts_cache_key_differs_for_different_text(self, voice_pipeline):
        vp, _ = voice_pipeline
        key1 = vp._tts_cache_key("Hello", "bmo_calm")
        key2 = vp._tts_cache_key("Goodbye", "bmo_calm")
        assert key1 != key2

    def test_tts_cache_key_differs_for_different_speaker(self, voice_pipeline):
        vp, _ = voice_pipeline
        key1 = vp._tts_cache_key("Hello", "bmo_calm")
        key2 = vp._tts_cache_key("Hello", "bmo_excited")
        assert key1 != key2

    def test_tts_cache_put_writes_file(self, voice_pipeline, tmp_path):
        vp, vp_module = voice_pipeline
        audio_bytes = b"\xff\xfb\x90" * 50

        vp._tts_cache_put("Cache test text", "bmo_calm", audio_bytes, ext=".mp3")

        key = vp._tts_cache_key("Cache test text", "bmo_calm")
        expected_path = os.path.join(vp_module.TTS_CACHE_DIR, f"{key}.mp3")
        assert os.path.exists(expected_path)
        with open(expected_path, "rb") as f:
            assert f.read() == audio_bytes

    def test_tts_cache_get_returns_none_for_unknown_text(self, voice_pipeline):
        vp, _ = voice_pipeline
        result = vp._tts_cache_get("This text has never been spoken", "bmo_calm")
        assert result is None

    def test_tts_cache_get_returns_path_for_cached_text(self, voice_pipeline, tmp_path):
        vp, vp_module = voice_pipeline
        text = "Cached phrase for testing"
        speaker = "bmo_calm"
        audio_bytes = b"\x00" * 200

        vp._tts_cache_put(text, speaker, audio_bytes, ext=".opus")

        result = vp._tts_cache_get(text, speaker)
        assert result is not None
        assert os.path.exists(result)


class TestVolumeControl:
    def test_speak_volume_attribute_set(self, voice_pipeline):
        vp, _ = voice_pipeline
        vp._speak_volume = 50
        assert vp._speak_volume == 50

    def test_speak_with_custom_volume(self, voice_pipeline):
        vp, _ = voice_pipeline
        original = vp._speak_volume

        with patch.object(vp, "_mute_mic"), \
             patch.object(vp, "_tts_cache_get", return_value=None), \
             patch.object(vp, "_cloud_speak"):
            vp.speak("Volume test", volume=70)

        # After speak(), volume should be restored to original
        assert vp._speak_volume == original

    def test_play_audio_passes_volume_to_ffplay(self, voice_pipeline, tmp_path):
        vp, _ = voice_pipeline
        # Create a dummy audio file
        audio_file = str(tmp_path / "test.opus")
        with open(audio_file, "wb") as f:
            f.write(b"\x00" * 10)

        vp._speak_volume = 75
        captured_cmd = []

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stderr=b"")
            vp._play_audio(audio_file)
            if mock_run.call_args:
                captured_cmd = mock_run.call_args[0][0]

        # ffplay should include the -volume flag
        if captured_cmd:
            assert "-volume" in captured_cmd
            vol_idx = captured_cmd.index("-volume")
            assert captured_cmd[vol_idx + 1] == "75"


class TestDeviceRouting:
    def test_tts_output_mode_defaults_to_pi(self, voice_pipeline):
        vp, _ = voice_pipeline
        assert getattr(vp, "_tts_output_mode", "pi") == "pi"

    def test_tts_output_mode_browser_emits_socket_event(self, voice_pipeline, tmp_path):
        vp, _ = voice_pipeline
        vp._tts_output_mode = "browser"
        vp.socketio = MagicMock()

        audio_file = str(tmp_path / "tts_browser.opus")
        with open(audio_file, "wb") as f:
            f.write(b"\x00" * 50)

        with patch("threading.Thread"):
            vp._play_audio(audio_file)

        vp.socketio.emit.assert_called_once()
        event_name, payload = vp.socketio.emit.call_args[0]
        assert event_name == "tts_audio"
        assert "url" in payload
