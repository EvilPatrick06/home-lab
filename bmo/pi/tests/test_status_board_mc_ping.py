"""Tests for the 'ping the owner' button on the 🎮 Minecraft-server-down board item.

A friend can click it to alert the owner (via notify.sh) that the CobbleVerse MC
server needs a restart. Covers: button only renders when the MC item is present,
the cooldown/debounce decision, and that notify.sh is invoked with the stable
`<sev> <subject> <body>` signature.
"""
import time
import types

import discord

from bots.social import status_board_cog as cog
from services import status_board as sb


def _mc_row():
    now = time.time()
    return {"category": "info", "severity": "warning", "title": "🎮 Minecraft server down",
            "detail": "laptop is online but the MC port (25565) is not responding",
            "since": now, "due": None, "url": None, "kind": "item",
            "key": "mc", "id": "mc", "source": "mc"}


def _other_info_row():
    return {"category": "info", "severity": "info", "title": "🗓️ Some FYI",
            "detail": "not minecraft", "since": time.time(), "due": None, "url": None,
            "kind": "item", "key": "fyi", "id": "fyi", "source": "fyi"}


def _custom_ids(view):
    ids = []

    def walk(items):
        for it in items or []:
            cid = getattr(it, "custom_id", None)
            if cid:
                ids.append(cid)
            walk(getattr(it, "children", None))

    walk(getattr(view, "children", None))
    return ids


def _state():
    return types.SimpleNamespace(collapse_info=False, muted={})


# ── rendering ────────────────────────────────────────────────────────────────

def test_ping_button_renders_when_mc_down():
    view = cog.build_layout([_mc_row()], _state())
    assert "board:pingmc" in _custom_ids(view)


def test_no_ping_button_without_mc_item():
    view = cog.build_layout([_other_info_row()], _state())
    assert "board:pingmc" not in _custom_ids(view)


def test_no_info_section_no_ping_button():
    # incident-only board → no info section at all → no ping button.
    row = {"category": "incident", "severity": "critical", "title": "X", "detail": "",
           "since": time.time(), "due": None, "url": None, "key": "x", "id": "x", "source": "x"}
    view = cog.build_layout([row], _state())
    assert "board:pingmc" not in _custom_ids(view)


def test_ping_button_identity():
    btn = cog.PingOwnerButton()
    assert btn.item.custom_id == "board:pingmc"


# ── cooldown/debounce decision ───────────────────────────────────────────────

def test_decision_up_when_not_down():
    assert cog._mc_ping_decision(now=100.0, ping_until=0.0, mc_down=False) == "up"


def test_decision_ping_when_down_and_cold():
    assert cog._mc_ping_decision(now=100.0, ping_until=0.0, mc_down=True) == "ping"


def test_decision_cooldown_blocks_repeat():
    now = 100.0
    assert cog._mc_ping_decision(now=now, ping_until=now + 60, mc_down=True) == "cooldown"


def test_decision_ping_again_after_cooldown_expires():
    now = 1000.0
    assert cog._mc_ping_decision(now=now, ping_until=now - 1, mc_down=True) == "ping"


# ── notify.sh invocation ─────────────────────────────────────────────────────

def test_send_owner_mc_ping_invokes_notify(monkeypatch, tmp_path):
    fake = tmp_path / "notify.sh"
    fake.write_text("#!/usr/bin/env bash\nexit 0\n")
    monkeypatch.setattr(cog, "NOTIFY_SH", str(fake))
    calls = {}

    def fake_run(argv, **kw):
        calls["argv"] = argv
        calls["env"] = kw.get("env")
        return types.SimpleNamespace(returncode=0)

    monkeypatch.setattr(cog.subprocess, "run", fake_run)
    assert cog._send_owner_mc_ping() is True
    assert calls["argv"][0] == str(fake)
    assert calls["argv"][1] == "warn"
    assert calls["argv"][2] == "Minecraft server down"
    # routed to the actionable 'Needs you' section, not a non-actionable FYI.
    assert calls["env"]["NOTIFY_BOARD_CATEGORY"] == "attention"
    # forces the real owner alert (SMS/phone push) rather than a board-only
    # notice the owner might never see — this is the whole point of the ping.
    assert calls["env"]["NOTIFY_FORCE_SMS"] == "1"


def test_send_owner_mc_ping_false_when_notifier_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(cog, "NOTIFY_SH", str(tmp_path / "does-not-exist.sh"))
    called = {"n": 0}

    def fake_run(*a, **k):
        called["n"] += 1

    monkeypatch.setattr(cog.subprocess, "run", fake_run)
    assert cog._send_owner_mc_ping() is False
    assert called["n"] == 0  # never shells out when the notifier is absent


# sanity: the MC info row uses a severity the renderer knows about.
def test_mc_row_severity_known():
    assert "warning" in sb.SEV_DOT


# ── callback: a real click actually pings the owner (SMS + Discord) ───────────

class _FakeResponse:
    def __init__(self):
        self.messages = []

    async def send_message(self, msg, ephemeral=False):
        self.messages.append((msg, ephemeral))

    async def defer(self):
        pass


class _FakeMessage:
    def __init__(self, mid):
        self.id = mid
        self.deleted = False

    async def delete(self):
        self.deleted = True


class _FakeChannel:
    def __init__(self, cid=555):
        self.id = cid
        self.sent = []
        self._next_id = 1000

    async def send(self, content, **kw):
        self.sent.append((content, kw))
        self._next_id += 1
        return _FakeMessage(self._next_id)


class _FakeClient:
    def __init__(self, cog):
        self._cog = cog

    def get_cog(self, name):
        return self._cog


class _FakeInteraction:
    def __init__(self, cog, channel):
        self.client = _FakeClient(cog)
        self.channel = channel
        self.response = _FakeResponse()


