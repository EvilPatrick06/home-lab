"""Central filesystem roots for the BMO Pi assistant.

Single source of truth for the project root + data/models dirs, replacing the
~40 hand-rolled os.path.expanduser("~/home-lab/bmo/pi/...") literals scattered
across the tree. Resolved from the BMO_HOME env var, defaulting to the current
~/home-lab/bmo/pi so existing installs are byte-for-byte unaffected; set
BMO_HOME to relocate the tree (Docker, a non-patrick user, CI) without code
edits. Never raises; safe to import from hot paths.
"""
import os
from pathlib import Path

BMO_ROOT = Path(os.environ.get("BMO_HOME", os.path.expanduser("~/home-lab/bmo/pi")))
DATA_DIR = BMO_ROOT / "data"
MODELS_DIR = BMO_ROOT / "models"
