"""Compatibility shim — implementation moved to services/calendar/reauth.py.

Kept so the operator-invoked path `services/reauth_calendar.py` (referenced in
runbook + monitoring re-auth messages) keeps working after the calendar package
move.
"""
import os
import sys

_PI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PI_ROOT not in sys.path:
    sys.path.insert(0, _PI_ROOT)

from services.calendar.reauth import main  # noqa: E402

if __name__ == "__main__":
    main()
