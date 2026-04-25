import os

_APP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app.py"))

with open(_APP, "r") as f:
    content = f.read()

# Add detailed logging to power endpoint
old = '''@app.route("/api/tv/power", methods=["POST"])
def api_tv_power():
    if _tv_remote:
        try:
            data = request.get_json(silent=True) or {}
            state = data.get("state", "toggle")
            # Skip if TV is already in the desired state
            if state == "on" and _tv_is_on:
                return jsonify({"ok": True, "already": True, "is_on": True})
            if state == "off" and not _tv_is_on:
                return jsonify({"ok": True, "already": True, "is_on": False})
            _tv_remote.send_key_command("POWER")
            return jsonify({"ok": True, "state": state})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"error": "TV not connected \\u2014 pair first"}), 503'''

new = '''@app.route("/api/tv/power", methods=["POST"])
def api_tv_power():
    if _tv_remote:
        try:
            data = request.get_json(silent=True) or {}
            state = data.get("state", "toggle")
            print(f"[tv] Power request: state={state}, _tv_is_on={_tv_is_on}")
            # Skip if TV is already in the desired state
            if state == "on" and _tv_is_on:
                print("[tv] Skipping — TV already on")
                return jsonify({"ok": True, "already": True, "is_on": True})
            if state == "off" and not _tv_is_on:
                print("[tv] Skipping — TV already off")
                return jsonify({"ok": True, "already": True, "is_on": False})
            _tv_remote.send_key_command("POWER")
            print(f"[tv] Sent POWER key (state={state})")
            return jsonify({"ok": True, "state": state})
        except Exception as e:
            print(f"[tv] Power error: {e}")
            return jsonify({"error": str(e)}), 500
    return jsonify({"error": "TV not connected \\u2014 pair first"}), 503'''

if old in content:
    content = content.replace(old, new)
    print("OK - added power debug logging")
else:
    print("ERROR - power endpoint not found")

with open(_APP, "w") as f:
    f.write(content)
