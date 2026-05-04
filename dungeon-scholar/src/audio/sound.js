// Web-Audio backed soundtrack + SFX engine for Dungeon Scholar.
//
// All audio is *procedural* — no audio files are bundled — so this module
// stays small and works fully offline. Each biome has a small chord
// progression and a base oscillator pair that loops indefinitely until
// stopBgm() is called.
//
// Settings are persisted to localStorage so the player's mute / volume
// choice survives reloads. The first user gesture on the page resumes
// the AudioContext (browsers suspend it until interaction).

const STORAGE_KEY = 'dungeon-scholar-audio-settings';

const DEFAULT_SETTINGS = {
  muted: true,        // Default mute so the page is silent until the player opts in.
  bgmVolume: 0.4,
  sfxVolume: 0.6,
};

let ctx = null;
let masterGain = null;
let bgmGain = null;
let sfxGain = null;
let bgmNodes = [];     // Active oscillators / gains for the BGM loop.
let bgmTimer = null;   // setTimeout id used to schedule the next phrase.
let currentBgmId = null;
let settings = { ...DEFAULT_SETTINGS };

const loadSettings = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    settings = { ...DEFAULT_SETTINGS, ...parsed };
  } catch { /* corrupted blob — keep defaults */ }
};

const saveSettings = () => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* quota / private mode — best effort */ }
};

loadSettings();

const ensureContext = () => {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = settings.muted ? 0 : 1;
    masterGain.connect(ctx.destination);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = settings.bgmVolume;
    bgmGain.connect(masterGain);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = settings.sfxVolume;
    sfxGain.connect(masterGain);
  }
  if (ctx.state === 'suspended') {
    // Resume after first gesture — caller wraps user-initiated taps.
    ctx.resume().catch(() => {});
  }
  return ctx;
};

export const getAudioSettings = () => ({ ...settings });

export const setMuted = (muted) => {
  settings.muted = !!muted;
  saveSettings();
  if (masterGain) masterGain.gain.value = settings.muted ? 0 : 1;
};

export const setBgmVolume = (v) => {
  settings.bgmVolume = Math.min(1, Math.max(0, v));
  saveSettings();
  if (bgmGain) bgmGain.gain.value = settings.bgmVolume;
};

export const setSfxVolume = (v) => {
  settings.sfxVolume = Math.min(1, Math.max(0, v));
  saveSettings();
  if (sfxGain) sfxGain.gain.value = settings.sfxVolume;
};

// === BGM phrase definitions =============================================
// Each biome maps to a list of MIDI note triplets. The loop plays them
// at a slow, dungeon-y tempo with a soft pad oscillator on top.

const NOTE = (n, durSec) => ({ n, d: durSec });

// MIDI 60 = C4. We're working in low octaves for ambience.
const BGM_PHRASES = {
  crypt: [
    NOTE(43, 1.6), NOTE(46, 1.6), NOTE(48, 1.6), NOTE(50, 2.4),
    NOTE(48, 1.6), NOTE(46, 1.6), NOTE(43, 2.4),
  ],
  sewers: [
    NOTE(40, 1.4), NOTE(45, 1.4), NOTE(43, 1.4), NOTE(48, 1.4),
    NOTE(45, 1.4), NOTE(43, 2.0),
  ],
  tower: [
    NOTE(50, 1.2), NOTE(52, 1.2), NOTE(55, 1.2), NOTE(57, 1.6),
    NOTE(55, 1.2), NOTE(52, 1.2), NOTE(50, 2.0),
  ],
  halls: [
    NOTE(38, 1.8), NOTE(43, 1.8), NOTE(45, 1.8), NOTE(48, 2.0),
    NOTE(45, 1.8), NOTE(43, 1.8),
  ],
  wastes: [
    NOTE(45, 1.5), NOTE(48, 1.5), NOTE(50, 1.5), NOTE(52, 2.0),
    NOTE(50, 1.5), NOTE(48, 1.5), NOTE(45, 2.0),
  ],
  hearth: [
    NOTE(48, 2.0), NOTE(52, 2.0), NOTE(55, 2.0), NOTE(57, 2.0),
    NOTE(55, 2.0), NOTE(52, 2.0),
  ],
};

const midiToHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

const playPhrase = (phrase, biomeId) => {
  if (!ctx || !bgmGain) return 0;
  let elapsed = 0;
  phrase.forEach(({ n, d }) => {
    const startAt = ctx.currentTime + elapsed;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(midiToHz(n), startAt);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(0.18, startAt + 0.4);
    g.gain.linearRampToValueAtTime(0.0, startAt + d);
    osc.connect(g);
    g.connect(bgmGain);
    osc.start(startAt);
    osc.stop(startAt + d + 0.1);
    bgmNodes.push(osc, g);

    // Pad layer — fifth above for warmth.
    const pad = ctx.createOscillator();
    pad.type = 'triangle';
    pad.frequency.setValueAtTime(midiToHz(n + 7), startAt);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0, startAt);
    pg.gain.linearRampToValueAtTime(0.06, startAt + 0.6);
    pg.gain.linearRampToValueAtTime(0.0, startAt + d);
    pad.connect(pg);
    pg.connect(bgmGain);
    pad.start(startAt);
    pad.stop(startAt + d + 0.1);
    bgmNodes.push(pad, pg);

    elapsed += d;
  });
  return elapsed;
};

