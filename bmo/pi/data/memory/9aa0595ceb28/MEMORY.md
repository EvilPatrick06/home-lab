
## IDE TODOs - Comprehensive Prompt
## BMO IDE — Remaining TODOs (saved 2026-03-16 01:27 AM)

User built a comprehensive detailed prompt with line numbers, function names, API patterns for the IDE code agent.

### Codebase Layout
- Backend: app.py (Flask + SocketIO, ~4500 lines)
- Frontend JS: static/ide/ide.js (~2480 lines, IIFE module)
- Frontend CSS: static/ide/ide.css (~1730 lines)
- Frontend HTML: templates/ide.html (373 lines)
- Music: music_service.py (754 lines)
- Agent: agent.py (~2088 lines)

### TODO 1: Fix Music Playing Wrong Song on Restart
- File: music_service.py
- Bug: On restart, plays different song than before. play() modifies queue_index when add_to_queue=True. restore_playback() calls play(song, add_to_queue=False). _save_playback_state() may save wrong index. _monitor_loop() may auto-advance during restore.
- Fix: Set queue_index BEFORE play(). Add self._restoring flag. Prevent _monitor_loop from firing next_track() during restore.

### TODO 2: Settings → Agents Section
- Files: ide.js (showSettings at line 1457), ide.css
- Add "Agents" section to settings modal with: Default Mode dropdown (Autopilot/Normal/Plan), Default Model dropdown (auto/fast/balanced/quality), Default Agent dropdown (from state._agentsList), Auto-approve toggle
- Wire into createJob() defaults

### TODO 3: Server-Side State Restore on Page Load
- Files: app.py (GET/POST /api/ide/state at lines 4359-4400), ide.js (persistState at 1105, restoreState at 1124)
- POST state to server in persistState(), fetch from server in restoreState(), debounce 2s

### TODO 4: Content Search (Ctrl+Shift+F)
- Files: ide.js, ide.html, ide.css
- Ctrl+Shift+F focuses #panel-search, searchFiles() already calls /api/ide/search, enhance renderSearchResults() to show line content, click to open file at line with monaco.editor.revealLineInCenter()

### TODO 5: Monaco Diff Approval View
- Files: ide.js, ide.css
- showDiffApproval(filePath, originalContent, newContent) using monaco.editor.createDiffEditor
- Approve/Deny buttons, wire into _handleJobActivity for file_edit events

### TODO 6: Push API + Service Worker (Mobile Notifications)
- New file static/ide/sw.js, ide.js, app.py
- Service worker registration, push subscription, POST /api/ide/push/subscribe, pywebpush for job completion notifications

### TODO 7: Voice → Job Integration
- Files: app.py
- When voice creates a task, also create an IDE job and emit socketio ide_job_started

### TODO 8: Multi-Workspace Support
- Files: app.py, ide.js, ide.html
- state.workspaces array, File → Add Workspace menu, collapsible roots in file tree, pass workspace root to all ops

### Key Reference Info
- API Endpoints: /api/ide/tree, file/read|write|edit|create|rename|delete, search, find, git/*, jobs/*, state
- JS Functions: initSocket(65), initMonaco(152), loadTree(254), openFile(386), saveFile(449), showSettings(1457), loadAgents(1630), loadJobs(1671), createJob(1752), persistState(1105), restoreState(1124), searchFiles(866), _handleJobActivity(1964)
- CSS Tokens: --accent:#7aa2f7, --green:#9ece6a, --red:#f7768e, --bg-darkest:#1a1b26, --bg-base:#282a3a
- Deploy: scp file to pi, sudo systemctl restart bmo
