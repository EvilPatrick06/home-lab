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

# Default BMO_ROOT to the checkout this code actually lives in — the parent of
# the services/ package (…/bmo/pi) — so live services and every child they spawn
# resolve data/models to the SAME tree they execute from. This removes the
# dev-tree vs deploy-checkout split-brain that occurred when BMO_HOME was unset
# and this defaulted to a fixed ~/home-lab/bmo/pi (BMO-ISSUES-LOG 2026-07-02).
# BMO_HOME still overrides for Docker / a non-patrick user / CI relocation.
_DEFAULT_BMO_ROOT = Path(__file__).resolve().parent.parent
BMO_ROOT = Path(os.environ.get("BMO_HOME", str(_DEFAULT_BMO_ROOT)))
DATA_DIR = BMO_ROOT / "data"
MODELS_DIR = BMO_ROOT / "models"
