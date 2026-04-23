"""Shared pytest fixtures for BMO test suite.

Mocks all hardware, cloud APIs, and Pi-specific dependencies so tests
run on any machine (Windows, Linux, macOS) without real hardware.
"""

import sys
import types
from unittest.mock import MagicMock, patch

import pytest


# ── Mock Pi-specific modules before any BMO imports ────────────────

_MOCK_MODULES = [
    "RPi", "RPi.GPIO", "smbus2",
    "luma", "luma.oled", "luma.oled.device", "luma.core", "luma.core.interface",
    "luma.core.interface.serial", "luma.core.render",
    "picamera2", "cv2",
    "pyaudio", "sounddevice", "openwakeword",
    "piper", "resemblyzer",
    "vlc", "pychromecast", "androidtvremote2",
    "gevent", "gevent.monkey",
    "spidev",
]

for mod_name in _MOCK_MODULES:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = MagicMock()

# gevent.monkey.patch_all must be callable and a no-op
sys.modules["gevent"].monkey = MagicMock()
sys.modules["gevent.monkey"] = sys.modules["gevent"].monkey
sys.modules["gevent.monkey"].patch_all = MagicMock()


# ── Fixtures ───────────────────────────────────────────────────────

@pytest.fixture
def flask_app():
    """Create a test Flask app with SocketIO."""
    from flask import Flask
    from flask_socketio import SocketIO

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret"
    sio = SocketIO(app, async_mode="threading")
    return app, sio


@pytest.fixture
def flask_client(flask_app):
    """Flask test client."""
    app, _ = flask_app
    return app.test_client()


@pytest.fixture
def mock_cloud_apis():
    """Mock all cloud API calls (Gemini, Claude, Groq, Fish Audio, Vision)."""
    with patch("requests.post") as mock_post, \
         patch("requests.get") as mock_get:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"choices": [{"message": {"content": "mock response"}}]}),
            text="mock response",
        )
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={}),
        )
        yield {"post": mock_post, "get": mock_get}


@pytest.fixture
def mock_hardware():
    """Mock all hardware interfaces (OLED, LED, GPIO, camera)."""
    mocks = {
        "oled": MagicMock(),
        "led": MagicMock(),
        "gpio": sys.modules["RPi.GPIO"],
        "camera": sys.modules["picamera2"],
    }
    return mocks


@pytest.fixture
def mock_filesystem(tmp_path):
    """Temporary filesystem for data persistence tests."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    return tmp_path


@pytest.fixture
def sample_agent_config():
    """Sample agent configuration for testing."""
    return {
        "name": "test_agent",
        "model": "gemini-2.0-flash",
        "temperature": 0.7,
        "max_tokens": 1024,
        "tools": [],
        "system_prompt": "You are a test agent.",
    }
