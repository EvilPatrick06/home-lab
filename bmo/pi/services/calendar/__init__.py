"""Google Calendar integration package.

Groups the calendar API client + OAuth config + the authorize/reauth flows
(previously four flat services/*.py files) into one subpackage, mirroring
services/voice/. Submodules: service, oauth_config, authorize, reauth.
"""
