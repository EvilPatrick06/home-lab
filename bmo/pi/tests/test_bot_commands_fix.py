"""Regression coverage for the bot-commands-fix batch:
- FFmpeg User-Agent forwarding (googlevideo 403 fix)
- yt-dlp player-client pinning keeps android_vr (headless-Pi extraction)
- /waifu + /husbando moved off dead waifu.pics to nekos.best (with a UA header)
- /animequote endpoint corrected to api.animechan.io
- /meme + /reddit moved off reddit's 403-ing .json to meme-api.com
- Gemini 429 -> typed CloudRateLimitError with graceful /ask handling
"""
import bots.social.bot as bot
import bots.social.youtube as youtube
from services import cloud_providers


def test_ffmpeg_ua_prefix_uses_info_header():
    info = {"http_headers": {"User-Agent": "TestUA/9.9"}}
    assert bot._ffmpeg_ua_prefix(info) == '-user_agent "TestUA/9.9" '


def test_ffmpeg_ua_prefix_falls_back():
    out = bot._ffmpeg_ua_prefix(None)
    assert out.startswith('-user_agent "') and bot.YTDLP_FALLBACK_UA in out
    # and never emits an unquoted/empty UA
    assert '""' not in out


def test_ytdlp_client_keeps_android_vr():
    # android_vr is the only client that yields audio on the headless Pi; the
    # default must keep it (regression guard against re-pinning to web-only).
    args = youtube._ytdlp_extractor_args()
    clients = args["youtube"]["player_client"]
    assert "android_vr" in clients


def test_nekos_best_hits_right_url_with_ua(monkeypatch):
    captured = {}

    class FakeResp:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {"results": [{"url": "https://nekos.best/x.png"}]}

    def fake_get(url, headers=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers or {}
        return FakeResp()

    import requests
    monkeypatch.setattr(requests, "get", fake_get)
    url = bot._nekos_best_get("husbando")
    assert url == "https://nekos.best/x.png"
    assert captured["url"] == "https://nekos.best/api/v2/husbando"
    # nekos.best 403s the default python-requests UA -> a custom UA is required
    ua = captured["headers"].get("User-Agent", "")
    assert ua and "python" not in ua.lower()


def test_animequote_uses_api_subdomain(monkeypatch):
    captured = {}

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return {"data": {"content": "q", "anime": {}, "character": {}}}

    def fake_get(url, timeout=None):
        captured["url"] = url
        return FakeResp()

    import requests
    monkeypatch.setattr(requests, "get", fake_get)
    bot._animequote_get()
    assert captured["url"] == "https://api.animechan.io/v1/quotes/random"


def test_reddit_uses_meme_api_and_filters_nsfw(monkeypatch):
    captured = {}

    class FakeResp:
        def raise_for_status(self): pass
        def json(self):
            return {"memes": [
                {"title": "ok", "url": "https://i.redd.it/a.png", "postLink": "https://redd.it/1",
                 "author": "u", "ups": 5, "nsfw": False},
                {"title": "nsfw", "url": "https://i.redd.it/b.png", "postLink": "https://redd.it/2",
                 "author": "u", "ups": 5, "nsfw": True},
                {"title": "video", "url": "https://v.redd.it/c.mp4", "postLink": "https://redd.it/3",
                 "author": "u", "ups": 5, "nsfw": False},
            ]}

    def fake_get(url, headers=None, timeout=None):
        captured["url"] = url
        return FakeResp()

    import requests
    monkeypatch.setattr(requests, "get", fake_get)
    posts = bot._reddit_get("memes")
    assert captured["url"] == "https://meme-api.com/gimme/memes/50"
    titles = [p["title"] for p in posts]
    assert titles == ["ok"]  # nsfw + non-image filtered out
    assert posts[0]["permalink"] == "https://redd.it/1"


def test_gemini_429_raises_cloud_rate_limit_error(monkeypatch):
    import requests

    class Resp429:
        status_code = 429
        headers = {"Retry-After": "0"}
        def raise_for_status(self):
            raise requests.exceptions.HTTPError(response=self)

    monkeypatch.setattr(cloud_providers, "GEMINI_API_KEY", "x")
    monkeypatch.setattr(cloud_providers._gemini_session, "post",
                        lambda *a, **k: Resp429())
    monkeypatch.setattr(cloud_providers.time, "sleep", lambda *_: None)
    try:
        cloud_providers.gemini_chat([{"role": "user", "content": "hi"}], model="gemini-3-pro")
        assert False, "expected CloudRateLimitError"
    except cloud_providers.CloudRateLimitError:
        pass


def test_retry_after_seconds_parses_and_clamps():
    class R:
        headers = {"Retry-After": "5"}
    assert cloud_providers._retry_after_seconds(R(), 2.0) == 5.0

    class R2:
        headers = {}
    assert cloud_providers._retry_after_seconds(R2(), 3.0) == 3.0

    class R3:
        headers = {"Retry-After": "9999"}
    assert cloud_providers._retry_after_seconds(R3(), 2.0) == 30.0  # clamped
