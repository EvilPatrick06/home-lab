import os

_APP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app.py"))

with open(_APP, "r") as f:
    content = f.read()

# Revert to POWER for everything - WAKEUP doesn't work on this RCA TV
old = '''            if state == "on":
                _tv_remote.send_key_command("WAKEUP")
            else:
                _tv_remote.send_key_command("POWER")'''

new = '''            _tv_remote.send_key_command("POWER")'''

if old in content:
    content = content.replace(old, new)
    print("OK - reverted to POWER for all states")
else:
    print("ERROR - pattern not found")

with open(_APP, "w") as f:
    f.write(content)
