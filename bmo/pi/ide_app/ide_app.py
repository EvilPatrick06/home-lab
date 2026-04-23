"""BMO IDE Test App — Standalone Flask + SocketIO IDE on port 5001.

A brand-new IDE built from scratch. Runs independently alongside
the main BMO app (port 5000).
"""

import mimetypes
import os
import subprocess
import sys
import threading

from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO, emit

# ── Import terminal service from parent directory ────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from dev.terminal_service import TerminalManager

# ── App Setup ────────────────────────────────────────────────────

app = Flask(__name__,
            template_folder='templates',
            static_folder='static')
app.config['SECRET_KEY'] = 'bmo-ide-dev-2024'

socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading')
terminal_mgr = TerminalManager()

# ── Configuration ────────────────────────────────────────────────

PI_HOME = os.path.expanduser('~')
DEFAULT_PATH = PI_HOME
LANGUAGE_MAP = {
    '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
    '.tsx': 'typescript', '.jsx': 'javascript', '.html': 'html',
    '.css': 'css', '.json': 'json', '.md': 'markdown',
    '.sh': 'shell', '.bash': 'shell', '.yml': 'yaml',
    '.yaml': 'yaml', '.toml': 'toml', '.xml': 'xml',
    '.sql': 'sql', '.rs': 'rust', '.go': 'go',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
    '.java': 'java', '.rb': 'ruby', '.php': 'php',
    '.txt': 'plaintext', '.log': 'plaintext',
    '.env': 'plaintext', '.gitignore': 'plaintext',
    '.service': 'ini', '.conf': 'ini', '.ini': 'ini',
    '.dockerfile': 'dockerfile', '.svg': 'xml',
}

BINARY_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
    '.mp3', '.mp4', '.wav', '.ogg', '.flac',
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.exe', '.dll', '.so', '.o', '.pyc', '.whl',
    '.woff', '.woff2', '.ttf', '.eot',
}

HIDDEN_DIRS = {'.git', 'node_modules', '__pycache__', '.venv', 'venv',
               '.mypy_cache', '.pytest_cache', '.tox', 'dist', 'build',
               '.next', '.nuxt'}


def _resolve_path(path: str) -> str:
    """Expand ~ and resolve to absolute path safely."""
    if path.startswith('~'):
        path = os.path.expanduser(path)
    return os.path.abspath(path)


def _detect_language(filepath: str) -> str:
    """Guess Monaco editor language from file extension."""
    _, ext = os.path.splitext(filepath.lower())
    # Handle Dockerfile (no extension)
    basename = os.path.basename(filepath).lower()
    if basename == 'dockerfile':
        return 'dockerfile'
    if basename == 'makefile':
        return 'makefile'
    return LANGUAGE_MAP.get(ext, 'plaintext')


def _is_binary(filepath: str) -> bool:
    """Check if a file is likely binary."""
    _, ext = os.path.splitext(filepath.lower())
    return ext in BINARY_EXTENSIONS


# ── Page Routes ──────────────────────────────────────────────────

@app.route('/')
def index():
    """Main IDE view — device detection happens client-side."""
    return render_template('ide.html')


# ── File API ─────────────────────────────────────────────────────

@app.route('/api/files/tree')
def file_tree():
    """List directory contents. Returns dirs and files sorted."""
    path = request.args.get('path', DEFAULT_PATH)
    resolved = _resolve_path(path)

    if not os.path.isdir(resolved):
        return jsonify({'error': f'Not a directory: {path}'}), 400

    try:
        entries = os.listdir(resolved)
    except PermissionError:
        return jsonify({'error': f'Permission denied: {path}'}), 403

    dirs = []
    files = []

    for name in sorted(entries, key=str.lower):
        if name.startswith('.') and name in ('.git',):
            continue  # Skip .git but show other dotfiles
        if name in HIDDEN_DIRS:
            continue

        full = os.path.join(resolved, name)
        if os.path.isdir(full):
            dirs.append(name + '/')
        elif os.path.isfile(full):
            try:
                size = os.path.getsize(full)
            except OSError:
                size = 0
            files.append({'name': name, 'size': size})

    return jsonify({
        'path': path,
        'dirs': dirs,
        'files': files,
    })


