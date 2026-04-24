/** BMO Touchscreen UI — Alpine.js data + WebSocket handlers */

// Global error handler — logs JS errors to server for debugging
window.addEventListener('error', (e) => {
  fetch('/api/ide/js-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg: e.message, file: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack }),
  }).catch(() => {});
});

// Auto-reload when returning to page (tab switch, phone→PC, etc.)
let _bmoHiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _bmoHiddenAt = Date.now();
  } else if (_bmoHiddenAt && (Date.now() - _bmoHiddenAt) > 30000) {
    // Page was hidden for >30s — reload for fresh data
    location.reload();
  }
});
window.addEventListener('unhandledrejection', (e) => {
  fetch('/api/ide/js-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg: 'Unhandled rejection: ' + String(e.reason), stack: e.reason?.stack }),
  }).catch(() => {});
});

// ── Google Places Autocomplete ──────────────────────────────────
let _placesLoaded = false;
let _placesCallbacks = [];

function loadPlacesAPI(apiKey) {
  if (_placesLoaded || !apiKey) return;
  _placesLoaded = true;
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=_onPlacesReady&loading=async`;
  script.async = true;
  script.onerror = () => console.warn('Failed to load Google Places API');
  document.head.appendChild(script);
}

window._onPlacesReady = function() {
  _placesCallbacks.forEach(cb => cb());
  _placesCallbacks = [];
};

const _autocompleteInstances = {};

function initPlacesAutocomplete(inputId, onSelect) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (_autocompleteInstances[inputId]) return;

  function attach() {
    if (!window.google?.maps?.places) return;
    try {
      const ac = new google.maps.places.Autocomplete(el, {
        fields: ['formatted_address', 'name'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const value = place.name && place.formatted_address
          ? `${place.name}, ${place.formatted_address}`
          : place.formatted_address || place.name || '';
        if (onSelect) onSelect(value);
        el.value = value;
        el.dispatchEvent(new Event('input'));
      });
      _autocompleteInstances[inputId] = ac;
    } catch (e) {
      console.warn('Places autocomplete failed:', e);
    }
  }

  if (window.google?.maps?.places) {
    attach();
  } else {
    _placesCallbacks.push(attach);
  }
}

function bmo() {
  return {
    // Tabs
    tab: 'home',
    tabs: [
      { id: 'tv', icon: '\u{1F4FA}', label: 'TV' },
      { id: 'chat', icon: '\u{1F4AC}', label: 'Chat' },
      { id: 'home', icon: '\u{1F3E0}', label: 'Home' },
      { id: 'music', icon: '\u{1F3B5}', label: 'Music' },
      { id: 'ide', icon: '\u{1F4BB}', label: 'IDE' },
      { id: 'calendar', icon: '\u{1F4C5}', label: 'Cal' },
      { id: 'timers', icon: '\u23F1', label: 'Timers' },
      { id: 'controls', icon: '\u2699', label: 'Settings' },
    ],

    // Clock
    clock: '',
    dateStr: '',
    fullDateStr: '',

    // Status
    status: 'idle', // idle, listening, thinking, speaking

    // Weather
    weather: { temperature: null, description: '', icon: 'clear', feels_like: null },

    // Next event
    nextEvent: null,

    // Chat
    messages: [],
    chatInput: '',

    // Music
    musicQuery: '',
    musicResults: [],
    searchMode: 'songs',
    playlistResults: [],
    musicState: {
      song: null, is_playing: false, position: 0, duration: 0,
      volume: 50, output_device: 'pi', queue: [], queue_length: 0,
      queue_index: -1, shuffle: false, repeat: 'off', autoplay: true,
    },
    musicDevices: [{ name: 'pi', label: 'Pi Speakers' }],
    musicHistory: [],
    musicMostPlayed: [],
    showHistory: false,
    showQueue: false,
    albumView: null,

    // TTS output
    ttsOutput: 'pi',
    ttsLaptopDevice: null,
    laptopAudioDevices: [],
    laptopMicDevices: [],
    browserMicGranted: false,
    _ttsAudio: null,
    micInputs: [],

    // Calendar
    calEvents: [],
    calOffline: false,
    calAuthUrl: '',
    calAuthCode: '',
    calDays: 7,
    showEventForm: false,
    newEvent: {
      summary: '', date: '', startTime: '12:00', durationHrs: '1', location: '', description: '',
      allDay: false, repeatMode: 'none',
      customInterval: 1, customFreq: 'WEEKLY', customDays: [], customEnd: 'never', customEndDate: '', customCount: 10,
    },
    editingEvent: null,
    editEvent: {
      id: '', summary: '', date: '', startTime: '', endTime: '', location: '', description: '',
      allDay: false, repeatMode: 'none',
      customInterval: 1, customFreq: 'WEEKLY', customDays: [], customEnd: 'never', customEndDate: '', customCount: 10,
    },

    // Camera (now accessed via chat overlay)
    cameraActive: true,
    visionResult: '',
    motionEnabled: false,
    showCameraOverlay: false,

    // Timers
    timerMode: 'timer',
    timerItems: [],
    newTimerMin: 0,
    newTimerSec: 0,
    newTimerLabel: '',
    alarmHour: 0,
    alarmMin: 0,
    alarmAmPm: 'AM',
    alarmLabel: '',
    alarmTag: 'reminder',

    // Schedule overlay (separate state)
    schedHour: null,
    schedMin: null,
    schedAmPm: 'AM',
    schedLabel: '',
    schedDate: '',
    schedRepeat: 'none',
    schedRepeatDays: [],
    schedTag: 'reminder',
    showAlarmSchedule: false,
    alarmCalMonth: new Date().getMonth(),
    alarmCalYear: new Date().getFullYear(),

    // Notifications
    notification: null,
    notificationHistory: [],
    unreadNotifications: 0,
    showNotifications: false,

    // Notes
    notes: [],
    newNoteText: '',

    // Lyrics
    showLyrics: false,
    currentLyrics: '',
    lyricsSource: '',
    lyricsLoading: false,
    _lyricsCache: {},

    // Agent system
    agentUsed: '',
    agentDisplayName: '',

    // Plan mode
    planMode: false,       // true when in any plan mode state
    planStatus: 'idle',    // idle, exploring, designing, review, executing, done
    planTask: '',          // current plan task description
    planText: '',          // full plan text from scratchpad
    planSteps: [],         // parsed steps: [{num, desc, agent, status}]
    planCurrentStep: 0,
    planTotalSteps: 0,
    scratchpad: {},        // section name → content

    // D&D Party
    activePlayer: '',
    players: [],

    // TV Remote
    tvConnected: false,
    tvPairing: false,
    tvPairPin: '',
    tvAutoSkip: false,
    tvCurrentApp: '',
    tvVolumeLevel: -1,
    tvMediaTitle: '',
    tvMediaArtist: '',

    // Controls tab state
    ledState: null,
    ledColorHex: '#000000',
    volumeLevels: null,
    systemStatus: null,
    showStatusDetail: false,
    detailedStatus: null,
    copiedStatus: false,
    conversationActive: false,
    kdeNotifications: [],
    notifSettings: { enabled: true, blocklist: [], devices: {} },

    // Scene modes
    scenes: [],
    activeScene: null,
    sceneEditing: null,
    sceneForm: { label: '', rgb_off: false, rgb_mode: '', rgb_color: [0, 0, 0], rgb_brightness: 100, tv_on: false, tv_off: false, tv_app: '', music_stop: false, music_playlist: '' },

    // Smart home devices
    smartDevices: [],
    smartDeviceExpanded: null,

    // Audio devices
    audioDevices: [],
    audioStatus: {},
    audioRouting: {},
    btScanning: false,
    btDevices: [],

    // Blocklist input
    blocklistInput: '',

    // Swipe animation direction
    swipeDirection: '',

    // Alert overlay
    alertFired: null,  // { id, label, type } when a timer/alarm goes off

    // Socket
    socket: null,

    // Swipe
    _touchStartX: 0,
    _touchStartY: 0,

    // Voice settings (Phase 6)
    voiceSettings: { wake_enabled: true, silence_threshold: 600, vad_sensitivity: 1.8, tts_provider: 'auto', stt_provider: 'auto', wake_variants: [] },

    // Agent/Model picker (Phase 7)
    selectedAgent: 'auto',
    selectedModel: 'auto',
    showAgentPicker: false,

    // Ambient/idle mode
    ambientActive: false,
    ambientMode: 'clock',  // 'clock', 'now_playing', 'bmo_face'
    _idleTimer: null,
    _idleTimeout: 300000,  // 5 minutes

    // Procedural BMO face
    _faceCanvas: null,
    _faceCtx: null,
    _faceAnimFrame: null,
    _faceState: 'idle',
    _faceEmotion: null,
    _faceBlink: 0,
    _faceBlinkState: false,
    _faceMouth: 0,
    _faceThinkAngle: 0,
    _faceLookOffset: 0,
    _faceLookTarget: 0,
    _faceLookTimer: 0,
    _faceFrame: 0,

    // Lists
    lists: {},
    activeList: '',
    newListName: '',
    newListItemText: '',

    // Alerts
    recentAlerts: [],
    alertToast: null,
    _alertToastTimer: null,

    // Routines
    routines: [],

    // Personality
    personalitySettings: { enabled: true, chattiness: 'medium' },

    // Games
    gameActive: false,
    currentGame: null,
    gameState: {},

    // ── IDE Tab (under construction — new IDE on port 5001) ──

    // ── Init ──────────────────────────────────────────────────

    init() {
      this.updateClock();
      setInterval(() => this.updateClock(), 1000);

      this.socket = io();
      this.setupSocket();

      // Fetch current music state on page load (preserve playback across reloads)
      this.fetchMusicState();

      // Load cached calendar instantly from localStorage (before any server call)
      try {
        const cached = localStorage.getItem('bmo_cal_events');
        if (cached) {
          this.calEvents = JSON.parse(cached);
          if (this.calEvents.length > 0) this.nextEvent = this.calEvents[0];
        }
      } catch {}

      // Restore laptop devices from localStorage
      try {
        const audioDevs = localStorage.getItem('bmo_laptop_audio');
        const micDevs = localStorage.getItem('bmo_laptop_mic');
        if (audioDevs) this.laptopAudioDevices = JSON.parse(audioDevs);
        if (micDevs) this.laptopMicDevices = JSON.parse(micDevs);
        if (localStorage.getItem('bmo_mic_granted')) {
          this.browserMicGranted = true;
          // Re-enumerate in background to refresh device list
          this.enumerateLaptopDevices();
        }
      } catch {}

      // Restore chat from last session
      this.loadChatHistory();

      // Fetch D&D player names if a session is active
      this.fetchPlayers();

      // Initial data fetches
      this.fetchWeather();
      this.fetchCalendar();
      this.fetchMusicState();
      this.fetchMusicDevices();
      this.fetchMusicHistory();
      this.fetchMostPlayed();
      this.fetchTimers();
      this.fetchNotes();
      this.fetchTvStatus();

      // Poll music state every 2s (on any tab since now-playing bar is global)
      setInterval(() => this.fetchMusicState(), 2000);
      // Poll timers every 1s
      setInterval(() => { if (this.timerItems.length > 0 || this.tab === 'timers') this.fetchTimers(); }, 1000);
      // Poll calendar every 5 min
      setInterval(() => this.fetchCalendar(), 300000);
      // Poll TV status every 5s when TV tab is active
      setInterval(() => { if (this.tab === 'tv' && this.tvConnected) this.fetchTvStatus(); }, 5000);

      // Watch calendar tab for day changes
      this.$watch('calDays', () => this.fetchCalendar());

      // Clear overlays when switching tabs
      this.$watch('tab', () => {
        this.musicResults = [];
        this.playlistResults = [];
        this.musicSearchFocused = false;
        // Hide Google Places autocomplete dropdown
        document.querySelectorAll('.pac-container').forEach(el => el.style.display = 'none');
      });

      // Swipe navigation
      this.initSwipe();

      // Idle timer for ambient mode
      this.resetIdleTimer();
      document.addEventListener('touchstart', () => this.resetIdleTimer(), { passive: true });
      document.addEventListener('mousedown', () => this.resetIdleTimer());
      document.addEventListener('keydown', () => this.resetIdleTimer());

      // Fetch new service data
      this.fetchLists();
      this.fetchRoutines();
      this.fetchAlerts();

      // Load Google Places API
      fetch('/api/config').then(r => r.json()).then(c => {
        if (c.maps_api_key) loadPlacesAPI(c.maps_api_key);
      }).catch(() => {});

      // IDE: stubbed out — new IDE on port 5001

    },

    // ── Swipe ─────────────────────────────────────────────────

    initSwipe() {
      const main = document.querySelector('main');
      if (!main) return;

      let usedTouch = false;

      main.addEventListener('touchstart', (e) => {
        usedTouch = true;
        this._touchStartX = e.touches[0].clientX;
        this._touchStartY = e.touches[0].clientY;
      }, { passive: true });

      main.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - this._touchStartX;
        const dy = e.changedTouches[0].clientY - this._touchStartY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          this.swipeTab(dx < 0 ? 1 : -1);
        }
      }, { passive: true });

      // Mouse/touch-as-mouse drag — vertical scroll + horizontal tab swipe
      let mouseDown = false;
      let scrollTarget = null;
      let lastY = 0;
      let dragged = false;

      main.addEventListener('mousedown', (e) => {
        if (usedTouch) return;
        if (e.target.closest('input, button, select, textarea, a')) return;
        // Allow text selection in chat bubbles (PC mouse copy)
        if (e.target.closest('#chatScroll [class*="select-text"]')) return;
        mouseDown = true;
        dragged = false;
        this._touchStartX = e.clientX;
        this._touchStartY = e.clientY;
        lastY = e.clientY;
        // Find nearest scrollable ancestor of the target
        scrollTarget = null;
        let el = e.target;
        while (el && el !== main) {
          if (el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'hidden' && getComputedStyle(el).overflowY !== 'visible') {
            scrollTarget = el;
            break;
          }
          el = el.parentElement;
        }
        e.preventDefault();
      });

      main.addEventListener('mousemove', (e) => {
        if (!mouseDown) return;
        const dy = e.clientY - lastY;
        if (scrollTarget && Math.abs(dy) > 1) {
          scrollTarget.scrollTop -= dy;
          dragged = true;
        }
        lastY = e.clientY;
      });

      main.addEventListener('mouseup', (e) => {
        if (usedTouch) { usedTouch = false; return; }
        if (!mouseDown) return;
        mouseDown = false;
        const dx = e.clientX - this._touchStartX;
        const dy = e.clientY - this._touchStartY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          this.swipeTab(dx < 0 ? 1 : -1);
        }
        scrollTarget = null;
      });
    },

    _lastSwipe: 0,

    swipeTab(direction) {
      const now = Date.now();
      if (now - this._lastSwipe < 300) return;
      this._lastSwipe = now;
      const ids = this.tabs.map(t => t.id);
      const idx = ids.indexOf(this.tab);
      const next = idx + direction;
      if (next >= 0 && next < ids.length) {
        this.swipeDirection = direction > 0 ? 'left' : 'right';
        this.tab = ids[next];
        setTimeout(() => this.swipeDirection = '', 250);
      }
    },

    // ── Clock ─────────────────────────────────────────────────

    updateClock() {
      const now = new Date();
      this.clock = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      this.dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      this.fullDateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    },

    // ── WebSocket ─────────────────────────────────────────────

    setupSocket() {
      this.socket.on('weather_update', (data) => { this.weather = data; });
      this.socket.on('music_state', (data) => {
        // Preserve saved volume if incoming state has 0 (VLC reports 0 when idle)
        if (!data.volume && this.musicState.volume > 0) data.volume = this.musicState.volume;
        // Refresh history/most-played when song changes (e.g. autoplay)
        const oldVid = this.musicState.song?.videoId;
        const newVid = data.song?.videoId;
        if (newVid && newVid !== oldVid) {
          this.fetchMusicHistory();
          this.fetchMostPlayed();
        }
        this.musicState = data;
        // Don't let music_state override the settings slider — settings API is source of truth
      });
      this.socket.on('next_event', (data) => { this.nextEvent = data; });
      this.socket.on('timers_tick', (data) => { this.timerItems = data; });
      this.socket.on('status', (data) => {
        this.status = data.state;
        this._faceState = data.state;
      });
      this.socket.on('expression', (data) => {
        if (data.expression) this._faceEmotion = data.expression;
      });

      this.socket.on('chat_response', (data) => {
        this.status = data.agent_used === 'code'
          ? (data.incomplete ? 'code_incomplete' : 'code_done')
          : 'yapping';
        let text = (data.text || '').trim();
        // Remove progress placeholders for non-Code agents. For Code Agent, keep progress
        // so the user can see what work was done—especially when the summary says "still
        // doing work" or sounds incomplete.
        if (data.agent_used !== 'code') {
          while (this.messages.length > 0 && this.messages[this.messages.length - 1].role === 'progress') {
            this.messages.pop();
          }
        }
        if (!text) {
          text = "Something went wrong—BMO couldn't produce a response. Try again or check the logs.";
        }
        const last = this.messages[this.messages.length - 1];
        if (last && last.role === 'assistant' && last.text === text) return;
        this.messages.push({
          role: 'assistant',
          text,
          agent: data.agent_used || '',
          incomplete: data.incomplete === true
        });
        if (data.agent_used) this.agentUsed = data.agent_used;
        this.scrollChat();
        const codeDelay = (data.agent_used === 'code') ? 6000 : 2000;
        setTimeout(() => { this.status = 'idle'; }, codeDelay);
      });

      this.socket.on('agent_ack', (data) => {
        const text = (data.text || '').trim();
        if (text) {
          this.messages.push({ role: 'assistant', text, agent: data.agent || '', isAck: true });
          this.scrollChat();
        }
      });

      this.socket.on('agent_progress', (data) => {
        const label = data.label || data.tool || 'Working';
        const status = data.status === 'running' ? '...' : data.status === 'done' ? '✓' : data.status === 'failed' ? '✗' : data.status;
        const msg = status === '✓' ? `${label} ✓` : status === '✗' ? `${label} ✗` : `${label} ${status}`;
        const failed = data.status === 'failed';
        const last = this.messages[this.messages.length - 1];
        if (last && last.role === 'progress') {
          last.text = msg;
          last.failed = failed;
        } else {
          this.messages.push({ role: 'progress', text: msg, failed });
        }
        this.scrollChat();
      });

      this.socket.on('transcription', (data) => {
        const last = this.messages[this.messages.length - 1];
        if (last && last.role === 'user' && last.text === data.text) return;
        this.messages.push({ role: 'user', text: data.text, speaker: data.speaker });
        this.scrollChat();
        if (this.tab !== 'chat') this.tab = 'chat';
      });

      this.socket.on('timer_fired', (data) => {
        this.playAlertSound({ id: data.id, label: data.label || data.message, type: 'timer' });
      });

      this.socket.on('alarm_fired', (data) => {
        this.playAlertSound({ id: data.id, label: data.label || data.message, type: 'alarm', repeat: data.repeat || 'none' });
      });

      this.socket.on('calendar_reminder', (data) => {
        this.showNotification(`${data.summary} in ${data.minutes_until} min`);
      });

      this.socket.on('motion_detected', (data) => {
        this.showNotification(`Motion: ${data.description}`);
      });

      this.socket.on('bt_scan_result', (data) => {
        this.btDevices = data.devices || [];
        this.btScanning = false;
      });

      this.socket.on('vision_result', (data) => {
        this.visionResult = data.description || 'No description';
      });

      this.socket.on('tts_audio', (data) => {
        this._playTtsInBrowser(data.url, data.volume);
      });

      // ── Agent system events ────────────────────────────
      this.socket.on('agent_selected', (data) => {
        this.agentUsed = data.agent;
        this.agentDisplayName = data.display_name;
      });

      this.socket.on('agent_nesting', (data) => {
        console.log(`[bmo] Agent nesting: ${data.parent} → ${data.child} for "${data.task}"`);
      });

      // ── Plan mode events ───────────────────────────────
      this.socket.on('plan_mode_entered', (data) => {
        this.planMode = true;
        this.planStatus = 'exploring';
        this.planTask = data.task;
        this.planSteps = [];
        if (this.tab !== 'chat') this.tab = 'chat';
      });

      this.socket.on('plan_mode_review', (data) => {
        this.planStatus = 'review';
        this.planText = data.plan || '';
        this.planSteps = this._parsePlanSteps(data.plan || '');
      });

      this.socket.on('plan_mode_executing', (data) => {
        this.planStatus = 'executing';
      });

      this.socket.on('plan_step_start', (data) => {
        this.planCurrentStep = data.step;
        this.planTotalSteps = data.total;
        const step = this.planSteps.find(s => s.num === data.step);
        if (step) step.status = 'running';
      });

      this.socket.on('plan_step_done', (data) => {
        const step = this.planSteps.find(s => s.num === data.step);
        if (step) step.status = 'done';
      });

      this.socket.on('plan_step_failed', (data) => {
        const step = this.planSteps.find(s => s.num === data.step);
        if (step) step.status = 'failed';
      });

      this.socket.on('plan_mode_exited', (data) => {
        this.planMode = false;
        this.planStatus = 'idle';
      });

      this.socket.on('scratchpad_update', (data) => {
        this.scratchpad = data;
      });

      // Controls tab events
      this.socket.on('led_state', (data) => {
        this.ledState = data;
        if (data.color) {
          const r = data.color.r.toString(16).padStart(2, '0');
          const g = data.color.g.toString(16).padStart(2, '0');
          const b = data.color.b.toString(16).padStart(2, '0');
          this.ledColorHex = `#${r}${g}${b}`;
        }
      });
      this.socket.on('volume_update', (data) => {
        if (this.volumeLevels && data.category) {
          this.volumeLevels[data.category] = data.level;
        }
      });
      this.socket.on('conversation_mode', (data) => { this.conversationActive = data.active; });
      this.socket.on('scene_change', (data) => {
        this.activeScene = data.scene;
        this.scenes = this.scenes.map(s => ({ ...s, active: s.name === data.scene }));
      });
      this.socket.on('scenes_updated', (data) => {
        if (data.scenes) this.scenes = data.scenes;
      });
      this.socket.on('notification', (data) => {
        // BMO system toast (from scenes, errors, etc.) — has 'message' but no 'app'/'title'
        if (data.message && !data.app && !data.title) {
          this.showNotification(data.message, data.type || 'info');
          return;
        }
        // KDE phone notification
        this.kdeNotifications.unshift(data);
        if (this.kdeNotifications.length > 100) this.kdeNotifications.length = 100;
      });
      this.socket.on('notification_settings', (data) => { this.notifSettings = data; });
      this.socket.on('audio_routing_update', (data) => { this.audioRouting = data; });

      // Proactive alerts
      this.socket.on('proactive_alert', (data) => {
        this.showAlertToast(data);
      });
      this.socket.on('recent_alerts', (data) => {
        this.recentAlerts = data;
      });

      // Routine events
      this.socket.on('routine_triggered', (data) => {
        this.showNotification(`Running routine: ${data.name}`);
      });
      this.socket.on('routine_done', (data) => {
        this.showNotification(`Routine complete: ${data.name}`);
      });

      // IDE SocketIO events removed — new IDE on port 5001

      // Personality quips
      this.socket.on('bmo_quip', (data) => {
        if (data.text) {
          this.messages.push({ role: 'assistant', text: data.text });
          this.scrollChat();
        }
      });
    },

    // ── Plan mode helpers ─────────────────────────────────
    _parsePlanSteps(planText) {
      const steps = [];
      const re = /(\d+)\.\s*\[(.)\]\s*(.+?)(?:\(agent:\s*(\w+)\))?$/gm;
      let match;
      while ((match = re.exec(planText)) !== null) {
        const statusChar = match[2];
        let status = 'pending';
        if (statusChar === 'x') status = 'done';
        else if (statusChar === '~') status = 'running';
        else if (statusChar === '!') status = 'failed';
        steps.push({ num: parseInt(match[1]), desc: match[3].trim(), agent: match[4] || 'code', status });
      }
      return steps;
    },

    approvePlan() {
      this.socket.emit('chat_message', { message: 'yes', speaker: this.activePlayer || 'gavin' });
      this.planStatus = 'executing';
    },

    rejectPlan() {
      this.socket.emit('chat_message', { message: 'no', speaker: this.activePlayer || 'gavin' });
      this.planMode = false;
      this.planStatus = 'idle';
    },

    // ── Chat ──────────────────────────────────────────────────

    async loadChatHistory() {
      try {
        const res = await fetch('/api/chat/history');
        const history = await res.json();
        if (Array.isArray(history) && history.length > 0) {
          this.messages = history.map(m => ({ role: m.role, text: m.text, speaker: m.speaker }));
          this.scrollChat();
        }
      } catch (e) {
        console.warn('[bmo] Failed to load chat history:', e);
      }
    },

    sendChat() {
      const msg = this.chatInput.trim();
      if (!msg) return;

      // Handle slash commands
      if (msg.startsWith('/')) {
        this.chatInput = '';
        this.handleSlashCommand(msg);
        return;
      }

      // Prefix with active player name if in D&D mode
      const speaker = this.activePlayer || 'gavin';
      const displayMsg = this.activePlayer ? `[${this.activePlayer}] ${msg}` : msg;
      this.messages.push({ role: 'user', text: displayMsg, speaker: this.activePlayer || undefined });
      this.chatInput = '';
      this.status = 'thinking';
      this.scrollChat();
      const payload = { message: displayMsg, speaker };
      if (this.selectedAgent && this.selectedAgent !== 'auto') payload.agent = this.selectedAgent;
      if (this.selectedModel && this.selectedModel !== 'auto') payload.model = this.selectedModel;
      this.socket.emit('chat_message', payload);
    },

    async handleSlashCommand(cmd) {
      const lower = cmd.toLowerCase().trim();

      if (lower === '/clear') {
        this.messages = [];
        this.scrollChat();
        try {
          const res = await fetch('/api/chat/clear', { method: 'POST' });
          const data = await res.json();
          if (data.dnd_saved) {
            this.messages.push({ role: 'assistant', text: 'Campaign session saved! Chat cleared. Starting fresh.' });
          } else {
            this.messages.push({ role: 'assistant', text: 'Chat cleared. Starting fresh!' });
          }
        } catch {
          this.messages.push({ role: 'assistant', text: 'Chat cleared. Starting fresh!' });
        }
        this.scrollChat();
        return;
      }

      if (lower === '/campaign' || lower === '/campaigns') {
        this.messages.push({ role: 'user', text: '/campaign' });
        this.scrollChat();
        try {
          const res = await fetch('/api/dnd/sessions');
          const sessions = await res.json();
          if (!sessions || sessions.length === 0) {
            this.messages.push({ role: 'assistant', text: 'No saved campaign sessions found.' });
          } else {
            let text = 'Saved campaign sessions:\n\n';
            for (const s of sessions) {
              text += `${s.date} — ${s.messages} messages\n`;
              if (s.preview) text += `  "${s.preview}"\n`;
            }
            text += '\nSay /campaign <date> to load a session (e.g. /campaign 2026-02-22)';
            this.messages.push({ role: 'assistant', text });
          }
        } catch (e) {
          this.messages.push({ role: 'assistant', text: 'Failed to load campaign sessions.' });
        }
        this.scrollChat();
        return;
      }

      // /campaign <date> — load a specific session
      const loadMatch = lower.match(/^\/campaign\s+(\d{4}-\d{2}-\d{2})$/);
      if (loadMatch) {
        const date = loadMatch[1];
        this.messages.push({ role: 'user', text: cmd });
        this.scrollChat();
        try {
          const res = await fetch(`/api/dnd/sessions/${date}`);
          const data = await res.json();
          if (data.error) {
            this.messages.push({ role: 'assistant', text: data.error });
          } else {
            this.messages = data.map(m => ({ role: m.role, text: m.text, speaker: m.speaker }));
            this.messages.push({ role: 'assistant', text: `Loaded campaign session from ${date} (${data.length} messages). The adventure continues!` });
            // Also restore into server memory and get recap
            try {
              const restoreRes = await fetch('/api/dnd/sessions/' + date + '/restore', { method: 'POST' });
              const restoreData = await restoreRes.json();
              if (restoreData.recap) {
                this.messages.push({ role: 'assistant', text: `*Previously on your adventure...*\n\n${restoreData.recap}`, isRecap: true });
              }
              // Refresh player list after restore
              this.fetchPlayers();
            } catch {}
          }
        } catch {
          this.messages.push({ role: 'assistant', text: `No session found for ${date}.` });
        }
        this.scrollChat();
        return;
      }

      // /roll — dice roll result for D&D
      const rollMatch = lower.match(/^\/roll\s+(\d+)\s+(.+)$/);
      if (rollMatch) {
        const roll = parseInt(rollMatch[1]);
        const rest = rollMatch[2].trim();
        let diceMsg = '';

        // Parse: /roll <num> <skill> <character>  OR  /roll <num> <character>
        const parts = rest.split(/\s+/);
        if (parts.length >= 2) {
          // /roll 15 stealth Patrick  or  /roll 15 attack Draco
          const skillOrType = parts.slice(0, parts.length - 1).join(' ');
          const character = parts[parts.length - 1];
          const skillLower = skillOrType.toLowerCase();

          // Saving throws
          const savingThrows = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
          if (savingThrows.includes(skillLower)) {
            const capSkill = skillLower.charAt(0).toUpperCase() + skillLower.slice(1);
            diceMsg = `[DICE] ${character} rolled a ${roll} on a ${capSkill} saving throw.`;
          } else if (skillLower === 'attack') {
            diceMsg = `[DICE] ${character} rolled a ${roll} on their attack roll.`;
          } else if (skillLower === 'initiative') {
            diceMsg = `[DICE] ${character} rolled a ${roll} for initiative.`;
          } else if (skillLower === 'death' || skillLower === 'death save') {
            diceMsg = `[DICE] ${character} rolled a ${roll} on a death saving throw.`;
          } else {
            // Generic skill check
            const capSkill = skillLower.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            diceMsg = `[DICE] ${character} rolled a ${roll} on ${capSkill}.`;
          }
        } else if (parts.length === 1) {
          // /roll 15 Patrick — generic d20 roll
          const character = parts[0];
          diceMsg = `[DICE] ${character} rolled a ${roll} on a d20.`;
        }

        if (diceMsg) {
          this.messages.push({ role: 'user', text: cmd });
          this.scrollChat();
          this.status = 'thinking';
          this.socket.emit('chat_message', { message: diceMsg, speaker: 'gavin' });
          return;
        }
      }

      // /roll with no valid args — show help
      if (lower.startsWith('/roll')) {
        this.messages.push({ role: 'assistant', text: `Usage: /roll <number> <skill> <character>\n\nExamples:\n  /roll 15 stealth Patrick\n  /roll 8 perception Draco\n  /roll 12 attack Patrick\n  /roll 14 wisdom Draco\n  /roll 10 initiative Patrick\n  /roll 18 Patrick  (generic d20 roll)` });
        this.scrollChat();
        return;
      }

      // /player <name> — switch active player
      const playerMatch = lower.match(/^\/player\s+(.+)$/);
      if (playerMatch) {
        const name = playerMatch[1].trim();
        // Try to match case-insensitively against known players
        const match = this.players.find(p => p.toLowerCase() === name.toLowerCase());
        if (match) {
          this.activePlayer = match;
          this.messages.push({ role: 'assistant', text: `Now speaking as ${match}.` });
        } else if (this.players.length > 0) {
          this.messages.push({ role: 'assistant', text: `Unknown player "${name}". Available: ${this.players.join(', ')}` });
        } else {
          // No players loaded — just set it raw
          this.activePlayer = name.charAt(0).toUpperCase() + name.slice(1);
          this.messages.push({ role: 'assistant', text: `Now speaking as ${this.activePlayer}.` });
        }
        this.scrollChat();
        return;
      }

      if (lower === '/player' || lower === '/players') {
        if (this.players.length > 0) {
          const current = this.activePlayer || 'None';
          this.messages.push({ role: 'assistant', text: `Active player: ${current}\nAvailable: ${this.players.join(', ')}\n\nUse /player <name> to switch.` });
        } else {
          this.messages.push({ role: 'assistant', text: 'No D&D session active. Load characters first.' });
        }
        this.scrollChat();
        return;
      }

      // /init — Create a BMO.md in the current or specified directory
      if (lower === '/init' || lower.startsWith('/init ')) {
        const dir = cmd.slice(5).trim() || '.';
        this.messages.push({ role: 'user', text: cmd });
        this.scrollChat();
        try {
          const res = await fetch('/api/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directory: dir }) });
          const data = await res.json();
          if (data.success) {
            this.messages.push({ role: 'assistant', text: `BMO.md created at ${data.path}! BMO will now auto-load project context from this file.` });
          } else {
            this.messages.push({ role: 'assistant', text: data.error || 'Failed to create BMO.md' });
          }
        } catch (e) {
          this.messages.push({ role: 'assistant', text: 'Failed to create BMO.md: ' + e.message });
        }
        this.scrollChat();
        return;
      }

      // /agents — List all registered agents
      if (lower === '/agents') {
        this.messages.push({ role: 'user', text: cmd });
        this.scrollChat();
        try {
          const res = await fetch('/api/agents');
          const data = await res.json();
          let text = `BMO has ${data.agents.length} agents (mode: ${data.mode}):\n\n`;
          for (const a of data.agents) {
            text += `  ${a.display_name} (${a.name}) — temp ${a.temperature}${a.can_nest ? ' [can nest]' : ''}\n`;
          }
          this.messages.push({ role: 'assistant', text });
        } catch (e) {
          this.messages.push({ role: 'assistant', text: 'Failed to list agents.' });
        }
        this.scrollChat();
        return;
      }

      // /scratchpad — Show scratchpad contents
      if (lower === '/scratchpad' || lower === '/scratch') {
        this.messages.push({ role: 'user', text: cmd });
        this.scrollChat();
        try {
          const res = await fetch('/api/scratchpad');
          const data = await res.json();
          const sections = Object.keys(data);
          if (sections.length === 0) {
            this.messages.push({ role: 'assistant', text: 'Scratchpad is empty.' });
          } else {
            let text = 'Scratchpad sections:\n\n';
            for (const section of sections) {
              text += `## ${section}\n${data[section].substring(0, 200)}${data[section].length > 200 ? '...' : ''}\n\n`;
            }
            this.messages.push({ role: 'assistant', text });
          }
        } catch (e) {
          this.messages.push({ role: 'assistant', text: 'Failed to read scratchpad.' });
        }
        this.scrollChat();
        return;
      }

      // Unknown command
      this.messages.push({ role: 'assistant', text: `Unknown command: ${cmd}\n\nAvailable commands:\n  /clear — Clear chat and start fresh\n  /campaign — List saved D&D sessions\n  /campaign <date> — Load a saved session\n  /roll <number> <skill> <character> — Send a dice roll to BMO\n  /player <name> — Switch active player character\n  /player — Show current player and available characters\n  /agents — List all registered agents\n  /scratchpad — Show scratchpad contents\n  /init [dir] — Create BMO.md in a directory` });
      this.scrollChat();
    },

    scrollChat() {
      this.$nextTick(() => {
        const el = this.$refs.chatScroll;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },

    async fetchPlayers() {
      try {
        const res = await fetch('/api/dnd/players');
        const data = await res.json();
        if (data.players && data.players.length > 0) {
          this.players = data.players;
          if (!this.activePlayer) {
            this.activePlayer = this.players[0];
          }
        }
      } catch {}
    },

    // ── Music ─────────────────────────────────────────────────

    _searchTimer: null,

    musicSearchFocused: false,

    onMusicSearchFocus() {
      this.musicSearchFocused = true;
      if (!this.musicQuery.trim()) {
        this.fetchMusicHistory();
      }
    },

    searchMusicDebounced() {
      clearTimeout(this._searchTimer);
      if (!this.musicQuery.trim()) {
        this.musicResults = [];
        this.playlistResults = [];
        if (this.musicSearchFocused) this.fetchMusicHistory();
        return;
      }
      this._searchTimer = setTimeout(() => this.searchMusic(), 200);
    },

    setSearchMode(mode) {
      this.searchMode = mode;
      this.musicResults = [];
      this.playlistResults = [];
      if (this.musicQuery.trim()) this.searchMusic();
    },

    async searchMusic() {
      if (!this.musicQuery.trim()) return;
      if (this.searchMode === 'playlists') {
        const res = await fetch(`/api/music/search/playlists?q=${encodeURIComponent(this.musicQuery)}`);
        this.playlistResults = await res.json();
        this.musicResults = [];
      } else {
        const res = await fetch(`/api/music/search?q=${encodeURIComponent(this.musicQuery)}`);
        this.musicResults = await res.json();
        this.playlistResults = [];
      }
    },

    async fetchPlaylist(browseId) {
      if (!browseId) return;
      try {
        const res = await fetch(`/api/music/playlist/${browseId}`);
        this.albumView = await res.json();
        this.playlistResults = [];
        this.musicResults = [];
        this.musicSearchFocused = false;
      } catch {
        this.showNotification('Failed to load playlist');
      }
    },

    async playSong(song) {
      await fetch('/api/music/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song }),
      });
      this.musicResults = [];
      this.showHistory = false;
      this.showQueue = false;
      this.fetchMusicState();
      this.fetchMusicHistory();
    },

    async playSongInline(song) {
      fetch('/api/music/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song }),
      }).then(() => { this.fetchMusicState(); this.fetchMusicHistory(); this.fetchMostPlayed(); });
    },

    async musicCmd(cmd) {
      await fetch(`/api/music/${cmd}`, { method: 'POST' });
      this.fetchMusicState();
    },

    setMusicVolume(vol) {
      const v = parseInt(vol);
      this.musicState.volume = v;
      if (this.volumeLevels) this.volumeLevels.music = v;
      fetch('/api/music/volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: v }),
      });
    },

    async castMusic(device) {
      await fetch('/api/music/cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device }),
      });
    },

    seekMusic(event) {
      if (!this.musicState.duration) return;
      const rect = event.target.getBoundingClientRect();
      const pct = (event.clientX - rect.left) / rect.width;
      const pos = pct * this.musicState.duration;
      fetch('/api/music/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: pos }),
      });
    },

    async fetchMusicState() {
      try {
        const res = await fetch('/api/music/state');
        const state = await res.json();
        // Volume is managed locally — always preserve current slider value
        if (this.musicState.volume !== undefined) {
          state.volume = this.musicState.volume;
        }
        this.musicState = state;
        // Sync settings slider
        if (this.volumeLevels) this.volumeLevels.music = this.musicState.volume;
      } catch {}
    },

    async fetchMusicDevices() {
      try {
        const res = await fetch('/api/music/devices');
        this.musicDevices = await res.json();
      } catch {}
    },

    async fetchMusicHistory() {
      try {
        const res = await fetch('/api/music/history');
        this.musicHistory = await res.json();
      } catch {}
    },

    async fetchMostPlayed() {
      try {
        const res = await fetch('/api/music/most-played');
        this.musicMostPlayed = await res.json();
      } catch {}
    },

    async addToQueue(song) {
      await fetch('/api/music/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song }),
      });
      this.fetchMusicState();
      this.showNotification(`Added to queue: ${song.title}`);
    },

    async removeFromQueue(index) {
      await fetch('/api/music/queue/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      this.fetchMusicState();
    },

    async playQueueItem(index) {
      // Play a specific item in the queue by stopping and seeking to that index
      const queue = this.musicState.queue || [];
      if (index >= 0 && index < queue.length) {
        const song = queue[index];
        await fetch('/api/music/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ song }),
        });
        this.fetchMusicState();
      }
    },

    async fetchAlbum(browseId) {
      if (!browseId) return;
      try {
        const res = await fetch(`/api/music/album/${browseId}`);
        this.albumView = await res.json();
      } catch {
        this.showNotification('Failed to load album');
      }
    },

    async addAlbumToQueue() {
      if (!this.albumView?.tracks) return;
      const tracks = this.albumView.tracks.filter(t => t.videoId);
      if (!tracks.length) return;
      // If nothing is playing, start the first track then queue the rest
      if (!this.musicState.song) {
        await fetch('/api/music/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ song: tracks[0] }),
        });
        for (const track of tracks.slice(1)) {
          await fetch('/api/music/queue/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ song: track }),
          });
        }
      } else {
        for (const track of tracks) {
          await fetch('/api/music/queue/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ song: track }),
          });
        }
      }
      this.fetchMusicState();
      this.fetchMusicHistory();
      this.showNotification(`Added ${tracks.length} tracks to queue`);
    },

    async playSongFromAlbum(song) {
      await fetch('/api/music/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song }),
      });
      this.fetchMusicState();
      this.fetchMusicHistory();
    },

    get musicProgress() {
      if (!this.musicState.duration) return 0;
      return (this.musicState.position / this.musicState.duration) * 100;
    },

    // ── Calendar ──────────────────────────────────────────────

    getFilteredCalEvents() {
      if (this.calDays !== 1) return this.calEvents;
      // Day mode: only show today's events
      const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      return this.calEvents.filter(e => {
        const start = (e.start || '').slice(0, 10);
        const date = (e.date || '').slice(0, 10);
        return start === today || date === today;
      });
    },

    async fetchCalendar() {
      try {
        const res = await fetch(`/api/calendar/events?days=${this.calDays}`);
        const data = await res.json();
        if (!res.ok) {
          console.warn('[cal] API error:', res.status, data);
          this.calOffline = true;
          return;
        }
        this.calOffline = false;
        this.calEvents = data.events || data || [];
        if (this.calEvents.length > 0) this.nextEvent = this.calEvents[0];
        try { localStorage.setItem('bmo_cal_events', JSON.stringify(this.calEvents)); } catch {}
      } catch (e) {
        console.warn('[cal] fetch failed:', e);
        this.calOffline = true;
        if (this.calEvents.length === 0) {
          try {
            const cached = localStorage.getItem('bmo_cal_events');
            if (cached) this.calEvents = JSON.parse(cached);
          } catch {}
        }
      }
    },

    async startCalendarAuth() {
      try {
        const res = await fetch('/api/calendar/auth/url');
        const data = await res.json();
        if (data.url) {
          this.calAuthUrl = data.url;
          this.calAuthCode = '';
        } else {
          this.showNotification(data.error || 'Failed to get auth URL', 'error');
        }
      } catch (e) {
        this.showNotification('Failed to start calendar auth', 'error');
      }
    },

    async submitCalendarAuth() {
      if (!this.calAuthCode.trim()) return;
      try {
        const res = await fetch('/api/calendar/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: this.calAuthCode.trim() }),
        });
        const data = await res.json();
        if (data.ok) {
          this.calAuthUrl = '';
          this.calAuthCode = '';
          this.calOffline = false;
          this.showNotification('Calendar authorized!', 'success');
          await this.fetchCalendar();
        } else {
          this.showNotification(data.error || 'Auth failed', 'error');
        }
      } catch (e) {
        this.showNotification('Auth submission failed', 'error');
      }
    },

    toggleDay(eventObj, day) {
      const idx = eventObj.customDays.indexOf(day);
      if (idx >= 0) {
        eventObj.customDays.splice(idx, 1);
      } else {
        eventObj.customDays.push(day);
      }
    },

    buildRRule(eventObj) {
      const mode = eventObj.repeatMode;
      if (mode === 'none') return null;

      // Preset modes
      const presets = {
        daily: 'RRULE:FREQ=DAILY',
        weekly: 'RRULE:FREQ=WEEKLY',
        monthly: 'RRULE:FREQ=MONTHLY',
        yearly: 'RRULE:FREQ=YEARLY',
        weekdays: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      };
      if (presets[mode]) return presets[mode];

      // Custom mode
      if (mode === 'custom') {
        let rule = `RRULE:FREQ=${eventObj.customFreq};INTERVAL=${eventObj.customInterval}`;
        if (eventObj.customFreq === 'WEEKLY' && eventObj.customDays.length > 0) {
          rule += `;BYDAY=${eventObj.customDays.join(',')}`;
        }
        if (eventObj.customEnd === 'date' && eventObj.customEndDate) {
          const d = eventObj.customEndDate.replace(/-/g, '');
          rule += `;UNTIL=${d}T235959Z`;
        } else if (eventObj.customEnd === 'count' && eventObj.customCount > 0) {
          rule += `;COUNT=${eventObj.customCount}`;
        }
        return rule;
      }
      return null;
    },

    async createCalEvent() {
      const e = this.newEvent;
      if (!e.summary || !e.date) {
        this.showNotification('Fill in title and date');
        return;
      }
      if (!e.allDay && !e.startTime) {
        this.showNotification('Fill in start time or mark as all day');
        return;
      }

      const body = {
        summary: e.summary,
        description: e.description,
        location: e.location,
        allDay: e.allDay,
      };

      if (e.allDay) {
        body.start = e.date;
        // All-day events use date (not dateTime). End date is exclusive in Google Calendar.
        const endDate = new Date(e.date);
        endDate.setDate(endDate.getDate() + 1);
        body.end = endDate.toISOString().split('T')[0];
      } else {
        const start = new Date(`${e.date}T${e.startTime}:00`);
        const end = new Date(start.getTime() + parseFloat(e.durationHrs) * 3600000);
        body.start = start.toISOString();
        body.end = end.toISOString();
      }

      const rrule = this.buildRRule(e);
      if (rrule) body.recurrence = rrule;

      try {
        await fetch('/api/calendar/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        this.showEventForm = false;
        this.newEvent = {
          summary: '', date: '', startTime: '12:00', durationHrs: '1', location: '', description: '',
          allDay: false, repeatMode: 'none',
          customInterval: 1, customFreq: 'WEEKLY', customDays: [], customEnd: 'never', customEndDate: '', customCount: 10,
        };
        this.fetchCalendar();
        this.showNotification('Event created!');
      } catch {
        this.showNotification('Failed to create event');
      }
    },

    async deleteCalEvent(eventId) {
      if (!eventId) return;
      try {
        await fetch(`/api/calendar/delete/${eventId}`, { method: 'DELETE' });
        this.editingEvent = null;
        this.fetchCalendar();
        this.showNotification('Event deleted');
      } catch {
        this.showNotification('Failed to delete event');
      }
    },

    startEditEvent(event) {
      const isAllDay = !!event.all_day;
      let date = '', startTime = '', endTime = '';

      if (isAllDay) {
        // All-day events have date strings like "2026-02-22"
        date = event.start_iso || '';
      } else if (event.start_iso) {
        try {
          const d = new Date(event.start_iso);
          date = d.toISOString().split('T')[0];
          startTime = d.toTimeString().slice(0, 5);
        } catch {}
      }
      if (!isAllDay && event.end_iso) {
        try {
          const d = new Date(event.end_iso);
          endTime = d.toTimeString().slice(0, 5);
        } catch {}
      }

      // Parse recurrence if present
      let repeatMode = 'none';
      let customInterval = 1, customFreq = 'WEEKLY', customDays = [], customEnd = 'never', customEndDate = '', customCount = 10;
      if (event.recurrence && event.recurrence.length > 0) {
        const rule = event.recurrence[0] || '';
        if (rule === 'RRULE:FREQ=DAILY') repeatMode = 'daily';
        else if (rule === 'RRULE:FREQ=WEEKLY') repeatMode = 'weekly';
        else if (rule === 'RRULE:FREQ=MONTHLY') repeatMode = 'monthly';
        else if (rule === 'RRULE:FREQ=YEARLY') repeatMode = 'yearly';
        else if (rule.includes('BYDAY=MO,TU,WE,TH,FR') && !rule.includes('INTERVAL')) repeatMode = 'weekdays';
        else if (rule.startsWith('RRULE:')) {
          repeatMode = 'custom';
          const parts = rule.replace('RRULE:', '').split(';');
          for (const p of parts) {
            const [k, v] = p.split('=');
            if (k === 'FREQ') customFreq = v;
            else if (k === 'INTERVAL') customInterval = parseInt(v) || 1;
            else if (k === 'BYDAY') customDays = v.split(',');
            else if (k === 'UNTIL') { customEnd = 'date'; customEndDate = v.slice(0,4) + '-' + v.slice(4,6) + '-' + v.slice(6,8); }
            else if (k === 'COUNT') { customEnd = 'count'; customCount = parseInt(v) || 10; }
          }
        }
      }

      this.editEvent = {
        id: event.id,
        summary: event.summary || '',
        date, startTime, endTime,
        location: event.location || '',
        description: event.description || '',
        allDay: isAllDay, repeatMode,
        customInterval, customFreq, customDays, customEnd, customEndDate, customCount,
      };
      this.editingEvent = event.id;
      this.showEventForm = false;
    },

    async updateCalEvent() {
      const e = this.editEvent;
      if (!e.id || !e.summary || !e.date) {
        this.showNotification('Fill in title and date');
        return;
      }
      if (!e.allDay && !e.startTime) {
        this.showNotification('Fill in start time or mark as all day');
        return;
      }

      const body = {
        summary: e.summary,
        description: e.description,
        location: e.location,
        allDay: e.allDay,
      };

      if (e.allDay) {
        body.start = e.date;
        const endDate = new Date(e.date);
        endDate.setDate(endDate.getDate() + 1);
        body.end = endDate.toISOString().split('T')[0];
      } else {
        const start = new Date(`${e.date}T${e.startTime}:00`);
        const endTimeStr = e.endTime || e.startTime;
        let end = new Date(`${e.date}T${endTimeStr}:00`);
        if (end <= start) end = new Date(start.getTime() + 3600000);
        body.start = start.toISOString();
        body.end = end.toISOString();
      }

      const rrule = this.buildRRule(e);
      if (rrule) body.recurrence = [rrule];
      else body.recurrence = [];  // Clear recurrence if set to "none"

      try {
        await fetch(`/api/calendar/update/${e.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        this.editingEvent = null;
        this.fetchCalendar();
        this.showNotification('Event updated!');
      } catch {
        this.showNotification('Failed to update event');
      }
    },

    // ── Camera ────────────────────────────────────────────────

    async cameraSnapshot() {
      await fetch('/api/camera/snapshot', { method: 'POST' });
      this.showNotification('Snapshot saved!');
    },

    async cameraDescribe() {
      this.visionResult = 'Looking...';
      try {
        await fetch('/api/camera/describe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'What do you see? Describe briefly.' }),
        });
        // Result arrives via vision_result socket event
      } catch {
        this.visionResult = 'Could not describe scene';
      }
    },

    async toggleMotion() {
      this.motionEnabled = !this.motionEnabled;
      await fetch('/api/camera/motion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: this.motionEnabled }),
      });
    },

    // ── Timers ────────────────────────────────────────────────

    async fetchTimers() {
      try {
        const res = await fetch('/api/timers');
        const items = await res.json();
        // Check if any timer just hit 0
        for (const item of items) {
          if (item.remaining <= 0) {
            const old = this.timerItems.find(t => t.id === item.id);
            if (old && old.remaining > 0) {
              this.playAlertSound({ id: item.id, label: item.label, type: item.type });
            }
          }
        }
        this.timerItems = items;
      } catch {}
    },

    async createTimer() {
      const totalSec = (this.newTimerMin || 0) * 60 + (this.newTimerSec || 0);
      if (totalSec <= 0) return;
      const label = this.newTimerLabel || (this.newTimerMin ? `${this.newTimerMin}m${this.newTimerSec ? ' ' + this.newTimerSec + 's' : ''} timer` : `${this.newTimerSec}s timer`);
      await fetch('/api/timers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: totalSec, label }),
      });
      this.newTimerLabel = '';
      this.fetchTimers();
    },

    async createTimerRaw() {
      const sec = this.newTimerSec || 0;
      if (sec <= 0) return;
      const label = sec >= 60 ? `${Math.floor(sec/60)}m timer` : `${sec}s timer`;
      await fetch('/api/timers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: sec, label }),
      });
      this.fetchTimers();
    },

    async createAlarmFromTime() {
      let h24 = this.alarmHour % 12;
      if (this.alarmAmPm === 'PM') h24 += 12;
      if (this.alarmAmPm === 'AM' && this.alarmHour === 12) h24 = 0;
      const label = this.alarmLabel || `Alarm (${this.alarmHour}:${String(this.alarmMin).padStart(2,'0')} ${this.alarmAmPm})`;
      await fetch('/api/alarms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour: h24, minute: this.alarmMin, label, tag: this.alarmTag }),
      });
      this.alarmHour = 0;
      this.alarmMin = 0;
      this.alarmAmPm = 'AM';
      this.alarmLabel = '';
      this.alarmTag = 'reminder';
      this.fetchTimers();
    },

    async createScheduledAlarm() {
      if (!this.schedHour && this.schedHour !== 0) return;
      let h24 = this.schedHour % 12;
      if (this.schedAmPm === 'PM') h24 += 12;
      if (this.schedAmPm === 'AM' && this.schedHour === 12) h24 = 0;
      const label = this.schedLabel || `Alarm (${this.schedHour}:${String(this.schedMin || 0).padStart(2,'0')} ${this.schedAmPm})`;
      const body = { hour: h24, minute: this.schedMin || 0, label };
      if (this.schedDate) body.date = this.schedDate;
      if (this.schedRepeat !== 'none') body.repeat = this.schedRepeat;
      if (this.schedRepeat === 'custom' && this.schedRepeatDays.length > 0) body.repeat_days = this.schedRepeatDays;
      if (this.schedTag !== 'reminder') body.tag = this.schedTag;
      await fetch('/api/alarms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      this.schedHour = null;
      this.schedMin = null;
      this.schedAmPm = 'AM';
      this.schedLabel = '';
      this.schedDate = '';
      this.schedRepeat = 'none';
      this.schedRepeatDays = [];
      this.schedTag = 'reminder';
      this.fetchTimers();
    },

    toggleAlarmDay(day) {
      const idx = this.schedRepeatDays.indexOf(day);
      if (idx >= 0) {
        this.schedRepeatDays.splice(idx, 1);
      } else {
        this.schedRepeatDays.push(day);
      }
    },

    // ── Alarm Calendar ───────────────────────────────────────

    initAlarmCal() {
      const now = new Date();
      if (this.schedDate) {
        const d = new Date(this.schedDate + 'T00:00:00');
        this.alarmCalMonth = d.getMonth();
        this.alarmCalYear = d.getFullYear();
      } else {
        this.alarmCalMonth = now.getMonth();
        this.alarmCalYear = now.getFullYear();
      }
    },

    alarmCalTitle() {
      return new Date(this.alarmCalYear, this.alarmCalMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    },

    alarmCalPrev() {
      this.alarmCalMonth--;
      if (this.alarmCalMonth < 0) { this.alarmCalMonth = 11; this.alarmCalYear--; }
    },

    alarmCalNext() {
      this.alarmCalMonth++;
      if (this.alarmCalMonth > 11) { this.alarmCalMonth = 0; this.alarmCalYear++; }
    },

    alarmCalCells() {
      const first = new Date(this.alarmCalYear, this.alarmCalMonth, 1);
      const daysInMonth = new Date(this.alarmCalYear, this.alarmCalMonth + 1, 0).getDate();
      const startDow = first.getDay(); // 0=Sun
      const today = new Date();
      const todayStr = this.todayISO();
      const cells = [];

      for (let i = 0; i < startDow; i++) {
        cells.push({ key: 'e' + i, day: 0, iso: '', today: false, past: false });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${this.alarmCalYear}-${String(this.alarmCalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({
          key: iso,
          day: d,
          iso,
          today: iso === todayStr,
          past: new Date(iso + 'T23:59:59') < new Date(todayStr + 'T00:00:00'),
        });
      }
      return cells;
    },

    pickAlarmDate(iso) {
      this.schedDate = iso;
    },

    todayISO() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    tomorrowISO() {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    alarmTagIcon(item) {
      if (!item.tag || item.tag === 'reminder') return '\u23F0';
      if (item.tag === 'wake-up') return '\u2600\uFE0F';
      if (item.tag === 'timer') return '\u23F1';
      return '\u23F0';
    },
    alarmRepeatLabel(item) {
      if (!item.repeat || item.repeat === 'none') return '';
      if (item.repeat === 'daily') return 'Daily';
      if (item.repeat === 'weekdays') return 'M-F';
      if (item.repeat === 'weekends') return 'Sa Su';
      if (item.repeat === 'custom' && item.repeat_days && item.repeat_days.length > 0) {
        const map = { SU: 'Su', MO: 'M', TU: 'T', WE: 'W', TH: 'Th', FR: 'F', SA: 'Sa' };
        const order = ['SU','MO','TU','WE','TH','FR','SA'];
        return item.repeat_days
          .slice()
          .sort((a, b) => order.indexOf(a) - order.indexOf(b))
          .map(d => map[d] || d)
          .join(' ');
      }
      return item.repeat;
    },

    alarmScheduleSummary() {
      return 'Schedule';
    },

    alarmScheduleDescription() {
      const h = this.schedHour; const m = this.schedMin;
      const time = (h !== null && h !== undefined) ? `${h}:${String(m || 0).padStart(2, '0')} ${this.schedAmPm}` : '--:--';
      if (this.schedRepeat === 'daily') return `Every day at ${time}`;
      if (this.schedRepeat === 'weekdays') return `Weekdays (Mon\u2013Fri) at ${time}`;
      if (this.schedRepeat === 'weekends') return `Weekends (Sat\u2013Sun) at ${time}`;
      if (this.schedRepeat === 'custom' && this.schedRepeatDays.length > 0) {
        const names = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };
        const order = ['SU','MO','TU','WE','TH','FR','SA'];
        const days = this.schedRepeatDays.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(d => names[d]).join(', ');
        return `Every ${days} at ${time}`;
      }
      if (this.schedDate) {
        const d = new Date(this.schedDate + 'T00:00:00');
        return `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${time}`;
      }
      return `Set time and date above`;
    },

    async pauseTimer(id) {
      await fetch(`/api/timers/${id}/pause`, { method: 'POST' });
      this.fetchTimers();
    },

    async snoozeAlarm(id) {
      await fetch(`/api/alarms/${id}/snooze`, { method: 'POST' });
      this.stopAlertLoop();
      this.fetchTimers();
    },

    async cancelTimer(item) {
      const endpoint = item.type === 'timer' ? 'timers' : 'alarms';
      await fetch(`/api/${endpoint}/${item.id}/cancel`, { method: 'POST' });
      this.stopAlertLoop();
      this.fetchTimers();
    },

    // ── Weather ───────────────────────────────────────────────

    async fetchWeather() {
      try {
        const res = await fetch('/api/weather');
        this.weather = await res.json();
      } catch {}
    },

    weatherIcon(code) {
      const icons = { clear: '\u2600', cloudy: '\u2601', rain: '\u{1F327}', snow: '\u2744', storm: '\u26A1', fog: '\u{1F32B}' };
      return icons[code] || '\u2600';
    },

    // ── Notifications ─────────────────────────────────────────

    showNotification(msg) {
      this.notification = msg;
      this.notificationHistory.unshift({ text: msg, time: new Date().toLocaleTimeString() });
      if (this.notificationHistory.length > 20) this.notificationHistory.pop();
      this.unreadNotifications++;
      setTimeout(() => { this.notification = null; }, 5000);
    },

    _alertInterval: null,

    startAlertLoop() {
      if (this._alertInterval) return;
      this.playAlertBeep();
      this._alertInterval = setInterval(() => this.playAlertBeep(), 2000);
    },

    stopAlertLoop() {
      if (this._alertInterval) {
        clearInterval(this._alertInterval);
        this._alertInterval = null;
      }
    },

    playAlertBeep() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [660, 880, 660, 880, 660];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.18);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.2);
          osc.stop(ctx.currentTime + i * 0.2 + 0.18);
        });
        setTimeout(() => ctx.close(), 2000);
      } catch {}
    },

    playAlertSound(item) {
      this.alertFired = item || { id: null, label: 'Timer', type: 'timer' };
      this.startAlertLoop();
    },

    dismissAlert() {
      if (this.alertFired) {
        // Only cancel non-repeating alarms — repeating ones already advanced to next occurrence
        if (!this.alertFired.repeat || this.alertFired.repeat === 'none') {
          this.cancelTimer(this.alertFired);
        }
      }
      this.alertFired = null;
      this.stopAlertLoop();
      this.fetchTimers();
    },

    async snoozeAlert(seconds) {
      const secs = seconds || 300;
      const label = this.alertFired?.label || 'Snoozed';
      // Cancel the fired one
      if (this.alertFired) {
        const endpoint = this.alertFired.type === 'timer' ? 'timers' : 'alarms';
        await fetch(`/api/${endpoint}/${this.alertFired.id}/cancel`, { method: 'POST' });
      }
      // Create a new timer for the snooze duration
      await fetch('/api/timers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: secs, label: `${label} (snoozed)` }),
      });
      this.alertFired = null;
      this.stopAlertLoop();
      this.fetchTimers();
    },

    // ── Weather Suggestion ──────────────────────────────────────

    get weatherSuggestion() {
      const t = this.weather.temperature;
      const icon = this.weather.icon;
      if (icon === 'snow') return 'Watch for ice!';
      if (icon === 'rain' || icon === 'storm') return 'Grab an umbrella';
      if (t !== null && t < 32) return 'Bundle up! Below freezing';
      if (t !== null && t < 50) return 'Bring a jacket';
      if (t !== null && t > 95) return 'Stay hydrated!';
      if (t !== null && t > 85) return "It's hot out there";
      return '';
    },

    get activeTimerCount() {
      return this.timerItems.filter(t => !t.fired).length;
    },

    // ── Notes ────────────────────────────────────────────────

    async fetchNotes() {
      try {
        const res = await fetch('/api/notes');
        this.notes = await res.json();
      } catch {}
    },

    async addNote() {
      const text = this.newNoteText.trim();
      if (!text) return;
      try {
        await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        this.newNoteText = '';
        this.fetchNotes();
      } catch {}
    },

    async toggleNote(note) {
      try {
        await fetch(`/api/notes/${note.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ done: !note.done }),
        });
        this.fetchNotes();
      } catch {}
    },

    async deleteNote(noteId) {
      try {
        await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
        this.fetchNotes();
      } catch {}
    },

    // ── Lyrics ───────────────────────────────────────────────

    async fetchLyrics() {
      const vid = this.musicState.song?.videoId;
      if (!vid) return;
      if (this._lyricsCache[vid]) {
        this.currentLyrics = this._lyricsCache[vid];
        this.showLyrics = true;
        return;
      }
      this.lyricsLoading = true;
      this.showLyrics = true;
      try {
        const res = await fetch(`/api/music/lyrics/${vid}`);
        const data = await res.json();
        this.currentLyrics = data.lyrics || 'No lyrics available';
        this.lyricsSource = data.source || '';
        this._lyricsCache[vid] = this.currentLyrics;
      } catch {
        this.currentLyrics = 'Failed to load lyrics';
      }
      this.lyricsLoading = false;
    },

    // ── TV Remote ────────────────────────────────────────────

    tvNeedsPairing: false,

    _tvAppNames: {
      'com.google.android.youtube.tv': 'YouTube',
      'com.netflix.ninja': 'Netflix',
      'com.amazon.amazonvideo.livingroom': 'Prime Video',
      'https://app.primevideo.com': 'Prime Video',
      'crunchyroll://': 'Crunchyroll',
      'com.crunchyroll.crunchyroid': 'Crunchyroll',
      'tv.twitch.android.app': 'Twitch',
      'com.plexapp.android': 'Plex',
      'com.google.android.tvlauncher': 'Home',
      'com.spocky.projengmenu': 'Home',
      'com.android.vending': 'Play Store',
      'com.disney.disneyplus': 'Disney+',
      'com.hulu.plus': 'Hulu',
      'com.spotify.tv.android': 'Spotify',
    },

    tvAppDisplayName(pkg) {
      if (!pkg) return '';
      if (this._tvAppNames[pkg]) return this._tvAppNames[pkg];
      // Fallback: extract last part of package name and capitalize
      const parts = pkg.split('.');
      const last = parts[parts.length - 1];
      return last.charAt(0).toUpperCase() + last.slice(1);
    },

    async fetchTvStatus() {
      try {
        const res = await fetch('/api/tv/status');
        const data = await res.json();
        this.tvConnected = data.connected;
        this.tvNeedsPairing = data.needs_pairing || false;
        this.tvCurrentApp = data.current_app || '';
        this.tvVolumeLevel = data.volume_level !== undefined ? data.volume_level : -1;
        this.tvMediaTitle = data.media_title || '';
        this.tvMediaArtist = data.media_artist || '';
      } catch {}
    },

    async tvStartPairing() {
      this.tvPairing = true;
      this.tvPairPin = '';
      try {
        const res = await fetch('/api/tv/pair/start', { method: 'POST' });
        const data = await res.json();
        if (data.error) {
          this.showNotification('Pairing failed: ' + data.error);
          this.tvPairing = false;
        } else {
          this.showNotification('Check your TV for a PIN code!');
        }
      } catch {
        this.showNotification('Failed to start pairing');
        this.tvPairing = false;
      }
    },

    async tvFinishPairing() {
      if (!this.tvPairPin) return;
      try {
        const res = await fetch('/api/tv/pair/finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: this.tvPairPin }),
        });
        const data = await res.json();
        if (data.error) {
          this.showNotification('Pairing failed: ' + data.error);
        } else {
          this.showNotification('TV paired and connected!');
          this.tvConnected = true;
          this.tvNeedsPairing = false;
        }
      } catch {
        this.showNotification('Failed to finish pairing');
      }
      this.tvPairing = false;
      this.tvPairPin = '';
    },

    async tvKey(key) {
      try {
        await fetch('/api/tv/key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
      } catch {}
    },

    async tvLaunch(app) {
      try {
        await fetch('/api/tv/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app }),
        });
      } catch {}
    },

    async tvVolume(direction) {
      try {
        await fetch('/api/tv/volume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction }),
        });
      } catch {}
    },

    async tvPower() {
      try {
        await fetch('/api/tv/power', { method: 'POST' });
      } catch {}
    },

    async tvInput() {
      try {
        await fetch('/api/tv/input', { method: 'POST' });
      } catch {}
    },

    async tvToggleAutoSkip() {
      try {
        const res = await fetch('/api/tv/auto-skip', { method: 'POST' });
        const data = await res.json();
        this.tvAutoSkip = data.enabled;
        this.showNotification(data.enabled ? 'Auto-skip enabled' : 'Auto-skip disabled');
      } catch {}
    },

    // ── Camera Snap (download) ───────────────────────────────

    cameraSnap() {
      window.open('/api/camera/snapshot?download=1', '_blank');
    },

    // ── Formatters ────────────────────────────────────────────

    formatTime(sec) {
      if (!sec || sec < 0) return '0:00';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    },

    formatCountdown(sec) {
      if (sec <= 0) return '0:00';
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      return `${m}:${s.toString().padStart(2, '0')}`;
    },

    // ── Status Indicators ─────────────────────────────────────

    get statusColor() {
      return {
        idle: 'bg-green-500',
        listening: 'bg-blue-500',
        thinking: 'bg-amber-500',
        yapping: 'bg-orange-500',
        speaking: 'bg-purple-500',
        code_done: 'bg-green-500',
        code_incomplete: 'bg-amber-500',
      }[this.status] || 'bg-gray-500';
    },

    get statusText() {
      return {
        idle: 'What can BMO do for you?',
        listening: 'BMO is listening...',
        thinking: 'BMO is thinking!',
        yapping: 'BMO is yapping!',
        speaking: 'BMO is talking!',
        code_done: 'Code Agent finished ✓',
        code_incomplete: 'Response may be incomplete',
      }[this.status] || 'BMO';
    },

    get statusTextColor() {
      return {
        idle: 'text-green-400',
        listening: 'text-blue-400',
        thinking: 'text-amber-400',
        yapping: 'text-orange-400',
        speaking: 'text-purple-400',
        code_done: 'text-green-400',
        code_incomplete: 'text-amber-400',
      }[this.status] || 'text-text-muted';
    },

    // ── Controls Tab ──────────────────────────────────────────

    async fetchControlsData() {
      try {
        const [ledRes, volRes, statusRes, notifRes, notifSettRes, scenesRes, audioRes, ttsOutRes] = await Promise.all([
          fetch('/api/led/status'),
          fetch('/api/volume'),
          fetch('/api/status/summary'),
          fetch('/api/notifications'),
          fetch('/api/notifications/settings'),
          fetch('/api/scenes'),
          fetch('/api/audio/devices'),
          fetch('/api/tts/output'),
        ]);
        if (ledRes.ok) {
          const d = await ledRes.json();
          this.ledState = d;
          if (d.color) {
            const r = d.color.r.toString(16).padStart(2, '0');
            const g = d.color.g.toString(16).padStart(2, '0');
            const b = d.color.b.toString(16).padStart(2, '0');
            this.ledColorHex = `#${r}${g}${b}`;
          }
        }
        if (volRes.ok) {
          const vols = await volRes.json();
          // Sync musicState volume from saved settings (API is source of truth)
          if (vols.music !== undefined) this.musicState.volume = vols.music;
          this.volumeLevels = vols;
        }
        if (statusRes.ok) this.systemStatus = await statusRes.json();
        if (notifRes.ok) {
          const nd = await notifRes.json();
          this.kdeNotifications = nd.notifications || [];
        }
        if (notifSettRes.ok) this.notifSettings = await notifSettRes.json();
        if (scenesRes.ok) {
          const sd = await scenesRes.json();
          this.scenes = sd.scenes || [];
          this.activeScene = sd.active;
        }
        if (audioRes.ok) {
          const ad = await audioRes.json();
          this.audioDevices = ad.sinks || ad.devices || [];
        }
        if (ttsOutRes.ok) {
          const td = await ttsOutRes.json();
          this.ttsOutput = td.output || 'pi';
        }
        // Laptop devices loaded on demand via button click
        this.fetchMicInputs();
        this.fetchAudioRouting();
        this.fetchSmartDevices();
        this.fetchVoiceSettings();
      } catch {}
    },

    async fetchScenes() {
      try {
        const r = await fetch('/api/scenes');
        if (r.ok) {
          const d = await r.json();
          this.scenes = d.scenes || [];
          this.activeScene = d.active;
        }
      } catch {}
    },

    async activateScene(name) {
      try {
        const r = await fetch('/api/scene/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene: name }),
        });
        if (r.ok) {
          this.activeScene = name;
          this.scenes = this.scenes.map(s => ({ ...s, active: s.name === name }));
        }
      } catch {}
    },

    async deactivateScene() {
      try {
        const r = await fetch('/api/scene/deactivate', { method: 'POST' });
        if (r.ok) {
          this.activeScene = null;
          this.scenes = this.scenes.map(s => ({ ...s, active: false }));
        }
      } catch {}
    },

    openSceneEditor(scene) {
      if (scene) {
        // Editing an existing custom scene
        this.sceneEditing = scene.name;
        this.sceneForm = {
          label: scene.label || '',
          rgb_off: !!scene.rgb_off,
          rgb_mode: scene.rgb_mode || '',
          rgb_color: scene.rgb_color || [0, 0, 0],
          rgb_brightness: scene.rgb_brightness ?? 100,
          tv_on: !!scene.tv_on,
          tv_off: !!scene.tv_off,
          tv_app: scene.tv_app || '',
          music_stop: !!scene.music_stop,
          music_playlist: scene.music_playlist || '',
        };
      } else {
        // Creating a new scene
        this.sceneEditing = 'new';
        this.sceneForm = {
          label: '', rgb_off: false, rgb_mode: '', rgb_color: [0, 0, 0],
          rgb_brightness: 100, tv_on: false, tv_off: false, tv_app: '',
          music_stop: false, music_playlist: '',
        };
      }
    },

    async saveScene() {
      if (!this.sceneForm.label.trim()) {
        this.showNotification('Scene name is required');
        return;
      }
      const config = { ...this.sceneForm };
      try {
        if (this.sceneEditing === 'new') {
          const name = config.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
          await fetch('/api/scene/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, config }),
          });
          this.showNotification('Scene created!');
        } else {
          await fetch(`/api/scene/${encodeURIComponent(this.sceneEditing)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config }),
          });
          this.showNotification('Scene updated!');
        }
        this.sceneEditing = null;
        this.fetchScenes();
      } catch {
        this.showNotification('Failed to save scene');
      }
    },

    async deleteScene(name) {
      try {
        await fetch(`/api/scene/${encodeURIComponent(name)}`, { method: 'DELETE' });
        this.sceneEditing = null;
        this.showNotification('Scene deleted');
        this.fetchScenes();
      } catch {
        this.showNotification('Failed to delete scene');
      }
    },

    // ── Smart Home Devices ──────────────────────────────────

    async fetchSmartDevices() {
      try {
        const res = await fetch('/api/devices');
        const data = await res.json();
        this.smartDevices = Array.isArray(data) ? data : (data.devices || []);
      } catch {}
    },

    async smartDeviceAction(name, action, body) {
      try {
        await fetch(`/api/devices/${encodeURIComponent(name)}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
        });
        this.fetchSmartDevices();
      } catch {}
    },

    async smartDeviceVolume(name, level) {
      try {
        await fetch(`/api/devices/${encodeURIComponent(name)}/volume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level: parseInt(level) / 100 }),
        });
      } catch {}
    },

    async fetchAudioDevices() {
      try {
        const r = await fetch('/api/audio/devices');
        if (r.ok) {
          const d = await r.json();
          this.audioDevices = d.sinks || d.devices || [];
        }
      } catch {}
    },

    async setAudioOutput(deviceId) {
      try {
        await fetch('/api/audio/output', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ function: 'all', device_id: deviceId }),
        });
        this.musicState.output_device = 'pi'; // back to Pi output
        this.fetchAudioDevices();
      } catch {}
    },

    async btScan() {
      this.btScanning = true;
      this.btDevices = [];
      try {
        await fetch('/api/audio/bluetooth/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration: 8 }),
        });
        // Results arrive via bt_scan_result socket event
      } catch { this.btScanning = false; }
    },

    async btPair(address) {
      try {
        const r = await fetch('/api/audio/bluetooth/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        });
        const data = await r.json();
        if (data.ok) {
          this.showNotification('Bluetooth paired!');
          this.fetchAudioDevices();
        } else {
          this.showNotification(data.message || 'Pair failed', 'error');
        }
      } catch {
        this.showNotification('Pair request failed', 'error');
      }
    },

    async btDisconnect(address) {
      try {
        await fetch('/api/audio/bluetooth/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        });
        this.fetchAudioDevices();
      } catch {}
    },

    // ── TTS Output ──────────────────────────────────────────
    async enumerateLaptopDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        this.browserMicGranted = true;
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.laptopAudioDevices = devices
          .filter(d => d.kind === 'audiooutput' && d.deviceId !== '')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0,8)}` }));
        this.laptopMicDevices = devices
          .filter(d => d.kind === 'audioinput' && d.deviceId !== '')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0,8)}` }));
        // Persist to localStorage
        try {
          localStorage.setItem('bmo_laptop_audio', JSON.stringify(this.laptopAudioDevices));
          localStorage.setItem('bmo_laptop_mic', JSON.stringify(this.laptopMicDevices));
          localStorage.setItem('bmo_mic_granted', '1');
        } catch {}
      } catch (e) {
        console.warn('Cannot enumerate devices:', e);
        this.showNotification('Allow microphone access when prompted to load laptop devices', 'warning');
      }
    },

    async requestBrowserMicPermission() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        this.browserMicGranted = true;
        this.showNotification('Microphone access granted!', 'success');
        this.enumerateLaptopDevices();
      } catch (e) {
        console.warn('Mic permission denied:', e);
        this.showNotification('Microphone access denied. Check browser permissions or enable Chrome secure origin flag.', 'warning');
      }
    },

    setMusicLaptopOutput(deviceId) {
      this.showNotification('Laptop music output requires Chrome secure origin flag', 'warning');
    },

    async setTtsOutput(mode, piSinkId, laptopDeviceId) {
      this.ttsOutput = mode;
      this.ttsLaptopDevice = laptopDeviceId || null;
      if (mode === 'pi' && piSinkId) {
        // Set the Pi sink as default
        await fetch('/api/audio/output', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ function: 'all', device_id: piSinkId }),
        });
        this.fetchAudioDevices();
      }
      await fetch('/api/tts/output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output: mode }),
      });
    },

    _playTtsInBrowser(url, volume) {
      if (!this._ttsAudio) {
        this._ttsAudio = new Audio();
      }
      const audio = this._ttsAudio;
      audio.src = url;
      if (volume != null) audio.volume = Math.min(1, volume / 100);
      // Route to selected laptop device if supported
      if (this.ttsLaptopDevice && audio.setSinkId) {
        audio.setSinkId(this.ttsLaptopDevice).then(() => audio.play()).catch(() => audio.play());
      } else {
        audio.play();
      }
    },

    // ── Mic Input ───────────────────────────────────────────
    async fetchMicInputs() {
      try {
        const res = await fetch('/api/audio/inputs');
        if (res.ok) {
          const data = await res.json();
          this.micInputs = data.sources || [];
        }
      } catch {}
    },

    async setMicInput(deviceId) {
      try {
        const res = await fetch('/api/audio/input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id: deviceId }),
        });
        if (res.ok) {
          this.showNotification('Mic input changed', 'success');
          await this.fetchMicInputs();
        }
      } catch {}
    },

    async setLedColor() {
      const hex = this.ledColorHex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      try {
        await fetch('/api/led/color', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ r, g, b }),
        });
      } catch {}
    },

    async setLedMode(mode) {
      const target = this.ledState.mode === mode ? 'off' : mode;
      try {
        const r = await fetch('/api/led/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: target }),
        });
        if (r.ok) this.ledState.mode = target;
      } catch {}
    },

    async setLedBrightness(val) {
      try {
        const r = await fetch('/api/led/brightness', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brightness: parseInt(val) }),
        });
        if (r.ok) this.ledState.brightness = parseInt(val);
      } catch {}
    },

    _volumeTimers: {},
    async setVolume(category, level) {
      const val = parseInt(level);
      if (this.volumeLevels) this.volumeLevels[category] = val;
      if (category === 'music') this.musicState.volume = val;
      // Debounce: wait 150ms after last change before sending to server
      clearTimeout(this._volumeTimers[category]);
      this._volumeTimers[category] = setTimeout(async () => {
        try {
          await fetch('/api/volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, level: val }),
          });
        } catch {}
      }, 150);
    },

    async clearKdeNotifications() {
      try {
        await fetch('/api/notifications/clear', { method: 'POST' });
        this.kdeNotifications = [];
      } catch {}
    },

    async replyToNotification(notif) {
      const msg = prompt('Reply:');
      if (!msg) return;
      try {
        await fetch('/api/notifications/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notif.id, message: msg, device_id: notif.device_id }),
        });
        this.showNotification('Reply sent!');
      } catch {}
    },

    async refreshNotifDevices() {
      try {
        const res = await fetch('/api/notifications/devices/refresh', { method: 'POST' });
        if (res.ok) {
          this.notifSettings = await res.json();
          this.showNotification('Devices refreshed');
        }
      } catch {}
    },

    async toggleNotifications() {
      try {
        const res = await fetch('/api/notifications/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !this.notifSettings.enabled }),
        });
        if (res.ok) {
          this.notifSettings = await res.json();
        }
      } catch {}
    },

    async addToBlocklist() {
      const app = this.blocklistInput.trim();
      if (!app) return;
      const blocklist = [...(this.notifSettings.blocklist || []), app];
      try {
        const res = await fetch('/api/notifications/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocklist }),
        });
        if (res.ok) {
          this.notifSettings = await res.json();
          this.blocklistInput = '';
        }
      } catch {}
    },

    async removeFromBlocklist(app) {
      const blocklist = (this.notifSettings.blocklist || []).filter(a => a !== app);
      try {
        const res = await fetch('/api/notifications/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocklist }),
        });
        if (res.ok) {
          this.notifSettings = await res.json();
        }
      } catch {}
    },

    // ── Audio Routing ──────────────────────────────────────────

    async fetchAudioRouting() {
      try {
        const res = await fetch('/api/audio/status');
        if (res.ok) {
          const data = await res.json();
          this.audioRouting = data.routing || {};
          // Also update audioDevices from the status response
          if (data.sinks || data.devices) {
            this.audioDevices = data.sinks || data.devices || [];
          }
        }
      } catch {}
    },

    async setFunctionOutput(func, deviceId) {
      try {
        await fetch('/api/audio/output', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ function: func, device_id: parseInt(deviceId) }),
        });
        this.fetchAudioRouting();
      } catch {}
    },

    async refreshStatus() {
      try {
        const res = await fetch('/api/status/summary');
        if (res.ok) this.systemStatus = await res.json();
      } catch {}
    },

    async fetchDetailedStatus() {
      try {
        const res = await fetch('/api/health/full');
        if (res.ok) this.detailedStatus = await res.json();
      } catch {}
    },

    formatUptime(startedAt, serverTime) {
      if (!startedAt || !serverTime) return '';
      const secs = Math.max(0, serverTime - startedAt);
      const d = Math.floor(secs / 86400);
      const h = Math.floor((secs % 86400) / 3600);
      const m = Math.floor((secs % 3600) / 60);
      if (d > 0) return `${d}d ${h}h ${m}m`;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    },

    formatTimestamp(epoch) {
      if (!epoch) return '';
      const d = new Date(epoch * 1000);
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    },

    formatPiUptime(secs) {
      if (!secs) return '?';
      const d = Math.floor(secs / 86400);
      const h = Math.floor((secs % 86400) / 3600);
      const m = Math.floor((secs % 3600) / 60);
      if (d > 0) return `${d}d ${h}h ${m}m`;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    },

    async restartService(target) {
      if (!confirm(`Restart ${target}?`)) return;
      try {
        const res = await fetch('/api/service/restart', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({target}),
        });
        const data = await res.json();
        if (data.ok) {
          alert(`✅ ${target} restarted`);
          setTimeout(() => this.fetchDetailedStatus(), 3000);
        } else {
          alert(`❌ Failed: ${data.message || data.error}`);
        }
      } catch (e) {
        // If we restarted BMO itself, the server goes down — that's expected
        if (target === 'bmo') {
          alert('🔄 BMO is restarting... page will reload in 5 seconds.');
          setTimeout(() => location.reload(), 5000);
        } else {
          alert('❌ Restart failed: ' + e.message);
        }
      }
    },

    async restartAll() {
      if (!confirm('Restart ALL services and containers? This will briefly interrupt everything.')) return;
      try {
        const res = await fetch('/api/service/restart-all', {method: 'POST'});
        const data = await res.json();
        if (data.ok) {
          let msg = '✅ Restart results:\n';
          for (const [k, v] of Object.entries(data.results)) {
            msg += `  ${k}: ${v}\n`;
          }
          alert(msg);
          // BMO restarts itself so page will need a reload
          alert('🔄 BMO is restarting... page will reload in 8 seconds.');
          setTimeout(() => location.reload(), 8000);
        }
      } catch (e) {
        // Expected — BMO killed itself mid-restart
        alert('🔄 All services restarting... page will reload in 8 seconds.');
        setTimeout(() => location.reload(), 8000);
      }
    },

    // ── Voice Settings (Phase 6) ────────────────────────────

    async fetchVoiceSettings() {
      try {
        const res = await fetch('/api/voice/settings');
        if (res.ok) this.voiceSettings = await res.json();
      } catch {}
    },

    async updateVoiceSetting(key, value) {
      this.voiceSettings[key] = value;
      try {
        await fetch('/api/voice/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        });
      } catch {}
    },

    async toggleWakeWord() {
      const enabled = !this.voiceSettings.wake_enabled;
      this.voiceSettings.wake_enabled = enabled;
      try {
        await fetch('/api/voice/wake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
      } catch {}
    },

    // ── Ambient/Idle Mode ────────────────────────────────────

    resetIdleTimer() {
      if (this.ambientActive) {
        this.ambientActive = false;
      }
      clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => this.enterAmbient(), this._idleTimeout);
    },

    enterAmbient() {
      if (this.musicState.is_playing && this.musicState.song) {
        this.ambientMode = 'now_playing';
      } else {
        this.ambientMode = 'bmo_face';
      }
      this.ambientActive = true;
      if (this.ambientMode === 'bmo_face') {
        this.$nextTick(() => this.initFaceCanvas());
      }
    },

    exitAmbient() {
      this._stopFaceAnimation();
      this.ambientActive = false;
      this.resetIdleTimer();
    },

    // ── Procedural BMO Face ─────────────────────────────────
    initFaceCanvas() {
      const el = document.getElementById('bmo-face-canvas');
      if (!el) return;
      this._faceCanvas = el;
      this._faceCtx = el.getContext('2d');
      el.width = 320;
      el.height = 240;
      this._faceFrame = 0;
      this._faceBlink = 0;
      this._faceBlinkState = false;
      this._faceLookOffset = 0;
      this._faceLookTarget = 0;
      this._faceLookTimer = 0;
      this._faceThinkAngle = 0;
      this._startFaceAnimation();
    },

    _startFaceAnimation() {
      const animate = () => {
        if (!this.ambientActive || this.ambientMode !== 'bmo_face') return;
        this._renderFace();
        this._faceFrame++;
        this._faceAnimFrame = requestAnimationFrame(animate);
      };
      animate();
    },

    _stopFaceAnimation() {
      if (this._faceAnimFrame) {
        cancelAnimationFrame(this._faceAnimFrame);
        this._faceAnimFrame = null;
      }
    },

    _renderFace() {
      const ctx = this._faceCtx;
      if (!ctx) return;
      const W = 320, H = 240;
      const green = '#4AE0A5';
      const darkBg = '#1a1a2e';
      const pupilColor = '#1a1a2e';

      ctx.fillStyle = darkBg;
      ctx.fillRect(0, 0, W, H);

      // Use emotion as override, otherwise use status state
      const state = this._faceEmotion || this._faceState || 'idle';

      switch (state) {
        case 'listening': this._drawListening(ctx, W, H, green, pupilColor); break;
        case 'thinking':  this._drawThinking(ctx, W, H, green, pupilColor); break;
        case 'speaking':  this._drawSpeaking(ctx, W, H, green); break;
        case 'follow_up': this._drawListening(ctx, W, H, green, pupilColor); break;
        case 'happy':     this._drawHappy(ctx, W, H, green); break;
        case 'excited':   this._drawHappy(ctx, W, H, green); break;
        case 'sad':       this._drawSad(ctx, W, H, green, pupilColor); break;
        case 'scared':    this._drawScared(ctx, W, H, green, pupilColor); break;
        case 'sleeping':  this._drawSleeping(ctx, W, H, green); break;
        case 'error':     this._drawError(ctx, W, H, green); break;
        case 'mischievous': this._drawMischievous(ctx, W, H, green, pupilColor); break;
        default:          this._drawIdle(ctx, W, H, green, pupilColor); break;
      }

      // Clear emotion after a few seconds
      if (this._faceEmotion && this._faceFrame % 300 === 299) {
        this._faceEmotion = null;
      }
    },

    _drawFaceOutline(ctx, W, H, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      const r = 20, x = 25, y = 10, w = W - 50, h = H - 20;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.stroke();
    },

    _drawEllipse(ctx, cx, cy, rx, ry, fill, stroke) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    },

    _drawIdle(ctx, W, H, green, pupilColor) {
      this._drawFaceOutline(ctx, W, H, green);

      // Blink every ~5 seconds (at ~60fps = 300 frames)
      this._faceBlink++;
      if (this._faceBlink >= 300) {
        this._faceBlinkState = true;
        if (this._faceBlink >= 312) {
          this._faceBlinkState = false;
          this._faceBlink = 0;
        }
      }

      // Look-around
      this._faceLookTimer++;
      if (this._faceLookTimer >= 480) {
        this._faceLookTarget = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
        if (this._faceLookTimer >= 600) { this._faceLookTarget = 0; this._faceLookTimer = 0; }
      }
      const diff = this._faceLookTarget - this._faceLookOffset;
      if (Math.abs(diff) > 0.05) this._faceLookOffset += diff * 0.08;
      else this._faceLookOffset = this._faceLookTarget;
      const shift = this._faceLookOffset * 8;

      if (this._faceBlinkState) {
        ctx.strokeStyle = green; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(88, 80); ctx.lineTo(128, 80); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(192, 80); ctx.lineTo(232, 80); ctx.stroke();
      } else {
        this._drawEllipse(ctx, 108, 75, 20, 18, green);
        this._drawEllipse(ctx, 212, 75, 20, 18, green);
        this._drawEllipse(ctx, 103 + shift, 73, 7, 8, pupilColor);
        this._drawEllipse(ctx, 207 + shift, 73, 7, 8, pupilColor);
      }

      // Mouth — small line
      ctx.strokeStyle = green; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(130, 150); ctx.lineTo(190, 150); ctx.stroke();
    },

    _drawListening(ctx, W, H, green, pupilColor) {
      this._drawFaceOutline(ctx, W, H, green);

      // Wide eyes
      this._drawEllipse(ctx, 105, 72, 25, 24, green);
      this._drawEllipse(ctx, 215, 72, 25, 24, green);
      this._drawEllipse(ctx, 105, 70, 10, 10, pupilColor);
      this._drawEllipse(ctx, 215, 70, 10, 10, pupilColor);

      // Small O mouth
      this._drawEllipse(ctx, 160, 152, 15, 12, null, green);

      // Pulsing mic arcs
      const pulse = this._faceFrame % 60 < 30;
      if (pulse) {
        ctx.strokeStyle = green; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(15, 120, 12, -Math.PI / 3, Math.PI / 3); ctx.stroke();
        ctx.beginPath(); ctx.arc(305, 120, 12, Math.PI * 2 / 3, Math.PI * 4 / 3); ctx.stroke();
      }
    },

    _drawThinking(ctx, W, H, green, pupilColor) {
      this._drawFaceOutline(ctx, W, H, green);

      // Eyes looking up-right
      this._drawEllipse(ctx, 108, 75, 20, 18, green);
      this._drawEllipse(ctx, 212, 75, 20, 18, green);
      this._drawEllipse(ctx, 115, 68, 7, 8, pupilColor);
      this._drawEllipse(ctx, 219, 68, 7, 8, pupilColor);

      // Slight frown
      ctx.strokeStyle = green; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(160, 155, 25, 0.2, Math.PI - 0.2); ctx.stroke();

      // Rotating dots
      this._faceThinkAngle += 0.04;
      const cx = 160, cy = 155, r = 20;
      for (let i = 0; i < 3; i++) {
        const a = this._faceThinkAngle + (i * Math.PI * 2 / 3);
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        const sz = i === 0 ? 5 : 3;
        this._drawEllipse(ctx, x, y, sz, sz, green);
      }
    },

    _drawSpeaking(ctx, W, H, green) {
      this._drawFaceOutline(ctx, W, H, green);

      // Happy squint eyes (arcs)
      ctx.strokeStyle = green; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(108, 82, 18, Math.PI + 0.5, -0.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(212, 82, 18, Math.PI + 0.5, -0.5); ctx.stroke();

      // Animated mouth
      const mouthSize = 8 + Math.abs(Math.sin(this._faceFrame * 0.15)) * 16;
      this._drawEllipse(ctx, 160, 150, 25, mouthSize, null, green);
    },

    _drawHappy(ctx, W, H, green) {
      this._drawFaceOutline(ctx, W, H, green);

      // Squinted happy eyes
      ctx.strokeStyle = green; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(108, 80, 20, Math.PI + 0.4, -0.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(212, 80, 20, Math.PI + 0.4, -0.4); ctx.stroke();

      // Big smile
      ctx.beginPath(); ctx.arc(160, 130, 50, 0.15, Math.PI - 0.15); ctx.stroke();
    },

    _drawSad(ctx, W, H, green, pupilColor) {
      this._drawFaceOutline(ctx, W, H, green);

      // Droopy eyes
      this._drawEllipse(ctx, 108, 80, 18, 14, green);
      this._drawEllipse(ctx, 212, 80, 18, 14, green);
      this._drawEllipse(ctx, 108, 82, 7, 7, pupilColor);
      this._drawEllipse(ctx, 212, 82, 7, 7, pupilColor);

      // Sad eyebrows
      ctx.strokeStyle = green; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(85, 58); ctx.lineTo(130, 62); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(235, 58); ctx.lineTo(190, 62); ctx.stroke();

      // Frown
      ctx.beginPath(); ctx.arc(160, 170, 30, Math.PI + 0.3, -0.3); ctx.stroke();
    },

    _drawScared(ctx, W, H, green, pupilColor) {
      // Trembling outline
      const off = this._faceFrame % 12 < 6 ? 2 : -2;
      ctx.strokeStyle = green; ctx.lineWidth = 3;
      const r = 20, x = 25 + off, y = 10, w = W - 50, h = H - 20;
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.stroke();

      // Wide scared eyes
      this._drawEllipse(ctx, 105, 72, 28, 28, green);
      this._drawEllipse(ctx, 215, 72, 28, 28, green);
      this._drawEllipse(ctx, 105, 66, 7, 8, pupilColor);
      this._drawEllipse(ctx, 215, 66, 7, 8, pupilColor);

      // Small O mouth
      this._drawEllipse(ctx, 160, 158, 14, 12, null, green);
    },

    _drawSleeping(ctx, W, H, green) {
      this._drawFaceOutline(ctx, W, H, green);

      // Closed eyes
      ctx.strokeStyle = green; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(88, 80); ctx.lineTo(128, 80); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(192, 80); ctx.lineTo(232, 80); ctx.stroke();

      // Slight smile
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(160, 140, 25, 0.2, Math.PI - 0.2); ctx.stroke();

      // Animated Zzz
      const phase = Math.floor(this._faceFrame / 50) % 3;
      ctx.fillStyle = green; ctx.font = 'bold 16px monospace';
      for (let i = 0; i <= phase; i++) {
        const x = 240 + i * 15, y = 60 - i * 18;
        const sz = 12 + i * 4;
        ctx.font = `bold ${sz}px monospace`;
        ctx.fillText('Z', x, y);
      }
    },

    _drawError(ctx, W, H, green) {
      this._drawFaceOutline(ctx, W, H, green);

      // X eyes
      ctx.strokeStyle = green; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(90, 60); ctx.lineTo(126, 96); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(126, 60); ctx.lineTo(90, 96); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(194, 60); ctx.lineTo(230, 96); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(230, 60); ctx.lineTo(194, 96); ctx.stroke();

      // Frown
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(160, 175, 35, Math.PI + 0.3, -0.3); ctx.stroke();
    },

    _drawMischievous(ctx, W, H, green, pupilColor) {
      this._drawFaceOutline(ctx, W, H, green);

      // Angled brows
      ctx.strokeStyle = green; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(80, 62); ctx.lineTo(130, 52); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(190, 52); ctx.lineTo(240, 62); ctx.stroke();

      // Narrowed eyes
      this._drawEllipse(ctx, 108, 78, 18, 10, green);
      this._drawEllipse(ctx, 212, 78, 18, 10, green);
      this._drawEllipse(ctx, 108, 77, 6, 6, pupilColor);
      this._drawEllipse(ctx, 212, 77, 6, 6, pupilColor);

      // Wide grin
      ctx.strokeStyle = green; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(160, 135, 55, 0.1, Math.PI - 0.1); ctx.stroke();
    },

    // ── Lists ────────────────────────────────────────────────

    async fetchLists() {
      try {
        const res = await fetch('/api/lists');
        const data = await res.json();
        this.lists = data.lists || {};
        if (!this.activeList && Object.keys(this.lists).length > 0) {
          this.activeList = Object.keys(this.lists)[0];
        }
      } catch (e) {
        console.warn('[bmo] Failed to fetch lists:', e);
      }
    },

    async createList() {
      const name = this.newListName.trim();
      if (!name) return;
      try {
        await fetch('/api/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        this.newListName = '';
        this.activeList = name.toLowerCase().replace(/\s+/g, '_');
        await this.fetchLists();
      } catch (e) {
        console.warn('[bmo] Failed to create list:', e);
      }
    },

    async deleteList(name) {
      try {
        await fetch(`/api/lists/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (this.activeList === name) this.activeList = '';
        await this.fetchLists();
      } catch (e) {
        console.warn('[bmo] Failed to delete list:', e);
      }
    },

    async addListItem(listName) {
      const text = this.newListItemText.trim();
      if (!text) return;
      try {
        await fetch(`/api/lists/${encodeURIComponent(listName)}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        this.newListItemText = '';
        await this.fetchLists();
      } catch (e) {
        console.warn('[bmo] Failed to add list item:', e);
      }
    },

    async removeListItem(listName, itemId) {
      try {
        await fetch(`/api/lists/${encodeURIComponent(listName)}/items/${itemId}`, { method: 'DELETE' });
        await this.fetchLists();
      } catch (e) {
        console.warn('[bmo] Failed to remove list item:', e);
      }
    },

    async checkListItem(listName, itemId, done) {
      try {
        await fetch(`/api/lists/${encodeURIComponent(listName)}/items/${itemId}/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ done }),
        });
        await this.fetchLists();
      } catch (e) {
        console.warn('[bmo] Failed to check list item:', e);
      }
    },

    async clearList(listName, doneOnly) {
      try {
        await fetch(`/api/lists/${encodeURIComponent(listName)}/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ done_only: doneOnly }),
        });
        await this.fetchLists();
      } catch (e) {
        console.warn('[bmo] Failed to clear list:', e);
      }
    },

    // ── Alerts ───────────────────────────────────────────────

    async fetchAlerts() {
      try {
        const res = await fetch('/api/alerts/history?limit=20');
        const data = await res.json();
        this.recentAlerts = data.alerts || [];
      } catch (e) {
        console.warn('[bmo] Failed to fetch alerts:', e);
      }
    },

    showAlertToast(alert) {
      this.alertToast = alert;
      clearTimeout(this._alertToastTimer);
      const duration = alert.priority === 'low' ? 5000 : alert.priority === 'medium' ? 10000 : 0;
      if (duration > 0) {
        this._alertToastTimer = setTimeout(() => { this.alertToast = null; }, duration);
      }
      // Add to recent list
      this.recentAlerts.unshift(alert);
      if (this.recentAlerts.length > 20) this.recentAlerts.length = 20;
    },

    dismissAlertToast() {
      this.alertToast = null;
      clearTimeout(this._alertToastTimer);
    },

    // ── Routines ─────────────────────────────────────────────

    async fetchRoutines() {
      try {
        const res = await fetch('/api/routines');
        const data = await res.json();
        this.routines = data.routines || [];
      } catch (e) {
        console.warn('[bmo] Failed to fetch routines:', e);
      }
    },

    async triggerRoutine(id) {
      try {
        await fetch(`/api/routines/${id}/trigger`, { method: 'POST' });
        this.showNotification('Routine triggered!');
      } catch (e) {
        console.warn('[bmo] Failed to trigger routine:', e);
      }
    },

    async toggleRoutine(id, enabled) {
      try {
        await fetch(`/api/routines/${id}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        await this.fetchRoutines();
      } catch (e) {
        console.warn('[bmo] Failed to toggle routine:', e);
      }
    },

    async deleteRoutine(id) {
      try {
        await fetch(`/api/routines/${id}`, { method: 'DELETE' });
        await this.fetchRoutines();
      } catch (e) {
        console.warn('[bmo] Failed to delete routine:', e);
      }
    },

    // ── IDE methods removed — new IDE on port 5001 ──────────
  };
}

