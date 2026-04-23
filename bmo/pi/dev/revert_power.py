import re

with open("/home/patrick/bmo/app.py", "r") as f:
    lines = f.readlines()

# 1. Remove keep_reconnecting and is_on callback from initial connect (lines 1024-1026)
# Replace with simple print
new_lines = []
skip_until = -1
for i, line in enumerate(lines, 1):
    if i == 1024:  # remote.keep_reconnecting()
        continue
    elif i == 1025:  # remote.add_is_on_updated_callback(...)
        continue
    elif i == 1026:  # print(...auto-reconnect enabled...)
        new_lines.append('            print(f"[tv] Connected to TV at {TV_IP}")\n')
        continue
    elif i == 1169:  # _TV_MAC line - start skipping the whole block until power endpoint
        skip_until = 1229  # end of the modified power endpoint
        # Write the original simple power endpoint
        new_lines.append('@app.route("/api/tv/power", methods=["POST"])\n')
        new_lines.append('def api_tv_power():\n')
        new_lines.append('    if _tv_remote:\n')
        new_lines.append('        try:\n')
        new_lines.append('            _tv_remote.send_key_command("POWER")\n')
        new_lines.append('            return jsonify({"ok": True})\n')
        new_lines.append('        except Exception as e:\n')
        new_lines.append('            return jsonify({"error": str(e)}), 500\n')
        new_lines.append('    return jsonify({"error": "TV not connected \\u2014 pair first"}), 503\n')
        continue
    elif 1170 <= i <= skip_until:
        continue
    else:
        new_lines.append(line)

with open("/home/patrick/bmo/app.py", "w") as f:
    f.writelines(new_lines)

print("OK - reverted app.py to original power endpoint")
