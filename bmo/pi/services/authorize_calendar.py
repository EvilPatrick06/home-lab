"""Google Calendar OAuth2 Authorization — run on a machine with a web browser (or use reauth_calendar on headless).

Saves the refresh token to bmo/pi/config/token.json (same directory as `app.py`’s calendar config).

Usage:
    cd ~/home-lab/bmo/pi && ./venv/bin/python services/authorize_calendar.py
"""

import os

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/calendar"]
_CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
CREDENTIALS_PATH = os.path.join(_CONFIG_DIR, "credentials.json")
TOKEN_PATH = os.path.join(_CONFIG_DIR, "token.json")


def authorize():
    creds = None
    wrote = False

    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing expired token...")
            try:
                creds.refresh(Request())
                wrote = True
            except RefreshError as e:
                print(f"Refresh failed ({e}); starting a new consent flow — remove stale token if prompted.")
                creds = None
        if not creds or not creds.valid:
            if not os.path.exists(CREDENTIALS_PATH):
                print(f"ERROR: credentials.json not found at {CREDENTIALS_PATH}")
                print("Download it from Google Cloud Console → APIs & Services → Credentials")
                return

            print("Opening browser for Google Calendar authorization...")
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
            wrote = True

    if wrote and creds and creds.valid:
        os.makedirs(_CONFIG_DIR, exist_ok=True)
        with open(TOKEN_PATH, "w") as f:
            f.write(creds.to_json())
        print(f"Token saved to {TOKEN_PATH}")

    print("\nAuthorization successful! Restart BMO: sudo systemctl restart bmo")


if __name__ == "__main__":
    authorize()
