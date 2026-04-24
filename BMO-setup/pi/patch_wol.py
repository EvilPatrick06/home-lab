with open("/home/patrick/bmo/app.py", "r") as f:
    content = f.read()

# Add WoL fallback to the power endpoint when TV is disconnected
old = '''def _tv_reconnect():
    """Try to reconnect to the TV if disconnected."""
    global _tv_remote
    if _tv_remote:
        return True
    try:
        from androidtvremote2 import AndroidTVRemote
        import asyncio
        async def _connect():
            global _tv_remote
            remote = AndroidTVRemote(
                client_name="BMO",
                certfile=_TV_CERTFILE,
                keyfile=_TV_KEYFILE,
                host=TV_IP,
            )
            await asyncio.wait_for(remote.async_connect(), timeout=5)
            _tv_remote = remote
            remote.keep_reconnecting()
            print(f"[tv] Reconnected to TV at {TV_IP} (auto-reconnect enabled)")
        _tv_run(_connect(), timeout=5)
        return _tv_remote is not None
    except Exception as e:
        print(f"[tv] Reconnect failed: {e}")
        return False


@app.route("/api/tv/power", methods=["POST"])
def api_tv_power():
    _tv_reconnect()
    if _tv_remote:
        try:
            data = request.get_json(silent=True) or {}
            state = data.get("state", "toggle")
            _tv_remote.send_key_command("POWER")
            return jsonify({"ok": True, "state": state})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"error": "TV not connected — pair first"}), 503'''

new = '''_TV_MAC = "d0:76:02:64:84:4d"


def _tv_wol():
    """Send Wake-on-LAN magic packet to the TV."""
    import socket, struct
    mac_bytes = bytes.fromhex(_TV_MAC.replace(":", ""))
    magic = b"\\xff" * 6 + mac_bytes * 16
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.sendto(magic, ("255.255.255.255", 9))
    print(f"[tv] Sent WoL packet to {_TV_MAC}")


def _tv_reconnect():
    """Try to reconnect to the TV if disconnected."""
    global _tv_remote
    if _tv_remote:
        return True
    try:
        from androidtvremote2 import AndroidTVRemote
        import asyncio
        async def _connect():
            global _tv_remote
            remote = AndroidTVRemote(
                client_name="BMO",
                certfile=_TV_CERTFILE,
                keyfile=_TV_KEYFILE,
                host=TV_IP,
            )
            await asyncio.wait_for(remote.async_connect(), timeout=5)
            _tv_remote = remote
            remote.keep_reconnecting()
            print(f"[tv] Reconnected to TV at {TV_IP} (auto-reconnect enabled)")
        _tv_run(_connect(), timeout=5)
        return _tv_remote is not None
    except Exception as e:
        print(f"[tv] Reconnect failed: {e}")
        return False


@app.route("/api/tv/power", methods=["POST"])
def api_tv_power():
    data = request.get_json(silent=True) or {}
    state = data.get("state", "toggle")
    _tv_reconnect()
    if _tv_remote:
        try:
            _tv_remote.send_key_command("POWER")
            return jsonify({"ok": True, "state": state})
        except Exception as e:
            # Connection may have gone stale — try WoL for power on
            if state == "on":
                _tv_wol()
                return jsonify({"ok": True, "state": state, "method": "wol"})
            return jsonify({"error": str(e)}), 500
    # No connection at all — try WoL if turning on
    if state == "on":
        _tv_wol()
        return jsonify({"ok": True, "state": state, "method": "wol"})
    return jsonify({"error": "TV not connected — pair first"}), 503'''

if old in content:
    content = content.replace(old, new)
    print("OK - added WoL fallback to power endpoint")
else:
    print("ERROR - pattern not found")

with open("/home/patrick/bmo/app.py", "w") as f:
    f.write(content)
