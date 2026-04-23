/**
 * BMO IDE — Frontend Logic (Built from scratch)
 * 
 * Manages: File explorer, Monaco editor, terminals, git panel,
 * search, quick-open, tabs, keyboard shortcuts, context menus.
 */

(() => {
  'use strict';

  // ── State ───────────────────────────────────────────────────

  const STORAGE_KEY = 'bmo-ide-state';
  let autosaveTimer = null;
  const AUTOSAVE_DELAY = 2000; // ms after last edit

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


  // ── Agent Panel ──────────────────────────────────────────────

  let agentList = [];
  let agentChatSending = false;

  async function loadAgents() {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      agentList = data.agents || [];
      populateAgentSelector();
      console.log(`[ide] Loaded ${agentList.length} agents`);
    } catch (e) {
      console.warn('[ide] Failed to load agents:', e);
    }
  }

  function populateAgentSelector() {
    const sel = $('#agent-selector');
    if (!sel) return;
    sel.innerHTML = '<option value="auto">🤖 Auto-Route</option>';
    for (const agent of agentList) {
      const opt = document.createElement('option');
      opt.value = agent.name;
      opt.textContent = `${agent.icon} ${agent.display_name}`;
      sel.appendChild(opt);
    }
  }

  async function sendAgentChat() {
    const input = $('#agent-chat-input');
    if (!input) return;
    const message = input.value.trim();
    if (!message || agentChatSending) return;

    agentChatSending = true;
    input.value = '';
    const sendBtn = $('#btn-send-chat');
    if (sendBtn) sendBtn.disabled = true;

    // Remove welcome message
    const welcome = $('#agent-chat .agent-welcome');
    if (welcome) welcome.remove();

    // Add user bubble
    appendChatMsg('user', message);

    // Show typing indicator
    const typing = document.createElement('div');
    typing.className = 'chat-typing';
    typing.id = 'agent-typing';
    typing.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    $('#agent-chat').appendChild(typing);
    scrollChat();

    try {
      const agentOverride = $('#agent-selector')?.value;
      const modelOverride = $('#model-selector')?.value;

      // Set model if changed
      if (modelOverride && modelOverride !== 'auto') {
        await fetch('/api/agents/model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelOverride }),
        });
      }

      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          agent_override: agentOverride === 'auto' ? null : agentOverride,
        }),
      });
      const data = await res.json();

      // Remove typing indicator
      const typingEl = document.getElementById('agent-typing');
      if (typingEl) typingEl.remove();

      appendChatMsg('assistant', data.text || 'No response', data.agent);
    } catch (e) {
      const typingEl = document.getElementById('agent-typing');
      if (typingEl) typingEl.remove();
      appendChatMsg('assistant', `Error: ${e.message}`, 'system');
    }

    agentChatSending = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }

  function appendChatMsg(role, text, agent) {
    const chat = $('#agent-chat');
    if (!chat) return;

    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`;

    let html = '';
    if (role === 'assistant' && agent) {
      html += `<div class="agent-badge">${agent}</div>`;
    }
    // Basic markdown: bold, code, italic
    let safe = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    html += `<div class="msg-text">${safe}</div>`;
    msg.innerHTML = html;

    chat.appendChild(msg);
    scrollChat();
  }

  function scrollChat() {
    const chat = $('#agent-chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  async function loadChatHistory() {
    try {
      const res = await fetch('/api/agents/history?limit=50');
      const data = await res.json();
      const chat = $('#agent-chat');
      if (!chat) return;

      if (data.history && data.history.length > 0) {
        // Remove welcome
        const welcome = chat.querySelector('.agent-welcome');
        if (welcome) welcome.remove();

        for (const msg of data.history) {
          appendChatMsg(msg.role, msg.content, msg.agent);
        }
      }
    } catch (e) {
      console.warn('[ide] Failed to load chat history:', e);
    }
  }

  async function clearChatHistory() {
    try {
      await fetch('/api/agents/history', { method: 'DELETE' });
      const chat = $('#agent-chat');
      if (chat) {
        chat.innerHTML = `
          <div class="agent-welcome">
            <span class="agent-welcome-icon">🤖</span>
            <p>Chat with BMO's agents</p>
            <p class="agent-welcome-hint">Messages route to the best agent automatically</p>
          </div>
        `;
      }
    } catch (e) {
      console.warn('[ide] Failed to clear chat:', e);
    }
  }

  function showAgentList() {
    const panel = $('#panel-agents');
    if (!panel) return;

    // Toggle existing overlay
    let overlay = panel.querySelector('.agent-list-overlay');
    if (overlay) {
      overlay.remove();
      return;
    }

    overlay = document.createElement('div');
    overlay.className = 'agent-list-overlay visible';
    overlay.innerHTML = '<div style="padding:4px 8px;font-size:11px;color:var(--text-secondary);font-weight:600;">ALL AGENTS</div>';

    for (const agent of agentList) {
      const card = document.createElement('div');
      card.className = 'agent-card';
      card.innerHTML = `
        <span class="agent-icon">${agent.icon}</span>
        <span class="agent-name">${agent.display_name}</span>
        <span class="agent-tier ${agent.tier}">${agent.tier}</span>
      `;
      card.addEventListener('click', () => {
        const sel = $('#agent-selector');
        if (sel) sel.value = agent.name;
        overlay.remove();
      });
      overlay.appendChild(card);
    }

    // Close button
    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = 'padding:8px;text-align:center;cursor:pointer;color:var(--text-muted);font-size:11px;';
    closeBtn.textContent = '← Back to Chat';
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.appendChild(closeBtn);

    panel.style.position = 'relative';
    panel.appendChild(overlay);
  }

  function initAgents() {
    // Chat input — Enter to send
    const chatInput = $('#agent-chat-input');
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendAgentChat();
        }
      });
    }

    // Send button
    const sendBtn = $('#btn-send-chat');
    if (sendBtn) sendBtn.addEventListener('click', sendAgentChat);

    // Clear chat button
    const clearBtn = $('#btn-clear-chat');
    if (clearBtn) clearBtn.addEventListener('click', clearChatHistory);

    // Agent list button
    const listBtn = $('#btn-agent-list');
    if (listBtn) listBtn.addEventListener('click', showAgentList);

    // Load agents and chat history
    loadAgents();
    loadChatHistory();

    // Listen for SocketIO agent events
    if (socket) {
      socket.on('agent_response', (data) => {
        // Real-time response from another client's chat
        console.log('[ide] Agent response event:', data.agent);
      });
    }
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
