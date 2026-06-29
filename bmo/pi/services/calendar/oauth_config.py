"""Shared Google Calendar OAuth config — single source of truth for paths + scopes.

authorize_calendar.py and reauth_calendar.py both need the same config dir,
credentials/token paths, and OAuth scope list. Defining them here keeps the two
scripts from drifting apart.
"""

import os

# Both auth scripts and this module live in bmo/pi/services/, so config/ is one
# directory up from here (bmo/pi/config).
_PI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(_PI_ROOT, "config")
CREDENTIALS_PATH = os.path.join(CONFIG_DIR, "credentials.json")
TOKEN_PATH = os.path.join(CONFIG_DIR, "token.json")

SCOPES = ["https://www.googleapis.com/auth/calendar"]