const cleanupBgmNodes = () => {
  bgmNodes.forEach((node) => {
    try { node.disconnect(); } catch { /* already disconnected */ }
  });
  bgmNodes = [];
};

export const startBgm = (biomeId) => {
  ensureContext();
  if (!ctx) return;
  if (currentBgmId === biomeId) return;
  stopBgm();
  const phrase = BGM_PHRASES[biomeId] || BGM_PHRASES.hearth;
  currentBgmId = biomeId;
  const loop = () => {
    if (currentBgmId !== biomeId) return;
    const dur = playPhrase(phrase, biomeId);
    bgmTimer = setTimeout(loop, Math.max(500, dur * 1000 - 200));
  };
  loop();
};

export const stopBgm = () => {
  currentBgmId = null;
  if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = null; }
  cleanupBgmNodes();
};

// === SFX ================================================================
// Single short bursts — frequency-swept tones generated from oscillators.

const sfxPlayTone = ({ freq, freqEnd, durMs, type = 'sine', gainPeak = 0.3 }) => {
  if (!ctx || !sfxGain) return;
  const t0 = ctx.currentTime;
  const t1 = t0 + durMs / 1000;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (typeof freqEnd === 'number') {
    osc.frequency.linearRampToValueAtTime(freqEnd, t1);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
  g.gain.linearRampToValueAtTime(0, t1);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(t0);
  osc.stop(t1 + 0.05);
};

// SFX presets keyed by name. Each is a small array of tones played in
// sequence so the call site stays a one-liner.
const SFX_PRESETS = {
  click:        [{ freq: 660, freqEnd: 880, durMs: 70,  type: 'square',   gainPeak: 0.25 }],
  step:         [{ freq: 220, freqEnd: 180, durMs: 60,  type: 'sine',     gainPeak: 0.1  }],
  hit:          [{ freq: 320, freqEnd: 90,  durMs: 180, type: 'sawtooth', gainPeak: 0.35 }],
  hurt:         [{ freq: 480, freqEnd: 110, durMs: 240, type: 'square',   gainPeak: 0.32 }],
  victory:      [
    { freq: 523, freqEnd: 659, durMs: 180, type: 'triangle', gainPeak: 0.32 },
    { freq: 784, freqEnd: 988, durMs: 220, type: 'triangle', gainPeak: 0.32 },
  ],
  defeat:       [
    { freq: 220, freqEnd: 110, durMs: 320, type: 'sawtooth', gainPeak: 0.32 },
    { freq: 165, freqEnd: 82,  durMs: 420, type: 'sawtooth', gainPeak: 0.28 },
  ],
  pickup:       [{ freq: 988, freqEnd: 1318, durMs: 120, type: 'triangle', gainPeak: 0.3 }],
  cast:         [
    { freq: 880, freqEnd: 1320, durMs: 100, type: 'sine', gainPeak: 0.28 },
    { freq: 660, freqEnd: 1100, durMs: 120, type: 'sine', gainPeak: 0.22 },
  ],
  levelup:      [
    { freq: 523, freqEnd: 784, durMs: 160, type: 'triangle', gainPeak: 0.32 },
    { freq: 659, freqEnd: 988, durMs: 160, type: 'triangle', gainPeak: 0.32 },
    { freq: 784, freqEnd: 1175, durMs: 220, type: 'triangle', gainPeak: 0.32 },
  ],
  chest:        [
    { freq: 440, freqEnd: 660, durMs: 100, type: 'square', gainPeak: 0.28 },
    { freq: 660, freqEnd: 880, durMs: 140, type: 'square', gainPeak: 0.28 },
  ],
};

export const playSfx = (name) => {
  ensureContext();
  if (!ctx) return;
  const preset = SFX_PRESETS[name];
  if (!preset) return;
  let delay = 0;
  preset.forEach((tone) => {
    setTimeout(() => sfxPlayTone(tone), delay);
    delay += Math.max(40, (tone.durMs || 0) * 0.7);
  });
};

// Some browsers block AudioContext until the first user gesture. Bind
// once at app start so the next click/keypress unmutes silently.
let gestureHandler = null;
export const armOnFirstGesture = () => {
  if (typeof window === 'undefined' || gestureHandler) return;
  gestureHandler = () => {
    ensureContext();
    window.removeEventListener('pointerdown', gestureHandler, true);
    window.removeEventListener('keydown', gestureHandler, true);
    gestureHandler = null;
  };
  window.addEventListener('pointerdown', gestureHandler, true);
  window.addEventListener('keydown', gestureHandler, true);
};
