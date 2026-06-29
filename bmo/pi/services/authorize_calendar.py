"""Compatibility shim — implementation moved to services/calendar/authorize.py.

Kept so the operator-invoked path `services/authorize_calendar.py` keeps working
after the calendar package move.
"""
import os
import sys

_PI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PI_ROOT not in sys.path:
    sys.path.insert(0, _PI_ROOT)

from services.calendar.authorize import authorize  # noqa: E402

if __name__ == "__main__":
    authorize()
