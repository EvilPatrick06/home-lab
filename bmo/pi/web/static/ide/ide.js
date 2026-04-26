/**
 * BMO IDE — Frontend Logic (Built from scratch)
 * 
 * Manages: File explorer, Monaco editor, terminals, git panel,
 * search, quick-open, tabs, keyboard shortcuts, context menus.
 */

(() => {
  'use strict';

  // ── XSS-safe HTML helper ────────────────────────────────────
  // Used by every `innerHTML = \`...${userField}...\`` site below to escape
  // server-supplied strings (filenames, branch names, terminal labels, git
  // change descriptions). Without this an attacker who can plant a file
  // with HTML in its name gets script execution next time the tree renders.
  const escapeHtml = (s) => {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // ── State ───────────────────────────────────────────────────

  const STORAGE_KEY = 'bmo-ide-state';
  let autosaveTimer = null;
  const AUTOSAVE_DELAY = 2000; // ms after last edit

  const state = {
    currentPath: '~/home-lab',
    fileTree: [],
    openFiles: [],      // { path, content, language, dirty, model }
    activeFile: null,
    expandedDirs: {},
    dirCache: {},
    
    // Terminal
    terminals: [],      // { id, label, term, fitAddon }
    activeTerminal: null,
    nextTermId: 1,
    
    // Git
    gitBranch: '',
    gitChanges: [],
    
    // Search
    searchResults: [],
    
    // UI
    sidebarWidth: 260,
    terminalHeight: 250,
    sidebarVisible: true,
    terminalVisible: false,
    activePanel: 'explorer',

    // Settings (persisted)
    settings: {
      fontSize: 14,
      tabSize: 2,
      wordWrap: 'off',
      minimap: true,
      termFontSize: 13,
      autosave: true,
    },
  };

  // ── Elements ────────────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let monacoEditor = null;
  let socket = null;

  // ── Socket.IO ───────────────────────────────────────────────

  function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
      $('#connection-status').className = 'status-dot online';
      const txt = document.getElementById('connection-text');
      if (txt) txt.textContent = 'Connected';
    });
    
    socket.on('disconnect', () => {
      $('#connection-status').className = 'status-dot offline';
      const txt = document.getElementById('connection-text');
      if (txt) txt.textContent = 'Offline';
    });
    
    socket.on('terminal_output', (data) => {
      const t = state.terminals.find(t => t.id === data.term_id);
      if (t && t.term) t.term.write(data.data);
    });

    // Agent chat response from the main app's orchestrator
    socket.on('chat_response', (data) => {
      _handleMainChatResponse(data);
    });

    // ── Job SocketIO Events ────────────────────────────────
    socket.on('ide_job_started', (data) => {
      console.log('[ide] Job started:', data.id);
      loadJobs();
    });

    socket.on('ide_job_progress', (data) => {
      // Real-time streaming update for a job
      _handleJobProgress(data);
    });

    socket.on('ide_job_activity', (data) => {
      // Structured activity event (thinking, status, done, error)
      _handleJobActivity(data);
    });

    socket.on('ide_job_done', (data) => {
      console.log('[ide] Job done:', data.id, data.status);
      loadJobs();
      if (state._activeJobId === data.id) loadJobChat(data.id);
      // Toast
      if (data.status === 'done') {
        showToast('success', data.id, 'Task completed');
        sendBrowserNotification('Task Completed', _getJobName(data.id));
      } else if (data.status === 'failed') {
        showToast('error', data.id, data.error || 'Task failed');
        sendBrowserNotification('Task Failed', _getJobName(data.id));
      }
    });

    socket.on('ide_job_agent', (data) => {
      // Agent was resolved for a job
      loadJobs();
    });

    socket.on('ide_job_deleted', (data) => {
      loadJobs();
      if (state._activeJobId === data.id) switchAgentView('list');
    });

    socket.on('ide_job_archived', (data) => {
      loadJobs();
      if (state._activeJobId === data.id) switchAgentView('list');
    });

    socket.on('ide_job_unarchived', (data) => {
      loadJobs();
    });

    // Agent requests a mode change
    socket.on('ide_job_mode_request', (data) => {
      sendBrowserNotification('Mode Change Request', `Agent wants to switch to ${data.to_mode} mode` + (data.reason ? `: ${data.reason}` : ''));
      if (state._activeJobId === data.id) {
        _showModeChangeRequest(data.id, data.from_mode, data.to_mode, data.reason, true);
      } else {
        showToast('warning', data.id, `Agent wants to switch to ${data.to_mode} mode`);
      }
    });
  }

  // ── Monaco Editor ───────────────────────────────────────────

  function initMonaco() {
    const amdRequire = window.require;
    amdRequire.config({
      paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs' }
    });
    
    amdRequire(['vs/editor/editor.main'], () => {
      // Define custom theme
      monaco.editor.defineTheme('bmo-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6c6f85', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'bb9af7' },
          { token: 'string', foreground: '9ece6a' },
          { token: 'number', foreground: 'ff9e64' },
          { token: 'type', foreground: '7dcfff' },
          { token: 'function', foreground: '7aa2f7' },
          { token: 'variable', foreground: 'c8cad8' },
          { token: 'operator', foreground: '89ddff' },
        ],
        colors: {
          'editor.background': '#1a1b26',
          'editor.foreground': '#c8cad8',
          'editor.lineHighlightBackground': '#24253a',
          'editor.selectionBackground': '#364a82',
          'editorCursor.foreground': '#7aa2f7',
          'editorWhitespace.foreground': '#2f3146',
          'editorIndentGuide.background': '#2f3146',
          'editorIndentGuide.activeBackground': '#464870',
          'editorLineNumber.foreground': '#4a4c60',
          'editorLineNumber.activeForeground': '#7aa2f7',
          'editor.selectionHighlightBackground': '#364a8240',
          'editorBracketMatch.background': '#7aa2f720',
          'editorBracketMatch.border': '#7aa2f750',
          'minimap.background': '#1a1b26',
        },
      });

      monacoEditor = monaco.editor.create($('#monaco-editor'), {
        theme: 'bmo-dark',
        automaticLayout: true,
        minimap: { enabled: true, scale: 1 },
        scrollBeyondLastLine: false,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: true,
        renderWhitespace: 'selection',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling: true,
        bracketPairColorization: { enabled: true },
        wordWrap: 'off',
        lineNumbers: 'on',
        glyphMargin: false,
        folding: true,
        links: true,
        padding: { top: 8, bottom: 8 },
      });

      // Track cursor position
      monacoEditor.onDidChangeCursorPosition((e) => {
        const pos = e.position;
        $('#status-cursor').textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
      });

      // Track content changes (dirty flag + autosave)
      monacoEditor.onDidChangeModelContent(() => {
        const f = state.openFiles.find(f => f.path === state.activeFile);
        if (f && !f.dirty) {
          f.dirty = true;
          renderTabs();
        }
        // Autosave
        if (state.settings.autosave) {
          clearTimeout(autosaveTimer);
          autosaveTimer = setTimeout(() => {
            if (state.activeFile) saveFile(state.activeFile);
          }, AUTOSAVE_DELAY);
        }
      });

      // Ctrl+S to save (also in global keyboard handler)
      monacoEditor.addAction({
        id: 'bmo-save',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => saveFile(),
      });

      // Apply persisted settings
      monacoEditor.updateOptions({
        fontSize: state.settings.fontSize,
        tabSize: state.settings.tabSize,
        wordWrap: state.settings.wordWrap,
        minimap: { enabled: state.settings.minimap },
      });
    });
  }

  // ── File Tree ───────────────────────────────────────────────

  async function loadTree(path) {
    path = path || state.currentPath;
    try {
      const res = await fetch(`/api/ide/tree?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.error) { console.warn('[ide] Tree error:', data.error); return; }

      const nodes = [];
      for (const d of (data.dirs || [])) {
        const name = d.replace(/\/$/, '');
        const fullPath = joinPath(path, name);
        nodes.push({ name, path: fullPath, isDir: true });
      }
      for (const f of (data.files || [])) {
        const fullPath = joinPath(path, f.name);
        nodes.push({ name: f.name, path: fullPath, isDir: false, size: f.size });
      }

      if (path === state.currentPath) {
        state.fileTree = nodes;
        renderFileTree();
      }
      state.dirCache[path] = nodes;
    } catch (e) {
      console.warn('[ide] Failed to load tree:', e);
    }
  }

  function joinPath(parent, child) {
    return parent.replace(/\/$/, '') + '/' + child;
  }

  function renderFileTree() {
    const container = $('#file-tree');
    container.innerHTML = '';
    renderNodes(state.fileTree, container, 0);
    renderBreadcrumbs();
  }

  function renderNodes(nodes, container, depth) {
    for (const node of nodes) {
      const item = document.createElement('div');
      item.className = 'tree-item' + (node.path === state.activeFile ? ' active' : '');
      item.style.paddingLeft = (12 + depth * 12) + 'px';
      item.dataset.path = node.path;

      const arrow = node.isDir
        ? `<span class="arrow">${state.expandedDirs[node.path] ? '▾' : '▸'}</span>`
        : '<span class="arrow"></span>';
      const icon = node.isDir ? '<span class="icon">📁</span>' : `<span class="icon">${escapeHtml(fileIcon(node.name))}</span>`;

      item.innerHTML = `${arrow}${icon}<span class="name">${escapeHtml(node.name)}</span>`;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (node.isDir) {
          toggleDir(node);
        } else {
          openFile(node.path);
        }
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, node);
      });

      container.appendChild(item);

      // Render children if expanded
      if (node.isDir && state.expandedDirs[node.path]) {
        const children = state.dirCache[node.path] || [];
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-children';
        renderNodes(children, childContainer, depth + 1);
        container.appendChild(childContainer);
      }
    }
  }

  async function toggleDir(node) {
    if (state.expandedDirs[node.path]) {
      delete state.expandedDirs[node.path];
    } else {
      state.expandedDirs[node.path] = true;
      if (!state.dirCache[node.path]) {
        await loadTree(node.path);
      }
    }
    renderFileTree();
  }

  function renderBreadcrumbs() {
    const bc = $('#breadcrumbs');
    const parts = state.currentPath.replace(/\\/g, '/').split('/');
    let html = '';
    let acc = '';
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const path = acc;
      if (i > 0) html += '<span class="separator">/</span>';
      html += `<span class="crumb" data-path="${path}">${part || '/'}</span>`;
    });
    bc.innerHTML = html;
    bc.querySelectorAll('.crumb').forEach(el => {
      el.addEventListener('click', () => navigateTo(el.dataset.path));
    });
  }

  function navigateTo(path) {
    state.currentPath = path;
    state.expandedDirs = {};
    state.dirCache = {};
    loadTree(path);
  }

  function fileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
      py: '🐍', js: '🟡', ts: '🔵', tsx: '⚛️', jsx: '⚛️',
      html: '🌐', css: '🎨', json: '{}', md: '📝',
      sh: '📟', yml: '⚙️', yaml: '⚙️', toml: '⚙️',
      svg: '🖼️', png: '🖼️', jpg: '🖼️',
      rs: '🦀', go: '🔷', rb: '💎', php: '🐘',
      sql: '🗄️', env: '🔒', lock: '🔒',
    };
    return icons[ext] || '📄';
  }


  // ── File Operations ─────────────────────────────────────────

  async function openFile(path) {
    // Already open — just activate
    const existing = state.openFiles.find(f => f.path === path);
    if (existing) { setActiveFile(path); return; }

    try {
      const res = await fetch('/api/ide/file/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (data.error) { console.warn('[ide] Read error:', data.error); return; }

      const file = {
        path,
        content: data.content,
        language: data.language || 'plaintext',
        dirty: false,
        model: null,
      };

      state.openFiles.push(file);
      renderTabs();

      // Create Monaco model
      if (monacoEditor && window.monaco) {
        const uri = monaco.Uri.parse('inmemory://ide/' + encodeURIComponent(path));
        let model = monaco.editor.getModel(uri);
        if (!model) {
          model = monaco.editor.createModel(data.content, data.language, uri);
        }
        file.model = model;
      }

      setActiveFile(path);
    } catch (e) {
      console.warn('[ide] Failed to open file:', e);
    }
  }

  function setActiveFile(path) {
    state.activeFile = path;
    const f = state.openFiles.find(f => f.path === path);
    if (!f) return;

    // Update Monaco
    if (monacoEditor && f.model) {
      monacoEditor.setModel(f.model);
    }

    // Update status bar
    $('#status-language').textContent = f.language;

    // Show editor, hide welcome
    $('#welcome-screen').style.display = 'none';
    $('#monaco-editor').style.display = 'block';

    renderTabs();
    renderFileTree();
    persistState();
  }

  async function saveFile(filePath) {
    const targetPath = filePath || state.activeFile;
    const f = state.openFiles.find(f => f.path === targetPath);
    if (!f || !f.dirty) return;

    // Get content from model if it's the active file
    let content;
    if (targetPath === state.activeFile && monacoEditor) {
      content = monacoEditor.getValue();
    } else if (f.model) {
      content = f.model.getValue();
    } else {
      content = f.content;
    }

    try {
      const res = await fetch('/api/ide/file/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: f.path, content }),
      });
      const data = await res.json();
      if (data.success) {
        f.dirty = false;
        f.content = content;
        renderTabs();
        flashStatus('Saved');
        persistState();
      }
    } catch (e) {
      console.warn('[ide] Save failed:', e);
    }
  }

  function closeTab(path) {
    const idx = state.openFiles.findIndex(f => f.path === path);
    if (idx === -1) return;

    const f = state.openFiles[idx];
    if (f.model) { try { f.model.dispose(); } catch {} }

    state.openFiles.splice(idx, 1);

    if (state.activeFile === path) {
      if (state.openFiles.length > 0) {
        const newIdx = Math.min(idx, state.openFiles.length - 1);
        setActiveFile(state.openFiles[newIdx].path);
      } else {
        state.activeFile = null;
        if (monacoEditor) monacoEditor.setModel(null);
        $('#welcome-screen').style.display = 'flex';
        $('#monaco-editor').style.display = 'none';
        $('#status-language').textContent = 'Plain Text';
      }
    }
    renderTabs();
    persistState();
  }


  // ── Tabs ────────────────────────────────────────────────────

  function renderTabs() {
    const container = $('#tabs-container');
    container.innerHTML = '';

    for (const f of state.openFiles) {
      const name = f.path.split('/').pop().split('\\').pop();
      const tab = document.createElement('div');
      tab.className = 'tab' + (f.path === state.activeFile ? ' active' : '');
      tab.innerHTML = `
        ${f.dirty ? '<span class="dirty">•</span>' : ''}
        <span class="tab-name">${escapeHtml(name)}</span>
        <span class="close-tab">×</span>
      `;

      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-tab')) {
          closeTab(f.path);
        } else {
          setActiveFile(f.path);
        }
      });

      container.appendChild(tab);
    }
  }


  // ── Terminal ────────────────────────────────────────────────

  function newTerminal() {
    const id = `term-${state.nextTermId++}`;
    const label = `bash ${state.terminals.length + 1}`;

    const termEntry = { id, label, term: null, fitAddon: null };
    state.terminals.push(termEntry);
    state.activeTerminal = id;

    // Show terminal panel
    state.terminalVisible = true;
    $('#terminal-panel').style.display = 'flex';
    $('#terminal-resize').style.display = 'block';

    // Open PTY
    socket.emit('terminal_open', { term_id: id, cols: 80, rows: 24 });

    // Create xterm instance
    setTimeout(() => {
      const container = document.createElement('div');
      container.className = 'xterm-instance';
      container.id = `xterm-${id}`;
      $('#terminal-container').appendChild(container);

      const term = new Terminal({
        theme: {
          background: '#1a1b26',
          foreground: '#c8cad8',
          cursor: '#7aa2f7',
          selectionBackground: '#364a82',
          black: '#1a1b26',
          red: '#f7768e',
          green: '#9ece6a',
          yellow: '#e0af68',
          blue: '#7aa2f7',
          magenta: '#bb9af7',
          cyan: '#7dcfff',
          white: '#c8cad8',
        },
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13,
        cursorBlink: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);
      fitAddon.fit();

      term.onData((data) => {
        socket.emit('terminal_input', { term_id: id, data });
      });

      termEntry.term = term;
      termEntry.fitAddon = fitAddon;

      // Auto-resize on container size change
      const ro = new ResizeObserver(() => {
        try { fitAddon.fit(); } catch {}
      });
      ro.observe(container);

      renderTerminalTabs();
      setActiveTerminal(id);
    }, 50);
  }

  function setActiveTerminal(id) {
    state.activeTerminal = id;
    // Show/hide xterm instances
    $$('.xterm-instance').forEach(el => {
      el.classList.toggle('hidden', el.id !== `xterm-${id}`);
    });
    // Fit the active one
    const t = state.terminals.find(t => t.id === id);
    if (t && t.fitAddon) {
      setTimeout(() => { try { t.fitAddon.fit(); } catch {} }, 50);
    }
    renderTerminalTabs();
  }

  function closeTerminal(id) {
    socket.emit('terminal_close', { term_id: id });
    const idx = state.terminals.findIndex(t => t.id === id);
    if (idx !== -1) {
      const t = state.terminals[idx];
      if (t.term) t.term.dispose();
      const el = $(`#xterm-${id}`);
      if (el) el.remove();
      state.terminals.splice(idx, 1);
    }

    if (state.activeTerminal === id) {
      if (state.terminals.length > 0) {
        setActiveTerminal(state.terminals[0].id);
      } else {
        state.activeTerminal = null;
        state.terminalVisible = false;
        $('#terminal-panel').style.display = 'none';
        $('#terminal-resize').style.display = 'none';
      }
    }
    renderTerminalTabs();
  }

  function renderTerminalTabs() {
    const container = $('#terminal-tabs-container');
    container.innerHTML = '';
    for (const t of state.terminals) {
      const tab = document.createElement('div');
      tab.className = 'terminal-tab' + (t.id === state.activeTerminal ? ' active' : '');
      tab.innerHTML = `<span>${escapeHtml(t.label)}</span><span class="close-term">×</span>`;
      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-term')) {
          closeTerminal(t.id);
        } else {
          setActiveTerminal(t.id);
        }
      });
      container.appendChild(tab);
    }
  }


  // ── Git Panel ───────────────────────────────────────────────

  async function loadGitStatus() {
    try {
      const res = await fetch(`/api/ide/git/status?path=${encodeURIComponent(state.currentPath)}`);
      const data = await res.json();
      state.gitBranch = data.branch || '';
      state.gitChanges = data.changes || [];
      renderGitPanel();
    } catch (e) {
      console.warn('[ide] Git status failed:', e);
    }
  }

  function renderGitPanel() {
    $('#git-branch').innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M12 8V16"/></svg>
      ${escapeHtml(state.gitBranch || '(no repo)')}
    `;
    $('#status-branch-name').textContent = state.gitBranch || 'none';

    // Changes count
    const countEl = $('#git-changes-count');
    if (countEl) countEl.textContent = state.gitChanges.length;

    const container = $('#git-changes');
    container.innerHTML = '';

    if (state.gitChanges.length === 0) {
      container.innerHTML = '<div class="empty-state"><p style="font-size:12px;color:var(--text-dim)">No changes</p></div>';
      return;
    }

    for (const c of state.gitChanges) {
      const statusClass = c.status === 'M' ? 'modified' : c.status === 'A' || c.status === '?' || c.status === '??' ? 'added' : c.status === 'D' ? 'deleted' : 'untracked';
      const div = document.createElement('div');
      div.className = 'git-change';
      div.innerHTML = `
        <span class="status ${statusClass}">${escapeHtml(c.status)}</span>
        <span class="filepath">${escapeHtml(c.path)}</span>
        <span class="git-file-actions">
          <button class="git-file-btn" data-action="stage" title="Stage">+</button>
          <button class="git-file-btn" data-action="unstage" title="Unstage">−</button>
          <button class="git-file-btn" data-action="diff" title="View Diff">⊟</button>
        </span>
      `;
      div.querySelector('[data-action="stage"]').addEventListener('click', (e) => { e.stopPropagation(); gitStageFile(c.path); });
      div.querySelector('[data-action="unstage"]').addEventListener('click', (e) => { e.stopPropagation(); gitUnstageFile(c.path); });
      div.querySelector('[data-action="diff"]').addEventListener('click', (e) => { e.stopPropagation(); gitViewDiff(c.path); });
      div.addEventListener('click', () => openFile(joinPath(state.currentPath, c.path)));
      container.appendChild(div);
    }
  }

  async function gitCommit() {
    const msg = $('#git-commit-msg').value.trim();
    if (!msg) return;
    try {
      const res = await fetch('/api/ide/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, repo: state.currentPath }),
      });
      const data = await res.json();
      if (data.exit_code !== 0) { console.warn('[ide] Commit error:', data.output); return; }
      $('#git-commit-msg').value = '';
      loadGitStatus();
    } catch (e) {
      console.warn('[ide] Commit failed:', e);
    }
  }

  async function gitStageFile(path) {
    await fetch('/api/ide/git/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, repo: state.currentPath }) });
    loadGitStatus();
  }

  async function gitUnstageFile(path) {
    await fetch('/api/ide/git/unstage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, repo: state.currentPath }) });
    loadGitStatus();
  }

  async function gitStageAll() {
    await fetch('/api/ide/git/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '.', repo: state.currentPath }) });
    loadGitStatus();
  }

  async function gitViewDiff(path) {
    try {
      const res = await fetch(`/api/ide/git/diff?path=${encodeURIComponent(path)}&repo=${encodeURIComponent(state.currentPath)}`);
      const data = await res.json();
      const output = data.output || 'No diff available';
      // Open diff in a virtual tab
      const tab = { name: `diff: ${path.split('/').pop()}`, path: `__diff__:${path}`, content: output, language: 'plaintext' };
      state.openFiles.push(tab);
      state.activeFile = tab.path;
      if (window._editor) {
        const model = monaco.editor.createModel(output, 'plaintext');
        window._editor.setModel(model);
      }
      renderTabs();
    } catch (e) {
      console.warn('[ide] Diff failed:', e);
    }
  }

  async function gitPush() {
    showToast('warning', null, '⏳ Pushing...');
    try {
      const res = await fetch('/api/ide/git/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: state.currentPath }) });
      const data = await res.json();
      showToast(data.exit_code === 0 ? 'success' : 'error', null, data.exit_code === 0 ? '✅ Pushed successfully' : `Push failed: ${(data.output || '').substring(0, 80)}`);
      loadGitStatus();
    } catch (e) { showToast('error', null, 'Push failed'); }
  }

  async function gitPull() {
    showToast('warning', null, '⏳ Pulling...');
    try {
      const res = await fetch('/api/ide/git/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: state.currentPath }) });
      const data = await res.json();
      showToast(data.exit_code === 0 ? 'success' : 'error', null, data.exit_code === 0 ? '✅ Pulled successfully' : `Pull failed: ${(data.output || '').substring(0, 80)}`);
      loadGitStatus();
    } catch (e) { showToast('error', null, 'Pull failed'); }
  }

  async function gitFetch() {
    showToast('warning', null, '⏳ Fetching...');
    try {
      const res = await fetch('/api/ide/git/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: state.currentPath }) });
      const data = await res.json();
      showToast(data.exit_code === 0 ? 'success' : 'warning', null, data.exit_code === 0 ? '✅ Fetched successfully' : `Fetch: ${(data.output || '').substring(0, 80)}`);
    } catch (e) { showToast('error', null, 'Fetch failed'); }
  }

  async function gitStash(action) {
    try {
      const body = { repo: state.currentPath, action };
      if (action === 'save') {
        const msg = prompt('Stash message (optional):');
        if (msg === null) return;
        body.message = msg;
      }
      const res = await fetch('/api/ide/git/stash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (action === 'list') {
        const output = data.output || 'No stashes';
        showToast('success', null, output.substring(0, 100));
      } else {
        showToast(data.exit_code === 0 ? 'success' : 'error', null, data.exit_code === 0 ? `Stash ${action} done` : `Stash failed`);
        loadGitStatus();
      }
    } catch (e) { showToast('error', null, 'Stash failed'); }
  }

  async function gitShowBranchPicker() {
    try {
      const res = await fetch(`/api/ide/git/branches?path=${encodeURIComponent(state.currentPath)}`);
      const data = await res.json();
      const branches = data.branches || [];
      const current = data.current || '';
      const choice = prompt(`Current: ${current}\n\nBranches:\n${branches.map(b => b === current ? `* ${b}` : `  ${b}`).join('\n')}\n\nType branch name to switch:`);
      if (choice && choice !== current) {
        const r = await fetch('/api/ide/git/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: choice, repo: state.currentPath }) });
        const d = await r.json();
        showToast(d.exit_code === 0 ? 'success' : 'error', null, d.exit_code === 0 ? `Switched to ${choice}` : `Checkout failed`);
        loadGitStatus();
      }
    } catch (e) { showToast('error', null, 'Failed to load branches'); }
  }

  async function gitCreateBranch() {
    const name = prompt('New branch name:');
    if (!name) return;
    try {
      const res = await fetch('/api/ide/git/branch/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, repo: state.currentPath }) });
      const data = await res.json();
      showToast(data.exit_code === 0 ? 'success' : 'error', null, data.exit_code === 0 ? `Created & switched to ${name}` : `Failed: ${(data.output || '').substring(0, 60)}`);
      loadGitStatus();
    } catch (e) { showToast('error', null, 'Branch creation failed'); }
  }

  async function loadGitLog() {
    const logEl = $('#git-log');
    if (!logEl) return;
    try {
      const res = await fetch(`/api/ide/git/log?path=${encodeURIComponent(state.currentPath)}&count=20`);
      const data = await res.json();
      const commits = data.commits || [];
      if (commits.length === 0) {
        logEl.innerHTML = '<div class="empty-state"><p style="font-size:11px;color:var(--text-dim)">No commits</p></div>';
        return;
      }
      logEl.innerHTML = commits.map(c =>
        `<div class="git-log-entry"><span class="git-hash">${escapeHtml(c.hash)}</span><span class="git-log-msg">${_escapeHtml(c.message)}</span></div>`
      ).join('');
    } catch (e) { logEl.innerHTML = '<p style="font-size:11px;color:var(--text-dim)">Failed to load log</p>'; }
  }


  // ── Search ──────────────────────────────────────────────────

  async function searchFiles(query) {
    if (!query) { state.searchResults = []; renderSearchResults(); return; }
    try {
      const res = await fetch(`/api/ide/search?pattern=${encodeURIComponent(query)}&path=${encodeURIComponent(state.currentPath)}`);
      const data = await res.json();
      state.searchResults = data.matches || [];
      renderSearchResults();
    } catch (e) {
      console.warn('[ide] Search failed:', e);
    }
  }

  function renderSearchResults() {
    const container = $('#search-results');
    container.innerHTML = '';

    if (state.searchResults.length === 0) {
      container.innerHTML = '<div class="empty-state"><p style="font-size:12px;color:var(--text-dim)">No results</p></div>';
      return;
    }

    for (const r of state.searchResults) {
      const div = document.createElement('div');
      div.className = 'search-result';
      div.innerHTML = `
        <div class="result-file">${escapeHtml(r.file.split('/').pop())}</div>
        <div class="result-line">Line ${escapeHtml(String(r.line))}</div>
        <div class="result-content">${escapeHtml(r.content)}</div>
      `;
      div.addEventListener('click', () => openFile(r.file));
      container.appendChild(div);
    }
  }


  // ── Quick Open ──────────────────────────────────────────────

  function showQuickOpen() {
    const overlay = $('#quick-open-overlay');
    overlay.classList.remove('hidden');
    const input = $('#quick-open-input');
    input.value = '';
    input.focus();
    $('#quick-open-results').innerHTML = '';
  }

  function hideQuickOpen() {
    $('#quick-open-overlay').classList.add('hidden');
  }

  async function quickOpenSearch(query) {
    if (!query) { $('#quick-open-results').innerHTML = ''; return; }
    try {
      const res = await fetch(`/api/ide/find?pattern=${encodeURIComponent(query)}&path=${encodeURIComponent(state.currentPath)}`);
      const data = await res.json();
      const results = (data.matches || []).slice(0, 20);
      
      const container = $('#quick-open-results');
      container.innerHTML = '';
      for (const filepath of results) {
        const div = document.createElement('div');
        div.className = 'quick-open-item';
        div.innerHTML = `
          <span class="file-name">${escapeHtml(filepath.split('/').pop())}</span>
          <span class="file-path">${escapeHtml(filepath)}</span>
        `;
        div.addEventListener('click', () => {
          hideQuickOpen();
          openFile(filepath);
        });
        container.appendChild(div);
      }
    } catch {}
  }


  // ── Context Menu ────────────────────────────────────────────

  let contextTarget = null;

  function showContextMenu(e, node) {
    contextTarget = node;
    const menu = $('#context-menu');
    menu.classList.remove('hidden');
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
  }

  function hideContextMenu() {
    $('#context-menu').classList.add('hidden');
    contextTarget = null;
  }


  // ── Panel Switching ─────────────────────────────────────────

  function switchPanel(panel) {
    state.activePanel = panel;
    $$('.activity-icon').forEach(el => el.classList.toggle('active', el.dataset.panel === panel));
    $$('.sidebar-panel').forEach(el => el.classList.toggle('active', el.id === `panel-${panel}`));

    // Auto-load data
    if (panel === 'git') loadGitStatus();
  }


  // ── Resize Handling ─────────────────────────────────────────

  function initResize() {
    // Sidebar resize
    let resizing = null;
    
    $('#sidebar-resize').addEventListener('mousedown', (e) => {
      resizing = 'sidebar';
      e.preventDefault();
    });

    $('#terminal-resize').addEventListener('mousedown', (e) => {
      resizing = 'terminal';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      if (resizing === 'sidebar') {
        const w = Math.max(180, Math.min(500, e.clientX - 48)); // 48 = activity bar
        state.sidebarWidth = w;
        $('#sidebar').style.width = w + 'px';
      } else if (resizing === 'terminal') {
        const editorArea = $('#editor-area');
        const rect = editorArea.getBoundingClientRect();
        const h = Math.max(100, Math.min(500, rect.bottom - e.clientY));
        state.terminalHeight = h;
        $('#terminal-panel').style.height = h + 'px';
      }
    });

    document.addEventListener('mouseup', () => { resizing = null; });
  }


  // ── Keyboard Shortcuts ──────────────────────────────────────

  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+P — Quick Open
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        showQuickOpen();
      }
      // Ctrl+` — Toggle Terminal
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
      }
      // Ctrl+Shift+F — Search Panel
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        switchPanel('search');
        setTimeout(() => $('#search-input').focus(), 50);
      }
      // Ctrl+W — Close Tab
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (state.activeFile) closeTab(state.activeFile);
      }
      // Escape — close overlays
      if (e.key === 'Escape') {
        hideQuickOpen();
        hideContextMenu();
      }
      // Ctrl+B — Toggle Sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      // F5 — Run Active File
      if (e.key === 'F5') {
        e.preventDefault();
        runActiveFile();
      }
      // Ctrl+G — Go to Line
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        if (monacoEditor) {
          monacoEditor.focus();
          monacoEditor.trigger('keyboard', 'editor.action.gotoLine');
        }
      }
      // Ctrl+S — Save (global fallback)
      if (e.ctrlKey && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    });
  }

  function toggleTerminal() {
    if (!state.terminalVisible) {
      state.terminalVisible = true;
      $('#terminal-panel').style.display = 'flex';
      $('#terminal-resize').style.display = 'block';
      if (state.terminals.length === 0) newTerminal();
    } else {
      state.terminalVisible = false;
      $('#terminal-panel').style.display = 'none';
      $('#terminal-resize').style.display = 'none';
    }
  }

  function toggleSidebar() {
    state.sidebarVisible = !state.sidebarVisible;
    $('#sidebar').style.display = state.sidebarVisible ? 'flex' : 'none';
    $('#sidebar-resize').style.display = state.sidebarVisible ? 'block' : 'none';
  }


  // ── Utilities ───────────────────────────────────────────────

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function flashStatus(text) {
    const el = $('#file-status');
    el.textContent = text;
    el.style.color = 'var(--green)';
    setTimeout(() => { el.textContent = ''; }, 2000);
  }

  function fileName(path) {
    return path.split('/').pop().split('\\').pop();
  }


  // ── Persistence (localStorage) ──────────────────────────────

  function persistState() {
    try {
      const data = {
        currentPath: state.currentPath,
        openFilePaths: state.openFiles.map(f => f.path),
        activeFile: state.activeFile,
        activePanel: state.activePanel,
        sidebarWidth: state.sidebarWidth,
        sidebarVisible: state.sidebarVisible,
        settings: state.settings,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function persistSettings() {
    persistState();
  }

  function restoreState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.currentPath) state.currentPath = data.currentPath;
      if (data.activePanel) state.activePanel = data.activePanel;
      if (data.sidebarWidth) state.sidebarWidth = data.sidebarWidth;
      if (data.sidebarVisible !== undefined) state.sidebarVisible = data.sidebarVisible;
      if (data.settings) Object.assign(state.settings, data.settings);

      // Apply sidebar width
      const sidebar = $('#sidebar');
      if (sidebar) sidebar.style.width = state.sidebarWidth + 'px';
      if (!state.sidebarVisible) {
        if (sidebar) sidebar.style.display = 'none';
        const resize = $('#sidebar-resize');
        if (resize) resize.style.display = 'none';
      }

      // Apply active panel
      switchPanel(state.activePanel);

      // Re-open files from last session
      if (data.openFilePaths && data.openFilePaths.length > 0) {
        const activeFile = data.activeFile;
        (async () => {
          for (const path of data.openFilePaths) {
            await openFile(path);
          }
          if (activeFile && state.openFiles.find(f => f.path === activeFile)) {
            setActiveFile(activeFile);
          }
        })();
      }

      console.log(`[ide] Restored state: ${data.openFilePaths?.length || 0} files, workdir=${state.currentPath}`);
    } catch (e) {
      console.warn('[ide] Failed to restore state:', e);
    }
  }


  // ── Event Bindings ──────────────────────────────────────────

  function bindEvents() {
    // Activity bar
    $$('.activity-icon[data-panel]').forEach(el => {
      el.addEventListener('click', () => switchPanel(el.dataset.panel));
    });

    // New file/folder
    $('#btn-new-file').addEventListener('click', () => {
      const name = prompt('File name:');
      if (name) createFile(state.currentPath, name, false);
    });
    $('#btn-new-folder').addEventListener('click', () => {
      const name = prompt('Folder name:');
      if (name) createFile(state.currentPath, name, true);
    });

    // Refresh tree
    $('#btn-refresh-tree').addEventListener('click', () => {
      state.dirCache = {};
      loadTree();
    });

    // Search
    let searchTimeout;
    $('#search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => searchFiles(e.target.value), 300);
    });

    // Git
    $('#btn-git-refresh').addEventListener('click', loadGitStatus);
    $('#btn-git-commit').addEventListener('click', gitCommit);
    $('#git-commit-msg').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') gitCommit();
    });
    $('#btn-git-fetch').addEventListener('click', gitFetch);
    $('#btn-git-pull').addEventListener('click', gitPull);
    $('#btn-git-push').addEventListener('click', gitPush);
    $('#btn-git-stash').addEventListener('click', () => {
      const action = prompt('Stash action (save / pop / list):');
      if (action && ['save', 'pop', 'list'].includes(action.trim().toLowerCase())) gitStash(action.trim().toLowerCase());
    });
    $('#btn-git-branch-pick').addEventListener('click', gitShowBranchPicker);
    $('#btn-git-branch-new').addEventListener('click', gitCreateBranch);
    $('#btn-git-stage-all').addEventListener('click', gitStageAll);
    $('#btn-git-log-toggle').addEventListener('click', () => {
      const logEl = $('#git-log');
      const icon = $('#btn-git-log-toggle .toggle-icon');
      if (logEl.style.display === 'none') {
        logEl.style.display = 'block';
        if (icon) icon.textContent = '▾';
        loadGitLog();
      } else {
        logEl.style.display = 'none';
        if (icon) icon.textContent = '▸';
      }
    });

    // Terminal buttons
    $('#btn-new-terminal').addEventListener('click', newTerminal);
    $('#btn-close-terminal-panel').addEventListener('click', () => {
      state.terminalVisible = false;
      $('#terminal-panel').style.display = 'none';
      $('#terminal-resize').style.display = 'none';
    });

    // Quick open
    $('#quick-open-btn').addEventListener('click', showQuickOpen);
    $('#quick-open-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) hideQuickOpen();
    });
    let qoTimeout;
    $('#quick-open-input').addEventListener('input', (e) => {
      clearTimeout(qoTimeout);
      qoTimeout = setTimeout(() => quickOpenSearch(e.target.value), 200);
    });
    $('#quick-open-input').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideQuickOpen();
    });

    // Context menu actions
    $$('#context-menu button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'open' && contextTarget && !contextTarget.isDir) openFile(contextTarget.path);
        if (action === 'delete' && contextTarget) deleteFile(contextTarget.path);
        if (action === 'rename' && contextTarget) renameFile(contextTarget);
        if (action === 'new-file') {
          const dir = contextTarget && contextTarget.isDir ? contextTarget.path : state.currentPath;
          const name = prompt('File name:');
          if (name) createFile(dir, name, false);
        }
        if (action === 'new-folder') {
          const dir = contextTarget && contextTarget.isDir ? contextTarget.path : state.currentPath;
          const name = prompt('Folder name:');
          if (name) createFile(dir, name, true);
        }
        if (action === 'set-workdir' && contextTarget && contextTarget.isDir) {
          state.currentPath = contextTarget.path;
          loadTree(contextTarget.path);
          console.log('[ide] Working directory set to:', contextTarget.path);
        }
        if (action === 'copy-path' && contextTarget) {
          navigator.clipboard.writeText(contextTarget.path).then(() => {
            console.log('[ide] Path copied:', contextTarget.path);
          }).catch(() => {});
        }
        hideContextMenu();
      });
    });

    // Close context menu on click elsewhere
    document.addEventListener('click', hideContextMenu);

    // Menu bar dropdowns
    const menuDefs = {
      file: [
        { label: 'New File', shortcut: '', action: () => { const n = prompt('File name:'); if (n) createFile(state.currentPath, n, false); } },
        { label: 'New Folder', shortcut: '', action: () => { const n = prompt('Folder name:'); if (n) createFile(state.currentPath, n, true); } },
        { label: 'Open File…', shortcut: '', action: () => { const p = prompt('File path (absolute or relative to working dir):'); if (p) openFile(p.startsWith('/') || p.startsWith('~') ? p : joinPath(state.currentPath, p)); } },
        { label: 'Open Folder…', shortcut: '', action: () => { const p = prompt('Folder path:', state.currentPath); if (p) { state.currentPath = p; state.dirCache = {}; state.expandedDirs = {}; loadTree(); persistState(); } } },
        { label: '─' },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => saveFile() },
        { label: 'Save All', shortcut: '', action: () => { state.openFiles.filter(f => f.dirty).forEach(f => saveFile(f.path)); } },
        { label: 'Autosave ' + (state.settings.autosave ? '✓' : ''), shortcut: '', action: () => { state.settings.autosave = !state.settings.autosave; persistSettings(); flashStatus(state.settings.autosave ? 'Autosave ON' : 'Autosave OFF'); } },
        { label: '─' },
        { label: 'Close Tab', shortcut: 'Ctrl+W', action: () => { if (state.activeFile) closeTab(state.activeFile); } },
        { label: 'Close Saved Tabs', shortcut: '', action: () => { [...state.openFiles].filter(f => !f.dirty).forEach(f => closeTab(f.path)); } },
        { label: 'Close All Tabs', shortcut: '', action: () => { [...state.openFiles].forEach(f => closeTab(f.path)); } },
      ],
      edit: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => { if (monacoEditor) monacoEditor.trigger('menu', 'undo'); } },
        { label: 'Redo', shortcut: 'Ctrl+Y', action: () => { if (monacoEditor) monacoEditor.trigger('menu', 'redo'); } },
        { label: '─' },
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
        { label: '─' },
        { label: 'Find', shortcut: 'Ctrl+F', action: () => { if (monacoEditor) monacoEditor.trigger('menu', 'actions.find'); } },
        { label: 'Replace', shortcut: 'Ctrl+H', action: () => { if (monacoEditor) monacoEditor.trigger('menu', 'editor.action.startFindReplaceAction'); } },
      ],
      view: [
        { label: 'Explorer', shortcut: '', action: () => switchPanel('explorer') },
        { label: 'Search', shortcut: 'Ctrl+Shift+F', action: () => { switchPanel('search'); setTimeout(() => $('#search-input').focus(), 50); } },
        { label: 'Source Control', shortcut: '', action: () => switchPanel('git') },
        { label: 'Agents', shortcut: '', action: () => switchPanel('agents') },
        { label: '─' },
        { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: toggleSidebar },
        { label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: toggleTerminal },
        { label: '─' },
        { label: 'Word Wrap', shortcut: '', action: () => { if (monacoEditor) { const current = monacoEditor.getOption(monaco.editor.EditorOption.wordWrap); monacoEditor.updateOptions({ wordWrap: current === 'on' ? 'off' : 'on' }); } } },
        { label: 'Minimap', shortcut: '', action: () => { if (monacoEditor) { const current = monacoEditor.getOption(monaco.editor.EditorOption.minimap).enabled; monacoEditor.updateOptions({ minimap: { enabled: !current } }); } } },
      ],
      go: [
        { label: 'Go to File', shortcut: 'Ctrl+P', action: showQuickOpen },
        { label: 'Go to Line', shortcut: 'Ctrl+G', action: () => { if (monacoEditor) { monacoEditor.focus(); monacoEditor.trigger('menu', 'editor.action.gotoLine'); } } },
        { label: '─' },
        { label: 'Go to Definition', shortcut: 'F12', action: () => { if (monacoEditor) monacoEditor.trigger('menu', 'editor.action.revealDefinition'); } },
        { label: 'Peek Definition', shortcut: 'Alt+F12', action: () => { if (monacoEditor) monacoEditor.trigger('menu', 'editor.action.peekDefinition'); } },
      ],
      run: [
        { label: 'Run Active File', shortcut: 'F5', action: runActiveFile },
        { label: '─' },
        { label: 'Run in Terminal', shortcut: '', action: () => runInTerminal() },
      ],
      terminal: [
        { label: 'New Terminal', shortcut: '', action: newTerminal },
        { label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: toggleTerminal },
        { label: '─' },
        { label: 'Clear Terminal', shortcut: '', action: () => { const t = state.terminals.find(t => t.id === state.activeTerminal); if (t && t.term) t.term.clear(); } },
      ],
    };

    let activeDropdown = null;

    $$('.menu-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const menuName = el.dataset.menu;
        const items = menuDefs[menuName];
        if (!items) return;

        // Close if same menu clicked again
        if (activeDropdown && activeDropdown.dataset.menuName === menuName) {
          closeDropdown();
          return;
        }
        closeDropdown();

        const dropdown = document.createElement('div');
        dropdown.className = 'menu-dropdown';
        dropdown.dataset.menuName = menuName;

        for (const item of items) {
          if (item.label === '─') {
            dropdown.appendChild(Object.assign(document.createElement('hr'), { className: 'menu-sep' }));
            continue;
          }
          const btn = document.createElement('button');
          btn.className = 'menu-dropdown-item';
          btn.innerHTML = `<span class="menu-label">${item.label}</span>${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}`;
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            closeDropdown();
            if (item.action) item.action();
          });
          dropdown.appendChild(btn);
        }

        const rect = el.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = rect.bottom + 'px';
        document.body.appendChild(dropdown);
        activeDropdown = dropdown;
        el.classList.add('menu-active');
      });
    });

    function closeDropdown() {
      if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
        $$('.menu-item').forEach(el => el.classList.remove('menu-active'));
      }
    }

    document.addEventListener('click', closeDropdown);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });

    // Settings gear
    const settingsBtn = document.querySelector('.activity-icon[data-action="settings"]');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', showSettings);
    }
  }


  // ── Run Helpers ──────────────────────────────────────────────

  async function runActiveFile() {
    if (!state.activeFile) { flashStatus('No file open'); return; }
    try {
      flashStatus('Running...');
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: state.activeFile }),
      });
      const data = await res.json();
      if (data.error) { flashStatus(`Error: ${data.error}`); return; }
      // Show output in terminal
      if (!state.terminalVisible) toggleTerminal();
      const t = state.terminals.find(t => t.id === state.activeTerminal);
      if (t && t.term) {
        t.term.write('\r\n── Run Output ──\r\n');
        t.term.write(data.output.replace(/\n/g, '\r\n'));
        t.term.write('\r\n── Exit: ' + data.exit_code + ' ──\r\n');
      }
      flashStatus(`Exit: ${data.exit_code}`);
    } catch (e) {
      flashStatus('Run failed');
    }
  }

  function runInTerminal() {
    if (!state.activeFile) { flashStatus('No file open'); return; }
    if (!state.terminalVisible) toggleTerminal();
    if (state.terminals.length === 0) newTerminal();
    const t = state.terminals.find(t => t.id === state.activeTerminal);
    if (t) {
      const ext = state.activeFile.split('.').pop().toLowerCase();
      const cmds = { py: 'python3', js: 'node', ts: 'npx tsx', sh: 'bash' };
      const runner = cmds[ext] || 'cat';
      socket.emit('terminal_input', { term_id: t.id, data: `${runner} ${state.activeFile}\n` });
    }
  }

  function saveCurrentFile() {
    if (state.activeFile) {
      const f = state.openFiles.find(f => f.path === state.activeFile);
      if (f && f.dirty) saveFile(f.path);
    }
  }


  // ── Settings Dialog ─────────────────────────────────────────

  function showSettings() {
    if (document.getElementById('settings-overlay')) {
      document.getElementById('settings-overlay').remove();
      return;
    }

    const s = state.settings;
    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="settings-modal">
        <div class="settings-header">
          <span class="settings-title">Settings</span>
          <button class="icon-btn settings-close" title="Close">×</button>
        </div>
        <div class="settings-body">
          <div class="settings-section">
            <h3>Editor</h3>
            <label class="settings-row">
              <span>Font Size</span>
              <input type="number" id="setting-fontsize" value="${s.fontSize}" min="10" max="32" class="settings-input">
            </label>
            <label class="settings-row">
              <span>Tab Size</span>
              <input type="number" id="setting-tabsize" value="${s.tabSize}" min="1" max="8" class="settings-input">
            </label>
            <label class="settings-row">
              <span>Word Wrap</span>
              <select id="setting-wordwrap" class="settings-input">
                <option value="off" ${s.wordWrap === 'off' ? 'selected' : ''}>Off</option>
                <option value="on" ${s.wordWrap === 'on' ? 'selected' : ''}>On</option>
              </select>
            </label>
            <label class="settings-row">
              <span>Minimap</span>
              <select id="setting-minimap" class="settings-input">
                <option value="true" ${s.minimap ? 'selected' : ''}>Visible</option>
                <option value="false" ${!s.minimap ? 'selected' : ''}>Hidden</option>
              </select>
            </label>
            <label class="settings-row">
              <span>Autosave</span>
              <select id="setting-autosave" class="settings-input">
                <option value="true" ${s.autosave ? 'selected' : ''}>On</option>
                <option value="false" ${!s.autosave ? 'selected' : ''}>Off</option>
              </select>
            </label>
          </div>
          <div class="settings-section">
            <h3>Terminal</h3>
            <label class="settings-row">
              <span>Font Size</span>
              <input type="number" id="setting-term-fontsize" value="${s.termFontSize}" min="10" max="24" class="settings-input">
            </label>
          </div>
          <div class="settings-section">
            <h3>Workspace</h3>
            <label class="settings-row">
              <span>Working Directory</span>
              <input type="text" id="setting-workdir" value="${state.currentPath}" class="settings-input settings-input-wide">
            </label>
          </div>
          <button id="settings-apply" class="btn-primary" style="margin-top:12px;width:100%;">Apply</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close
    overlay.querySelector('.settings-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Apply
    document.getElementById('settings-apply').addEventListener('click', () => {
      s.fontSize = parseInt(document.getElementById('setting-fontsize').value);
      s.tabSize = parseInt(document.getElementById('setting-tabsize').value);
      s.wordWrap = document.getElementById('setting-wordwrap').value;
      s.minimap = document.getElementById('setting-minimap').value === 'true';
      s.autosave = document.getElementById('setting-autosave').value === 'true';
      s.termFontSize = parseInt(document.getElementById('setting-term-fontsize').value);

      if (monacoEditor) {
        monacoEditor.updateOptions({
          fontSize: s.fontSize,
          tabSize: s.tabSize,
          wordWrap: s.wordWrap,
          minimap: { enabled: s.minimap },
        });
      }
      // Terminal font size
      state.terminals.forEach(t => { if (t.term) t.term.options.fontSize = s.termFontSize; });
      // Working directory
      const newDir = document.getElementById('setting-workdir').value.trim();
      if (newDir && newDir !== state.currentPath) {
        state.currentPath = newDir;
        state.dirCache = {};
        state.expandedDirs = {};
        loadTree();
      }
      persistSettings();
      flashStatus('Settings saved');
      overlay.remove();
    });
  }


  // ── File CRUD helpers ───────────────────────────────────────

  async function createFile(parentPath, name, isDir) {
    const path = joinPath(parentPath, name);
    try {
      await fetch('/api/ide/file/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, is_dir: isDir }),
      });
      delete state.dirCache[parentPath];
      if (parentPath === state.currentPath) {
        loadTree();
      } else if (state.expandedDirs[parentPath]) {
        await loadTree(parentPath);
        renderFileTree();
      }
    } catch (e) {
      console.warn('[ide] Create failed:', e);
    }
  }

  async function deleteFile(path) {
    if (!confirm(`Delete ${fileName(path)}?`)) return;
    try {
      await fetch('/api/ide/file/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      closeTab(path);
      // Refresh parent
      const parent = path.replace(/\/[^/]+$/, '') || state.currentPath;
      delete state.dirCache[parent];
      loadTree();
    } catch (e) {
      console.warn('[ide] Delete failed:', e);
    }
  }

  async function renameFile(node) {
    const newName = prompt('New name:', node.name);
    if (!newName || newName === node.name) return;
    const parent = node.path.replace(/\/[^/]+$/, '');
    const newPath = joinPath(parent, newName);
    try {
      await fetch('/api/ide/file/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_path: node.path, new_path: newPath }),
      });
      delete state.dirCache[parent];
      loadTree();
    } catch (e) {
      console.warn('[ide] Rename failed:', e);
    }
  }


  // ── Agent Panel — Job Management System ──────────────────

  let agentList = [];
  let agentChatSending = false;
  let _jobsCache = [];

  async function loadAgents() {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      agentList = data.agents || [];
      populateAgentSelector();
    } catch (e) {
      console.warn('[ide] Failed to load agents:', e);
    }
  }

  const AGENT_ICONS = {
    code: '💻', dnd_dm: '🐉', plan: '📋', conversation: '💬',
    music: '🎵', weather: '🌤️', timer: '⏲️', calendar: '📅',
    smart_home: '🏠', security: '🔒', deploy: '🚀', docs: '📝',
    research: '🔬', design: '🎨', test: '🧪', review: '👁️',
    learning: '📚', monitoring: '📊', cleanup: '🧹',
    alert: '🚨', encounter: '⚔️', npc_dialogue: '🗣️',
    lore: '📜', rules: '📖', treasure: '💰',
    session_recap: '📝', list: '📋', routine: '🔄',
  };

  function getAgentIcon(name) {
    return AGENT_ICONS[name] || '🤖';
  }

  function populateAgentSelector() {
    const sel = $('#agent-selector');
    if (!sel) return;
    sel.innerHTML = '<option value="auto">🤖 Auto</option>';
    for (const agent of agentList) {
      const opt = document.createElement('option');
      opt.value = agent.name;
      const icon = agent.icon || getAgentIcon(agent.name);
      opt.textContent = `${icon} ${agent.display_name}`;
      sel.appendChild(opt);
    }
  }

  // ── Job List ──────────────────────────────────────────────

  async function loadJobs() {
    try {
      const res = await fetch('/api/ide/jobs');
      const data = await res.json();
      _jobsCache = data.jobs || [];
      renderJobList();
    } catch (e) {
      console.warn('[ide] Failed to load jobs:', e);
    }
  }

  function _getJobName(jobId) {
    const job = _jobsCache.find(j => j.id === jobId);
    return job ? (job.custom_name || job.task.substring(0, 40)) : jobId;
  }

  function renderJobList() {
    const container = $('#jobs-list');
    const emptyEl = $('#jobs-empty');
    if (!container) return;

    container.querySelectorAll('.job-card').forEach(el => el.remove());

    const activeJobs = _jobsCache.filter(j => !j.archived);
    if (emptyEl) emptyEl.style.display = activeJobs.length ? 'none' : '';

    for (const job of activeJobs) {
      const card = _createJobCard(job);
      container.appendChild(card);
    }
  }

  function _createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.dataset.jobId = job.id;

    const icon = getAgentIcon(job.agent_name);
    const name = job.custom_name || job.task.substring(0, 40) + (job.task.length > 40 ? '...' : '');
    const statusClass = job.status;
    const statusText = job.status === 'done' ? '✅ Finished' :
                       job.status === 'running' ? '⏳ Running...' :
                       job.status === 'failed' ? '❌ Failed' :
                       job.status === 'cancelled' ? '⛔ Cancelled' : job.status;

    card.innerHTML = `
      <div class="job-card-top">
        <span class="job-card-icon">${icon}</span>
        <div class="job-card-info">
          <div class="job-card-name">${_escapeHtml(name)}</div>
          <div class="job-card-status" id="job-status-${job.id}">${statusText}</div>
        </div>
        <span class="job-status-badge ${statusClass}">${job.status}</span>
      </div>
      <div class="job-card-actions">
        <button class="job-action-btn" data-action="speak" title="Open chat">💬 Speak</button>
        ${job.status === 'running' ? '<button class="job-action-btn" data-action="cancel" title="Cancel">⏹ Stop</button>' : ''}
        <button class="job-action-btn" data-action="rename" title="Rename">✏️</button>
        <button class="job-action-btn" data-action="archive" title="Archive">📦</button>
        <button class="job-action-btn danger" data-action="delete" title="Delete">🗑</button>
      </div>
    `;

    card.querySelectorAll('.job-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'speak') openJobChat(job.id);
        else if (action === 'cancel') cancelJob(job.id);
        else if (action === 'rename') renameJob(job.id);
        else if (action === 'archive') archiveJob(job.id);
        else if (action === 'delete') deleteJob(job.id);
      });
    });

    card.addEventListener('click', () => openJobChat(job.id));
    return card;
  }

  // ── Job Actions ───────────────────────────────────────────

  async function createJob(message, opts = {}) {
    if (!message) return;
    try {
      const body = { task: message };
      if (opts.agent && opts.agent !== 'auto') body.agent = opts.agent;
      if (opts.model && opts.model !== 'auto') body.model = opts.model;
      if (opts.mode) body.mode = opts.mode;
      const res = await fetch('/api/ide/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.id) {
        await loadJobs();
        openJobChat(data.id);
      }
    } catch (e) {
      console.error('[ide] Failed to create job:', e);
    }
  }

  async function cancelJob(jobId) {
    await fetch(`/api/ide/jobs/${jobId}/cancel`, { method: 'POST' });
    loadJobs();
  }

  async function renameJob(jobId) {
    const newName = prompt('Enter new name:');
    if (newName) {
      await fetch(`/api/ide/jobs/${jobId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      loadJobs();
      if (state._activeJobId === jobId) {
        const titleEl = document.querySelector('.job-chat-title');
        if (titleEl) titleEl.textContent = newName;
      }
    }
  }

  async function archiveJob(jobId) {
    await fetch(`/api/ide/jobs/${jobId}/archive`, { method: 'POST' });
    loadJobs();
  }

  async function unarchiveJob(jobId) {
    await fetch(`/api/ide/jobs/${jobId}/unarchive`, { method: 'POST' });
    loadJobs();
    loadArchive();
  }

  async function deleteJob(jobId) {
    if (!confirm('Permanently delete this task?')) return;
    await fetch(`/api/ide/jobs/${jobId}/delete`, { method: 'DELETE' });
    loadJobs();
    loadArchive();
  }

  // ── Job Chat View ─────────────────────────────────────────

  async function openJobChat(jobId) {
    state._activeJobId = jobId;
    switchAgentView('chat');

    // Sync mode buttons with this job's mode
    const job = _jobsCache.find(j => j.id === jobId);
    _syncModeButtons(job ? (job.mode || 'normal') : 'normal');

    try {
      const res = await fetch(`/api/ide/jobs/${jobId}/messages`);
      const data = await res.json();
      const messages = data.messages || [];
      const activityLog = data.activity_log || [];
      const jobStatus = data.status || 'pending';

      const job = _jobsCache.find(j => j.id === jobId);
      const titleEl = document.querySelector('.job-chat-title');
      const subtitleEl = document.querySelector('.job-chat-subtitle');
      if (titleEl) titleEl.textContent = job ? (job.custom_name || job.task.substring(0, 40)) : jobId;
      if (subtitleEl) subtitleEl.textContent = job ? `${getAgentIcon(job.agent_name)} ${(job.agent_name || 'auto').replace('_', ' ')} · Job ${jobId}` : `Job ${jobId}`;

      const chatEl = $('#job-chat-messages');
      if (chatEl) {
        chatEl.innerHTML = '';
        for (const msg of messages) {
          appendJobChatMsg(msg.role, msg.text, msg.role === 'assistant' ? job?.agent_name : undefined);
        }

        // Replay stored activity log (all print output, status, thinking, etc.)
        if (activityLog.length > 0) {
          const typeIcons = { status: '\ud83d\udd04', thinking: '\ud83e\udde0', log: '\ud83d\udcbb', done: '\u2705', error: '\u274c' };
          for (const entry of activityLog) {
            const icon = typeIcons[entry.type] || '\ud83d\udccc';
            const card = document.createElement('div');
            card.className = `activity-card activity-${entry.type}`;
            card.innerHTML = `<span class="activity-icon">${icon}</span><span class="activity-text">${_escapeHtml(entry.content)}</span>`;
            chatEl.appendChild(card);
          }
          chatEl.scrollTop = chatEl.scrollHeight;
        }
      }
    } catch (e) {
      console.error('[ide] Failed to load job chat:', e);
    }
  }

  // Strip BMO-specific tags from chat text
  function _stripBmoTags(text) {
    return text
      .replace(/\[FACE:\w+\]/gi, '')
      .replace(/\[LED:\w+\]/gi, '')
      .replace(/\[EMOTION:\w+\]/gi, '')
      .replace(/\[RELAY:\w+\][\s\S]*/gi, '')  // strip RELAY tag + everything after it
      .replace(/\[SOUND:[^\]]*\]/gi, '')
      .replace(/\[ACTION:[^\]]*\][\s\S]*/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function appendJobChatMsg(role, text, agent) {
    const chatEl = $('#job-chat-messages');
    if (!chatEl) return;

    text = _stripBmoTags(text);
    if (!text) return; // skip empty messages after stripping

    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`;

    let html = '';
    if (role === 'assistant' && agent) {
      html += `<div class="agent-badge">${getAgentIcon(agent)} ${agent.replace('_', ' ')}</div>`;
    }

    let rendered;
    if (typeof marked !== 'undefined') {
      try { rendered = marked.parse(text); } catch (_e) { rendered = null; }
    }
    if (!rendered) {
      rendered = _escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }

    // Remove empty paragraphs and trim trailing whitespace from rendered HTML
    rendered = rendered.replace(/<p>\s*<\/p>/g, '').trim();

    rendered = rendered.replace(/(?:^|\s)(\/[\w\-\.\/]+\.\w+)/g, (match, path) => {
      return ` <span class="activity-file-link" data-path="${path}" onclick="window._ideOpenFile && window._ideOpenFile('${path}')">${path}</span>`;
    });

    html += `<div class="msg-text">${rendered}</div>`;
    html += `<button class="msg-copy-btn" title="Copy message">📋</button>`;
    msg.innerHTML = html;
    msg.dataset.rawText = text;

    // Wire copy button
    const copyBtn = msg.querySelector('.msg-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = '✅';
          setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
        });
      });
    }

    chatEl.appendChild(msg);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  async function sendJobFollowUp() {
    const input = $('#job-chat-input');
    if (!input || !state._activeJobId) return;
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    appendJobChatMsg('user', message);

    try {
      await fetch(`/api/ide/jobs/${state._activeJobId}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
    } catch (e) {
      appendJobChatMsg('assistant', `Error: ${e.message}`, 'system');
    }
  }

  function loadJobChat(jobId) {
    if (state._activeJobId === jobId) openJobChat(jobId);
  }

  // ── Job Progress (Real-Time Streaming) ────────────────────

  function _handleJobProgress(data) {
    // Update status text in job list
    const statusEl = document.getElementById(`job-status-${data.id}`);
    if (statusEl) {
      const preview = (data.text || '').substring(0, 60);
      statusEl.textContent = `⏳ ${preview}${preview.length >= 60 ? '...' : ''}`;
    }

    // Live streaming into job chat
    if (state._activeJobId === data.id && data.chunk) {
      let streamEl = document.getElementById('job-stream-active');
      if (!streamEl) {
        streamEl = document.createElement('div');
        streamEl.id = 'job-stream-active';
        streamEl.className = 'chat-msg assistant streaming';
        streamEl.innerHTML = '<div class="msg-text"><span class="stream-content"></span><span class="stream-cursor">▋</span></div>';
        const chatEl = $('#job-chat-messages');
        if (chatEl) chatEl.appendChild(streamEl);
      }
      const contentEl = streamEl.querySelector('.stream-content');
      if (contentEl) {
        contentEl.textContent += data.chunk;
        const chatEl = $('#job-chat-messages');
        if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
      }
    }
  }

  function _handleJobActivity(data) {
    if (state._activeJobId !== data.id) return;
    const chatEl = $('#job-chat-messages');
    if (!chatEl) return;

    const typeIcons = {
      status: '🔄',
      thinking: '🧠',
      log: '💻',
      done: '✅',
      error: '❌',
    };

    // If done/error, finalize the streaming bubble
    if (data.type === 'done' || data.type === 'error') {
      const streamEl = document.getElementById('job-stream-active');
      if (streamEl) {
        streamEl.classList.remove('streaming');
        const cursor = streamEl.querySelector('.stream-cursor');
        if (cursor) cursor.remove();
        // Re-render the content with markdown
        const contentEl = streamEl.querySelector('.stream-content');
        if (contentEl && typeof marked !== 'undefined') {
          try {
            let text = _stripBmoTags(contentEl.textContent);
            let rendered = marked.parse(text);
            rendered = rendered.replace(/<p>\s*<\/p>/g, '').trim();
            const msgText = streamEl.querySelector('.msg-text');
            if (msgText) msgText.innerHTML = rendered;
          } catch(_e) {}
        }
        streamEl.id = '';
      }
    }

    // Show activity card
    const icon = typeIcons[data.type] || '📌';
    const card = document.createElement('div');
    card.className = `activity-card activity-${data.type}`;
    card.innerHTML = `<span class="activity-icon">${icon}</span><span class="activity-text">${_escapeHtml(data.content)}</span>`;
    chatEl.appendChild(card);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // ── Main Chat (List View) ─────────────────────────────────

  function _handleMainChatResponse(data) {
    const text = data.text || data.response || 'No response';
    const agent = data.agent || data.speaker || '';
    appendMainChatMsg('assistant', text, agent);

    agentChatSending = false;
    const sendBtn = $('#btn-send-chat');
    if (sendBtn) sendBtn.disabled = false;
  }

  function appendMainChatMsg(role, text, agent) {
    const chat = $('#main-chat-area');
    if (!chat) return;

    text = _stripBmoTags(text);
    if (!text) return;

    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`;

    let html = '';
    if (role === 'assistant' && agent) {
      html += `<div class="agent-badge">${getAgentIcon(agent)} ${agent}</div>`;
    }
    let safe = _escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    html += `<div class="msg-text">${safe}</div>`;
    msg.innerHTML = html;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  }

  async function sendMainChat() {
    const input = $('#agent-chat-input');
    if (!input) return;
    const message = input.value.trim();
    if (!message || agentChatSending) return;

    agentChatSending = true;
    input.value = '';
    const sendBtn = $('#btn-send-chat');
    if (sendBtn) sendBtn.disabled = true;

    const agentOverride = $('#agent-selector')?.value;

    // Smart detection: if message looks like a task, create a job
    const isTask = message.length > 60 || /\b(create|build|fix|refactor|implement|deploy|update|add|remove|delete|write|change|modify)\b/i.test(message);
    if (isTask) {
      appendMainChatMsg('user', message);
      appendMainChatMsg('assistant', `🚀 Creating task: "${message.substring(0, 40)}..."`, 'system');
      await createJob(message, { agent: agentOverride });
      agentChatSending = false;
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    appendMainChatMsg('user', message);

    socket.emit('chat_message', {
      message,
      speaker: 'IDE User',
      agent: (agentOverride && agentOverride !== 'auto') ? agentOverride : undefined,
    });
  }

  // ── Archive View ──────────────────────────────────────────

  async function loadArchive() {
    const container = $('#archived-jobs-list');
    const emptyEl = $('#archive-empty');
    if (!container) return;

    container.querySelectorAll('.job-card').forEach(el => el.remove());

    const archivedJobs = _jobsCache.filter(j => j.archived);
    if (emptyEl) emptyEl.style.display = archivedJobs.length ? 'none' : '';

    for (const job of archivedJobs) {
      const card = document.createElement('div');
      card.className = 'job-card';
      const icon = getAgentIcon(job.agent_name);
      const name = job.custom_name || job.task.substring(0, 40);
      card.innerHTML = `
        <div class="job-card-top">
          <span class="job-card-icon">${icon}</span>
          <div class="job-card-info">
            <div class="job-card-name">${_escapeHtml(name)}</div>
            <div class="job-card-status">📦 Archived</div>
          </div>
          <span class="job-status-badge archived">archived</span>
        </div>
        <div class="job-card-actions">
          <button class="job-action-btn" data-action="unarchive">↩ Restore</button>
          <button class="job-action-btn" data-action="speak">💬 View</button>
          <button class="job-action-btn danger" data-action="delete">🗑 Delete</button>
        </div>
      `;
      card.querySelectorAll('.job-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btn.dataset.action === 'unarchive') unarchiveJob(job.id);
          else if (btn.dataset.action === 'speak') openJobChat(job.id);
          else if (btn.dataset.action === 'delete') deleteJob(job.id);
        });
      });
      container.appendChild(card);
    }
  }

  // ── View Switching ────────────────────────────────────────

  function switchAgentView(view) {
    const views = { list: '#agent-view-list', chat: '#agent-view-chat', archive: '#agent-view-archive' };
    for (const [key, sel] of Object.entries(views)) {
      const el = $(sel);
      if (el) {
        el.style.display = key === view ? 'flex' : 'none';
        el.classList.toggle('active', key === view);
      }
    }

    const backBtn = $('#btn-agent-back');
    if (backBtn) backBtn.style.display = view !== 'list' ? '' : 'none';

    if (view !== 'chat') {
      const streamEl = document.getElementById('job-stream-active');
      if (streamEl) streamEl.remove();
      state._activeJobId = null;
    }
  }

  // ── Toast Notifications ───────────────────────────────────

  function showToast(type, jobId, message) {
    const container = $('#toast-container');
    if (!container) return;

    while (container.children.length >= 3) {
      container.firstChild.remove();
    }

    const job = _jobsCache.find(j => j.id === jobId);
    const name = job ? (job.custom_name || job.task.substring(0, 30)) : jobId;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div class="toast-body">
        <div class="toast-title">${_escapeHtml(name)}</div>
        <div class="toast-message">${_escapeHtml(message)}</div>
      </div>
      <button class="toast-close">✕</button>
      <div class="toast-progress"></div>
    `;

    toast.addEventListener('click', () => {
      if (jobId) openJobChat(jobId);
      toast.remove();
    });
    toast.querySelector('.toast-close').addEventListener('click', (e) => {
      e.stopPropagation();
      toast.remove();
    });

    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 8000);
  }

  // ── Browser Notifications ─────────────────────────────────

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function sendBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`BMO IDE — ${title}`, { body, icon: '/static/ide/bmo-icon.png', tag: 'bmo-job' });
      } catch (_) {}
    }
  }

  // ── Utility ───────────────────────────────────────────────

  function _escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function _syncModeButtons(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  window._ideOpenFile = function(path) {
    if (path) openFile(path);
  };

  // ── Mode Change Confirmation ───────────────────────────────

  const MODE_LABELS = {
    autopilot: '🚀 Autopilot',
    normal: '🛡️ Normal',
    plan: '📋 Plan',
  };

  function _showModeChangeRequest(jobId, fromMode, toMode, reason, agentInitiated) {
    const chatEl = $('#job-chat-messages');
    if (!chatEl) return;

    // Remove any previous pending mode request
    chatEl.querySelectorAll('.mode-change-request').forEach(el => el.remove());

    const msg = document.createElement('div');
    msg.className = 'chat-msg system mode-change-request';

    const initiator = agentInitiated ? '🤖 Agent' : '👤 You';
    const reasonText = reason ? `<br><span style="color:var(--text-muted);font-size:11px">Reason: ${_escapeHtml(reason)}</span>` : '';

    msg.innerHTML = `
      <div class="mode-change-card">
        <div class="mode-change-title">${initiator} requested a mode change</div>
        <div class="mode-change-detail">
          ${MODE_LABELS[fromMode] || fromMode} → <strong>${MODE_LABELS[toMode] || toMode}</strong>
          ${reasonText}
        </div>
        <div class="mode-change-actions">
          <button class="mode-approve-btn" data-mode="${toMode}">✅ Approve</button>
          <button class="mode-deny-btn">❌ Deny</button>
        </div>
      </div>
    `;

    msg.querySelector('.mode-approve-btn').addEventListener('click', () => {
      _applyModeChange(jobId, toMode);
      msg.innerHTML = `<div class="mode-change-card confirmed"><span>✅ Mode switched to <strong>${MODE_LABELS[toMode] || toMode}</strong></span></div>`;
    });

    msg.querySelector('.mode-deny-btn').addEventListener('click', () => {
      msg.innerHTML = `<div class="mode-change-card denied"><span>❌ Mode change denied — staying on <strong>${MODE_LABELS[fromMode] || fromMode}</strong></span></div>`;
    });

    chatEl.appendChild(msg);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function _applyModeChange(jobId, newMode) {
    // Update UI
    state.agentMode = newMode;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === newMode);
    });

    // Persist to backend
    fetch(`/api/ide/jobs/${jobId}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode }),
    }).catch(e => console.warn('[ide] Failed to update mode:', e));
  }

  // ── New Task Modal ────────────────────────────────────────

  function showNewTaskModal() {
    const overlay = $('#new-task-overlay');
    if (!overlay) return;

    // Populate agent dropdown dynamically
    const agentSel = $('#new-task-agent');
    if (agentSel) {
      agentSel.innerHTML = '<option value="auto">🤖 Auto-Route</option>';
      for (const agent of agentList) {
        const opt = document.createElement('option');
        opt.value = agent.name;
        const icon = agent.icon || getAgentIcon(agent.name);
        opt.textContent = `${icon} ${agent.display_name}`;
        agentSel.appendChild(opt);
      }
    }

    // Set default mode from the mode bar
    const activeMode = document.querySelector('.mode-btn.active');
    const modeSel = $('#new-task-mode');
    if (modeSel && activeMode) modeSel.value = activeMode.dataset.mode;

    overlay.classList.remove('hidden');
    const textarea = $('#new-task-input');
    if (textarea) { textarea.value = ''; textarea.focus(); }
  }

  function hideNewTaskModal() {
    const overlay = $('#new-task-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  async function submitNewTask() {
    const textarea = $('#new-task-input');
    const modeSel = $('#new-task-mode');
    const agentSel = $('#new-task-agent');
    const modelSel = $('#new-task-model');

    const task = textarea ? textarea.value.trim() : '';
    if (!task) { if (textarea) textarea.focus(); return; }

    const opts = {
      mode: modeSel ? modeSel.value : 'normal',
      agent: agentSel ? agentSel.value : 'auto',
      model: modelSel ? modelSel.value : 'auto',
    };

    hideNewTaskModal();
    await createJob(task, opts);
  }

  // ── Init Agent Panel ──────────────────────────────────────

  function initAgents() {
    requestNotificationPermission();

    // Wire mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newMode = btn.dataset.mode;
        _syncModeButtons(newMode);
        if (state._activeJobId) {
          try {
            await fetch(`/api/ide/jobs/${state._activeJobId}/mode`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: newMode }),
            });
            const job = _jobsCache.find(j => j.id === state._activeJobId);
            if (job) job.mode = newMode;
            showToast('success', state._activeJobId, `Mode → ${newMode}`);
          } catch (e) {
            console.error('[ide] Mode change failed:', e);
          }
        }
      });
    });

    // Copy All chat button
    const copyAllBtn = $('#btn-copy-all-chat');
    if (copyAllBtn) {
      copyAllBtn.addEventListener('click', () => {
        const chatEl = $('#job-chat-messages');
        if (!chatEl) return;
        const msgs = chatEl.querySelectorAll('.chat-msg');
        let allText = '';
        msgs.forEach(msg => {
          const role = msg.classList.contains('user') ? 'User' : 'Agent';
          const raw = msg.dataset.rawText || msg.querySelector('.msg-text')?.textContent || '';
          allText += `--- ${role} ---\n${raw}\n\n`;
        });
        navigator.clipboard.writeText(allText.trim()).then(() => {
          copyAllBtn.textContent = '✅ Copied!';
          setTimeout(() => { copyAllBtn.textContent = '📋 Copy All'; }, 2000);
        });
      });
    }

    // Main chat input
    const chatInput = $('#agent-chat-input');
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMainChat();
        }
      });
    }

    // Job chat input
    const jobInput = $('#job-chat-input');
    if (jobInput) {
      jobInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendJobFollowUp();
        }
      });
    }

    // Send buttons
    const sendBtn = $('#btn-send-chat');
    if (sendBtn) sendBtn.addEventListener('click', sendMainChat);
    const sendJobBtn = $('#btn-send-job-chat');
    if (sendJobBtn) sendJobBtn.addEventListener('click', sendJobFollowUp);

    // Back button
    const backBtn = $('#btn-agent-back');
    if (backBtn) backBtn.addEventListener('click', () => switchAgentView('list'));

    // Archive toggle
    const archiveBtn = $('#btn-agent-archive-toggle');
    if (archiveBtn) {
      let showingArchive = false;
      archiveBtn.addEventListener('click', () => {
        showingArchive = !showingArchive;
        if (showingArchive) {
          loadArchive();
          switchAgentView('archive');
        } else {
          switchAgentView('list');
        }
      });
    }

    // New job button — show modal
    const newJobBtn = $('#btn-new-job');
    if (newJobBtn) {
      newJobBtn.addEventListener('click', () => showNewTaskModal());
    }

    // New task modal handlers
    const closeModalBtn = $('#btn-close-new-task');
    const cancelModalBtn = $('#btn-cancel-new-task');
    const submitModalBtn = $('#btn-submit-new-task');
    const taskOverlay = $('#new-task-overlay');

    if (closeModalBtn) closeModalBtn.addEventListener('click', hideNewTaskModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', hideNewTaskModal);
    if (taskOverlay) taskOverlay.addEventListener('click', (e) => {
      if (e.target === taskOverlay) hideNewTaskModal();
    });
    if (submitModalBtn) submitModalBtn.addEventListener('click', submitNewTask);

    // Mode selector — confirmation flow
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newMode = btn.dataset.mode;
        const currentMode = state.agentMode || 'normal';
        if (newMode === currentMode) return;
        if (state._activeJobId) {
          _showModeChangeRequest(state._activeJobId, currentMode, newMode, null, false);
        }
      });
    });

    // Load agents and jobs
    loadAgents();
    loadJobs();
  }



  // ── Initialize ──────────────────────────────────────────────

  function init() {
    console.log('[ide] init() starting...');
    try { initSocket(); console.log('[ide] Socket.IO initialized'); }
    catch (e) { console.error('[ide] initSocket failed:', e); }

    try { initMonaco(); console.log('[ide] Monaco init started'); }
    catch (e) { console.error('[ide] initMonaco failed:', e); }

    try { initResize(); console.log('[ide] Resize handlers attached'); }
    catch (e) { console.error('[ide] initResize failed:', e); }

    try { initKeyboard(); console.log('[ide] Keyboard shortcuts registered'); }
    catch (e) { console.error('[ide] initKeyboard failed:', e); }

    try { bindEvents(); console.log('[ide] Event listeners bound'); }
    catch (e) { console.error('[ide] bindEvents failed:', e); }

    try { restoreState(); console.log('[ide] State restored'); }
    catch (e) { console.error('[ide] restoreState failed:', e); }

    try { loadTree(); console.log('[ide] File tree load requested'); }
    catch (e) { console.error('[ide] loadTree failed:', e); }

    try { loadGitStatus(); console.log('[ide] Git status load requested'); }
    catch (e) { console.error('[ide] loadGitStatus failed:', e); }

    try { initAgents(); console.log('[ide] Agent panel initialized'); }
    catch (e) { console.error('[ide] initAgents failed:', e); }

    console.log('[ide] init() complete');
  }

  // Wait for external dependencies (Socket.IO, Monaco loader) then start
  function waitForDeps() {
    const maxWait = 10000;
    const start = Date.now();

    function check() {
      const elapsed = Date.now() - start;
      const hasIO = typeof io !== 'undefined';
      const hasRequire = typeof window.require !== 'undefined' && typeof window.require.config === 'function';

      if (hasIO && hasRequire) {
        console.log(`[ide] Dependencies ready after ${elapsed}ms`);
        init();
      } else if (elapsed > maxWait) {
        console.warn(`[ide] Timeout waiting for deps (io: ${hasIO}, require: ${hasRequire}). Starting anyway...`);
        init();
      } else {
        setTimeout(check, 50);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', check);
    } else {
      check();
    }
  }

  waitForDeps();

})();
