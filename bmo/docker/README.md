# BMO in Docker (optional)

> **Optional path — the supported deploy is host venv + systemd via `setup-bmo.sh`. Do not run both bindings of `:5000` at once.**

This directory holds an **off-by-default** container build of the BMO Flask app.
It is never wired into `setup-bmo.sh` or systemd — the host venv remains the
default and only supported deployment. The Docker image exists so the Flask app,
agents, and D&D engine can run in an isolated, reproducible userland (e.g. on a
non-Pi host, or for CI build proof). The `arm64` image is built — but not pushed
— by `.github/workflows/bmo-docker-build.yml` on every change here.

## What works in-container

- **Flask UI / web routes** (port 5000) — the full HTTP surface.
- **Agents** — the agent router and all `agents/` workflows.
- **D&D DM engine** — encounter/combat/narration logic.
- **Game relay + registry** — the VTT ↔ BMO relay (5000) and the device registry.
- **rclone / sounds / library APIs** — the file/asset API surface.
- The **music-less API surface** — endpoints that don't require local audio output.

## What does NOT work without host hardware

These need physical devices and are **disabled by default** (`BMO_DISABLE_OLED=1`,
`BMO_DISABLE_CAMERA=1` in `compose.yml`) or simply absent in a container:

- **OLED face display** — needs `/dev/i2c-*` passthrough.
- **Camera** — needs `picamera2` + the CSI camera device.
- **GPIO** — needs `/dev/gpiomem0` passthrough.
- **Voice** (mic capture + speaker playback) — needs `/dev/snd` passthrough.
- **Kiosk** — the on-Pi browser kiosk is a host-level concern, not containerized.
- **Fan control** — its own systemd service (`bmo-fan`), not part of this image.

Hardware can be re-enabled piecemeal by uncommenting the per-device entries under
`devices:` in `compose.yml` (and dropping the matching `BMO_DISABLE_*` env), but
this is unsupported and untested.

## How to run

```bash
cd bmo/docker
docker compose up -d --build
```

The container uses `network_mode: host` and reads secrets from `../pi/.env`, so
it binds the **same `:5000`** the host venv would. **Stop the systemd `bmo`
service first** (`sudo systemctl stop bmo`) — running both at once is a port
conflict.

Tear down with:

```bash
docker compose down
```

## Relationship to the other BMO containers

`setup-bmo.sh` already starts unrelated containers — `bmo-ollama`, `bmo-peerjs`,
`bmo-coturn`, `bmo-pihole`. Those are **unchanged and unrelated** to this image;
the BMO app talks to them over the network (host networking) exactly as it does
from the host venv. This image does not replace, depend on, or modify any of them.
