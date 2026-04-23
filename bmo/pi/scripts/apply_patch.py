"""Patch BMO's app.py to register VTT sync routes and dnd_dm.py to push Discord messages."""
import os

BMO_DIR = os.path.expanduser("~/DnD/bmo/pi")

# ── Patch app.py ──
app_path = os.path.join(BMO_DIR, "app.py")
with open(app_path, "r") as f:
    content = f.read()

if "vtt_sync" not in content:
    # Add import near top (before Flask app creation)
    content = content.replace(
        "app = Flask(__name__",
        "from agents.vtt_sync import register_sync_routes\n\napp = Flask(__name__",
        1,
    )
    # Register routes just before __main__
    content = content.replace(
        'if __name__ == "__main__":',
        "# VTT Sync Routes\nregister_sync_routes(app)\n\n"
        'if __name__ == "__main__":',
        1,
    )
    with open(app_path, "w") as f:
        f.write(content)
    print("app.py: patched (import + route registration)")
else:
    print("app.py: already patched")


# ── Patch dnd_dm.py ──
dm_path = os.path.join(BMO_DIR, "agents", "dnd_dm.py")
with open(dm_path, "r") as f:
    content = f.read()

if "push_discord_message" not in content:
    # Add import at top (after existing imports)
    content = content.replace(
        "from agents.base_agent import",
        "from agents.vtt_sync import push_discord_message\nfrom agents.base_agent import",
        1,
    )
    # Add push call in the run() method, right after the LLM reply
    content = content.replace(
        "# Parse game state updates",
        "# Forward response to VTT sync\n"
        "        try:\n"
        "            push_discord_message('DM', reply[:2000])\n"
        "        except Exception:\n"
        "            pass  # Non-critical\n\n"
        "        # Parse game state updates",
        1,
    )
    with open(dm_path, "w") as f:
        f.write(content)
    print("dnd_dm.py: patched (import + push_discord_message)")
else:
    print("dnd_dm.py: already patched")

print("\nDone! Restart BMO with: sudo systemctl restart bmo")
