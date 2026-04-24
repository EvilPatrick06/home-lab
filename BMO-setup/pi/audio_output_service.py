"""Audio output routing service for BMO.

Uses PipeWire/WirePlumber (wpctl) for device enumeration and switching.
Supports per-function audio routing and Bluetooth device management.
"""

import json
import os
import re
import subprocess
import threading
import time

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "data", "settings.json")

# Audio function categories that can be independently routed
AUDIO_FUNCTIONS = ["music", "voice", "effects", "notifications", "all"]


def _run(cmd: list[str], timeout: int = 10) -> tuple[int, str, str]:
    """Run a shell command, return (returncode, stdout, stderr)."""
    env = os.environ.copy()
    env["XDG_RUNTIME_DIR"] = "/run/user/1000"
    env["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=/run/user/1000/bus"
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
        return r.returncode, r.stdout, r.stderr
    except Exception as e:
        return 1, "", str(e)


class AudioDevice:
    """Represents a PipeWire audio sink or source."""

    def __init__(self, pw_id: int, name: str, description: str, is_default: bool = False):
        self.pw_id = pw_id
        self.name = name
        self.description = description
        self.is_default = is_default

    def to_dict(self) -> dict:
        return {
            "id": self.pw_id,
            "name": self.name,
            "description": self.description,
            "is_default": self.is_default,
        }


class AudioOutputService:
    """Manages audio output routing via PipeWire/WirePlumber."""

    def __init__(self):
        self._lock = threading.Lock()
        self._pw_procs: list[subprocess.Popen] = []
        self._ensure_pipewire()
        # Per-function device assignments: function -> pw_id
        self._routing: dict[str, int | None] = {}
        # Per-function device descriptions for resolving across reboots
        self._routing_desc: dict[str, str | None] = {}
        self._load_routing()
        self._resolve_and_apply_routing()

    def _ensure_pipewire(self):
        """Start PipeWire stack if not already running."""
        import time
        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        env["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=/run/user/1000/bus"

        # Check if PipeWire is already running and connectable
        r = subprocess.run(["wpctl", "status"], capture_output=True, text=True, timeout=5, env=env)
        if r.returncode == 0 and "Sinks:" in r.stdout:
            print("[audio] PipeWire already running")
            return

        # Kill any stale processes and sockets
        for proc_name in ["pipewire-pulse", "wireplumber", "pipewire"]:
            subprocess.run(["pkill", "-u", str(os.getuid()), "-x", proc_name],
                           capture_output=True, timeout=3)
        time.sleep(1)
        # Remove stale sockets
        import glob
        for f in glob.glob("/run/user/1000/pipewire*"):
            try:
                os.unlink(f)
            except OSError:
                pass

        print("[audio] Starting PipeWire stack...")
        # Start PipeWire
        pw = subprocess.Popen(["pipewire"], env=env)
        self._pw_procs.append(pw)
        time.sleep(3)

        # Start WirePlumber
        wp = subprocess.Popen(["wireplumber"], env=env)
        self._pw_procs.append(wp)
        time.sleep(2)

        # Start PipeWire-Pulse
        pp = subprocess.Popen(["pipewire-pulse"], env=env)
        self._pw_procs.append(pp)
        time.sleep(2)

        # Verify
        r = subprocess.run(["wpctl", "status"], capture_output=True, text=True, timeout=5, env=env)
        if r.returncode == 0 and "Sinks:" in r.stdout:
            print("[audio] PipeWire stack started successfully")
        else:
            print(f"[audio] PipeWire stack may not be fully ready: rc={r.returncode}")

    # ── Device Enumeration ──────────────────────────────────────────

    def list_sinks(self) -> list[AudioDevice]:
        """List active audio output devices (sinks only, no disconnected)."""
        rc, out, _ = _run(["wpctl", "status"])
        if rc != 0:
            return []
        return self._parse_sinks(out)

    def list_sources(self) -> list[AudioDevice]:
        """List active audio input devices (sources)."""
        rc, out, _ = _run(["wpctl", "status"])
        if rc != 0:
            return []
        return self._parse_sources(out)

    def _parse_sinks(self, wpctl_output: str) -> list[AudioDevice]:
        """Parse wpctl status output for active sinks."""
        return self._parse_section(wpctl_output, "Sinks:")

    def _parse_sources(self, wpctl_output: str) -> list[AudioDevice]:
        """Parse wpctl status output for active sources."""
        return self._parse_section(wpctl_output, "Sources:")

    def _parse_section(self, output: str, section_header: str) -> list[AudioDevice]:
        """Parse a section of wpctl status output for devices."""
        devices = []
        lines = output.split("\n")
        in_audio = False
        in_section = False

        for line in lines:
            stripped = line.strip()
            # Strip tree-drawing characters (│├└─ and spaces)
            clean = re.sub(r'^[│├└─\s]+', '', stripped)

            if clean.startswith("Audio"):
                in_audio = True
                continue
            if in_audio and clean.startswith("Video"):
                break
            if in_audio and clean == section_header:
                in_section = True
                continue
            if in_section:
                # End of section: next header like "Sources:", "Filters:", "Streams:"
                if clean and clean.endswith(":") and not any(c.isdigit() for c in clean.rstrip(":")):
                    in_section = False
                    continue
                # Empty or tree-only lines
                if not clean:
                    continue

                # Match: "*   78. Built-in Audio Digital Stereo (HDMI) [vol: 1.00]"
                #    or: "    79. Some Device [vol: 0.50]"
                match = re.match(r'(\*)?\s*(\d+)\.\s+(.+?)(?:\s+\[vol:.*\])?\s*$', clean)
                if match:
                    is_default = match.group(1) == "*"
                    pw_id = int(match.group(2))
                    desc = match.group(3).strip()
                    if desc.lower().startswith("default"):
                        continue
                    devices.append(AudioDevice(pw_id, f"sink_{pw_id}", desc, is_default))

        return devices

    def get_default_sink(self) -> AudioDevice | None:
        """Get the current default audio output device."""
        sinks = self.list_sinks()
        for s in sinks:
            if s.is_default:
                return s
        return sinks[0] if sinks else None

    def get_default_source(self) -> "AudioDevice | None":
        """Get the current default audio input device (source)."""
        sources = self.list_sources()
        for s in sources:
            if s.is_default:
                return s
        return sources[0] if sources else None

    # ── Output Switching ────────────────────────────────────────────

    def set_default_output(self, pw_id: int) -> bool:
        """Set the default audio output device for the whole system."""
        rc, _, err = _run(["wpctl", "set-default", str(pw_id)])
        if rc != 0:
            print(f"[audio] Failed to set default sink {pw_id}: {err}")
            return False
        print(f"[audio] Default output set to device {pw_id}")
        return True

    def set_default_input(self, pw_id: int) -> bool:
        """Set the default audio input device (source) for the whole system."""
        rc, _, err = _run(["wpctl", "set-default", str(pw_id)])
        if rc != 0:
            print(f"[audio] Failed to set default source {pw_id}: {err}")
            return False
        print(f"[audio] Default input set to device {pw_id}")
        return True

    def set_function_output(self, function: str, pw_id: int) -> bool:
        """Route a specific function's audio to a device.

        Sets the system default AND moves active streams to the target sink.
        """
        # Look up device description for persistent storage
        desc = None
        sink_name = None
        for sink in self.list_sinks():
            if sink.pw_id == pw_id:
                desc = sink.description
                sink_name = self._get_sink_node_name(pw_id)
                break

        if function == "all":
            success = self.set_default_output(pw_id)
            if success:
                self._move_all_streams(pw_id, sink_name)
                with self._lock:
                    self._routing = {f: pw_id for f in AUDIO_FUNCTIONS if f != "all"}
                    self._routing_desc = {f: desc for f in AUDIO_FUNCTIONS if f != "all"}
                    self._save_routing()
            return success

        if function not in AUDIO_FUNCTIONS:
            print(f"[audio] Unknown function: {function}")
            return False

        # Set as default and move streams so it takes effect immediately
        self.set_default_output(pw_id)
        self._move_all_streams(pw_id, sink_name)

        with self._lock:
            self._routing[function] = pw_id
            self._routing_desc[function] = desc
            self._save_routing()
        print(f"[audio] {function} routed to device {pw_id}")
        return True

    def _get_sink_node_name(self, pw_id: int) -> str | None:
        """Get the PipeWire node.name for a sink (used by pactl)."""
        try:
            rc, out, _ = _run(["pw-dump"], timeout=5)
            if rc != 0:
                return None
            import json as _json
            nodes = _json.loads(out)
            for n in nodes:
                if n.get("id") == pw_id and n.get("type") == "PipeWire:Interface:Node":
                    return n.get("info", {}).get("props", {}).get("node.name")
        except Exception:
            pass
        return None

    def _move_all_streams(self, pw_id: int, sink_name: str | None):
        """Move all active playback streams to the target sink via pactl."""
        if not sink_name:
            sink_name = self._get_sink_node_name(pw_id)
        if not sink_name:
            print(f"[audio] Cannot resolve sink name for pw_id {pw_id}")
            return

        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        try:
            r = subprocess.run(
                ["pactl", "list", "sink-inputs", "short"],
                capture_output=True, text=True, timeout=5, env=env,
            )
            if r.returncode != 0:
                print(f"[audio] pactl list failed: {r.stderr}")
                return
            for line in r.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                stream_idx = line.split()[0]
                rc, _, err = _run(["pactl", "move-sink-input", stream_idx, sink_name])
                if rc == 0:
                    print(f"[audio] Moved stream {stream_idx} → {sink_name}")
                else:
                    print(f"[audio] Failed to move stream {stream_idx}: {err}")
        except Exception as e:
            print(f"[audio] Stream move failed: {e}")

    def get_function_output(self, function: str) -> int | None:
        """Get the device ID assigned to a function, or None for system default."""
        with self._lock:
            return self._routing.get(function)

    def get_all_routing(self) -> dict:
        """Get all function-to-device routing as a dict."""
        sinks = self.list_sinks()
        sink_map = {s.pw_id: s.to_dict() for s in sinks}
        default = self.get_default_sink()

        result = {}
        for func in AUDIO_FUNCTIONS:
            if func == "all":
                continue
            pw_id = self._routing.get(func)
            if pw_id and pw_id in sink_map:
                result[func] = sink_map[pw_id]
            elif default:
                result[func] = {**default.to_dict(), "is_default": True}
            else:
                result[func] = None
        return result

    # ── Bluetooth ───────────────────────────────────────────────────

    def bluetooth_scan(self, duration: int = 10) -> list[dict]:
        """Scan for Bluetooth audio devices. Returns list of {address, name}."""
        import subprocess as sp
        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        env["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=/run/user/1000/bus"

        # Run scan in a persistent bluetoothctl process and parse results in-session
        try:
            proc = sp.Popen(
                ["bluetoothctl"],
                stdin=sp.PIPE, stdout=sp.PIPE, stderr=sp.PIPE,
                text=True, env=env,
            )
            proc.stdin.write("power on\n")
            proc.stdin.flush()
            time.sleep(0.5)
            proc.stdin.write("scan on\n")
            proc.stdin.flush()
            time.sleep(min(duration, 15))
            # Ask for device list inside the same session that ran the scan
            proc.stdin.write("devices\n")
            proc.stdin.flush()
            time.sleep(1)
            proc.stdin.write("scan off\n")
            proc.stdin.flush()
            time.sleep(0.5)
            proc.stdin.write("quit\n")
            proc.stdin.flush()
            out, _ = proc.communicate(timeout=5)
        except Exception as e:
            print(f"[bt] Scan process error: {e}")
            try:
                proc.kill()
            except Exception:
                pass
            return []

        # Parse "Device XX:XX:XX:XX:XX:XX Name" lines (not [NEW]/[CHG] lines)
        devices = []
        seen = set()
        for line in out.split("\n"):
            line = line.strip()
            # Match plain "Device" lines (from the `devices` command), not [NEW]/[CHG]
            if line.startswith("Device "):
                match = re.match(r"Device\s+([0-9A-Fa-f:]+)\s+(.+)", line)
                if match:
                    addr = match.group(1)
                    name = match.group(2).strip()
                    if addr in seen:
                        continue
                    seen.add(addr)
                    # Skip unresolved: name is MAC with dashes (e.g. 02-71-88-FB-A6-B3)
                    if re.fullmatch(r"[0-9A-Fa-f]{2}(-[0-9A-Fa-f]{2}){5}", name):
                        continue
                    # Skip if name is just the MAC with colons
                    if name.upper() == addr.upper():
                        continue
                    devices.append({"address": addr, "name": name})
        print(f"[bt] Scan found {len(devices)} named devices")
        return devices

    def bluetooth_pair(self, address: str) -> tuple[bool, str]:
        """Pair and connect to a Bluetooth device with proper A2DP negotiation.

        Uses a single persistent bluetoothctl session to maintain state during
        the pair→trust→connect flow, which is required for A2DP transport setup.
        """
        import subprocess as _sp
        import time as _t

        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        env["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=/run/user/1000/bus"

        try:
            proc = _sp.Popen(
                ["bluetoothctl"],
                stdin=_sp.PIPE, stdout=_sp.PIPE, stderr=_sp.PIPE,
                text=True, env=env,
            )
            # Power on
            proc.stdin.write("power on\n")
            proc.stdin.flush()
            _t.sleep(0.5)

            # Remove stale pairing for fresh A2DP negotiation
            proc.stdin.write(f"remove {address}\n")
            proc.stdin.flush()
            _t.sleep(1)

            # Scan to re-discover the device
            proc.stdin.write("scan on\n")
            proc.stdin.flush()
            _t.sleep(8)  # give enough time to discover

            # Pair + trust + connect in the same session
            proc.stdin.write(f"pair {address}\n")
            proc.stdin.flush()
            _t.sleep(5)

            proc.stdin.write(f"trust {address}\n")
            proc.stdin.flush()
            _t.sleep(1)

            proc.stdin.write("scan off\n")
            proc.stdin.flush()
            _t.sleep(0.5)

            proc.stdin.write(f"connect {address}\n")
            proc.stdin.flush()
            _t.sleep(5)

            proc.stdin.write("quit\n")
            proc.stdin.flush()
            out, _ = proc.communicate(timeout=5)
        except Exception as e:
            print(f"[bt] Pair session error: {e}")
            try:
                proc.kill()
            except Exception:
                pass
            return False, f"Pair failed: {e}"

        # Check for errors in output
        out_lower = out.lower() if out else ""
        if "not available" in out_lower and "already exists" not in out_lower:
            return False, "Device not available — make sure it's nearby and in pairing mode"

        # Wait for PipeWire to register the new BT A2DP sink
        _t.sleep(5)
        for sink in self.list_sinks():
            if address.replace(":", "_").upper() in sink.name.upper() or \
               (sink.description and sink.description not in ("Built-in Audio Digital Stereo (HDMI)", "")):
                self.set_default_output(sink.pw_id)
                print(f"[audio] Auto-set BT device {sink.description} (id={sink.pw_id}) as default")
                break

        return True, f"Connected to {address}"

    def bluetooth_disconnect(self, address: str) -> tuple[bool, str]:
        """Disconnect a Bluetooth device."""
        rc, _, err = _run(["bluetoothctl", "disconnect", address], timeout=5)
        if rc != 0:
            return False, f"Disconnect failed: {err}"
        return True, f"Disconnected {address}"

    def bluetooth_connected(self) -> list[dict]:
        """List currently connected Bluetooth devices."""
        rc, out, _ = _run(["bluetoothctl", "devices", "Connected"])
        if rc != 0:
            return []

        devices = []
        for line in out.strip().split("\n"):
            match = re.match(r"Device\s+([0-9A-Fa-f:]+)\s+(.+)", line.strip())
            if match:
                devices.append({"address": match.group(1), "name": match.group(2)})
        return devices

    # ── Persistence ─────────────────────────────────────────────────

    def _load_routing(self):
        """Load routing preferences from settings.json."""
        try:
            if os.path.exists(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    settings = json.load(f)
                raw = settings.get("audio_routing", {})
                # Convert string keys to int values
                self._routing = {k: int(v) for k, v in raw.items() if v is not None}
                # Load saved descriptions for re-resolving after reboot
                self._routing_desc = settings.get("audio_routing_desc", {})
        except Exception as e:
            print(f"[audio] Failed to load routing: {e}")
            self._routing = {}
            self._routing_desc = {}

    def _resolve_and_apply_routing(self):
        """Re-resolve saved device descriptions to current PW IDs after reboot."""
        if not self._routing_desc:
            return
        try:
            sinks = self.list_sinks()
            if not sinks:
                return
            # Build description -> current pw_id map
            desc_to_id = {s.description.lower(): s.pw_id for s in sinks}
            updated = False
            applied_default = False
            for func, desc in self._routing_desc.items():
                if not desc:
                    continue
                current_id = desc_to_id.get(desc.lower())
                if current_id is not None:
                    old_id = self._routing.get(func)
                    if old_id != current_id:
                        self._routing[func] = current_id
                        updated = True
                        print(f"[audio] Re-resolved {func}: '{desc}' -> pw_id {current_id} (was {old_id})")
                    # Apply the first resolved device as system default
                    if not applied_default:
                        self.set_default_output(current_id)
                        applied_default = True
                else:
                    print(f"[audio] Cannot resolve saved device for {func}: '{desc}' — not found in current sinks")
            if updated:
                self._save_routing()
        except Exception as e:
            print(f"[audio] Routing resolve failed: {e}")

    def _save_routing(self):
        """Save routing preferences to settings.json."""
        try:
            os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
            settings = {}
            if os.path.exists(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    settings = json.load(f)
            settings["audio_routing"] = self._routing
            settings["audio_routing_desc"] = self._routing_desc
            with open(SETTINGS_PATH, "w") as f:
                json.dump(settings, f, indent=2)
        except Exception as e:
            print(f"[audio] Failed to save routing: {e}")

    # ── Convenience ─────────────────────────────────────────────────

    def find_device_by_name(self, name: str) -> AudioDevice | None:
        """Find a sink by partial name match (case-insensitive)."""
        name_lower = name.lower()
        for sink in self.list_sinks():
            if name_lower in sink.description.lower():
                return sink
        return None

    def get_status(self) -> dict:
        """Get full audio status for API/voice responses."""
        return {
            "default": (d := self.get_default_sink()) and d.to_dict(),
            "sinks": [s.to_dict() for s in self.list_sinks()],
            "sources": [s.to_dict() for s in self.list_sources()],
            "routing": self.get_all_routing(),
            "bluetooth_connected": self.bluetooth_connected(),
        }
