import os

_APP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app.py"))

with open(_APP, "r") as f:
    content = f.read()

old = '''            _tv_remote.send_key_command("POWER")
            print(f"[tv] Sent POWER key (state={state})")
            return jsonify({"ok": True, "state": state})'''

new = '''            _tv_remote.send_key_command("POWER")
            print(f"[tv] Sent POWER key (state={state})")
            # When turning on, retry if TV doesn't wake within 3s
            if state == "on":
                import time as _t
                for attempt in range(2):
                    _t.sleep(3)
                    if _tv_is_on:
                        print(f"[tv] TV woke up after {attempt + 1} attempt(s)")
                        break
                    print(f"[tv] Retry {attempt + 2}: sending POWER again")
                    _tv_remote.send_key_command("POWER")
            return jsonify({"ok": True, "state": state})'''

if old in content:
    content = content.replace(old, new)
    print("OK - added power-on retry")
else:
    print("ERROR - not found")

with open(_APP, "w") as f:
    f.write(content)
