import os

_APP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app.py"))

with open(_APP, "r") as f:
    content = f.read()

# Find the initial TV connection code and add keep_reconnecting + is_on callback
old_connect = '''            await asyncio.wait_for(remote.async_connect(), timeout=5)
            _tv_remote = remote
            print(f"[tv] Connected to TV at {TV_IP}")'''

new_connect = '''            await asyncio.wait_for(remote.async_connect(), timeout=5)
            _tv_remote = remote
            remote.keep_reconnecting()
            remote.add_is_on_updated_callback(lambda is_on: print(f"[tv] TV is {'on' if is_on else 'off (standby)'}"))
            print(f"[tv] Connected to TV at {TV_IP} (auto-reconnect enabled)")'''

if old_connect in content:
    content = content.replace(old_connect, new_connect)
    print("OK - added keep_reconnecting + is_on callback")
else:
    print("WARN - initial connect block not found")

# Also update the reconnect helper to use keep_reconnecting
old_reconnect = '''            await asyncio.wait_for(remote.async_connect(), timeout=5)
            _tv_remote = remote
            print(f"[tv] Reconnected to TV at {TV_IP}")'''

new_reconnect = '''            await asyncio.wait_for(remote.async_connect(), timeout=5)
            _tv_remote = remote
            remote.keep_reconnecting()
            print(f"[tv] Reconnected to TV at {TV_IP} (auto-reconnect enabled)")'''

if old_reconnect in content:
    content = content.replace(old_reconnect, new_reconnect)
    print("OK - added keep_reconnecting to reconnect helper")
else:
    print("WARN - reconnect helper block not found")

with open(_APP, "w") as f:
    f.write(content)
