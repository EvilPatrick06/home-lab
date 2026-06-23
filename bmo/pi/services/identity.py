"""Owner / identity config — single source for the deployment owner's name,
relationship to BMO, and default speaker.

Defaults to Gavin so behaviour is unchanged; a second household can override via
env (BMO_OWNER_NAME / BMO_OWNER_RELATIONSHIP / BMO_DEFAULT_SPEAKER) without a
find-and-replace through prompts and code. (BMO-SUGGESTIONS 2026-06-22.)
"""
import os

OWNER_NAME = os.environ.get("BMO_OWNER_NAME", "Gavin")
OWNER_RELATIONSHIP = os.environ.get("BMO_OWNER_RELATIONSHIP", "your best friend and creator")
DEFAULT_SPEAKER = os.environ.get("BMO_DEFAULT_SPEAKER", "gavin")