async def test_callback_fires_notify_and_owner_mention_when_down(monkeypatch):
    # MC down, cold cooldown → a click must invoke the notify path AND @-mention
    # the owner in the channel (not merely show an ephemeral confirmation).
    fired = {"notify": 0}

    def fake_send_owner():
        fired["notify"] += 1
        return True

    monkeypatch.setattr(cog, "_send_owner_mc_ping", fake_send_owner)
    monkeypatch.setattr(cog, "OWNER_ID", "123456789")

    fake_state = types.SimpleNamespace(mc_ping_msgs=[], save=lambda: None)
    fake_cog = types.SimpleNamespace(_mc_down=True, _mc_ping_until=0.0, state=fake_state)
    channel = _FakeChannel()
    interaction = _FakeInteraction(fake_cog, channel)

    await cog.PingOwnerButton().callback(interaction)

    assert fired["notify"] == 1                       # owner alert (SMS/push) fired
    # the @-mention message id is tracked so MC recovery can delete it early.
    assert fake_state.mc_ping_msgs == [[channel.id, channel.sent and 1001]]
    assert channel.sent, "owner was not @-mentioned in the channel"
    assert "<@123456789>" in channel.sent[0][0]       # real Discord ping to owner
    assert fake_cog._mc_ping_until > 0                # cooldown armed (anti-spam)
    assert interaction.response.messages             # clicker still gets an ack
    assert interaction.response.messages[0][1] is True  # and it is ephemeral


async def test_callback_does_not_notify_when_server_up(monkeypatch):
    fired = {"notify": 0}
    monkeypatch.setattr(cog, "_send_owner_mc_ping",
                        lambda: fired.__setitem__("notify", fired["notify"] + 1) or True)
    monkeypatch.setattr(cog, "OWNER_ID", "123456789")

    fake_cog = types.SimpleNamespace(_mc_down=False, _mc_ping_until=0.0)
    channel = _FakeChannel()
    interaction = _FakeInteraction(fake_cog, channel)

    await cog.PingOwnerButton().callback(interaction)

    assert fired["notify"] == 0        # server up → no owner alert
    assert not channel.sent            # and no @-mention


# ── recovery: MC back UP deletes the tracked owner-ping @-mention early ───────

class _FakeBot:
    """Minimal bot: resolves a channel that can fetch/delete a tracked message."""
    def __init__(self, channel):
        self._channel = channel

    def get_channel(self, cid):
        return self._channel if cid == self._channel.id else None


class _FetchChannel:
    def __init__(self, cid, messages):
        self.id = cid
        self._messages = messages          # msg_id -> _FakeMessage

    async def fetch_message(self, mid):
        msg = self._messages.get(mid)
        if msg is None:
            # real discord raises NotFound (a subclass of HTTPException) here.
            resp = types.SimpleNamespace(status=404, reason="Not Found")
            raise discord.NotFound(resp, "Unknown Message")
        return msg


def _cog_with_state(bot, mc_ping_msgs):
    inst = cog.StatusBoardCog.__new__(cog.StatusBoardCog)
    inst.bot = bot
    inst.state = types.SimpleNamespace(mc_ping_msgs=list(mc_ping_msgs),
                                       save=lambda: None)
    return inst


async def test_clear_mc_ping_messages_deletes_and_clears():
    # A tracked ping message exists; recovery must delete it and empty the list.
    msg = _FakeMessage(2001)
    channel = _FetchChannel(555, {2001: msg})
    inst = _cog_with_state(_FakeBot(channel), [[555, 2001]])

    await inst._clear_mc_ping_messages()

    assert msg.deleted is True                     # the @-mention was removed
    assert inst.state.mc_ping_msgs == []           # and its id was cleared


async def test_clear_mc_ping_messages_best_effort_on_missing():
    # The 10-min delete_after may have already fired; a missing message must not
    # raise, and the stored id is still cleared.
    channel = _FetchChannel(555, {})               # fetch will raise
    inst = _cog_with_state(_FakeBot(channel), [[555, 9999]])

    await inst._clear_mc_ping_messages()           # must not raise

    assert inst.state.mc_ping_msgs == []


async def test_loop_recovery_transition_invokes_clear(monkeypatch):
    # A down->up transition in the reconcile loop must trigger the clear path.
    inst = cog.StatusBoardCog.__new__(cog.StatusBoardCog)
    inst._mc_down = True                           # previous tick: server down
    cleared = {"n": 0}

    async def fake_clear():
        cleared["n"] += 1

    async def fake_render():
        pass

    inst._clear_mc_ping_messages = fake_clear
    inst.render_to_message = fake_render
    monkeypatch.setattr(cog, "_deploy_adapter", lambda: [])
    monkeypatch.setattr(cog, "_mc_down", lambda: False)   # this tick: server up

    # call the loop body directly (unwrap the tasks.loop decorator)
    await cog.StatusBoardCog.loop.coro(inst)

    assert cleared["n"] == 1                        # recovery -> clear fired once
    assert inst._mc_down is False


async def test_loop_no_clear_while_still_down(monkeypatch):
    inst = cog.StatusBoardCog.__new__(cog.StatusBoardCog)
    inst._mc_down = True
    cleared = {"n": 0}

    async def fake_clear():
        cleared["n"] += 1

    async def fake_render():
        pass

    inst._clear_mc_ping_messages = fake_clear
    inst.render_to_message = fake_render
    monkeypatch.setattr(cog, "_deploy_adapter", lambda: [])
    monkeypatch.setattr(cog, "_mc_down", lambda: True)    # still down

    await cog.StatusBoardCog.loop.coro(inst)

    assert cleared["n"] == 0                        # no transition -> no clear
