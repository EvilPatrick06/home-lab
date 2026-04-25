"""Headless Google Calendar re-authorization.

Run on the Pi when the token is expired/revoked.
Prints a URL to open in any browser, then paste the auth code back.
Uses manual OAuth exchange (no PKCE) to avoid code verifier issues.
"""

import json
import os

import requests as http_requests
from google.oauth2.credentials import Credentials

_PI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(_PI_ROOT, "config")
SCOPES = ["https://www.googleapis.com/auth/calendar"]


def main():
    creds_path = os.path.join(CONFIG_DIR, "credentials.json")
    token_path = os.path.join(CONFIG_DIR, "token.json")

    if not os.path.exists(creds_path):
        print(f"ERROR: {creds_path} not found")
        return

    with open(creds_path) as f:
        client_config = json.load(f)["installed"]

    client_id = client_config["client_id"]
    client_secret = client_config["client_secret"]
    redirect_uri = "urn:ietf:wg:oauth:2.0:oob"

    # Build auth URL without PKCE
    auth_url = (
        f"https://accounts.google.com/o/oauth2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar"
        f"&access_type=offline"
        f"&prompt=consent"
    )

    print()
    print("=" * 60)
    print("Open this URL in ANY browser (phone, laptop, etc.):")
    print()
    print(auth_url)
    print()
    print("=" * 60)
    print()

    code = input("Paste the authorization code here: ").strip()

    # Exchange code for tokens manually (no PKCE verifier)
    token_resp = http_requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )

    if token_resp.status_code != 200:
        print(f"ERROR: Token exchange failed: {token_resp.text}")
        return

    token_data = token_resp.json()

    # Build credentials and save
    creds = Credentials(
        token=token_data["access_token"],
        refresh_token=token_data.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES,
    )

    os.makedirs(os.path.dirname(token_path), exist_ok=True)
    with open(token_path, "w") as f:
        f.write(creds.to_json())

    print(f"\nToken saved to {token_path}")
    print("Restart BMO to pick up the new token: sudo systemctl restart bmo")


if __name__ == "__main__":
    main()
