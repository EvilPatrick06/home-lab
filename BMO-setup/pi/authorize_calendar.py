"""Google Calendar OAuth2 Authorization — Run on Windows (one-time).

This script opens a browser for Google OAuth consent, then saves the
refresh token to token.json. Copy both credentials.json and token.json
to the Pi at ~/bmo/config/.

Usage:
    pip install google-api-python-client google-auth-oauthlib
    python authorize_calendar.py
"""

import os
import json

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/calendar"]
CONFIG_DIR = os.path.join(os.path.dirname(__file__), "config")
CREDENTIALS_PATH = os.path.join(CONFIG_DIR, "credentials.json")
TOKEN_PATH = os.path.join(CONFIG_DIR, "token.json")


def authorize():
    creds = None

    # Check for existing token
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    # If no valid credentials, do the OAuth flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing expired token...")
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_PATH):
                print(f"ERROR: credentials.json not found at {CREDENTIALS_PATH}")
                print("Download it from Google Cloud Console → APIs & Services → Credentials")
                return

            print("Opening browser for Google Calendar authorization...")
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)

        # Save the token
        with open(TOKEN_PATH, "w") as f:
            f.write(creds.to_json())
        print(f"Token saved to {TOKEN_PATH}")

    print("\nAuthorization successful!")
    print(f"\nNext steps:")
    print(f"  1. Copy to Pi: scp {TOKEN_PATH} pi@<pi-ip>:~/bmo/config/token.json")
    print(f"  2. Also copy:  scp {CREDENTIALS_PATH} pi@<pi-ip>:~/bmo/config/credentials.json")


if __name__ == "__main__":
    authorize()
