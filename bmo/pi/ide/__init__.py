"""IDE runtime services for BMO (production, not dev-only).

These modules are PRODUCTION runtime dependencies of the browser IDE + agents,
relocated out of the misleadingly-named `dev/` folder so the directory name
does not invite a "dev/ is non-prod, safe to skip/delete" mistake:

- terminal_service — TerminalManager: PTY spawn/read/write for the IDE terminal
                     (imported by routes/ide.py, ide_app/ide_app.py).
- file_watcher     — FileWatcher: filesystem change notifications for the IDE
                     (imported by routes/ide.py).
"""
