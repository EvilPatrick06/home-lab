/**
 * BMO IDE — Frontend Logic (Built from scratch)
 * 
 * Manages: File explorer, Monaco editor, terminals, git panel,
 * search, quick-open, tabs, keyboard shortcuts, context menus.
 */

(() => {
  'use strict';

  // ── State ───────────────────────────────────────────────────

  const state = {
    currentPath: '~',
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
      $('#connection-status').title = 'Connected';
    });
    
    socket.on('disconnect', () => {
      $('#connection-status').className = 'status-dot offline';
      $('#connection-status').title = 'Disconnected';
    });
    
    socket.on('terminal_output', (data) => {
      const t = state.terminals.find(t => t.id === data.term_id);
      if (t && t.term) t.term.write(data.data);
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

      // Track content changes (dirty flag)
      monacoEditor.onDidChangeModelContent(() => {
        const f = state.openFiles.find(f => f.path === state.activeFile);
        if (f && !f.dirty) {
          f.dirty = true;
          renderTabs();
        }
      });

      // Ctrl+S to save
      monacoEditor.addAction({
        id: 'bmo-save',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => saveFile(),
      });
    });
  }

  // ── File Tree ───────────────────────────────────────────────

  async function loadTree(path) {
    path = path || state.currentPath;
    try {
      const res = await fetch(`/api/files/tree?path=${encodeURIComponent(path)}`);
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
      const icon = node.isDir ? '<span class="icon">📁</span>' : `<span class="icon">${fileIcon(node.name)}</span>`;

      item.innerHTML = `${arrow}${icon}<span class="name">${node.name}</span>`;

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
      const res = await fetch('/api/files/read', {
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
  }

  async function saveFile() {
    const f = state.openFiles.find(f => f.path === state.activeFile);
    if (!f) return;

    const content = monacoEditor ? monacoEditor.getValue() : f.content;
    try {
      const res = await fetch('/api/files/write', {
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
        <span class="tab-name">${name}</span>
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
      tab.innerHTML = `<span>${t.label}</span><span class="close-term">×</span>`;
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
      const res = await fetch(`/api/git/status?path=${encodeURIComponent(state.currentPath)}`);
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
      ${state.gitBranch || '(no repo)'}
    `;
    $('#status-branch-name').textContent = state.gitBranch || 'none';

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
        <span class="status ${statusClass}">${c.status}</span>
        <span class="filepath">${c.path}</span>
      `;
      div.addEventListener('click', () => {
        openFile(joinPath(state.currentPath, c.path));
      });
      container.appendChild(div);
    }
  }

  async function gitCommit() {
    const msg = $('#git-commit-msg').value.trim();
    if (!msg) return;
    try {
      await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, repo: state.currentPath }),
      });
      $('#git-commit-msg').value = '';
      loadGitStatus();
    } catch (e) {
      console.warn('[ide] Commit failed:', e);
    }
  }


  // ── Search ──────────────────────────────────────────────────

  async function searchFiles(query) {
    if (!query) { state.searchResults = []; renderSearchResults(); return; }
    try {
      const res = await fetch(`/api/files/search?pattern=${encodeURIComponent(query)}&path=${encodeURIComponent(state.currentPath)}`);
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
        <div class="result-file">${r.file.split('/').pop()}</div>
        <div class="result-line">Line ${r.line}</div>
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
      const res = await fetch(`/api/files/find?pattern=${encodeURIComponent(query)}&path=${encodeURIComponent(state.currentPath)}`);
      const data = await res.json();
      const results = (data.matches || []).slice(0, 20);
      
      const container = $('#quick-open-results');
      container.innerHTML = '';
      for (const filepath of results) {
        const div = document.createElement('div');
        div.className = 'quick-open-item';
        div.innerHTML = `
          <span class="file-name">${filepath.split('/').pop()}</span>
          <span class="file-path">${filepath}</span>
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
        hideContextMenu();
      });
    });

    // Close context menu on click elsewhere
    document.addEventListener('click', hideContextMenu);

    // Menu bar items (placeholders)
    $$('.menu-item').forEach(el => {
      el.addEventListener('click', () => {
        const menu = el.dataset.menu;
        if (menu === 'terminal') toggleTerminal();
        if (menu === 'view') toggleSidebar();
      });
    });
  }


  // ── File CRUD helpers ───────────────────────────────────────

  async function createFile(parentPath, name, isDir) {
    const path = joinPath(parentPath, name);
    try {
      await fetch('/api/files/create', {
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
      await fetch('/api/files/delete', {
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
      await fetch('/api/files/rename', {
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


  // ── Initialize ──────────────────────────────────────────────

  function init() {
    initSocket();
    initMonaco();
    initResize();
    initKeyboard();
    bindEvents();
    loadTree();
    loadGitStatus();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
