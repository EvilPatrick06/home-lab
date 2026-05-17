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
    clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
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
    timezone: '',
    locationLabel: '',
    kioskMode: window.location.search.includes('kiosk=1'),

    // Status
    status: 'idle', // idle, listening, thinking, speaking
    notificationType: 'info',  // Round 4 #21: drives toast color (info/success/error)
    miniPlayerHidden: false,   // Round 4 #9: user can dismiss mini-bar; resets on new song

    // QA #6/#7 (2026-05-17): connection + health surface.
    // connectionState: 'online' | 'offline' | 'cf_expired'.
    // healthSummary: pill text reflecting /api/health/full overall.
    connectionState: 'online',
    healthSummary: 'BMO',
    _healthPoll: null,

    // QA #14 (2026-05-17): Controls/Settings hydration gate. Templates show
    // skeleton placeholders until controls fetch resolves, eliminating the
    // toggle flicker where they render off then jump to true.
    controlsLoaded: false,

    // QA Round 2 #1 (2026-05-17): system audio mute state — drives a
    // top-of-app banner so silent-play failures are obvious from any tab.
    systemAudioMuted: false,

    // QA Round 2 #25, #26 (2026-05-17): BT scan UX.
    btLastScan: 0,            // ms since epoch of last successful scan
    btShowMacs: false,        // off-by-default → privacy hygiene
    _btScanTimeout: null,     // safety timeout id (resets stuck "Scanning...")

    // QA Round 2 #31 (2026-05-17): routines editor visibility (CTA opens it).
    showRoutineEditor: false,

    // QA #15 (2026-05-17): track weather freshness for the "updated Xm ago" pill.
    _weatherFetchedAt: 0,

    // QA #16 (2026-05-17): persistent mini-player visibility derives from
    // musicState.song existence; no separate state field needed.

    // QA #19 (2026-05-17): inline snap preview.
    showSnapPreview: false,
    snapPreviewUrl: '',

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
    calAuthManualUrl: '',
    calAuthCode: '',
    _calAuthPolling: false,
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
    statusCopiedService: '',
    statusFilter: 'all',
    statusSearch: '',
    statusBulkRestartBusy: false,
    statusSelectedTargets: {},
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
    wifiStatus: null,
    wifiNetworks: [],
    wifiLoading: false,
    wifiConnectBusy: false,
    wifiSelectedSsid: '',
    wifiPassword: '',
    wifiError: '',
    wifiMessage: '',
    wifiShowPassword: false,

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
    voiceSettings: { wake_enabled: true, bmo_tts_enabled: true, silence_threshold: 600, vad_sensitivity: 1.8, tts_provider: 'auto', stt_provider: 'auto', wake_variants: [] },

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
    ideCompletedJobCount: 0,
    _lastGeoPushAt: 0,
    _geoWatchId: null,
    _lastGeoErrorAt: 0,

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
      this.refreshClientTimezone(true);
      this.updateClock();
      setInterval(() => this.updateClock(), 1000);
      setInterval(() => this.refreshClientTimezone(false), 60000);

      this.socket = io({ auth: { client_timezone: this.clientTimezone } });
      this.setupSocket();
      window.addEventListener('message', async (event) => {
        const payload = event?.data || {};
        if (payload.type !== 'bmo-calendar-auth') return;
        if (payload.ok) {
          await this.finishCalendarAuthSuccess(payload.message || 'Calendar authorized!');
        } else {
          this.showNotification(payload.message || 'Calendar auth failed', 'error');
        }
      });

      // Fetch current music state on page load (preserve playback across reloads)
      this.fetchMusicState().then(() => {
        // QA #23: if music is playing and we have a remembered query,
        // re-run the search so the now-playing row re-highlights.
        this.restoreMusicSearchIfPlaying();
      });

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

      // QA #6 (2026-05-17): poll /api/health/full so the header pill reflects
      // overall subsystem status. CF Access expiry / network outage detected
      // via apiFetch wrapper updates connectionState.
      this.pollHealth();
      this._healthPoll = setInterval(() => this.pollHealth(), 30000);

      // Load Google Places API
      fetch('/api/config').then(r => r.json()).then(c => {
        if (c.maps_api_key) loadPlacesAPI(c.maps_api_key);
        if (c.location) {
          this.timezone = c.location.timezone || '';
          this.locationLabel = c.location.location_label || '';
          this.updateClock();
        }
      }).catch(() => {});

      this.pushDeviceLocation();
      setTimeout(() => this.pushDeviceLocation(), 15000);
      setInterval(() => this.pushDeviceLocation(), 900000);
      this.startGeoWatch();

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
      const options = this.timezone ? { timeZone: this.timezone } : {};
      this.clock = now.toLocaleTimeString('en-US', {
        ...options,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      this.dateStr = now.toLocaleDateString('en-US', {
        ...options,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      this.fullDateStr = now.toLocaleDateString('en-US', {
        ...options,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    },

    // ── WebSocket ─────────────────────────────────────────────

    setupSocket() {
      this.socket.on('connect', () => {
        this.socket.emit('client_timezone', { client_timezone: this.clientTimezone });
        this.fetchTimers();
      });
      this.socket.on('weather_update', (data) => {
        this.weather = data;
        this._weatherFetchedAt = Date.now() / 1000;
        if (data.timezone) this.timezone = data.timezone;
        if (data.location_label) this.locationLabel = data.location_label;
      });
      this.socket.on('location_update', (data) => {
        if (data.timezone) this.timezone = data.timezone;
        if (data.location_label) this.locationLabel = data.location_label;
        this.fetchWeather();
      });
      this.socket.on('music_state', (data) => {
        // Preserve saved volume if incoming state has 0 (VLC reports 0 when idle)
        if (!data.volume && this.musicState.volume > 0) data.volume = this.musicState.volume;
        // Refresh history/most-played when song changes (e.g. autoplay)
        const oldVid = this.musicState.song?.videoId;
        const newVid = data.song?.videoId;
        if (newVid && newVid !== oldVid) {
          this.fetchMusicHistory();
          this.fetchMostPlayed();
          // Round 4 #9: re-show mini-bar on each new song so a dismissed
          // bar doesn't permanently hide playback indicators.
          this.miniPlayerHidden = false;
        }
        this.musicState = data;
        // Don't let music_state override the settings slider — settings API is source of truth
      });
      this.socket.on('next_event', (data) => { this.nextEvent = data; });
      this.socket.on('timers_tick', (data) => { this.timerItems = data; });
      this.socket.on('status', (data) => {
        this.status = data.state;
        // QA #28: keep _faceState in sync with status BUT defer to
        // face_state events when they arrive (unified source of truth).
        if (!this._faceStateAuthoritative) this._faceState = data.state;
      });
      this.socket.on('expression', (data) => {
        // Legacy event — face_state below supersedes when present.
        if (data.expression && !this._faceStateAuthoritative) {
          this._faceEmotion = data.expression;
        }
      });
      // QA #28 (2026-05-17): unified face state. When the server speaks
      // this, both the web ambient canvas and the OLED render the same
      // expression. We mark `_faceStateAuthoritative` true on first receipt
      // so legacy `status`/`expression` events stop fighting it.
      this.socket.on('face_state', (data) => {
        if (!data || !data.expression) return;
        this._faceStateAuthoritative = true;
        this._faceState = data.expression;
        this._faceEmotion = data.expression;
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
        // QA #30 (2026-05-17): double-tick the scroll so the freshly-pushed
        // message reaches the DOM before the scroll fires. Without this,
        // the final line of long responses occasionally sat below the
        // visible scroll window (looked like a "dropped tokens" bug).
        this.scrollChat();
        this.$nextTick(() => this.scrollChat());
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
        this.btLastScan = Date.now();
        if (this._btScanTimeout) clearTimeout(this._btScanTimeout);
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
      // Round 2 #22 / Round 3 #7 (2026-05-17): server broadcasts
      // chat_cleared after /api/chat/clear so every connected tab
      // refreshes. Use .splice() instead of reassignment because Alpine
      // misses some reassignment reactivity in nested-array cases.
      this.socket.on('chat_cleared', (data) => {
        this.messages.splice(0, this.messages.length);
        this.status = 'idle';
        const note = data?.dnd_saved
          ? 'Campaign session saved! Chat cleared. Starting fresh.'
          : 'Chat cleared.';
        this.messages.push({ role: 'assistant', text: note });
        this.scrollChat();
        // Toast on the current tab too — was silent before.
        this.showNotification?.(note);
      });
      this.socket.on('scene_change', (data) => {
        // QA #13: backend now emits the full scenes list alongside the
        // active name so the UI's `s.active` highlight stays in sync even
        // if a list mutation (custom scene added/removed) crossed paths
        // with the activation.
        this.activeScene = data.scene;
        if (Array.isArray(data.scenes)) {
          this.scenes = data.scenes;
        } else {
          this.scenes = this.scenes.map(s => ({ ...s, active: s.name === data.scene }));
        }
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

      // Personality quips (Round 3 #6, 2026-05-17): tag as ambient role
      // + dedupe within 5 min so identical nudges don't double-fire and
      // proactive turns are visually distinct from real assistant replies.
      this._recentQuipTexts = this._recentQuipTexts || new Map();
      this.socket.on('bmo_quip', (data) => {
        if (!data.text) return;
        const norm = data.text.trim().toLowerCase();
        const lastTs = this._recentQuipTexts.get(norm) || 0;
        const now = Date.now();
        if (now - lastTs < 5 * 60 * 1000) {
          return;  // dedupe — same nudge fired within 5 min, drop
        }
        this._recentQuipTexts.set(norm, now);
        // GC old entries so the map doesn't grow unbounded
        for (const [k, ts] of this._recentQuipTexts) {
          if (now - ts > 30 * 60 * 1000) this._recentQuipTexts.delete(k);
        }
        this.messages.push({
          role: 'ambient',
          text: data.text,
          isQuip: true,
        });
        this.scrollChat();
      });
    },

    // ── Plan mode helpers ─────────────────────────────────
    _parsePlanSteps(planText) {
      // Round 2 #18 (2026-05-17): relax the parser so plans with looser
      // formatting (numbered list without [status] checkbox, or markdown
      // bullets) still produce visible steps. Falls through to the strict
      // form first to preserve status/agent metadata when available.
      const steps = [];
      const strict = /(\d+)\.\s*\[(.)\]\s*(.+?)(?:\(agent:\s*(\w+)\))?$/gm;
      let m;
      while ((m = strict.exec(planText)) !== null) {
        const ch = m[2];
        let status = 'pending';
        if (ch === 'x') status = 'done';
        else if (ch === '~') status = 'running';
        else if (ch === '!') status = 'failed';
        steps.push({ num: parseInt(m[1]), desc: m[3].trim(), agent: m[4] || 'code', status });
      }
      if (steps.length > 0) return steps;

      // Fallback 1: plain numbered list ("1. <desc>" / "1) <desc>")
      const numbered = /^[ \t]*(\d+)[\.\)]\s+(.+)$/gm;
      while ((m = numbered.exec(planText)) !== null) {
        steps.push({ num: parseInt(m[1]), desc: m[2].trim(), agent: 'code', status: 'pending' });
      }
      if (steps.length > 0) return steps;

      // Fallback 2: markdown bullets ("- <desc>" / "* <desc>")
      const bulleted = /^[ \t]*[-*]\s+(.+)$/gm;
      let i = 1;
      while ((m = bulleted.exec(planText)) !== null) {
        steps.push({ num: i++, desc: m[1].trim(), agent: 'code', status: 'pending' });
      }
      return steps;
    },

    approvePlan() {
      // QA #3: dedicated plan_approve event so the approval doesn't show up
      // as a literal "yes" user turn in chat history / agent memory.
      this.socket.emit('plan_approve', { client_timezone: this.clientTimezone });
      this.planStatus = 'executing';
    },

    rejectPlan() {
      this.socket.emit('plan_reject', { client_timezone: this.clientTimezone });
      this.planMode = false;
      this.planStatus = 'idle';
      // Round 3 #4 (2026-05-17): also revert mode selector to whatever the
      // user actually had so the banner+selector agree. Plan-banner-was-
      // stuck-after-cancel was the headline complaint.
      if (this.selectedAgent === 'plan') this.selectedAgent = 'auto';
    },

    // ── Connection / Health (QA #6, #7, 2026-05-17) ───────────

    // Wrapper around fetch() that updates connectionState when CF Access
    // expires (401/403 with HTML body) or the network goes offline.
    async apiFetch(input, init) {
      try {
        const res = await fetch(input, init);
        if (res.status === 401 || res.status === 403) {
          // Cloudflare Access challenge bodies are HTML; the API normally
          // answers JSON. Use content-type as the disambiguator.
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('text/html')) {
            this.connectionState = 'cf_expired';
          }
        } else if (this.connectionState !== 'online') {
          this.connectionState = 'online';
        }
        return res;
      } catch (e) {
        // fetch threw → no network / CORS / DNS failure.
        if (this.connectionState !== 'cf_expired') {
          this.connectionState = 'offline';
        }
        throw e;
      }
    },

    async pollHealth() {
      try {
        const res = await this.apiFetch('/api/health/full');
        if (!res.ok) return;
        const data = await res.json();
        const overall = (data.overall || '').toLowerCase();
        if (overall === 'critical') {
          const failing = Object.entries(data.services || {})
            .filter(([_, s]) => (s.status || '').toLowerCase() === 'down')
            .map(([name]) => name.replace(/^svc_|^google_/, ''))
            .slice(0, 2)
            .join(',');
          this.healthSummary = failing ? `BMO ⚠ ${failing}` : 'BMO ⚠';
        } else if (overall === 'warning' || overall === 'degraded') {
          this.healthSummary = 'BMO ⚠';
        } else {
          this.healthSummary = 'BMO';
        }
      } catch {
        // Network failure — keep last summary; connection pill flips via apiFetch.
      }
    },

    healthPillClass() {
      if (this.connectionState === 'cf_expired') return 'bg-amber-500/20 text-amber-300';
      if (this.connectionState === 'offline') return 'bg-rose-500/20 text-rose-300';
      if ((this.healthSummary || '').includes('⚠')) return 'bg-amber-500/20 text-amber-300';
      return 'bg-emerald-500/20 text-emerald-300';
    },

    // ── Chat ──────────────────────────────────────────────────

    async loadChatHistory() {
      try {
        const res = await fetch('/api/chat/history');
        const history = await res.json();
        if (Array.isArray(history) && history.length > 0) {
          // QA #24 (2026-05-17): surface `incomplete` so the renderer can
          // show the "(interrupted)" pill on assistant turns that died mid-
          // generation (refresh during stream, Code Agent truncation, etc.)
          this.messages = history.map(m => ({
            role: m.role, text: m.text, speaker: m.speaker,
            incomplete: !!m.incomplete,
          }));
          // QA Round 2 #23 / N (2026-05-17): backend now writes a pending
          // assistant stub at chat start (incomplete:true, pending_id set)
          // and overwrites it on successful completion. Stubs that survive
          // a refresh stay incomplete:true → the renderer naturally shows
          // the (interrupted) pill from this.messages.map above. Legacy
          // safety net (trailing-user-no-assistant after 15s) kept as a
          // belt-and-suspenders fallback for any code path that bypasses
          // the stub mechanism.
          const last = this.messages[this.messages.length - 1];
          if (last && last.role === 'user') {
            const lastSourceTs = history[history.length - 1]?.ts || 0;
            const nowSec = Date.now() / 1000;
            if (lastSourceTs && (nowSec - lastSourceTs) > 15) {
              this.messages.push({
                role: 'assistant',
                text: '',
                incomplete: true,
                interruptedByRefresh: true,
              });
            }
          }
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

      // QA #2: typed input is "text"; only tag with voice:<profile> when the
      // user has explicitly selected an "as <player>" persona for D&D mode.
      const speaker = this.activePlayer ? `voice:${this.activePlayer}` : 'text';
      const displayMsg = this.activePlayer ? `[${this.activePlayer}] ${msg}` : msg;
      this.messages.push({ role: 'user', text: displayMsg, speaker: this.activePlayer || undefined });
      this.chatInput = '';
      this.status = 'thinking';
      this.scrollChat();
      const payload = { message: displayMsg, speaker, client_timezone: this.clientTimezone };
      if (this.selectedAgent && this.selectedAgent !== 'auto') payload.agent = this.selectedAgent;
      if (this.selectedModel && this.selectedModel !== 'auto') payload.model = this.selectedModel;
      this.socket.emit('chat_message', payload);
    },

    refreshClientTimezone(force = false) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (!tz) return;
      if (!force && tz === this.clientTimezone) return;
      this.clientTimezone = tz;
      if (this.socket) {
        this.socket.emit('client_timezone', { client_timezone: tz });
      }
      this.fetchTimers();
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
          // QA #2: /roll is typed via slash-command — tag as text not voice profile.
          this.socket.emit('chat_message', { message: diceMsg, speaker: 'text', client_timezone: this.clientTimezone });
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
      // QA Round 2 #14 (2026-05-17): also clear any pending debounced
      // search so Enter doesn't race with the typing-debounce timer
      // (which can fire after Enter completes and overwrite results).
      if (this._searchTimer) {
        clearTimeout(this._searchTimer);
        this._searchTimer = null;
      }
      // QA #23 (2026-05-17): remember the active query so a refresh during
      // playback can re-execute it and the now-playing row highlights again.
      try {
        localStorage.setItem('bmo_music_last_query', this.musicQuery);
        localStorage.setItem('bmo_music_last_mode', this.searchMode);
      } catch {}
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

    async restoreMusicSearchIfPlaying() {
      // QA #23 (2026-05-17): if a song is playing on init, re-run the last
      // search so the "now playing" row highlight rehydrates. Skipped when
      // nothing is playing (don't surprise the user with old results).
      try {
        const q = localStorage.getItem('bmo_music_last_query') || '';
        const m = localStorage.getItem('bmo_music_last_mode') || 'songs';
        if (!q || !this.musicState?.song?.videoId) return;
        this.musicQuery = q;
        this.searchMode = m;
        await this.searchMusic();
      } catch {}
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
      if (cmd === 'pause') {
        const endpoint = this.musicState?.is_playing ? '/api/music/pause' : '/api/music/play';
        await fetch(endpoint, { method: 'POST' });
      } else {
        await fetch(`/api/music/${cmd}`, { method: 'POST' });
      }
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
      // Round 2 #7 (2026-05-17): silent backoff. Don't poll when the tab
      // isn't visible (avoids the [cal] fetch failed spam on Home with
      // DevTools open). Don't log every failure — only first failure +
      // recovery so the console stays scannable.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      try {
        const res = await fetch(`/api/calendar/events?days=${this.calDays}`);
        const data = await res.json();
        if (!res.ok) {
          if (!this.calOffline) console.warn('[cal] API error:', res.status, data);
          this.calOffline = true;
          return;
        }
        if (this.calOffline) console.info('[cal] recovered');
        this.calOffline = false;
        this.calEvents = data.events || data || [];
        if (this.calEvents.length > 0) this.nextEvent = this.calEvents[0];
        try { localStorage.setItem('bmo_cal_events', JSON.stringify(this.calEvents)); } catch {}
      } catch (e) {
        if (!this.calOffline) console.warn('[cal] fetch failed:', e?.message || e);
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
        const res = await fetch('/api/calendar/auth/url?mode=auto');
        const data = await res.json();
        if (data.url) {
          this.calAuthUrl = data.url;
          this.calAuthManualUrl = data.manual_url || '';
          this.calAuthCode = '';
          const popup = window.open(data.url, 'bmo-calendar-auth', 'popup,width=560,height=760');
          if (popup) {
            this.showNotification('Finish Google sign-in in popup', 'info');
            this.pollCalendarAuthStatus();
          } else {
            this.showNotification('Popup blocked — use manual auth link below', 'warning');
          }
        } else {
          this.showNotification(data.error || 'Failed to get auth URL', 'error');
        }
      } catch (e) {
        this.showNotification('Failed to start calendar auth', 'error');
      }
    },

    async pollCalendarAuthStatus(maxAttempts = 30) {
      if (this._calAuthPolling) return;
      this._calAuthPolling = true;
      try {
        for (let i = 0; i < maxAttempts; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const res = await fetch('/api/calendar/auth/status');
          const data = await res.json();
          if (data.authorized) {
            await this.finishCalendarAuthSuccess(data.message || 'Calendar authorized!');
            return;
          }
        }
      } catch {}
      this._calAuthPolling = false;
    },

    async finishCalendarAuthSuccess(message = 'Calendar authorized!') {
      this.calAuthUrl = '';
      this.calAuthManualUrl = '';
      this.calAuthCode = '';
      this.calOffline = false;
      this._calAuthPolling = false;
      this.showNotification(message, 'success');
      await this.fetchCalendar();
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
          await this.finishCalendarAuthSuccess('Calendar authorized!');
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
      // Round 2 #24 (2026-05-17): inline validation feedback for common
      // wrong-state cases. Duration must be > 0; date must be parseable.
      if (!e.allDay) {
        const dur = parseFloat(e.durationHrs);
        if (!isFinite(dur) || dur <= 0) {
          this.showNotification('Duration must be greater than 0 hours');
          return;
        }
      }
      const checkDate = new Date(e.allDay ? e.date : `${e.date}T${e.startTime || '12:00'}:00`);
      if (isNaN(checkDate.getTime())) {
        this.showNotification('Date / time is invalid');
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
      // QA #20 (2026-05-17): surface backend errors verbatim instead of a
      // generic "Could not describe scene". Result still arrives via
      // vision_result socket event on success.
      this.visionResult = 'Looking…';
      try {
        const res = await fetch('/api/camera/describe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'What do you see? Describe briefly.' }),
        });
        if (!res.ok) {
          let msg = `Describe failed (HTTP ${res.status})`;
          try {
            const data = await res.json();
            if (data && data.error) msg = `Describe failed: ${data.error}`;
          } catch {}
          this.visionResult = msg;
        }
      } catch (e) {
        this.visionResult = `Could not describe scene: ${e.message || 'network'}`;
      }
    },

    async toggleMotion() {
      // Round 3 #10 (2026-05-17): read motion state back from the
      // server's response so the button styling never disagrees with
      // server reality. Use $nextTick to force Alpine to re-render the
      // :class binding after the boolean flip (the OFF case sometimes
      // didn't visually update without this).
      const next = !this.motionEnabled;
      this.motionEnabled = next;
      try {
        const res = await fetch('/api/camera/motion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        });
        if (!res.ok) {
          this.motionEnabled = !next;
          this.showNotification('Motion toggle failed', 'error');
          return;
        }
        try {
          const data = await res.json();
          if (typeof data?.enabled === 'boolean') this.motionEnabled = data.enabled;
        } catch {}
        this.$nextTick(() => { /* force re-render */ });
        this.showNotification(this.motionEnabled ? 'Motion detection: ON' : 'Motion detection: OFF');
      } catch (e) {
        this.motionEnabled = !next;
        this.showNotification('Motion toggle failed: ' + (e.message || 'network'), 'error');
      }
    },

    // ── Timers ────────────────────────────────────────────────

    async fetchTimers() {
      try {
        const tzq = encodeURIComponent(this.clientTimezone || '');
        const res = await fetch(`/api/timers?client_timezone=${tzq}`);
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
      // Round 4 #22 (2026-05-17): server-side guard in case the
      // template's :disabled binding didn't engage (defensive).
      if (!this.alarmHour || this.alarmHour < 1 || this.alarmHour > 12) {
        this.showNotification('Pick a valid hour (1-12) before setting the alarm', 'error');
        return;
      }
      let h24 = this.alarmHour % 12;
      if (this.alarmAmPm === 'PM') h24 += 12;
      if (this.alarmAmPm === 'AM' && this.alarmHour === 12) h24 = 0;
      const label = this.alarmLabel || `Alarm (${this.alarmHour}:${String(this.alarmMin).padStart(2,'0')} ${this.alarmAmPm})`;
      await fetch('/api/alarms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour: h24, minute: this.alarmMin, label, tag: this.alarmTag, client_timezone: this.clientTimezone }),
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
      body.client_timezone = this.clientTimezone;
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

    alarmEnabledLabel(item) {
      return item.enabled === false ? 'Off' : 'On';
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

    async toggleRecurringAlarm(item) {
      if (!item || item.type !== 'alarm' || !item.repeat || item.repeat === 'none') return;
      const enabled = item.enabled === false;
      await fetch(`/api/alarms/${item.id}/enabled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, client_timezone: this.clientTimezone }),
      });
      this.fetchTimers();
    },

    // ── Weather ───────────────────────────────────────────────

    async fetchWeather() {
      try {
        const res = await fetch('/api/weather?force=1');
        this.weather = await res.json();
        this._weatherFetchedAt = Date.now() / 1000;
        if (this.weather.timezone) this.timezone = this.weather.timezone;
        if (this.weather.location_label) this.locationLabel = this.weather.location_label;
      } catch {}
    },

    // QA #15: "updated 2m ago" pill on the weather card.
    weatherUpdatedAgo() {
      if (!this._weatherFetchedAt) return '';
      const m = Math.floor((Date.now() / 1000 - this._weatherFetchedAt) / 60);
      if (m < 1) return 'just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      return `${h}h ago`;
    },

    weatherCardReady() {
      // QA #15: only render the full card once temperature + icon both present.
      return this.weather && this.weather.temperature !== null && this.weather.icon;
    },

    _logGeolocationIssue(message) {
      const now = Date.now();
      if (now - this._lastGeoErrorAt < 60000) return;
      this._lastGeoErrorAt = now;
      fetch('/api/ide/js-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: `Geolocation: ${message}`, file: 'bmo.js' }),
      }).catch(() => {});
    },

    async _postDeviceLocation(pos) {
      const now = Date.now();
      if (now - this._lastGeoPushAt < 120000) return;
      this._lastGeoPushAt = now;
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const acc = Number(pos.coords.accuracy ?? NaN);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const payload = {
        latitude: lat,
        longitude: lon,
        timezone: tz,
        accuracy_m: Number.isFinite(acc) ? acc : null,
      };
      try {
        const deviceRes = await fetch('/api/location/device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!deviceRes.ok) {
          const errText = await deviceRes.text().catch(() => '');
          this._logGeolocationIssue(`device endpoint rejected (${deviceRes.status}): ${errText.slice(0, 160)}`);
          return;
        }
        const locRes = await fetch('/api/location');
        const loc = await locRes.json();
        if (loc.timezone) this.timezone = loc.timezone;
        if (loc.location_label) this.locationLabel = loc.location_label;
        this.fetchWeather();
      } catch (err) {
        this._logGeolocationIssue(`device endpoint error: ${String(err?.message || err)}`);
      }
    },

    startGeoWatch() {
      if (!navigator.geolocation || this._geoWatchId !== null) return;
      try {
        this._geoWatchId = navigator.geolocation.watchPosition(
          (pos) => this._postDeviceLocation(pos),
          (err) => this._logGeolocationIssue(`watchPosition failed (${err?.code ?? 'n/a'}): ${err?.message ?? 'unknown'}`),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
        );
      } catch (err) {
        this._logGeolocationIssue(`watchPosition exception: ${String(err?.message || err)}`);
      }
    },

    async pushDeviceLocation() {
      if (!navigator.geolocation) {
        this._logGeolocationIssue('navigator.geolocation unavailable');
        return;
      }
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => this._postDeviceLocation(pos),
          (err) => this._logGeolocationIssue(`getCurrentPosition failed (${err?.code ?? 'n/a'}): ${err?.message ?? 'unknown'}`),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 600000 },
        );
      } catch (err) {
        this._logGeolocationIssue(`getCurrentPosition exception: ${String(err?.message || err)}`);
      }
    },

    weatherIcon(code) {
      const icons = { clear: '\u2600', cloudy: '\u2601', rain: '\u{1F327}', snow: '\u2744', storm: '\u26A1', fog: '\u{1F32B}' };
      return icons[code] || '\u2600';
    },

    formatForecastWeekday(isoDate) {
      if (!isoDate) return '';
      const options = this.timezone ? { weekday: 'short', timeZone: this.timezone } : { weekday: 'short' };
      return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', options);
    },

    // ── Notifications ─────────────────────────────────────────

    showNotification(msg, type = 'info') {
      // Round 4 #21 (2026-05-17): accept a second arg so callers can flag
      // errors. Toast color is set via notificationType which the template
      // reads for high-contrast error styling.
      this.notification = msg;
      this.notificationType = type;
      const options = this.timezone ? { timeZone: this.timezone } : {};
      this.notificationHistory.unshift({ text: msg, time: new Date().toLocaleTimeString('en-US', options), type });
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
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.status === 409) {
          // QA #31 (2026-05-17): duplicate — ask before re-adding.
          if (confirm('A note with this text already exists. Add anyway?')) {
            await fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, allow_duplicate: true }),
            });
          } else {
            return;
          }
        }
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
      // QA #12 (2026-05-17): YouTube tile used to silently no-op because the
      // launcher URI was wrong AND the frontend swallowed errors. Surface
      // anything non-OK as a toast so the user knows what happened.
      try {
        const res = await fetch('/api/tv/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app }),
        });
        if (!res.ok) {
          let msg = `Couldn't launch ${app}`;
          try {
            const data = await res.json();
            if (data && data.error) msg = `${app}: ${data.error}`;
          } catch {}
          this.showNotification(msg, 'error');
        }
      } catch (e) {
        this.showNotification(`Couldn't launch ${app}: ${e.message || 'network'}`, 'error');
      }
    },

    async tvCancelPairing() {
      // QA #11 (2026-05-17): user dismissed the PIN dialog — tell the worker
      // so the next pair_start works from a clean state.
      try { await fetch('/api/tv/pair/cancel', { method: 'POST' }); } catch {}
      this.tvPairing = false;
      this.tvPairPin = '';
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

    // ── Camera Snap (inline preview, QA #19, 2026-05-17) ─────

    async cameraSnap() {
      // Was: window.open('/api/camera/snapshot?download=1', '_blank')
      // GET on a POST-only route returned 405 in a new tab. Now POSTs and
      // displays the most-recent snapshot inline over the camera overlay.
      // Round 2 #19 (2026-05-17): surface backend error string verbatim
      // so "Camera service not available" / "No camera available" tells
      // the user the actual blocker.
      try {
        const res = await fetch('/api/camera/snapshot', { method: 'POST' });
        if (!res.ok) {
          let msg = `Snapshot failed (${res.status})`;
          try {
            const data = await res.json();
            if (data?.error) msg = `Snapshot failed: ${data.error}`;
          } catch {}
          this.showNotification(msg, 'error');
          return;
        }
        const data = await res.json();
        const url = (data.preview_url || '/api/camera/snapshot/last') + `?ts=${Date.now()}`;
        this.snapPreviewUrl = url;
        this.showSnapPreview = true;
      } catch (e) {
        this.showNotification('Snapshot failed: ' + (e.message || 'network'), 'error');
      }
    },

    closeSnapPreview() {
      this.showSnapPreview = false;
      this.snapPreviewUrl = '';
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
        // Round 2 #32 (2026-05-17): idle copy stays the same but the
        // styling (statusTextColor below) is now muted-text not accent-
        // green so it no longer reads as a clickable link.
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
        // Round 2 #32 (2026-05-17): idle = muted, not green — the green
        // styling made the static prompt read as a clickable link.
        idle: 'text-text-muted',
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
      // QA #14 (2026-05-17) / Round 4 #12: flip controlsLoaded after the
      // FIRST three fast fetches (LED + volume + scenes) so the tab is
      // interactive within ~1s instead of waiting for all 8+ network
      // calls. Slow services (smart_home discovery, WiFi probe, voice
      // settings) keep loading in the background; their per-section
      // x-show gates reveal them when ready.
      const finish = (p, then) => {
        p.then((res) => { if (res.ok) return res.json().then(then).catch(() => {}); }).catch(() => {});
      };
      finish(fetch('/api/led/status'), (d) => {
        this.ledState = d;
        if (d.color) {
          const r = d.color.r.toString(16).padStart(2, '0');
          const g = d.color.g.toString(16).padStart(2, '0');
          const b = d.color.b.toString(16).padStart(2, '0');
          this.ledColorHex = `#${r}${g}${b}`;
        }
      });
      finish(fetch('/api/volume'), (vols) => {
        if (vols.music !== undefined) this.musicState.volume = vols.music;
        this.volumeLevels = vols;
        // Round 4 #2/#4 (2026-05-17): treat both wpctl-muted AND system
        // volume 0% as "audio will be inaudible" — banner triggers on
        // either case so play actions don't seem to do nothing.
        this.systemAudioMuted = !!vols.muted || (vols.system === 0);
      });
      finish(fetch('/api/status/summary'), (d) => { this.systemStatus = d; });
      finish(fetch('/api/notifications'), (d) => {
        this.kdeNotifications = d.notifications || [];
        // Round 4 #18 (2026-05-17): bell badge derived from server state,
        // not just local increments. If server says no notifs, badge clears.
        if (this.kdeNotifications.length === 0 && this.notificationHistory.length === 0) {
          this.unreadNotifications = 0;
        }
      });
      finish(fetch('/api/notifications/settings'), (d) => { this.notifSettings = d; });
      finish(fetch('/api/scenes'), (sd) => {
        this.scenes = sd.scenes || [];
        this.activeScene = sd.active;
      });
      finish(fetch('/api/audio/devices'), (ad) => {
        this.audioDevices = ad.sinks || ad.devices || [];
      });
      finish(fetch('/api/tts/output'), (td) => { this.ttsOutput = td.output || 'pi'; });
      // Start the slow ones in parallel; they paint when ready.
      this.fetchMicInputs();
      this.fetchAudioRouting();
      this.fetchSmartDevices();
      this.fetchVoiceSettings();
      this.fetchWifiStatus();
      // Round 4 #12: flip the gate immediately so the user sees the skeleton
      // replaced fast. Per-section skeletons can handle individual lag.
      this.controlsLoaded = true;
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
      // Round 2 #25 / Round 3 #23 (2026-05-17): explicit timeout reset
      // so the button doesn't stick in "Scanning..." if no event arrives.
      // Suppress the "timed out" toast when devices DID arrive (the
      // earlier message was contradictory — list was populated but
      // banner said timeout).
      this.btScanning = true;
      this.btDevices = [];
      if (this._btScanTimeout) clearTimeout(this._btScanTimeout);
      this._btScanTimeout = setTimeout(() => {
        if (this.btScanning) {
          this.btScanning = false;
          if ((this.btDevices?.length || 0) === 0) {
            this.showNotification('Bluetooth scan timed out — no devices found', 'error');
          }
        }
      }, 20000);
      try {
        await fetch('/api/audio/bluetooth/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration: 8 }),
        });
      } catch {
        this.btScanning = false;
        if (this._btScanTimeout) clearTimeout(this._btScanTimeout);
      }
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

    dismissKdeNotification(n) {
      // Round 2 #29 (2026-05-17): per-item dismiss — local only, since
      // KDE notifications are read from a daemon. Removing locally hides
      // the entry; backend may re-emit if the daemon re-broadcasts.
      this.kdeNotifications = this.kdeNotifications.filter(x => x.id !== n.id);
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

    // ── Wi-Fi Settings ────────────────────────────────────────

    async fetchWifiStatus() {
      // Round 3 #18 (2026-05-17): Settings panel reads current_ssid /
      // ip_address / internet / saved_networks — all on the DETAIL shape.
      // The slim /api/wifi/status (31b public-surface trim) only has
      // {ssid, connected}, so reading it here made every field show
      // disconnected fallbacks. /api/wifi/status/detail is behind CF
      // Access — appropriate for a Settings panel.
      try {
        const res = await fetch('/api/wifi/status/detail');
        if (res.ok) this.wifiStatus = await res.json();
      } catch {}
    },

    async scanWifiNetworks() {
      this.wifiLoading = true;
      this.wifiError = '';
      try {
        const res = await fetch('/api/wifi/scan');
        const data = await res.json();
        if (!res.ok) {
          this.wifiError = data.error || 'Wi-Fi scan failed';
          return;
        }
        this.wifiNetworks = data.networks || [];
        if (!this.wifiSelectedSsid) {
          const active = this.wifiNetworks.find(n => n.in_use);
          if (active) this.wifiSelectedSsid = active.ssid;
        }
      } catch (e) {
        this.wifiError = e.message || 'Wi-Fi scan failed';
      } finally {
        this.wifiLoading = false;
      }
    },

    async connectWifi() {
      if (!this.wifiSelectedSsid) {
        this.wifiError = 'Select a Wi-Fi network first.';
        return;
      }
      this.wifiConnectBusy = true;
      this.wifiError = '';
      this.wifiMessage = '';
      try {
        const res = await fetch('/api/wifi/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ssid: this.wifiSelectedSsid,
            password: this.wifiPassword || '',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          this.wifiError = data.error || 'Wi-Fi connect failed';
          return;
        }
        this.wifiMessage = data.message || `Connecting to ${this.wifiSelectedSsid}`;
        this.wifiStatus = data.status || this.wifiStatus;
        this.wifiPassword = '';
        setTimeout(() => this.fetchWifiStatus(), 4000);
      } catch (e) {
        this.wifiError = e.message || 'Wi-Fi connect failed';
      } finally {
        this.wifiConnectBusy = false;
      }
    },

    async connectSavedWifi(name) {
      if (!name) return;
      this.wifiConnectBusy = true;
      this.wifiError = '';
      this.wifiMessage = '';
      try {
        const res = await fetch('/api/wifi/connect_saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          this.wifiError = data.error || 'Saved Wi-Fi connect failed';
          return;
        }
        this.wifiMessage = data.message || `Connecting to ${name}`;
        this.wifiStatus = data.status || this.wifiStatus;
        setTimeout(() => this.fetchWifiStatus(), 4000);
      } catch (e) {
        this.wifiError = e.message || 'Saved Wi-Fi connect failed';
      } finally {
        this.wifiConnectBusy = false;
      }
    },

    async refreshStatus() {
      try {
        const res = await fetch('/api/status/summary');
        if (res.ok) this.systemStatus = await res.json();
      } catch {}
    },

    async fetchDetailedStatus() {
      // Round 4 #11 (2026-05-17): paint synchronously from whatever
      // we have, then pre-compute filtered service buckets so the
      // template doesn't re-run Object.entries.filter on every render
      // pass (was driving the 15-20s "Loading detailed status…" delay
      // on a 30+-service payload).
      try {
        const res = await fetch('/api/health/full');
        if (!res.ok) return;
        const data = await res.json();
        const entries = Object.entries(data.services || {});
        const startsWithAny = (k, prefixes) => prefixes.some(p => k.startsWith(p));
        const groupOf = (k) => {
          if (k.startsWith('pi_') || k === 'internet') return 'pi';
          if (k.startsWith('svc_')) return 'svc';
          if (k.startsWith('docker_')) return 'docker';
          if (k.endsWith('_api') || ['ollama_local','peerjs','pihole','google_calendar','cloudflared','rclone'].includes(k) || k.startsWith('pihole_')) return 'api';
          if (k.startsWith('net_') || k.startsWith('port_') || k === 'ports') return 'net';
          return 'other';
        };
        data._buckets = { pi: [], svc: [], docker: [], api: [], net: [], other: [] };
        for (const e of entries) data._buckets[groupOf(e[0])].push(e);
        this.detailedStatus = data;
      } catch {}
    },

    statusMatches(name, info) {
      const status = info?.status || 'unknown';
      if (this.statusFilter !== 'all' && status !== this.statusFilter) return false;
      const q = (this.statusSearch || '').trim().toLowerCase();
      if (!q) return true;
      const haystack = [
        name,
        info?.label || '',
        info?.message || '',
        info?.last_error || '',
        info?.recommended_action || '',
        info?.source_check || '',
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    },

    statusDisplayName(name, info) {
      return info?.label || name;
    },

    serviceRestartTarget(name) {
      if (!name) return '';
      if (name.startsWith('svc_')) return name.slice(4).replace(/_/g, '-');
      if (name.startsWith('docker_')) return name.slice(7);
      return name;
    },

    canRestartTarget(name) {
      const target = this.serviceRestartTarget(name);
      const allowed = new Set([
        'bmo', 'bmo-dm-bot', 'bmo-social-bot', 'bmo-kiosk', 'bmo-fan', 'cloudflared',
        'bmo-pihole', 'bmo-ollama', 'bmo-coturn', 'bmo-peerjs',
      ]);
      return allowed.has(target);
    },

    formatStatusSince(epoch, serverTime) {
      if (!epoch || !serverTime) return '';
      const secs = Math.max(0, Math.round(serverTime - epoch));
      if (secs < 60) return `${secs}s ago`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    },

    async copyText(text) {
      if (!text) return false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {}
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        return true;
      } catch {}
      return false;
    },

    async copyStatusText() {
      const ok = await this.copyText(this.$refs?.statusText?.innerText || '');
      if (!ok) return;
      this.copiedStatus = true;
      setTimeout(() => { this.copiedStatus = false; }, 2000);
    },

    async copyServiceStatus(name, info) {
      const target = this.serviceRestartTarget(name);
      const lines = [
        `${this.statusDisplayName(name, info)} (${name})`,
        `Status: ${info?.status || 'unknown'}`,
        `Message: ${info?.message || ''}`,
      ];
      if (info?.source_check) lines.push(`Source: ${info.source_check}`);
      if ((info?.failure_count || 0) > 0) lines.push(`Failure count: ${info.failure_count}`);
      if (info?.last_change && this.detailedStatus?.server_time) {
        lines.push(`Last change: ${this.formatTimestamp(info.last_change)} (${this.formatStatusSince(info.last_change, this.detailedStatus.server_time)})`);
      }
      if (info?.recommended_action) lines.push(`Fix: ${info.recommended_action}`);
      if (this.canRestartTarget(name)) lines.push(`Restart target: ${target}`);
      if (info?.recent_errors?.length) lines.push(`Recent errors: ${info.recent_errors.join(' | ')}`);
      const ok = await this.copyText(lines.join('\n'));
      if (!ok) return;
      this.statusCopiedService = name;
      setTimeout(() => { this.statusCopiedService = ''; }, 1800);
    },

    async restartSelected() {
      const targets = Object.entries(this.statusSelectedTargets || {})
        .filter(([, on]) => Boolean(on))
        .map(([target]) => target);
      if (!targets.length) {
        this.showNotification('Select at least one service/container to restart');
        return;
      }
      if (!confirm(`Restart ${targets.length} selected target(s)?`)) return;
      this.statusBulkRestartBusy = true;
      const lines = [];
      for (const target of targets) {
        try {
          const res = await fetch('/api/service/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target }),
          });
          const data = await res.json();
          if (res.ok && data.ok) lines.push(`✅ ${target}: restarted`);
          else lines.push(`❌ ${target}: ${data.message || data.error || 'failed'}`);
        } catch (e) {
          lines.push(`❌ ${target}: ${e.message || 'request failed'}`);
        }
      }
      this.statusBulkRestartBusy = false;
      this.statusSelectedTargets = {};
      alert(lines.join('\n'));
      setTimeout(() => this.fetchDetailedStatus(), 3000);
      if (targets.includes('bmo')) {
        alert('🔄 BMO restart requested. Page will reload in 8 seconds.');
        setTimeout(() => location.reload(), 8000);
      }
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

    // QA #26 (2026-05-17): suppression rules. Ambient should NOT take over
    // the screen while a modal is open, audio is actively playing, or a
    // timer is about to fire (last 60 seconds). Without this, the
    // screensaver hijacked the TV-pair PIN dialog mid-handshake and
    // covered the timer ring-down.
    _shouldSuppressAmbient() {
      if (this.showStatusDetail || this.tvPairing || this.showLyrics) return true;
      if (this.showCameraOverlay || this.showSnapPreview) return true;
      if (this.showAlarmSchedule || this.sceneEditing !== null) return true;
      if (this.musicState?.song && this.musicState?.is_playing) {
        // Allow now_playing ambient mode here — covered by enterAmbient picking
        // 'now_playing' rather than 'bmo_face'. Don't suppress outright.
      }
      if (Array.isArray(this.timerItems)) {
        for (const t of this.timerItems) {
          if (!t.fired && typeof t.remaining === 'number' && t.remaining > 0 && t.remaining <= 60) return true;
        }
      }
      // QA Round 2 #27 (2026-05-17): also defer when the user is actively
      // working — focused text input, focused button, or chat input has
      // any content. Mid-task ambient hijack was the headline complaint.
      try {
        const ae = document.activeElement;
        if (ae && ae !== document.body) {
          const tag = (ae.tagName || '').toUpperCase();
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
          if (ae.isContentEditable) return true;
        }
      } catch {}
      if ((this.chatInput || '').trim()) return true;
      if ((this.newNoteText || '').trim()) return true;
      if ((this.musicQuery || '').trim()) return true;
      return false;
    },

    resetIdleTimer() {
      if (this.ambientActive) {
        this.ambientActive = false;
      }
      clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => {
        if (this._shouldSuppressAmbient()) {
          // Reschedule instead of entering — caller will reset again on
          // the next user interaction. Short retry so we re-check soon.
          this.resetIdleTimer();
          return;
        }
        this.enterAmbient();
      }, this._idleTimeout);
    },

    enterAmbient() {
      if (this.musicState.is_playing && this.musicState.song) {
        this.ambientMode = 'now_playing';
      } else {
        this.ambientMode = 'bmo_face';
      }
      this.ambientActive = true;
      // QA #27: smooth fade-in handled by Tailwind's transition class on
      // the overlay; canvas init runs after the next tick.
      if (this.ambientMode === 'bmo_face') {
        this.$nextTick(() => this.initFaceCanvas());
      }
    },

    exitAmbient(event) {
      this._stopFaceAnimation();
      this.ambientActive = false;
      // QA #26: swallow the dismissing tap so it doesn't fall through to
      // underlying UI (otherwise the same touch that wakes the screen
      // also activates whichever button was under the overlay).
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
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

    // ── BMO face renderer (31l, 2026-05-17) ─────────────────────────
    // Mirrors the OLED 128×64 coordinate system exactly so the web
    // ambient face and the physical OLED show the same expression with
    // matching proportions. The OLED's `_render_<name>` in
    // hardware/oled_face.py is the spec; methods here port each one to
    // canvas via _logical*() helpers that scale 128×64 → 320×160 centered
    // in the 240-tall canvas. To add a new expression: implement
    // hardware/oled_face.py:_render_<name>, then mirror the same drawing
    // commands here.
    _faceLogical: { W: 128, H: 64, scaleX: 2.5, scaleY: 2.5, offY: 40 },

    _logicalToCanvas(x, y) {
      const f = this._faceLogical;
      return [x * f.scaleX, y * f.scaleY + f.offY];
    },

    _logicalLine(ctx, x1, y1, x2, y2, color, width) {
      const [cx1, cy1] = this._logicalToCanvas(x1, y1);
      const [cx2, cy2] = this._logicalToCanvas(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = (width || 1) * this._faceLogical.scaleX * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx1, cy1);
      ctx.lineTo(cx2, cy2);
      ctx.stroke();
    },

    _logicalRoundedRect(ctx, x, y, w, h, r, color, fill) {
      const f = this._faceLogical;
      const [cx, cy] = this._logicalToCanvas(x, y);
      const cw = w * f.scaleX, ch = h * f.scaleY, cr = r * f.scaleX;
      ctx.beginPath();
      ctx.moveTo(cx + cr, cy);
      ctx.lineTo(cx + cw - cr, cy);
      ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + cr);
      ctx.lineTo(cx + cw, cy + ch - cr);
      ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - cr, cy + ch);
      ctx.lineTo(cx + cr, cy + ch);
      ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - cr);
      ctx.lineTo(cx, cy + cr);
      ctx.quadraticCurveTo(cx, cy, cx + cr, cy);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    },

    _logicalEllipse(ctx, x0, y0, x1, y1, color, fill) {
      // Matches PIL.ImageDraw.ellipse — bounding-box form.
      const f = this._faceLogical;
      const [cx0, cy0] = this._logicalToCanvas(x0, y0);
      const [cx1, cy1] = this._logicalToCanvas(x1, y1);
      const cx = (cx0 + cx1) / 2;
      const cy = (cy0 + cy1) / 2;
      const rx = (cx1 - cx0) / 2;
      const ry = (cy1 - cy0) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fill !== undefined && fill !== null) {
        ctx.fillStyle = fill; ctx.fill();
      }
      if (color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    },

    _logicalArc(ctx, x0, y0, x1, y1, startDeg, endDeg, color, width) {
      // PIL arc: degrees, 0 is east, sweeps clockwise.
      const f = this._faceLogical;
      const [cx0, cy0] = this._logicalToCanvas(x0, y0);
      const [cx1, cy1] = this._logicalToCanvas(x1, y1);
      const cx = (cx0 + cx1) / 2, cy = (cy0 + cy1) / 2;
      const rx = (cx1 - cx0) / 2, ry = (cy1 - cy0) / 2;
      const startRad = startDeg * Math.PI / 180;
      const endRad = endDeg * Math.PI / 180;
      ctx.strokeStyle = color;
      ctx.lineWidth = (width || 1) * this._faceLogical.scaleX * 0.4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, startRad, endRad);
      ctx.stroke();
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

      // Unified state from face_state SocketIO event (31h) — falls back to
      // legacy _faceState/_faceEmotion for back-compat with older clients.
      const state = this._faceState || this._faceEmotion || 'idle';

      switch (state) {
        case 'listening':       this._drawListening(ctx, green, pupilColor); break;
        case 'thinking':        this._drawThinking(ctx, green, pupilColor); break;
        case 'speaking':
        case 'yapping':         this._drawSpeaking(ctx, green); break;
        case 'follow_up':       this._drawListening(ctx, green, pupilColor); break;
        case 'happy':           this._drawHappy(ctx, green); break;
        case 'excited':         this._drawExcited(ctx, green, pupilColor); break;
        case 'surprised':       this._drawSurprised(ctx, green, pupilColor); break;
        case 'concerned':
        case 'sad':             this._drawConcerned(ctx, green, pupilColor); break;
        case 'scared':          this._drawScared(ctx, green, pupilColor); break;
        case 'sleepy':
        case 'sleeping':        this._drawSleepy(ctx, green); break;
        case 'error':           this._drawError(ctx, green); break;
        case 'mischievous':     this._drawMischievous(ctx, green, pupilColor); break;
        case 'looking_around':  this._drawLookingAround(ctx, green, pupilColor); break;
        default:                this._drawIdle(ctx, green, pupilColor); break;
      }

      // Render BMO body frame outline (the show's pixel-accurate corners).
      // The face itself sits inside this rounded screen rect.
      // Clear ambient emotion after ~5s so face returns to baseline.
      if (this._faceEmotion && this._faceFrame % 300 === 299) {
        this._faceEmotion = null;
      }
    },

    // Compatibility wrappers — old _drawFaceOutline / _drawEllipse calls
    // (kept for any external callers; new code should use _logical*).
    _drawFaceOutline(ctx, _W, _H, color) {
      // Canonical BMO screen outline — matches OLED's rounded_rectangle
      // [10, 4, 118, 60] radius=8 exactly.
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, color);
    },
    _drawEllipse(ctx, cx, cy, rx, ry, fill, stroke) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    },

    _drawIdle(ctx, green, pupilColor) {
      // Mirrors hardware/oled_face.py:_render_idle exactly (128×64 coords).
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);

      // Blink at ~60fps: open ~5s, closed ~12 frames (~200ms)
      this._faceBlink++;
      if (this._faceBlink >= 300) {
        this._faceBlinkState = true;
        if (this._faceBlink >= 312) {
          this._faceBlinkState = false;
          this._faceBlink = 0;
        }
      }

      // Look-around: target every ~8s, smooth interp toward it
      this._faceLookTimer++;
      if (this._faceLookTimer >= 480) {
        this._faceLookTarget = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
        if (this._faceLookTimer >= 600) { this._faceLookTarget = 0; this._faceLookTimer = 0; }
      }
      const diff = this._faceLookTarget - this._faceLookOffset;
      if (Math.abs(diff) > 0.05) this._faceLookOffset += diff * 0.08;
      else this._faceLookOffset = this._faceLookTarget;
      const pupilShift = this._faceLookOffset * 3;  // OLED uses 3 logical px

      if (this._faceBlinkState) {
        // OLED blink: horizontal lines [35,25]→[50,25] and [78,25]→[93,25]
        this._logicalLine(ctx, 35, 25, 50, 25, green, 2);
        this._logicalLine(ctx, 78, 25, 93, 25, green, 2);
      } else {
        // OLED open eyes: ellipse [35,18,50,32] filled, pupils shifted by look
        const ps = pupilShift;
        this._logicalEllipse(ctx, 35, 18, 50, 32, green, green);
        this._logicalEllipse(ctx, 78, 18, 93, 32, green, green);
        this._logicalEllipse(ctx, 40 + ps, 22, 45 + ps, 28, pupilColor, pupilColor);
        this._logicalEllipse(ctx, 83 + ps, 22, 88 + ps, 28, pupilColor, pupilColor);
      }

      // OLED mouth: line [52,44]→[76,44]
      this._logicalLine(ctx, 52, 44, 76, 44, green, 1);
    },

    _drawListening(ctx, green, pupilColor) {
      // Mirrors hardware/oled_face.py:_render_listening
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);

      // Wide open eyes [32,14,52,34] + [76,14,96,34] filled
      this._logicalEllipse(ctx, 32, 14, 52, 34, green, green);
      this._logicalEllipse(ctx, 76, 14, 96, 34, green, green);
      // Large pupils [38,20,46,28] + [82,20,90,28]
      this._logicalEllipse(ctx, 38, 20, 46, 28, pupilColor, pupilColor);
      this._logicalEllipse(ctx, 82, 20, 90, 28, pupilColor, pupilColor);

      // Small 'o' mouth [58,40,70,50] outline only
      this._logicalEllipse(ctx, 58, 40, 70, 50, green, null);

      // Ear dots (perked)
      this._logicalEllipse(ctx, 14, 18, 18, 22, green, green);
      this._logicalEllipse(ctx, 14, 26, 18, 30, green, green);
      this._logicalEllipse(ctx, 110, 18, 114, 22, green, green);
      this._logicalEllipse(ctx, 110, 26, 114, 30, green, green);

      // Pulsing mic arcs
      if (this._faceFrame % 10 < 5) {
        this._logicalArc(ctx, 2, 20, 12, 44, 270, 450, green, 1);  // 270→90
        this._logicalArc(ctx, 116, 20, 126, 44, 90, 270, green, 1);
      }
    },

    _drawThinking(ctx, green, pupilColor) {
      // Mirrors hardware/oled_face.py:_render_thinking
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);

      // Eyes looking up-right (filled ovals + pupils shifted up-right)
      this._logicalEllipse(ctx, 35, 18, 50, 32, green, green);
      this._logicalEllipse(ctx, 78, 18, 93, 32, green, green);
      this._logicalEllipse(ctx, 43, 19, 48, 25, pupilColor, pupilColor);
      this._logicalEllipse(ctx, 86, 19, 91, 25, pupilColor, pupilColor);

      // Slight frown — OLED arc [50,44,78,54] 180→360
      this._logicalArc(ctx, 50, 44, 78, 54, 180, 360, green, 1);

      // Rotating dots — small circles orbiting (64,46) at logical r=8
      this._faceThinkAngle += 0.04;
      const cx = 64, cy = 46, orbit = 8;
      for (let i = 0; i < 3; i++) {
        const a = this._faceThinkAngle + (i * Math.PI * 2 / 3);
        const x = cx + orbit * Math.cos(a);
        const y = cy + orbit * Math.sin(a);
        const sz = i === 0 ? 2 : 1.5;
        this._logicalEllipse(ctx, x - sz, y - sz, x + sz, y + sz, green, green);
      }
    },

    _drawSpeaking(ctx, green) {
      // Mirrors hardware/oled_face.py:_render_speaking
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);

      // Happy squint arcs — OLED arcs 200→340 over eye area
      this._logicalArc(ctx, 35, 22, 50, 32, 200, 340, green, 2);
      this._logicalArc(ctx, 78, 22, 93, 32, 200, 340, green, 2);

      // Animated mouth — opens and closes
      const m = Math.abs(Math.sin(this._faceFrame * 0.15)) * 5 + 3;
      this._logicalEllipse(ctx, 56, 42 - m / 2, 72, 42 + m / 2, green, null);
    },

    _drawHappy(ctx, green) {
      // Mirrors hardware/oled_face.py:_render_happy
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);

      // Happy curved eyes (squinted ^ ^)
      this._logicalArc(ctx, 33, 18, 52, 32, 200, 340, green, 2);
      this._logicalArc(ctx, 76, 18, 95, 32, 200, 340, green, 2);

      // Big smile — wide arc
      this._logicalArc(ctx, 38, 36, 90, 54, 20, 160, green, 2);
    },

    _drawExcited(ctx, green, pupilColor) {
      // Wide open eyes + huge open mouth + bouncing accent
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);
      const bounce = Math.sin(this._faceFrame * 0.25) * 1.5;
      this._logicalEllipse(ctx, 32, 14 + bounce, 52, 34 + bounce, green, green);
      this._logicalEllipse(ctx, 76, 14 + bounce, 96, 34 + bounce, green, green);
      this._logicalEllipse(ctx, 38, 20 + bounce, 46, 28 + bounce, pupilColor, pupilColor);
      this._logicalEllipse(ctx, 82, 20 + bounce, 90, 28 + bounce, pupilColor, pupilColor);
      // Wide open smile
      this._logicalArc(ctx, 36, 36, 92, 56, 10, 170, green, 2);
    },

    _drawSurprised(ctx, green, pupilColor) {
      // Big wide-open eyes + small 'o' mouth
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);
      this._logicalEllipse(ctx, 30, 12, 54, 36, green, green);
      this._logicalEllipse(ctx, 74, 12, 98, 36, green, green);
      this._logicalEllipse(ctx, 38, 20, 46, 28, pupilColor, pupilColor);
      this._logicalEllipse(ctx, 82, 20, 90, 28, pupilColor, pupilColor);
      // Small O mouth — circle
      this._logicalEllipse(ctx, 60, 42, 68, 50, green, null);
    },

    _drawConcerned(ctx, green, pupilColor) {
      // Droopy eyes + frown
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);
      // Droopy eyes (slightly closed bottom)
      this._logicalEllipse(ctx, 35, 20, 50, 30, green, green);
      this._logicalEllipse(ctx, 78, 20, 93, 30, green, green);
      this._logicalEllipse(ctx, 40, 23, 45, 28, pupilColor, pupilColor);
      this._logicalEllipse(ctx, 83, 23, 88, 28, pupilColor, pupilColor);
      // Concerned brows — angled down toward center
      this._logicalLine(ctx, 30, 14, 50, 18, green, 1);
      this._logicalLine(ctx, 78, 18, 98, 14, green, 1);
      // Frown — inverted arc
      this._logicalArc(ctx, 50, 46, 78, 56, 180, 360, green, 1);
    },

    _drawScared(ctx, green, pupilColor) {
      // Mirrors hardware/oled_face.py:_render_scared — trembling outline
      const off = this._faceFrame % 12 < 6 ? 1 : -1;
      this._logicalRoundedRect(ctx, 10 + off, 4, 108, 56, 8, green);
      // Wide scared eyes (filled large)
      this._logicalEllipse(ctx, 30, 14, 54, 38, green, green);
      this._logicalEllipse(ctx, 74, 14, 98, 38, green, green);
      this._logicalEllipse(ctx, 39, 18, 45, 26, pupilColor, pupilColor);
      this._logicalEllipse(ctx, 83, 18, 89, 26, pupilColor, pupilColor);
      // Small O mouth
      this._logicalEllipse(ctx, 58, 44, 70, 54, green, null);
    },

    _drawSleepy(ctx, green) {
      // Mirrors hardware/oled_face.py:_render_sleeping — closed eyes + Zzz
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);
      // Closed eyes (horizontal lines)
      this._logicalLine(ctx, 35, 25, 50, 25, green, 2);
      this._logicalLine(ctx, 78, 25, 93, 25, green, 2);
      // Slight smile
      this._logicalArc(ctx, 50, 40, 78, 50, 20, 160, green, 1);
      // Animated Zzz — three Zs scaling up
      const phase = Math.floor(this._faceFrame / 50) % 3;
      const ctxFont = ctx;
      ctxFont.fillStyle = green;
      for (let i = 0; i <= phase; i++) {
        const [zx, zy] = this._logicalToCanvas(96 + i * 6, 20 - i * 8);
        const sz = 14 + i * 5;
        ctxFont.font = `bold ${sz}px monospace`;
        ctxFont.fillText('Z', zx, zy);
      }
    },

    _drawError(ctx, green) {
      // Mirrors hardware/oled_face.py:_render_error — X eyes
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);
      this._logicalLine(ctx, 35, 18, 50, 32, green, 2);
      this._logicalLine(ctx, 50, 18, 35, 32, green, 2);
      this._logicalLine(ctx, 78, 18, 93, 32, green, 2);
      this._logicalLine(ctx, 93, 18, 78, 32, green, 2);
      // Frown
      this._logicalArc(ctx, 50, 44, 78, 56, 180, 360, green, 2);
    },

    _drawMischievous(ctx, green, pupilColor) {
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);
      // Angled brows
      this._logicalLine(ctx, 32, 22, 50, 16, green, 1);
      this._logicalLine(ctx, 78, 16, 96, 22, green, 1);
      // Narrowed eyes
      this._logicalEllipse(ctx, 35, 22, 50, 30, green, green);
      this._logicalEllipse(ctx, 78, 22, 93, 30, green, green);
      this._logicalEllipse(ctx, 40, 24, 45, 28, pupilColor, pupilColor);
      this._logicalEllipse(ctx, 83, 24, 88, 28, pupilColor, pupilColor);
      // Wide grin
      this._logicalArc(ctx, 36, 36, 92, 54, 5, 175, green, 2);
    },

    _drawLookingAround(ctx, green, pupilColor) {
      // Procedural — explicit "looking around" with pronounced pupil drift,
      // small head-tilt feel via slightly larger sweep than idle's subtle range.
      this._logicalRoundedRect(ctx, 10, 4, 108, 56, 8, green);
      // Faster look cycle than idle
      this._faceLookTimer++;
      if (this._faceLookTimer >= 180) {
        this._faceLookTarget = [-1, 1, 0, -1, 1][Math.floor(Math.random() * 5)];
        if (this._faceLookTimer >= 240) { this._faceLookTimer = 0; }
      }
      const diff = this._faceLookTarget - this._faceLookOffset;
      if (Math.abs(diff) > 0.05) this._faceLookOffset += diff * 0.12;
      else this._faceLookOffset = this._faceLookTarget;
      const ps = this._faceLookOffset * 4;  // wider sweep than idle

      this._logicalEllipse(ctx, 35, 18, 50, 32, green, green);
      this._logicalEllipse(ctx, 78, 18, 93, 32, green, green);
      this._logicalEllipse(ctx, 40 + ps, 22, 45 + ps, 28, pupilColor, pupilColor);
      this._logicalEllipse(ctx, 83 + ps, 22, 88 + ps, 28, pupilColor, pupilColor);
      // Same neutral mouth
      this._logicalLine(ctx, 52, 44, 76, 44, green, 1);
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

