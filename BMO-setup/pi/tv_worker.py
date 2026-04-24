#!/usr/bin/env python3
"""Long-lived TV worker — persistent connection, reads JSON commands from stdin."""
import asyncio
import json
import sys

from androidtvremote2 import AndroidTVRemote


class TVWorker:
    def __init__(self, certfile, keyfile, host):
        self.certfile = certfile
        self.keyfile = keyfile
        self.host = host
        self.remote = None
        self.is_on = None
        self.pairing_remote = None

    async def ensure_connected(self):
        """Connect if not already connected."""
        if self.remote is not None:
            return
        r = AndroidTVRemote(
            client_name="BMO",
            certfile=self.certfile,
            keyfile=self.keyfile,
            host=self.host,
        )
        await asyncio.wait_for(r.async_connect(), timeout=5)
        self.remote = r

        def _on_is_on(val):
            self.is_on = val

        r.add_is_on_updated_callback(_on_is_on)
        r.keep_reconnecting()

    async def handle(self, cmd):
        action = cmd.get("action", "")
        try:
            if action == "connect_test":
                await self.ensure_connected()
                vol = -1
                try:
                    vol = self.remote.volume_level if hasattr(self.remote, "volume_level") else -1
                except Exception:
                    pass
                return {
                    "ok": True,
                    "connected": True,
                    "is_on": self.is_on,
                    "current_app": self.remote.current_app or "",
                    "volume_level": vol,
                }

            elif action == "send_key":
                await self.ensure_connected()
                self.remote.send_key_command(cmd["key"])
                await asyncio.sleep(0.05)
                return {"ok": True}

            elif action == "launch_app":
                await self.ensure_connected()
                self.remote.send_launch_app_command(cmd["uri"])
                await asyncio.sleep(0.05)
                return {"ok": True}

            elif action == "pair_start":
                self.pairing_remote = AndroidTVRemote(
                    client_name="BMO",
                    certfile=self.certfile,
                    keyfile=self.keyfile,
                    host=self.host,
                )
                await self.pairing_remote.async_generate_cert_if_missing()
                await self.pairing_remote.async_start_pairing()
                return {"ok": True, "message": "Check your TV for a PIN code"}

            elif action == "pair_finish":
                if not self.pairing_remote:
                    return {"error": "No pairing in progress"}
                await self.pairing_remote.async_finish_pairing(cmd["pin"])
                await asyncio.wait_for(
                    self.pairing_remote.async_connect(), timeout=10
                )
                # Promote pairing remote to main remote
                if self.remote:
                    self.remote.disconnect()
                self.remote = self.pairing_remote
                self.pairing_remote = None
                self.remote.keep_reconnecting()
                return {"ok": True, "message": "Paired and connected!"}

            elif action == "status":
                connected = self.remote is not None
                vol = -1
                if connected:
                    try:
                        vol = self.remote.volume_level if hasattr(self.remote, "volume_level") else -1
                    except Exception:
                        pass
                return {
                    "ok": True,
                    "connected": connected,
                    "is_on": self.is_on,
                    "current_app": (
                        self.remote.current_app or "" if connected else ""
                    ),
                    "volume_level": vol,
                }

            elif action == "disconnect":
                if self.remote:
                    self.remote.disconnect()
                    self.remote = None
                return {"ok": True}

            else:
                return {"error": f"Unknown action: {action}"}

        except Exception as e:
            # Connection lost — clear remote so next call reconnects
            if "not connected" in str(e).lower() or "closed" in str(e).lower():
                self.remote = None
            return {"error": str(e)}


async def main():
    config = json.loads(sys.argv[1])
    worker = TVWorker(config["certfile"], config["keyfile"], config["host"])

    # Try initial connection
    try:
        await worker.ensure_connected()
        sys.stderr.write(f"[tv_worker] Connected to {config['host']}\n")
        sys.stderr.flush()
    except Exception as e:
        sys.stderr.write(f"[tv_worker] Initial connect failed: {e}\n")
        sys.stderr.flush()

    # Read commands from stdin, one JSON per line
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        try:
            line = await reader.readline()
            if not line:
                break
            cmd = json.loads(line.decode().strip())
            result = await worker.handle(cmd)
            sys.stdout.write(json.dumps(result) + "\n")
            sys.stdout.flush()
        except json.JSONDecodeError:
            sys.stdout.write(json.dumps({"error": "Invalid JSON"}) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"error": str(e)}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