@app.route('/api/files/read', methods=['POST'])
def file_read():
    """Read file contents. Returns content + detected language."""
    data = request.get_json()
    path = data.get('path', '')
    resolved = _resolve_path(path)

    if not os.path.isfile(resolved):
        return jsonify({'error': f'Not a file: {path}'}), 404

    if _is_binary(resolved):
        return jsonify({'error': 'Binary file', 'binary': True}), 400

    try:
        with open(resolved, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except PermissionError:
        return jsonify({'error': f'Permission denied: {path}'}), 403

    return jsonify({
        'content': content,
        'language': _detect_language(resolved),
        'size': len(content),
        'path': path,
    })


@app.route('/api/files/write', methods=['POST'])
def file_write():
    """Write content to a file."""
    data = request.get_json()
    path = data.get('path', '')
    content = data.get('content', '')
    resolved = _resolve_path(path)

    try:
        os.makedirs(os.path.dirname(resolved), exist_ok=True)
        with open(resolved, 'w', encoding='utf-8') as f:
            f.write(content)
        return jsonify({'success': True, 'path': path})
    except PermissionError:
        return jsonify({'error': f'Permission denied: {path}'}), 403
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/create', methods=['POST'])
def file_create():
    """Create a new file or directory."""
    data = request.get_json()
    path = data.get('path', '')
    is_dir = data.get('is_dir', False)
    resolved = _resolve_path(path)

    try:
        if is_dir:
            os.makedirs(resolved, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(resolved), exist_ok=True)
            if not os.path.exists(resolved):
                open(resolved, 'w').close()
        return jsonify({'success': True, 'path': path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/delete', methods=['POST'])
def file_delete():
    """Delete a file or empty directory."""
    data = request.get_json()
    path = data.get('path', '')
    resolved = _resolve_path(path)

    try:
        if os.path.isfile(resolved):
            os.remove(resolved)
        elif os.path.isdir(resolved):
            os.rmdir(resolved)  # Only removes empty dirs for safety
        else:
            return jsonify({'error': f'Not found: {path}'}), 404
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/rename', methods=['POST'])
def file_rename():
    """Rename/move a file or directory."""
    data = request.get_json()
    old_path = _resolve_path(data.get('old_path', ''))
    new_path = _resolve_path(data.get('new_path', ''))

    try:
        os.rename(old_path, new_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Search API ───────────────────────────────────────────────────

@app.route('/api/files/search')
def file_search():
    """Search file contents using grep."""
    pattern = request.args.get('pattern', '')
    path = request.args.get('path', DEFAULT_PATH)
    resolved = _resolve_path(path)

    if not pattern:
        return jsonify({'matches': []})

    try:
        result = subprocess.run(
            ['grep', '-rnI', '--include=*', '-l', pattern, resolved],
            capture_output=True, text=True, timeout=10,
        )
        files = result.stdout.strip().split('\n')[:50] if result.stdout.strip() else []

        matches = []
        for filepath in files:
            # Get the first matching line for context
            try:
                line_result = subprocess.run(
                    ['grep', '-n', '-m', '1', pattern, filepath],
                    capture_output=True, text=True, timeout=5,
                )
                if line_result.stdout:
                    parts = line_result.stdout.split(':', 2)
                    line_num = int(parts[0]) if len(parts) > 1 else 1
                    content = parts[2].strip()[:200] if len(parts) > 2 else ''
                    matches.append({
                        'file': filepath,
                        'line': line_num,
                        'content': content,
                    })
            except Exception:
                matches.append({'file': filepath, 'line': 1, 'content': ''})

        return jsonify({'matches': matches})
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Search timed out'}), 408
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/find')
def file_find():
    """Find files by name pattern (for quick-open)."""
    pattern = request.args.get('pattern', '')
    path = request.args.get('path', DEFAULT_PATH)
    resolved = _resolve_path(path)

    if not pattern:
        return jsonify({'matches': []})

    try:
        result = subprocess.run(
            ['find', resolved, '-maxdepth', '6', '-type', 'f',
             '-iname', f'*{pattern}*',
             '-not', '-path', '*/.git/*',
             '-not', '-path', '*/node_modules/*',
             '-not', '-path', '*/__pycache__/*'],
            capture_output=True, text=True, timeout=5,
        )
        matches = result.stdout.strip().split('\n')[:30] if result.stdout.strip() else []
        return jsonify({'matches': matches})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Git API ──────────────────────────────────────────────────────

@app.route('/api/git/status')
def git_status():
    """Get git status for a repo path."""
    path = request.args.get('path', DEFAULT_PATH)
    resolved = _resolve_path(path)

    try:
        # Get branch
        branch = subprocess.run(
            ['git', '-C', resolved, 'branch', '--show-current'],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()

        # Get status
        result = subprocess.run(
            ['git', '-C', resolved, 'status', '--porcelain'],
            capture_output=True, text=True, timeout=5,
        )
        changes = []
        for line in result.stdout.strip().split('\n'):
            if line.strip():
                status = line[:2].strip()
                filepath = line[3:].strip()
                changes.append({'status': status, 'path': filepath})

        return jsonify({'branch': branch, 'changes': changes})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/git/stage', methods=['POST'])
def git_stage():
    """Stage a file."""
    data = request.get_json()
    path = data.get('path', '')
    repo = _resolve_path(data.get('repo', DEFAULT_PATH))

    try:
        subprocess.run(['git', '-C', repo, 'add', path],
                       capture_output=True, text=True, timeout=5)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/git/unstage', methods=['POST'])
def git_unstage():
    """Unstage a file."""
    data = request.get_json()
    path = data.get('path', '')
    repo = _resolve_path(data.get('repo', DEFAULT_PATH))

    try:
        subprocess.run(['git', '-C', repo, 'reset', 'HEAD', path],
                       capture_output=True, text=True, timeout=5)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/git/commit', methods=['POST'])
def git_commit():
    """Commit staged changes."""
    data = request.get_json()
    message = data.get('message', '')
    repo = _resolve_path(data.get('repo', DEFAULT_PATH))

    if not message.strip():
        return jsonify({'error': 'Empty commit message'}), 400

    try:
        result = subprocess.run(
            ['git', '-C', repo, 'commit', '-m', message],
            capture_output=True, text=True, timeout=10,
        )
        return jsonify({
            'success': result.returncode == 0,
            'output': result.stdout + result.stderr,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/git/branches')
def git_branches():
    """List git branches."""
    path = request.args.get('path', DEFAULT_PATH)
    resolved = _resolve_path(path)

    try:
        result = subprocess.run(
            ['git', '-C', resolved, 'branch', '-a'],
            capture_output=True, text=True, timeout=5,
        )
        branches = [b.strip().lstrip('* ') for b in result.stdout.strip().split('\n') if b.strip()]
        return jsonify({'branches': branches})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/git/checkout', methods=['POST'])
def git_checkout():
    """Checkout a branch."""
    data = request.get_json()
    branch = data.get('branch', '')
    repo = _resolve_path(data.get('repo', DEFAULT_PATH))

    try:
        result = subprocess.run(
            ['git', '-C', repo, 'checkout', branch],
            capture_output=True, text=True, timeout=10,
        )
        return jsonify({
            'success': result.returncode == 0,
            'output': result.stdout + result.stderr,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Run API ──────────────────────────────────────────────────────

@app.route('/api/run', methods=['POST'])
def run_file():
    """Execute a file (Python, JS, TS, Shell)."""
    data = request.get_json()
    path = data.get('path', '')
    resolved = _resolve_path(path)

    if not os.path.isfile(resolved):
        return jsonify({'error': f'Not a file: {path}'}), 404

    ext = os.path.splitext(resolved)[1].lower()
    name = os.path.basename(resolved)

    cmd_map = {
        '.py': f'python3 {resolved}',
        '.sh': f'bash {resolved}',
        '.js': f'node {resolved}',
        '.ts': f'npx tsx {resolved}',
    }

    cmd = cmd_map.get(ext)
    if not cmd:
        return jsonify({'error': f'Unsupported file type: {ext}'}), 400

    # Check for test files
    if 'test' in name.lower():
        if ext == '.py':
            cmd = f'pytest -v {resolved}'
        elif ext in ('.js', '.ts'):
            cmd = f'npx vitest run {resolved}'

    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=30, cwd=os.path.dirname(resolved),
        )
        return jsonify({
            'output': result.stdout + result.stderr,
            'exit_code': result.returncode,
        })
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Execution timed out (30s)'}), 408
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── SocketIO: Terminal ────────────────────────────────────────────

@socketio.on('terminal_open')
def handle_terminal_open(data):
    """Open a new PTY terminal session."""
    term_id = data.get('term_id', 'term-1')
    cols = data.get('cols', 80)
    rows = data.get('rows', 24)
    sid = request.sid

    def output_callback(tid, raw_bytes):
        socketio.emit('terminal_output', {
            'term_id': tid,
            'data': raw_bytes.decode('utf-8', errors='replace'),
        }, to=sid)

    terminal_mgr.open_terminal(sid, term_id, cols, rows, output_callback)


@socketio.on('terminal_input')
def handle_terminal_input(data):
    """Send input to a terminal session."""
    term_id = data.get('term_id', '')
    input_data = data.get('data', '')
    sid = request.sid

    session = terminal_mgr.get_session(sid, term_id)
    if session:
        session.write(input_data.encode('utf-8'))


@socketio.on('terminal_resize')
def handle_terminal_resize(data):
    """Resize a terminal session."""
    term_id = data.get('term_id', '')
    cols = data.get('cols', 80)
    rows = data.get('rows', 24)
    sid = request.sid

    session = terminal_mgr.get_session(sid, term_id)
    if session:
        session.resize(cols, rows)


@socketio.on('terminal_close')
def handle_terminal_close(data):
    """Close a terminal session."""
    term_id = data.get('term_id', '')
    terminal_mgr.close_terminal(request.sid, term_id)


@socketio.on('disconnect')
def handle_disconnect():
    """Clean up all terminal sessions on disconnect."""
    terminal_mgr.close_all(request.sid)


# ── Agent System ─────────────────────────────────────────────────

# Agent registry — populated once at startup
_agent_info = []  # cached list of {name, display_name, tier}
_chat_history = []  # shared chat history for IDE sessions
_agent_override = None  # pinned agent name or None for auto-routing
_model_override = None  # model tier override


def _discover_agents():
    """Scan the agents directory and build a lightweight list."""
    global _agent_info
    agents_dir = os.path.join(os.path.dirname(__file__), '..', 'agents')

    AGENT_TIERS = {
        'code': 'opus', 'dnd_dm': 'opus',
        'plan': 'pro', 'research': 'pro', 'review': 'pro', 'design': 'pro',
        'security': 'pro', 'deploy': 'pro', 'docs': 'pro', 'test': 'pro', 'learning': 'pro',
        'conversation': 'flash', 'music': 'flash', 'smart_home': 'flash',
        'timer': 'flash', 'calendar': 'flash', 'weather': 'flash',
        'monitoring': 'flash', 'cleanup': 'flash',
    }

    AGENT_ICONS = {
        'code': '💻', 'dnd_dm': '🐉', 'plan': '📋', 'conversation': '💬',
        'music': '🎵', 'weather': '🌤️', 'timer': '⏲️', 'calendar': '📅',
        'smart_home': '🏠', 'security': '🔒', 'deploy': '🚀', 'docs': '📝',
        'research': '🔬', 'design': '🎨', 'test': '🧪', 'review': '👁️',
        'learning': '📚', 'monitoring': '📊', 'cleanup': '🧹',
        'alert': '🚨', 'encounter': '⚔️', 'npc_dialogue': '🗣️',
        'lore': '📜', 'rules': '📖', 'treasure': '💰',
        'session_recap': '📝', 'list': '📋', 'routine': '🔄',
    }

    if os.path.isdir(agents_dir):
        for fname in sorted(os.listdir(agents_dir)):
            if fname.endswith('_agent.py') or fname.endswith('.py'):
                name = fname.replace('_agent.py', '').replace('.py', '')
                if name in ('base', 'orchestrator', 'router', 'scratchpad',
                            'hooks', 'memory', 'settings', 'conversation',
                            '__init__', 'mcp_manager'):
                    continue
                display = name.replace('_', ' ').title() + ' Agent'
                _agent_info.append({
                    'name': name,
                    'display_name': display,
                    'icon': AGENT_ICONS.get(name, '🤖'),
                    'tier': AGENT_TIERS.get(name, 'pro'),
                    'status': 'idle',
                })

    # Always ensure conversation agent is present
    if not any(a['name'] == 'conversation' for a in _agent_info):
        _agent_info.insert(0, {
            'name': 'conversation',
            'display_name': 'Conversation Agent',
            'icon': '💬', 'tier': 'flash', 'status': 'idle',
        })
    print(f'[ide] Discovered {len(_agent_info)} agents')


@app.route('/api/agents')
def agent_list():
    """List all registered agents."""
    return jsonify({'agents': _agent_info})


@app.route('/api/agents/chat', methods=['POST'])
def agent_chat():
    """Send message to BMO agent system via internal HTTP proxy."""
    global _agent_override
    data = request.get_json()
    message = data.get('message', '').strip()
    override = data.get('agent_override', _agent_override)

    if not message:
        return jsonify({'error': 'Empty message'}), 400

    # Add user message to history
    user_msg = {'role': 'user', 'content': message}
    _chat_history.append(user_msg)

    # Try to proxy to main BMO app via SocketIO client
    try:
        import socketio as sio_client
        client = sio_client.SimpleClient()
        client.connect('http://localhost:5000', wait_timeout=3)
        # Send chat message
        client.emit('send_message', {
            'text': message,
            'speaker': 'IDE User',
            'agent_override': override or 'auto',
        })
        # Wait for response (with timeout)
        import time as _time
        response_text = None
        agent_used = 'unknown'
        deadline = _time.time() + 15
        while _time.time() < deadline:
            try:
                events = client.receive(timeout=1)
                if events and len(events) >= 2:
                    event_name, event_data = events[0], events[1]
                    if event_name == 'bot_reply':
                        response_text = event_data.get('text', '')
                        agent_used = event_data.get('agent', 'unknown')
                        break
            except Exception:
                break

        client.disconnect()

        if response_text is None:
            response_text = "BMO didn't respond in time. The main app might be busy."
            agent_used = 'system'

    except Exception as e:
        # Fallback — BMO app not reachable, use a simple echo
        response_text = (
            f"*BMO main app not reachable on port 5000.* "
            f"Make sure `bmo.service` is running.\n\n"
            f"Error: {str(e)[:200]}"
        )
        agent_used = 'system'

    # Add assistant response to history
    assistant_msg = {
        'role': 'assistant',
        'content': response_text,
        'agent': agent_used,
    }
    _chat_history.append(assistant_msg)

    # Notify connected IDE clients via SocketIO
    socketio.emit('agent_response', {
        'text': response_text,
        'agent': agent_used,
    })

    return jsonify({
        'text': response_text,
        'agent': agent_used,
    })


@app.route('/api/agents/history')
def agent_history():
    """Get chat history."""
    limit = request.args.get('limit', 50, type=int)
    return jsonify({'history': _chat_history[-limit:]})


@app.route('/api/agents/history', methods=['DELETE'])
def agent_clear_history():
    """Clear chat history."""
    _chat_history.clear()
    return jsonify({'success': True})


@app.route('/api/agents/override', methods=['POST'])
def agent_set_override():
    """Set or clear agent override (pin to specific agent)."""
    global _agent_override
    data = request.get_json()
    _agent_override = data.get('agent', None)
    return jsonify({'override': _agent_override})


@app.route('/api/agents/model', methods=['POST'])
def agent_set_model():
    """Switch LLM model tier."""
    global _model_override
    data = request.get_json()
    _model_override = data.get('model', None)
    return jsonify({'model': _model_override})


# ── Main ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    print('🔧 BMO IDE Test App starting on port 5001...')
    _discover_agents()
    socketio.run(app, host='0.0.0.0', port=5001, debug=True,
                 allow_unsafe_werkzeug=True)
