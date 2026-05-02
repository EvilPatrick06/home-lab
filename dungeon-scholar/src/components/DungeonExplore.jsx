// Dungeon Delve — top-down RPG view that replaces the old wave-based delve.
// Player walks the world; bumping into mobs opens a battle modal that asks
// a question from the active tome. Correct = mob defeated. Wrong = -1 HP.
// Reach the boss room and survive its 5-question gauntlet to win the run.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

// === Equipment effects ==================================================
// In-dungeon stat bonuses for equipped items. Items live in App.jsx ITEMS;
// these effects apply only inside the delve.
const EQUIP_EFFECTS = {
  iron_circlet:    { maxHpBonus: 1 },
  silver_circlet:  { maxHpBonus: 1, shieldBonus: 1 },
  starbound_cloak: { firstWrongFree: true },
  oaken_blade:     { mobScoreBonus: 1 },
  gilded_sabre:    { goldMul: 1.5 },
  arcane_grimoire: { xpMul: 1.25 },
};

// === Potion effects =====================================================
// Quick-slotted potion behaviors when used inside the dungeon.
const POTION_EFFECTS = {
  minor_heal_tonic:   { kind: 'heal',    amount: 1, label: 'Healing Tonic' },
  greater_heal_tonic: { kind: 'heal',    amount: 2, label: 'Greater Draught' },
  shield_draught:     { kind: 'shield',  amount: 1, label: 'Shield Draught' },
  phoenix_ember:      { kind: 'revive',             label: 'Phoenix Ember' },
  scholars_brew:      { kind: 'xp_buff', questions: 3, label: "Scholar's Brew" },
  foresight_scroll:   { kind: 'noop',               label: 'Foresight Scroll' },
  tinkers_oil:        { kind: 'noop',               label: "Tinker's Oil" },
};
// Display info for the in-dungeon potion HUD (icons mirror App.jsx ITEMS).
const POTION_INFO = {
  minor_heal_tonic:   { icon: '🧪', name: 'Healing Tonic' },
  greater_heal_tonic: { icon: '⚗️', name: 'Greater Draught' },
  shield_draught:     { icon: '🛡️', name: 'Shield Draught' },
  phoenix_ember:      { icon: '🔥', name: 'Phoenix Ember' },
  scholars_brew:      { icon: '☕', name: "Scholar's Brew" },
  foresight_scroll:   { icon: '📜', name: 'Foresight Scroll' },
  tinkers_oil:        { icon: '🪔', name: "Tinker's Oil" },
};

export const TILE = {
  WALL: 0,
  FLOOR: 1,
  DOOR: 2,
  STAIRS_UP: 3,
  STAIRS_DOWN: 4,
};

const TILE_PX = 48;
const VIEW_W = 25;
const VIEW_H = 17;
const CANVAS_W = VIEW_W * TILE_PX;
const CANVAS_H = VIEW_H * TILE_PX;
const MOVE_MS = 110;
const WALK_FRAME_MS = 100;
// Held-key movement: after the initial keydown move, repeat at this cadence.
const HOLD_REPEAT_MS = 130;
const MOB_MOVE_MIN_MS = 1400;
const MOB_MOVE_MAX_MS = 2800;

const isWalkable = (t) => t === TILE.FLOOR || t === TILE.DOOR || t === TILE.STAIRS_UP || t === TILE.STAIRS_DOWN;

const DIR_DELTAS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// === Biomes ============================================================
export const BIOMES = {
  crypt: {
    id: 'crypt', name: 'Crypt of Cryptography', icon: '🗝️',
    flavor: 'Mossy stone tombs, encoded sigils etched on every wall.',
    accent: 'rgba(168, 85, 247, 0.4)', accentSolid: '#a855f7',
    palette: {
      wallBase: '#1a1422', wallTop: '#2a1f36', wallShade: '#0d0814', wallDetail: '#a855f7',
      floorBase: '#241a30', floorAlt: '#2a2038', floorDetail: '#3d2a48', floorAccent: '#7c3aed',
    },
    decoChance: 0.12,
  },
  sewers: {
    id: 'sewers', name: 'Sewers of OWASP', icon: '🕸️',
    flavor: 'Dripping pipes and graffiti scrawled by long-departed pen-testers.',
    accent: 'rgba(16, 185, 129, 0.4)', accentSolid: '#10b981',
    palette: {
      wallBase: '#1a2820', wallTop: '#284030', wallShade: '#0e1c14', wallDetail: '#10b981',
      floorBase: '#142820', floorAlt: '#1a3024', floorDetail: '#284030', floorAccent: '#10b981',
    },
    decoChance: 0.18,
  },
  tower: {
    id: 'tower', name: 'Tower of Network Defense', icon: '🗼',
    flavor: 'Glittering steel walkways, every door a port — opened or sealed.',
    accent: 'rgba(59, 130, 246, 0.4)', accentSolid: '#3b82f6',
    palette: {
      wallBase: '#1c2838', wallTop: '#2a4060', wallShade: '#0e1828', wallDetail: '#3b82f6',
      floorBase: '#16243a', floorAlt: '#1c2c44', floorDetail: '#2a3c5c', floorAccent: '#60a5fa',
    },
    decoChance: 0.15,
  },
  halls: {
    id: 'halls', name: 'Halls of the Hardware', icon: '⚙️',
    flavor: 'Ancient circuitry pulses behind iron grates, fans humming low.',
    accent: 'rgba(245, 158, 11, 0.4)', accentSolid: '#f59e0b',
    palette: {
      wallBase: '#2a1a14', wallTop: '#4a2a1c', wallShade: '#1a0e0a', wallDetail: '#f59e0b',
      floorBase: '#2a1c14', floorAlt: '#3a2418', floorDetail: '#4a2e1c', floorAccent: '#fbbf24',
    },
    decoChance: 0.14,
  },
  wastes: {
    id: 'wastes', name: 'Wastes of WiFi', icon: '📡',
    flavor: 'A windswept plain where signals scream and antennas sway.',
    accent: 'rgba(217, 119, 6, 0.4)', accentSolid: '#d97706',
    palette: {
      wallBase: '#3a3018', wallTop: '#5a4a28', wallShade: '#241c0e', wallDetail: '#d97706',
      floorBase: '#3a2e16', floorAlt: '#4a3c20', floorDetail: '#5a4830', floorAccent: '#fbbf24',
    },
    decoChance: 0.20,
  },
};

const BIOME_IDS = Object.keys(BIOMES);

const SUBJECT_BIOME_RULES = [
  { biome: 'crypt',  re: /crypt|encryption|pki|cipher|hash/i },
  { biome: 'sewers', re: /owasp|appsec|web|injection|xss|sqli/i },
  { biome: 'tower',  re: /network|cisco|firewall|routing|switch|cloud|aws|azure|gcp/i },
  { biome: 'halls',  re: /hardware|endpoint|device|memory|registry|kernel/i },
  { biome: 'wastes', re: /wifi|wireless|802\.11|radio|bluetooth/i },
];

export function pickBiomeForSubject(subject, rng = Math.random) {
  if (subject) {
    for (const rule of SUBJECT_BIOME_RULES) {
      if (rule.re.test(subject)) return rule.biome;
    }
    let h = 0;
    for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) | 0;
    return BIOME_IDS[Math.abs(h) % BIOME_IDS.length];
  }
  return BIOME_IDS[Math.floor(rng() * BIOME_IDS.length)];
}

// === Room templates =====================================================
const ROOM_TEMPLATES = [
  { id: 'rect-l', tiles: [
    [1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1],
  ]},
  { id: 'rect-s', tiles: [
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
  ]},
  { id: 'hall-h', tiles: [
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1],
  ]},
  { id: 'hall-v', tiles: [
    [1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],
  ]},
  { id: 'l-shape', tiles: [
    [1,1,1,1,0,0,0,0],
    [1,1,1,1,0,0,0,0],
    [1,1,1,1,0,0,0,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
  ]},
  { id: 'cross', tiles: [
    [0,0,1,1,1,0,0],
    [0,0,1,1,1,0,0],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [0,0,1,1,1,0,0],
    [0,0,1,1,1,0,0],
  ]},
  { id: 'pillars', tiles: [
    [1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1],
    [1,1,0,1,1,1,0,1,1],
    [1,1,1,1,1,1,1,1,1],
    [1,1,0,1,1,1,0,1,1],
    [1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1],
  ]},
  { id: 'round', tiles: [
    [0,1,1,1,1,1,0],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [0,1,1,1,1,1,0],
  ]},
];

export const ROOMS_BY_DIFFICULTY = { apprentice: 8, adept: 12, master: 18, mythic: 24 };
export const SIZE_BY_DIFFICULTY = {
  apprentice: { w: 80,  h: 55 },
  adept:      { w: 100, h: 70 },
  master:     { w: 130, h: 90 },
  mythic:     { w: 160, h: 110 },
};

// HP, shields, XP/gold multipliers per difficulty.
export const DIFF_CONFIG = {
  apprentice: { hp: 5, shields: 2, xpMul: 1,   goldMul: 1,    label: 'Apprentice', completeAchievement: null,             rewardTitleId: null },
  adept:      { hp: 4, shields: 2, xpMul: 1.5, goldMul: 1.25, label: 'Adept',      completeAchievement: 'adept_complete',  rewardTitleId: 'adeptVeteran' },
  master:     { hp: 2, shields: 1, xpMul: 2,   goldMul: 1.5,  label: 'Master',     completeAchievement: 'master_complete', rewardTitleId: 'masterSlayer' },
  mythic:     { hp: 1, shields: 0, xpMul: 3,   goldMul: 2,    label: 'Mythic',     completeAchievement: 'mythic_complete', rewardTitleId: 'mythicSage' },
};

// Biome → boss kind. IDs match BOSS_TYPES in App.jsx for run-history display.
const DECO_BY_BIOME = {
  crypt:  ['bones', 'candle', 'dead_branch', 'moss_patch', 'nightshade'],
  sewers: ['mushroom', 'puddle', 'algae', 'fern', 'rot_flower'],
  tower:  ['terminal', 'cable', 'bonsai', 'ivy', 'crystal'],
  halls:  ['gear', 'capacitor', 'pipe_vine', 'rust_flower', 'steam_fern'],
  wastes: ['cactus', 'antenna', 'tumbleweed', 'wildflower', 'desert_brush'],
};
// Per-mob behavior. tier = basic|elite (elites trigger 3-question fights and
// render with a glowing aura). ai = idle|patrol|aggressive.
//   - idle: don't move
//   - patrol: bounce horizontally within the room
//   - aggressive: chase if the player is within MOB_AGGRO_RANGE Manhattan
//     tiles and inside the room; otherwise wander
const MOB_DEFS = {
  // Crypt
  wraith:    { biome: 'crypt',  tier: 'basic', ai: 'patrol' },
  skeleton:  { biome: 'crypt',  tier: 'basic', ai: 'aggressive' },
  shade:     { biome: 'crypt',  tier: 'elite', ai: 'patrol' },
  // Sewers
  slime:     { biome: 'sewers', tier: 'basic', ai: 'idle' },
  rat:       { biome: 'sewers', tier: 'basic', ai: 'aggressive' },
  ooze:      { biome: 'sewers', tier: 'elite', ai: 'patrol' },
  // Tower
  sentry:    { biome: 'tower',  tier: 'basic', ai: 'idle' },
  drone:     { biome: 'tower',  tier: 'basic', ai: 'aggressive' },
  firewall:  { biome: 'tower',  tier: 'elite', ai: 'patrol' },
  // Halls
  spark:     { biome: 'halls',  tier: 'basic', ai: 'patrol' },
  imp:       { biome: 'halls',  tier: 'basic', ai: 'aggressive' },
  sentinel:  { biome: 'halls',  tier: 'elite', ai: 'idle' },
  // Wastes
  scorpion:  { biome: 'wastes', tier: 'basic', ai: 'patrol' },
  spider:    { biome: 'wastes', tier: 'basic', ai: 'aggressive' },
  elemental: { biome: 'wastes', tier: 'elite', ai: 'patrol' },
};

const MOBS_BY_BIOME = Object.entries(MOB_DEFS).reduce((acc, [kind, def]) => {
  acc[def.biome] = acc[def.biome] || { basic: [], elite: [] };
  acc[def.biome][def.tier].push(kind);
  return acc;
}, {});

const MOB_AGGRO_RANGE = 5;
const ELITE_QUESTION_COUNT = 3;
// Damage a wrong answer costs depending on what hit you back.
const DMG_BY_TIER = { basic: 1, elite: 2, boss: 3 };
const BOSS_BY_BIOME = {
  crypt:  'lich',
  sewers: 'hydra',
  tower:  'sphinx',
  halls:  'behemoth',
  wastes: 'riddler',
};

const templateRect = (template, x, y) => ({
  x, y,
  w: template.tiles[0].length,
  h: template.tiles.length,
  template: template.id,
});

const rectsOverlap = (a, b, pad = 1) => (
  a.x - pad < b.x + b.w &&
  a.x + a.w + pad > b.x &&
  a.y - pad < b.y + b.h &&
  a.y + a.h + pad > b.y
);

const rectCenter = (r) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });

const shuffle = (arr, rng) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function generateMap({ difficulty = 'apprentice', biome = 'halls', rng = Math.random } = {}) {
  const size = SIZE_BY_DIFFICULTY[difficulty] || SIZE_BY_DIFFICULTY.apprentice;
  const roomCount = ROOMS_BY_DIFFICULTY[difficulty] || ROOMS_BY_DIFFICULTY.apprentice;
  const width = size.w;
  const height = size.h;

  const map = Array.from({ length: height }, () => Array(width).fill(TILE.WALL));
  const rooms = [];
  let attempts = 0;
  let deck = shuffle(ROOM_TEMPLATES, rng);
  let deckIdx = 0;

  while (rooms.length < roomCount && attempts < 600) {
    attempts++;
    if (deckIdx >= deck.length) {
      deck = shuffle(ROOM_TEMPLATES, rng);
      deckIdx = 0;
    }
    const tmpl = deck[deckIdx++];
    const tw = tmpl.tiles[0].length;
    const th = tmpl.tiles.length;
    if (tw + 2 >= width || th + 2 >= height) continue;
    const x = 1 + Math.floor(rng() * (width - tw - 2));
    const y = 1 + Math.floor(rng() * (height - th - 2));
    const candidate = templateRect(tmpl, x, y);
    if (rooms.some((r) => rectsOverlap(r, candidate, 1))) continue;
    for (let yi = 0; yi < th; yi++) {
      for (let xi = 0; xi < tw; xi++) {
        if (tmpl.tiles[yi][xi] === 1) {
          map[y + yi][x + xi] = TILE.FLOOR;
        }
      }
    }
    rooms.push(candidate);
  }

  for (let i = 1; i < rooms.length; i++) {
    const a = rectCenter(rooms[i - 1]);
    const b = rectCenter(rooms[i]);
    const horizontalFirst = rng() < 0.5;
    const carveH = (y, x1, x2) => {
      const [lo, hi] = x1 < x2 ? [x1, x2] : [x2, x1];
      for (let x = lo; x <= hi; x++) {
        if (map[y][x] === TILE.WALL) map[y][x] = TILE.FLOOR;
      }
    };
    const carveV = (x, y1, y2) => {
      const [lo, hi] = y1 < y2 ? [y1, y2] : [y2, y1];
      for (let y = lo; y <= hi; y++) {
        if (map[y][x] === TILE.WALL) map[y][x] = TILE.FLOOR;
      }
    };
    if (horizontalFirst) {
      carveH(a.y, a.x, b.x);
      carveV(b.x, a.y, b.y);
    } else {
      carveV(a.x, a.y, b.y);
      carveH(b.y, a.x, b.x);
    }
  }

  let bossPos = null;
  if (rooms.length > 1) {
    const last = rectCenter(rooms[rooms.length - 1]);
    map[last.y][last.x] = TILE.STAIRS_DOWN;
    bossPos = { x: last.x, y: Math.max(rooms[rooms.length - 1].y + 1, last.y - 1) };
  }

  const decorations = [];
  const mobs = [];
  const decoKinds = DECO_BY_BIOME[biome] || DECO_BY_BIOME.halls;
  const mobPool = MOBS_BY_BIOME[biome] || MOBS_BY_BIOME.halls;

  // Pack rooms with decorations and mobs. Spawn room stays light so the
  // player isn't ambushed at start; boss room has a couple of decorations
  // (no mobs) flanking the lord.
  rooms.forEach((room, idx) => {
    const isSpawn = idx === 0;
    const isBoss = idx === rooms.length - 1 && rooms.length > 1;
    const roomArea = room.w * room.h;
    // Density: ~1 deco per 8 tiles, capped, plus a small base.
    const decoBase = isSpawn ? 1 : isBoss ? 2 : 4;
    const decoCount = decoBase + Math.floor(roomArea / 10) + Math.floor(rng() * 3);
    const mobCount = (isBoss || isSpawn) ? 0 : 3 + Math.floor(rng() * 4); // 3..6

    for (let i = 0; i < decoCount; i++) {
      const tx = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const ty = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (map[ty]?.[tx] !== TILE.FLOOR) continue;
      // Avoid stacking on top of existing decorations.
      if (decorations.some((d) => d.x === tx && d.y === ty)) continue;
      const kind = decoKinds[Math.floor(rng() * decoKinds.length)];
      decorations.push({ kind, x: tx, y: ty });
    }

    // Place a mix of basic and elite mobs. Elite count is small (0-1 per
    // mid room, 1-2 in larger rooms); basics fill out the rest.
    const eliteCount = mobCount > 0
      ? (mobCount >= 5 ? 1 + Math.floor(rng() * 2) : Math.floor(rng() * 2))
      : 0;
    const basicCount = Math.max(0, mobCount - eliteCount);
    const placeMob = (kind) => {
      const tx = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const ty = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (map[ty]?.[tx] !== TILE.FLOOR) return;
      if (mobs.some((m) => m.x === tx && m.y === ty)) return;
      if (decorations.some((d) => d.x === tx && d.y === ty)) return;
      const def = MOB_DEFS[kind] || { tier: 'basic', ai: 'idle' };
      mobs.push({
        kind,
        tier: def.tier,
        ai: def.ai,
        x: tx, y: ty,
        bounds: { x: room.x, y: room.y, w: room.w, h: room.h },
        nextMoveAt: 0,
        // patrol direction (-1 / +1) for patrol AI
        patrolDir: rng() < 0.5 ? -1 : 1,
      });
    };
    const basics = mobPool.basic || [];
    const elites = mobPool.elite || [];
    for (let i = 0; i < basicCount && basics.length > 0; i++) {
      placeMob(basics[Math.floor(rng() * basics.length)]);
    }
    for (let i = 0; i < eliteCount && elites.length > 0; i++) {
      placeMob(elites[Math.floor(rng() * elites.length)]);
    }
  });

  const boss = bossPos
    ? { kind: BOSS_BY_BIOME[biome] || BOSS_BY_BIOME.halls, x: bossPos.x, y: bossPos.y }
    : null;

  const spawn = rooms.length > 0 ? rectCenter(rooms[0]) : { x: 1, y: 1 };
  return { map, rooms, decorations, mobs, boss, spawn, width, height, biome };
}

export function generateStarterMap(opts = {}) {
  return generateMap({ difficulty: 'apprentice', biome: 'halls', ...opts });
}

const tileSeed = (x, y) => {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
};

// === Tile drawing =======================================================
function drawWall(ctx, p, px, py) {
  ctx.fillStyle = p.wallBase;
  ctx.fillRect(px, py, TILE_PX, TILE_PX);
  ctx.fillStyle = p.wallTop;
  ctx.fillRect(px, py, TILE_PX, 4);
  ctx.fillStyle = p.wallShade;
  ctx.fillRect(px, py + TILE_PX - 6, TILE_PX, 6);
  ctx.fillRect(px, py + 16, TILE_PX, 1);
  ctx.fillRect(px, py + 32, TILE_PX, 1);
  ctx.fillRect(px + 24, py + 4,  1, 12);
  ctx.fillRect(px + 12, py + 17, 1, 15);
  ctx.fillRect(px + 24, py + 33, 1, 9);
}

function drawFloor(ctx, p, px, py, decoChance, seed) {
  ctx.fillStyle = p.floorBase;
  ctx.fillRect(px, py, TILE_PX, TILE_PX);
  ctx.fillStyle = p.floorAlt;
  ctx.fillRect(px, py, TILE_PX, 1);
  ctx.fillRect(px, py, 1, TILE_PX);
  if (seed < decoChance) {
    ctx.fillStyle = p.floorDetail;
    const ox = 8 + Math.floor((seed * 1000) % 28);
    const oy = 8 + Math.floor((seed * 8000) % 28);
    ctx.fillRect(px + ox, py + oy, 4, 2);
    ctx.fillRect(px + ox + 1, py + oy + 2, 2, 2);
  } else if (seed > 1 - decoChance / 2) {
    ctx.fillStyle = p.floorAccent;
    const ox = 12 + Math.floor((seed * 700) % 22);
    const oy = 12 + Math.floor((seed * 1300) % 22);
    ctx.fillRect(px + ox, py + oy, 2, 2);
  }
}

function drawStairs(ctx, p, px, py) {
  ctx.fillStyle = p.floorBase;
  ctx.fillRect(px, py, TILE_PX, TILE_PX);
  ctx.fillStyle = p.wallShade;
  for (let i = 0; i < 5; i++) {
    const inset = i * 4;
    ctx.fillRect(px + 6 + inset, py + 6 + inset, TILE_PX - 12 - inset * 2, 3);
  }
  ctx.fillStyle = p.floorAccent;
  ctx.fillRect(px + 22, py + 22, 4, 4);
}

function drawDoor(ctx, p, px, py) {
  ctx.fillStyle = p.floorBase;
  ctx.fillRect(px, py, TILE_PX, TILE_PX);
  ctx.fillStyle = p.wallTop;
  ctx.fillRect(px + 8, py + 8, TILE_PX - 16, TILE_PX - 16);
  ctx.fillStyle = p.floorAccent;
  ctx.fillRect(px + 22, py + 24, 4, 4);
}

function drawTile(ctx, biome, type, px, py) {
  const p = biome.palette;
  const seed = tileSeed(Math.floor(px / TILE_PX), Math.floor(py / TILE_PX));
  if (type === TILE.WALL) drawWall(ctx, p, px, py);
  else if (type === TILE.FLOOR) drawFloor(ctx, p, px, py, biome.decoChance, seed);
  else if (type === TILE.STAIRS_DOWN || type === TILE.STAIRS_UP) drawStairs(ctx, p, px, py);
  else if (type === TILE.DOOR) drawDoor(ctx, p, px, py);
  else drawWall(ctx, p, px, py);
}

// === Plant + decoration sprites =========================================
function drawDeadBranch(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#1c1614';
  ctx.fillRect(cx - 1, cy - 14, 2, 14);
  ctx.fillRect(cx - 5, cy - 11, 5, 1);
  ctx.fillRect(cx - 6, cy - 12, 1, 2);
  ctx.fillRect(cx + 1, cy - 8, 5, 1);
  ctx.fillRect(cx + 6, cy - 9, 1, 2);
  ctx.fillRect(cx - 4, cy - 5, 4, 1);
  ctx.fillStyle = '#3a2a20';
  ctx.fillRect(cx, cy - 14, 1, 14);
  // small dead leaves
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 6, cy - 10, 1, 1);
  ctx.fillRect(cx + 6, cy - 7, 1, 1);
}
function drawMossPatch(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 8;
  ctx.fillStyle = '#2a2a30';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#15803d';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(cx - 8 + i * 3, cy - 1 + (i % 2 ? 1 : -1), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(cx - 6, cy - 3, 1, 1);
  ctx.fillRect(cx + 2, cy - 3, 1, 1);
  ctx.fillRect(cx + 5, cy - 1, 1, 1);
}
function drawNightshade(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#1c1614';
  ctx.fillRect(cx, cy - 12, 1, 12);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(cx - 3, cy - 8, 3, 2);
  ctx.fillRect(cx + 1, cy - 5, 3, 2);
  // flower
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(cx - 3, cy - 14, 7, 2);
  ctx.fillRect(cx - 2, cy - 16, 5, 2);
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(cx - 1, cy - 15, 1, 1);
  ctx.fillStyle = '#581c87';
  ctx.fillRect(cx - 1, cy - 10, 2, 2);
}
function drawAlgae(ctx, px, py) {
  const cx = px + TILE_PX / 2;
  ctx.fillStyle = '#065f46';
  ctx.fillRect(cx - 1, py + 2, 2, 32);
  ctx.fillStyle = '#10b981';
  for (let i = 0; i < 7; i++) {
    const ly = py + 6 + i * 4;
    const side = i % 2 === 0 ? -1 : 1;
    ctx.fillRect(cx + (side > 0 ? 1 : -3), ly, 3, 2);
  }
  ctx.fillStyle = '#34d399';
  ctx.fillRect(cx, py + 4, 1, 2);
  // drip
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(cx + 4, py + 28, 1, 3);
}
function drawFern(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 10;
  ctx.fillStyle = '#065f46';
  ctx.fillRect(cx, cy - 14, 1, 14);
  ctx.fillStyle = '#10b981';
  for (let i = 0; i < 6; i++) {
    const ly = cy - 13 + i * 3;
    ctx.fillRect(cx - 6, ly, 6, 1);
    ctx.fillRect(cx + 1, ly + 1, 6, 1);
  }
  ctx.fillStyle = '#34d399';
  ctx.fillRect(cx - 2, cy - 14, 1, 1);
  ctx.fillRect(cx + 1, cy - 13, 1, 1);
}
function drawRotFlower(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#3f1414';
  ctx.fillRect(cx, cy - 14, 1, 14);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(cx - 4, cy - 16, 9, 2);
  ctx.fillRect(cx - 3, cy - 18, 7, 2);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx - 1, cy - 17, 2, 2);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(cx - 2, cy - 12, 1, 2);
  ctx.fillRect(cx + 2, cy - 10, 1, 2);
  ctx.fillRect(cx - 4, cy - 13, 1, 2);
}
function drawBonsai(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 10;
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 5, cy - 2, 10, 4);
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 5, cy - 2, 10, 1);
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 5, cy + 1, 10, 1);
  ctx.fillStyle = '#1c1614';
  ctx.fillRect(cx, cy - 8, 1, 6);
  ctx.fillRect(cx - 2, cy - 10, 4, 2);
  ctx.fillStyle = '#15803d';
  ctx.fillRect(cx - 5, cy - 14, 11, 4);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(cx - 4, cy - 13, 9, 1);
  ctx.fillStyle = '#86efac';
  ctx.fillRect(cx, cy - 14, 1, 1);
  ctx.fillRect(cx + 3, cy - 12, 1, 1);
}
function drawIvy(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#065f46';
  ctx.fillRect(cx, cy - 16, 1, 16);
  ctx.fillStyle = '#10b981';
  for (let i = 0; i < 4; i++) {
    const ly = cy - 15 + i * 4;
    const side = i % 2 === 0 ? -1 : 1;
    ctx.fillRect(cx + side * 2, ly, 1, 2);
    ctx.fillRect(cx + side * 3, ly - 1, 1, 4);
    ctx.fillRect(cx + side * 4, ly, 1, 2);
  }
  ctx.fillStyle = '#34d399';
  ctx.fillRect(cx - 3, cy - 14, 1, 1);
  ctx.fillRect(cx + 3, cy - 10, 1, 1);
}
function drawCrystal(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 4;
  ctx.fillStyle = 'rgba(59,130,246,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx - 3, cy - 8, 6, 14);
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(cx - 2, cy - 10, 4, 2);
  ctx.fillStyle = '#93c5fd';
  ctx.fillRect(cx - 1, cy - 11, 2, 1);
  ctx.fillStyle = '#dbeafe';
  ctx.fillRect(cx - 2, cy - 6, 1, 9);
  // tiny side crystal
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx + 4, cy - 2, 2, 6);
  ctx.fillStyle = '#93c5fd';
  ctx.fillRect(cx + 4, cy - 4, 2, 1);
}
function drawPipeVine(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#525252';
  ctx.fillRect(cx - 9, cy, 18, 5);
  ctx.fillStyle = '#737373';
  ctx.fillRect(cx - 9, cy, 18, 1);
  ctx.fillStyle = '#262626';
  ctx.fillRect(cx - 9, cy + 4, 18, 1);
  // rust spots
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 6, cy + 2, 1, 1);
  ctx.fillRect(cx + 4, cy + 1, 2, 1);
  // vine
  ctx.fillStyle = '#15803d';
  ctx.fillRect(cx, cy - 10, 1, 10);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(cx - 3, cy - 6, 3, 1);
  ctx.fillRect(cx + 1, cy - 4, 3, 1);
  ctx.fillRect(cx - 2, cy - 9, 2, 1);
}
function drawRustFlower(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(cx, cy - 12, 1, 12);
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(cx - 4, cy - 14, 9, 2);
  ctx.fillRect(cx - 3, cy - 16, 7, 2);
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(cx - 1, cy - 15, 3, 1);
  ctx.fillStyle = '#fdba74';
  ctx.fillRect(cx, cy - 16, 1, 1);
  ctx.fillStyle = '#15803d';
  ctx.fillRect(cx - 2, cy - 8, 2, 1);
}
function drawSteamFern(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 10;
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(cx, cy - 10, 1, 10);
  ctx.fillStyle = '#15803d';
  for (let i = 0; i < 5; i++) {
    const ly = cy - 9 + i * 2;
    ctx.fillRect(cx - 5, ly, 5, 1);
    ctx.fillRect(cx + 1, ly + 1, 5, 1);
  }
  // animated steam puffs
  const tt = (t || 0);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const off = (tt / 60) % 12;
  ctx.fillRect(cx - 2, cy - 14 - off, 1, 2);
  ctx.fillRect(cx + 1, cy - 16 - ((off + 4) % 12), 1, 2);
  ctx.fillRect(cx, cy - 18 - ((off + 8) % 12), 1, 2);
}
function drawTumbleweed(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 4;
  const sway = Math.sin((t || 0) / 600) * 1;
  ctx.fillStyle = '#92400e';
  ctx.beginPath();
  ctx.arc(cx + sway, cy, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7c2d12';
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI * 2) / 10;
    ctx.fillRect(cx + sway + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1, 1);
  }
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx + sway - 2, cy - 1, 1, 2);
  ctx.fillRect(cx + sway + 2, cy + 1, 1, 1);
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx + sway, cy - 2, 1, 1);
}
function drawWildflower(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#15803d';
  ctx.fillRect(cx, cy - 10, 1, 10);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(cx - 2, cy - 6, 2, 1);
  ctx.fillRect(cx + 1, cy - 4, 2, 1);
  // petals (alternate two flowers)
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx - 2, cy - 14, 5, 2);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx, cy - 13, 1, 1);
  // smaller flower
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx + 4, cy - 11, 3, 1);
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx + 5, cy - 11, 1, 1);
}
function drawDesertBrush(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 8;
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 7, cy - 2, 14, 2);
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 5, cy - 4, 3, 2);
  ctx.fillRect(cx + 1, cy - 5, 3, 3);
  ctx.fillRect(cx - 1, cy - 6, 2, 4);
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx - 5, cy - 5, 1, 1);
  ctx.fillRect(cx + 3, cy - 6, 1, 1);
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 5, cy - 1, 1, 1);
  ctx.fillRect(cx + 4, cy - 2, 1, 1);
}

// === Existing decoration sprites ========================================
function drawBones(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  ctx.fillStyle = '#e7e5db';
  ctx.fillRect(cx - 8, cy - 1, 16, 3);
  ctx.fillRect(cx - 9, cy - 4, 3, 4);
  ctx.fillRect(cx - 9, cy + 1, 3, 4);
  ctx.fillRect(cx + 6, cy - 4, 3, 4);
  ctx.fillRect(cx + 6, cy + 1, 3, 4);
  ctx.fillStyle = '#9a9892';
  ctx.fillRect(cx - 2, cy - 1, 1, 3);
}
function drawCandle(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#3d2a1c';
  ctx.fillRect(cx - 3, cy, 6, 2);
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(cx - 2, cy - 8, 4, 8);
  ctx.fillStyle = '#000';
  ctx.fillRect(cx, cy - 11, 1, 3);
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(cx - 1, cy - 14, 3, 4);
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(cx, cy - 13, 1, 2);
}
function drawMushroom(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 4;
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(cx - 2, cy - 3, 4, 8);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx - 7, cy - 8, 14, 5);
  ctx.fillRect(cx - 5, cy - 11, 10, 3);
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(cx - 4, cy - 7, 2, 2);
  ctx.fillRect(cx + 1, cy - 9, 2, 2);
  ctx.fillRect(cx + 3, cy - 6, 2, 2);
}
function drawPuddle(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5eead4';
  ctx.fillRect(cx - 8, cy - 2, 4, 1);
  ctx.fillRect(cx + 2, cy + 1, 5, 1);
}
function drawTerminal(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 4;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx - 8, cy - 12, 16, 14);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cx - 7, cy - 11, 14, 9);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(cx - 6, cy - 9, 8, 1);
  ctx.fillRect(cx - 6, cy - 7, 6, 1);
  ctx.fillRect(cx - 6, cy - 5, 9, 1);
  ctx.fillStyle = '#475569';
  ctx.fillRect(cx - 6, cy + 1, 12, 2);
}
function drawCable(ctx, px, py) {
  const cy = py + TILE_PX / 2 + 8;
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 6, cy);
  ctx.bezierCurveTo(px + 16, cy - 12, px + 32, cy + 12, px + 42, cy);
  ctx.stroke();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1;
  ctx.stroke();
}
function drawGear(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  ctx.fillStyle = '#a3a3a3';
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#404040';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a3a3a3';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const tx = cx + Math.cos(a) * 11;
    const ty = cy + Math.sin(a) * 11;
    ctx.fillRect(Math.round(tx - 2), Math.round(ty - 2), 4, 4);
  }
}
function drawCapacitor(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 4;
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(cx - 4, cy - 10, 8, 12);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 3, cy - 9, 6, 2);
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(cx - 5, cy - 11, 10, 1);
  ctx.fillRect(cx - 1, cy - 13, 2, 3);
}
function drawCactus(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#15803d';
  ctx.fillRect(cx - 3, cy - 16, 6, 16);
  ctx.fillRect(cx - 7, cy - 8, 4, 6);
  ctx.fillRect(cx + 3, cy - 11, 4, 7);
  ctx.fillStyle = '#86efac';
  ctx.fillRect(cx - 2, cy - 16, 1, 16);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx, cy - 17, 1, 1);
}
function drawAntenna(ctx, px, py) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#52525b';
  ctx.fillRect(cx, cy - 18, 1, 18);
  ctx.fillRect(cx - 6, cy - 14, 13, 1);
  ctx.fillRect(cx - 4, cy - 10, 9, 1);
  ctx.fillRect(cx - 2, cy - 6,  5, 1);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(cx, cy - 20, 1, 2);
}

const DECO_DRAWERS = {
  // existing
  bones: drawBones, candle: drawCandle, mushroom: drawMushroom, puddle: drawPuddle,
  terminal: drawTerminal, cable: drawCable, gear: drawGear, capacitor: drawCapacitor,
  cactus: drawCactus, antenna: drawAntenna,
  // plants & extras
  dead_branch: drawDeadBranch, moss_patch: drawMossPatch, nightshade: drawNightshade,
  algae: drawAlgae, fern: drawFern, rot_flower: drawRotFlower,
  bonsai: drawBonsai, ivy: drawIvy, crystal: drawCrystal,
  pipe_vine: drawPipeVine, rust_flower: drawRustFlower, steam_fern: drawSteamFern,
  tumbleweed: drawTumbleweed, wildflower: drawWildflower, desert_brush: drawDesertBrush,
};

// === Mob sprites ========================================================
function drawWraith(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + Math.sin(t / 400) * 2;
  ctx.fillStyle = 'rgba(168,85,247,0.55)';
  ctx.fillRect(cx - 8, cy - 6, 16, 16);
  ctx.fillStyle = 'rgba(168,85,247,0.85)';
  ctx.fillRect(cx - 7, cy - 10, 14, 6);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(cx - 4, cy - 7, 2, 2);
  ctx.fillRect(cx + 2, cy - 7, 2, 2);
}
function drawSlime(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 4;
  const wob = Math.sin(t / 250) * 1.5;
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 9 + wob, 7 - wob / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34d399';
  ctx.fillRect(cx - 6, cy - 4, 4, 1);
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 3, cy - 1, 2, 2);
  ctx.fillRect(cx + 1, cy - 1, 2, 2);
}
function drawSentry(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(cx - 7, cy - 4, 14, 12);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx - 7, cy + 6, 14, 4);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx - 5, cy - 6, 10, 5);
  const blink = (Math.floor(t / 120) % 6) === 0;
  ctx.fillStyle = blink ? '#fef9c3' : '#ef4444';
  ctx.fillRect(cx - 1, cy - 4, 2, 2);
}
function drawSpark(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  const r = 4 + Math.sin(t / 150) * 2;
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.arc(cx, cy, r / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = (t / 200) + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
    ctx.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
    ctx.stroke();
  }
}
function drawScorpion(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 2;
  const wig = Math.sin(t / 200) * 1.5;
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 6, cy - 2, 12, 6);
  ctx.fillRect(cx + 4, cy - 5 + wig, 4, 4);
  ctx.fillRect(cx + 7, cy - 8 + wig, 2, 3);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx + 8, cy - 9 + wig, 1, 1);
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 9, cy - 1, 4, 2);
  ctx.fillRect(cx - 9, cy + 2, 4, 2);
}

// === Additional mob sprites (Phase 13) ==================================
function drawSkeleton(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE_PX - 5, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = '#e7e5db';
  ctx.fillRect(cx - 5, cy - 4, 10, 11);
  // skull
  ctx.fillRect(cx - 5, cy - 12, 10, 7);
  // jaw shadow
  ctx.fillStyle = '#9a9892';
  ctx.fillRect(cx - 4, cy - 6, 8, 1);
  // eye sockets
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(cx - 4, cy - 10, 3, 3);
  ctx.fillRect(cx + 1, cy - 10, 3, 3);
  // teeth
  ctx.fillRect(cx - 3, cy - 6, 1, 1);
  ctx.fillRect(cx - 1, cy - 6, 1, 1);
  ctx.fillRect(cx + 1, cy - 6, 1, 1);
  ctx.fillRect(cx + 3, cy - 6, 1, 1);
  // ribs
  ctx.fillStyle = '#9a9892';
  ctx.fillRect(cx - 4, cy - 1, 8, 1);
  ctx.fillRect(cx - 4, cy + 2, 8, 1);
  // arm bones (sway)
  const sway = Math.sin(t / 200) * 1;
  ctx.fillStyle = '#e7e5db';
  ctx.fillRect(cx - 7, cy - 3 + sway, 2, 7);
  ctx.fillRect(cx + 5, cy - 3 - sway, 2, 7);
}
function drawShade(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + Math.sin(t / 300) * 2;
  // elite aura
  ctx.fillStyle = 'rgba(168,85,247,0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy, 19, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = '#2a1838';
  ctx.fillRect(cx - 9, cy - 4, 18, 16);
  // hood
  ctx.fillStyle = '#1a1024';
  ctx.fillRect(cx - 9, cy - 12, 18, 8);
  ctx.fillRect(cx - 7, cy - 14, 14, 4);
  // glowing eyes
  ctx.fillStyle = '#a855f7';
  ctx.fillRect(cx - 4, cy - 8, 2, 3);
  ctx.fillRect(cx + 2, cy - 8, 2, 3);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(cx - 4, cy - 7, 1, 1);
  ctx.fillRect(cx + 2, cy - 7, 1, 1);
  // tendrils
  ctx.fillStyle = '#581c87';
  ctx.fillRect(cx - 8, cy + 12, 2, 2);
  ctx.fillRect(cx - 4, cy + 12, 2, 2);
  ctx.fillRect(cx + 2, cy + 12, 2, 2);
  ctx.fillRect(cx + 6, cy + 12, 2, 2);
}
function drawRat(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 5, 9, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = '#52525b';
  ctx.fillRect(cx - 6, cy - 2, 12, 6);
  ctx.fillStyle = '#71717a';
  ctx.fillRect(cx - 6, cy - 2, 12, 1);
  // head
  ctx.fillStyle = '#3f3f46';
  ctx.fillRect(cx - 9, cy - 1, 4, 4);
  // ear
  ctx.fillStyle = '#52525b';
  ctx.fillRect(cx - 8, cy - 3, 2, 2);
  // eye
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx - 8, cy, 1, 1);
  // nose
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(cx - 9, cy + 1, 1, 1);
  // tail
  const tailWag = Math.sin(t / 150) * 2;
  ctx.fillStyle = '#3f3f46';
  ctx.fillRect(cx + 6, cy + tailWag, 6, 1);
}
function drawOoze(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 4;
  ctx.fillStyle = 'rgba(34,197,94,0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 21, 0, Math.PI * 2);
  ctx.fill();
  const wob = Math.sin(t / 200) * 2;
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 13 + wob, 10 - wob / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#86efac';
  ctx.fillRect(cx - 8, cy - 5, 5, 1);
  ctx.fillRect(cx - 9, cy - 3, 2, 2);
  // 3 eyes
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 5, cy - 1, 2, 2);
  ctx.fillRect(cx, cy - 2, 2, 2);
  ctx.fillRect(cx + 4, cy - 1, 2, 2);
  // drips
  ctx.fillStyle = '#10b981';
  ctx.fillRect(cx - 7, cy + 7, 1, 2);
  ctx.fillRect(cx + 4, cy + 8, 1, 2);
}
function drawDrone(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + Math.sin(t / 200) * 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE_PX - 4, 9, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#475569';
  ctx.fillRect(cx - 7, cy - 4, 14, 8);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cx - 5, cy - 8, 10, 4);
  const blink = (Math.floor(t / 100) % 8) === 0;
  ctx.fillStyle = blink ? '#fde047' : '#3b82f6';
  ctx.fillRect(cx - 1, cy - 6, 2, 2);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(cx - 9, cy - 3, 3, 1);
  ctx.fillRect(cx + 6, cy - 3, 3, 1);
  // bottom thruster glow
  ctx.fillStyle = 'rgba(59,130,246,0.5)';
  ctx.fillRect(cx - 3, cy + 4, 2, 2);
  ctx.fillRect(cx + 1, cy + 4, 2, 2);
}
function drawFirewall(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  ctx.fillStyle = 'rgba(239,68,68,0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(cx - 11, cy - 9, 22, 19);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cx - 11, cy - 4, 22, 1);
  ctx.fillRect(cx - 11, cy + 1, 22, 1);
  ctx.fillRect(cx - 1, cy - 9, 1, 5);
  ctx.fillRect(cx + 4, cy - 4, 1, 5);
  ctx.fillRect(cx - 5, cy + 2, 1, 5);
  // flames atop
  const flame = Math.sin(t / 120) * 2;
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx - 9, cy - 13 + flame / 2, 3, 4);
  ctx.fillRect(cx + 6, cy - 13 - flame / 2, 3, 4);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 8, cy - 12 + flame / 2, 1, 2);
  ctx.fillRect(cx + 7, cy - 12 - flame / 2, 1, 2);
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(cx - 8, cy - 13 + flame / 2, 1, 1);
}
function drawImp(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE_PX - 4, 7, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(cx - 5, cy - 4, 10, 10);
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 4, cy - 9, 8, 5);
  // horns
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(cx - 4, cy - 11, 1, 2);
  ctx.fillRect(cx + 3, cy - 11, 1, 2);
  // eyes
  const blink = (Math.floor(t / 200) % 5) === 0;
  ctx.fillStyle = blink ? '#1a0e08' : '#fbbf24';
  ctx.fillRect(cx - 3, cy - 7, 2, 2);
  ctx.fillRect(cx + 1, cy - 7, 2, 2);
  // wings
  const flap = Math.sin(t / 200) * 2;
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 8, cy - 2 + flap, 3, 5);
  ctx.fillRect(cx + 5, cy - 2 - flap, 3, 5);
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 8, cy - 1 + flap, 1, 3);
  ctx.fillRect(cx + 7, cy - 1 - flap, 1, 3);
}
function drawSentinel(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  ctx.fillStyle = 'rgba(245,158,11,0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx - 10, cy - 9, 20, 20);
  // armor plates
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 10, cy - 9, 20, 2);
  ctx.fillRect(cx - 10, cy - 3, 20, 1);
  ctx.fillRect(cx - 10, cy + 4, 20, 1);
  // pulse eye
  const pulse = (Math.floor(t / 200) % 2) === 0;
  ctx.fillStyle = pulse ? '#fde047' : '#dc2626';
  ctx.fillRect(cx - 3, cy - 5, 6, 3);
  // arms (square)
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 13, cy + 1, 3, 7);
  ctx.fillRect(cx + 10, cy + 1, 3, 7);
  // gauntlets
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 13, cy + 8, 3, 1);
  ctx.fillRect(cx + 10, cy + 8, 3, 1);
}
function drawSpider(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE_PX - 6, 10, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.fillStyle = '#3f3f46';
  ctx.beginPath();
  ctx.arc(cx, cy - 5, 3, 0, Math.PI * 2);
  ctx.fill();
  // 6 eyes
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx - 2, cy - 6, 1, 1);
  ctx.fillRect(cx, cy - 6, 1, 1);
  ctx.fillRect(cx + 1, cy - 6, 1, 1);
  ctx.fillRect(cx - 1, cy - 4, 1, 1);
  ctx.fillRect(cx + 1, cy - 4, 1, 1);
  // legs
  const legWobble = Math.sin(t / 150) * 1;
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI / 5) + Math.PI / 4;
    const len = 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * len + legWobble, cy + Math.sin(a) * len);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - Math.cos(a) * len - legWobble, cy + Math.sin(a) * len);
    ctx.stroke();
  }
  // body highlight
  ctx.fillStyle = '#3f3f46';
  ctx.fillRect(cx - 3, cy - 1, 2, 1);
}
function drawElemental(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  ctx.fillStyle = 'rgba(217,119,6,0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
  // swirling sand body
  const swirl = (t / 100) % 8;
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx - 11, cy - 4 + Math.sin(swirl) * 1, 22, 9);
  ctx.fillRect(cx - 9, cy - 9, 18, 5);
  ctx.fillStyle = '#d97706';
  ctx.fillRect(cx - 9, cy - 4, 5, 1);
  ctx.fillRect(cx + 4, cy + 2, 5, 1);
  // eyes
  ctx.fillStyle = '#fde047';
  ctx.fillRect(cx - 5, cy - 7, 2, 2);
  ctx.fillRect(cx + 3, cy - 7, 2, 2);
  // sand particles
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI / 3.5) + (t / 250);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, 1, 1);
  }
  // mouth
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 2, cy + 1, 5, 1);
}

const MOB_DRAWERS = {
  // existing
  wraith: drawWraith, slime: drawSlime, sentry: drawSentry, spark: drawSpark, scorpion: drawScorpion,
  // new (Phase 13)
  skeleton: drawSkeleton, shade: drawShade,
  rat: drawRat, ooze: drawOoze,
  drone: drawDrone, firewall: drawFirewall,
  imp: drawImp, sentinel: drawSentinel,
  spider: drawSpider, elemental: drawElemental,
};

// === Boss sprites =======================================================
function drawLich(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 - 4;
  ctx.fillStyle = 'rgba(168,85,247,0.4)';
  ctx.fillRect(cx - 16, cy + 8, 32, 16);
  ctx.fillStyle = '#a855f7';
  ctx.fillRect(cx - 12, cy - 10, 24, 24);
  ctx.fillStyle = '#1a0e2a';
  ctx.fillRect(cx - 8, cy - 6, 16, 12);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(cx - 5, cy - 2, 3, 3);
  ctx.fillRect(cx + 2, cy - 2, 3, 3);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(cx - 10, cy - 14, 20, 4);
  ctx.fillRect(cx - 2, cy - 18, 4, 4);
  ctx.fillStyle = 'rgba(168,85,247,0.6)';
  const sw = 2 + Math.sin(t / 200) * 1;
  ctx.fillRect(cx - 14, cy - 12, sw, 2);
  ctx.fillRect(cx + 12, cy - 12, sw, 2);
}
function drawHydra(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2 + 8;
  ctx.fillStyle = '#065f46';
  ctx.fillRect(cx - 14, cy - 4, 28, 12);
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 8;
    const sway = Math.sin(t / 300 + i) * 3;
    ctx.fillStyle = '#10b981';
    ctx.fillRect(cx - 3 + off + sway, cy - 18, 6, 14);
    ctx.fillStyle = '#065f46';
    ctx.fillRect(cx - 4 + off + sway, cy - 22, 8, 6);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 2 + off + sway, cy - 20, 1, 1);
    ctx.fillRect(cx + 1 + off + sway, cy - 20, 1, 1);
  }
}
function drawSphinx(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(cx - 12, cy - 14, 24, 28);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cx - 12, cy + 10, 24, 6);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx - 10, cy - 12, 20, 8);
  const blink = (Math.floor(t / 150) % 4) === 0;
  ctx.fillStyle = blink ? '#fef9c3' : '#ef4444';
  ctx.fillRect(cx - 2, cy - 9, 4, 3);
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(cx - 11, cy - 4, 22, 2);
}
function drawBehemoth(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 14, cy - 12, 28, 26);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 12, cy - 10, 24, 4);
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 6, cy - 5, 4, 4);
  ctx.fillRect(cx + 2, cy - 5, 4, 4);
  ctx.fillStyle = '#fb923c';
  const glow = (Math.floor(t / 200) % 2) === 0 ? 1 : 0;
  if (glow) ctx.fillRect(cx - 5, cy - 4, 2, 2);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(cx - 8, cy + 4, 16, 4);
}
function drawRiddler(ctx, px, py, t) {
  const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;
  const flap = Math.sin(t / 250) * 4;
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx - 14 - flap, cy - 4, 12, 6);
  ctx.fillRect(cx + 2 + flap, cy - 4, 12, 6);
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 8, cy - 10, 16, 18);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 1, cy - 4, 2, 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 4, cy - 7, 2, 2);
  ctx.fillRect(cx + 2, cy - 7, 2, 2);
}

const BOSS_DRAWERS = {
  lich: drawLich, hydra: drawHydra, sphinx: drawSphinx, behemoth: drawBehemoth, riddler: drawRiddler,
};

const BOSS_DISPLAY = {
  lich:     { name: 'The Lich',     icon: '💀' },
  hydra:    { name: 'The Hydra',    icon: '🐉' },
  sphinx:   { name: 'The Sphinx',   icon: '🦁' },
  behemoth: { name: 'The Behemoth', icon: '🪨' },
  riddler:  { name: 'The Riddler',  icon: '🃏' },
};

// === Equipped weapon overlay ===========================================
// Drawn after the player so it sits on top. Hand position depends on facing.
function drawWeapon(ctx, weaponId, cx, py, facing) {
  if (!weaponId) return;
  const handX = facing === 'left' ? cx - 12
              : facing === 'right' ? cx + 10
              : cx + 9; // up/down — show on the right side
  const handY = py + 24;

  if (weaponId === 'oaken_blade') {
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(handX, handY - 14, 2, 16);
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(handX - 2, handY, 6, 2);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(handX, handY - 15, 2, 2);
  } else if (weaponId === 'gilded_sabre') {
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(handX, handY - 14, 2, 15);
    ctx.fillRect(handX + 1, handY - 15, 1, 1);
    ctx.fillRect(handX - 1, handY - 13, 1, 1);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(handX - 2, handY, 6, 2);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(handX, handY - 14, 1, 1);
    // golden glow
    ctx.fillStyle = 'rgba(251,191,36,0.25)';
    ctx.fillRect(handX - 1, handY - 16, 4, 2);
  } else if (weaponId === 'arcane_grimoire') {
    // floating tome with violet glow
    ctx.fillStyle = 'rgba(168,85,247,0.35)';
    ctx.fillRect(handX - 6, handY - 16, 14, 14);
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(handX - 4, handY - 14, 10, 10);
    ctx.fillStyle = '#a3471a';
    ctx.fillRect(handX - 4, handY - 14, 10, 1);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(handX - 2, handY - 12, 6, 1);
    ctx.fillRect(handX - 2, handY - 10, 6, 1);
    ctx.fillRect(handX - 2, handY - 8, 6, 1);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(handX - 1, handY - 14, 1, 1);
  }
}

// === Player sprite (more detailed; equipment-aware) =====================
function drawPlayer(ctx, px, py, facing, walkFrame, equipped = {}) {
  const cx = px + TILE_PX / 2;

  // Soft shadow under the player
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE_PX - 5, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const headTop = py + 4;
  const headHeight = 14;
  const bodyTop = headTop + headHeight - 1;
  const bodyHeight = 15;
  const legTop = bodyTop + bodyHeight - 1;
  const legHeight = 12;

  // === Cloak (back layer; visible when facing up/sides) ===
  const isStarbound = equipped.cloak === 'starbound_cloak';
  const cloakBase = isStarbound ? '#1e1b4b' : '#5a1d1d';
  const cloakEdge = isStarbound ? '#3730a3' : '#3a0e0e';
  if (facing !== 'down') {
    ctx.fillStyle = cloakBase;
    ctx.fillRect(cx - 9, bodyTop + 1, 18, bodyHeight - 1);
    ctx.fillStyle = cloakEdge;
    ctx.fillRect(cx - 9, bodyTop + bodyHeight - 1, 18, 2);
    ctx.fillRect(cx - 10, bodyTop + 4, 1, 10);
    ctx.fillRect(cx + 9, bodyTop + 4, 1, 10);
    if (isStarbound) {
      ctx.fillStyle = '#a5b4fc';
      ctx.fillRect(cx - 5, bodyTop + 4, 1, 1);
      ctx.fillRect(cx + 3, bodyTop + 7, 1, 1);
      ctx.fillRect(cx - 1, bodyTop + 10, 1, 1);
      ctx.fillRect(cx + 5, bodyTop + 13, 1, 1);
    }
  }

  // === Head — circlet (if equipped) overrides the hood ===
  const headEquip = equipped.head;
  if (headEquip === 'iron_circlet' || headEquip === 'silver_circlet') {
    // Hair + skin
    ctx.fillStyle = '#3b1f0a';
    ctx.fillRect(cx - 7, headTop, 14, 4);
    ctx.fillStyle = '#e8c4a0';
    ctx.fillRect(cx - 7, headTop + 4, 14, 9);
    // Circlet band
    const band = headEquip === 'silver_circlet' ? '#e2e8f0' : '#9ca3af';
    const bandShade = headEquip === 'silver_circlet' ? '#94a3b8' : '#52525b';
    const gem = headEquip === 'silver_circlet' ? '#22d3ee' : '#fde047';
    ctx.fillStyle = band;
    ctx.fillRect(cx - 8, headTop + 2, 16, 2);
    ctx.fillStyle = bandShade;
    ctx.fillRect(cx - 8, headTop + 4, 16, 1);
    ctx.fillStyle = gem;
    ctx.fillRect(cx - 1, headTop + 1, 2, 2);
  } else {
    // Default hood
    ctx.fillStyle = '#2a1810';
    ctx.fillRect(cx - 8, headTop, 16, 4);
    ctx.fillRect(cx - 9, headTop + 2, 18, 2);
    ctx.fillRect(cx - 8, headTop + 4, 16, headHeight - 4);
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(cx - 6, headTop + 4, 12, 7);
  }

  // Eyes (visible when not facing up — except when wearing a circlet, eyes
  // are clearly visible since the face isn't shadowed by a hood)
  if (facing !== 'up') {
    const showCirclet = headEquip === 'iron_circlet' || headEquip === 'silver_circlet';
    ctx.fillStyle = showCirclet ? '#1a0e08' : '#fde047';
    if (facing === 'down') {
      ctx.fillRect(cx - 4, headTop + 8, 2, 2);
      ctx.fillRect(cx + 2, headTop + 8, 2, 2);
      // Mouth (only with circlet — visible face)
      if (showCirclet) {
        ctx.fillStyle = '#451a03';
        ctx.fillRect(cx - 2, headTop + 11, 4, 1);
      }
    } else if (facing === 'right') {
      ctx.fillRect(cx + 1, headTop + 8, 2, 2);
    } else if (facing === 'left') {
      ctx.fillRect(cx - 3, headTop + 8, 2, 2);
    }
  }

  // === Body / tunic ===
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 8, bodyTop, 16, bodyHeight);
  ctx.fillStyle = '#a3471a';
  ctx.fillRect(cx - 8, bodyTop, 16, 2);
  ctx.fillStyle = '#c2410c';
  ctx.fillRect(cx - 8, bodyTop + bodyHeight - 5, 16, 1);
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(cx - 8, bodyTop + bodyHeight - 4, 16, 2);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 1, bodyTop + bodyHeight - 4, 2, 2);
  // V-neck collar
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 1, bodyTop, 2, 2);

  // === Arms ===
  ctx.fillStyle = '#7c2d12';
  if (facing === 'left') {
    ctx.fillRect(cx - 10, bodyTop + 3, 3, 9);
    ctx.fillStyle = '#e8c4a0';
    ctx.fillRect(cx - 10, bodyTop + 12, 3, 2);
  } else if (facing === 'right') {
    ctx.fillRect(cx + 7, bodyTop + 3, 3, 9);
    ctx.fillStyle = '#e8c4a0';
    ctx.fillRect(cx + 7, bodyTop + 12, 3, 2);
  } else {
    ctx.fillRect(cx - 10, bodyTop + 3, 3, 9);
    ctx.fillRect(cx + 7, bodyTop + 3, 3, 9);
    ctx.fillStyle = '#e8c4a0';
    ctx.fillRect(cx - 10, bodyTop + 12, 3, 2);
    ctx.fillRect(cx + 7, bodyTop + 12, 3, 2);
  }

  // === Legs (animated) ===
  const stepDelta = walkFrame === 1 ? 1 : walkFrame === 3 ? -1 : 0;
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(cx - 6, legTop + stepDelta,         5, legHeight - 3 - Math.abs(stepDelta));
  ctx.fillRect(cx + 1, legTop - stepDelta,         5, legHeight - 3 - Math.abs(stepDelta));
  // Boots
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(cx - 7, legTop + legHeight - 4 + stepDelta, 6, 3);
  ctx.fillRect(cx + 1, legTop + legHeight - 4 - stepDelta, 6, 3);
  // Boot trim
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(cx - 7, legTop + legHeight - 4 + stepDelta, 6, 1);
  ctx.fillRect(cx + 1, legTop + legHeight - 4 - stepDelta, 6, 1);

  // === Equipped weapon (top layer) ===
  drawWeapon(ctx, equipped.weapon, cx, py, facing);
}

// === Combat helpers =====================================================
const norm = (s) => String(s ?? '').trim().toLowerCase();

// Pull random questions from the active tome's quiz pool, excluding any
// already-used questions in this run. Includes flashcards as fallback.
function pickQuestions(courseSet, count, excludeIds = new Set()) {
  const quizPool = (courseSet?.quiz || []).filter((q) =>
    !excludeIds.has(q.id) && (q.type === 'multiplechoice' || q.type === 'truefalse'),
  );
  // Shuffle and take.
  const arr = quizPool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

function checkAnswerCorrect(question, choice) {
  if (!question) return false;
  if (question.type === 'multiplechoice') {
    return choice === question.correctIndex;
  }
  if (question.type === 'truefalse') {
    if (typeof question.correctIndex === 'number') return choice === question.correctIndex;
    if (typeof question.correctAnswer === 'string') {
      return norm(question.correctAnswer) === norm(choice === 0 ? 'true' : 'false');
    }
  }
  return false;
}

// === BattleModal ========================================================
function BattleModal({ battle, biome, onAnswer, onFlee, canFlee, shieldsRemaining, hp, maxHp, bossDisplay }) {
  if (!battle) return null;
  const q = battle.questions[battle.questionIdx];
  if (!q) return null;
  const isBoss = battle.type === 'boss';
  const total = battle.questions.length;
  const stepNum = battle.questionIdx + 1;
  const correctCount = battle.correctCount || 0;
  const mobMaxHp = total;
  const mobHpRemaining = Math.max(0, mobMaxHp - correctCount);
  const tier = isBoss ? 'boss' : (battle.mobTier || 'basic');
  const tierLabel = isBoss ? 'Boss'
                  : tier === 'elite' ? 'Elite'
                  : 'Basic';
  const tierDmg = isBoss ? 3 : tier === 'elite' ? 2 : 1;

  const [revealResult, setRevealResult] = useState(null);

  const handle = (choice) => {
    if (revealResult) return;
    const correct = checkAnswerCorrect(q, choice);
    setRevealResult({ correct, choice });
    setTimeout(() => {
      setRevealResult(null);
      onAnswer(correct, q);
    }, 900);
  };

  useEffect(() => { setRevealResult(null); }, [battle.questionIdx, battle.type]);

  const options = q.type === 'truefalse' ? ['True', 'False'] : (q.options || []);

  // HP-bar block helpers — small color-blocked rectangles per HP point.
  const renderHpRow = (current, max, color, dimColor) => (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 10, height: 16,
          background: i < current ? color : dimColor,
          border: '1px solid rgba(0,0,0,0.55)',
          borderRadius: 2,
          boxShadow: i < current ? `inset 0 0 4px ${color}` : 'none',
        }} />
      ))}
    </div>
  );

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.78)' }}>
      <div
        className="rounded-lg p-5 max-w-xl w-[90%] shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(31,17,8,0.97) 0%, rgba(20,10,4,0.97) 100%)',
          border: `2px double ${biome.accentSolid}`,
          boxShadow: `0 0 40px ${biome.accent}`,
          fontFamily: '"Cinzel", Georgia, serif',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wider italic" style={{ color: biome.accentSolid }}>
            {isBoss
              ? `⚔ Boss Trial · Question ${stepNum} of ${total}`
              : (total > 1 ? `⚔ Elite Encounter · Question ${stepNum} of ${total}` : '⚔ Encounter')}
          </div>
          <div className="text-[10px] italic text-amber-700">
            Wrong = -{tierDmg} HP
          </div>
        </div>

        {/* HP bars — player vs mob/boss */}
        <div className="flex items-center justify-between gap-3 mb-3 px-2 py-2 rounded"
             style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(120,53,15,0.4)' }}>
          <div>
            <div className="text-[10px] italic text-amber-700">Thee · {hp}/{maxHp}</div>
            {renderHpRow(hp, Math.max(maxHp, hp), '#dc2626', '#3a1414')}
          </div>
          <div className="text-amber-700 italic text-base">⚔</div>
          <div className="text-right">
            <div className="text-[10px] italic text-amber-700">
              {tierLabel}{isBoss && bossDisplay ? ` · ${bossDisplay.name}` : ''} · {mobHpRemaining}/{mobMaxHp}
            </div>
            {renderHpRow(mobHpRemaining, mobMaxHp,
              isBoss ? '#a855f7' : tier === 'elite' ? '#f97316' : '#dc2626',
              '#1e293b')}
          </div>
        </div>
        <div className="text-amber-100 italic mb-4 leading-relaxed">{q.question}</div>
        <div className={`grid gap-2 ${q.type === 'truefalse' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {options.map((opt, i) => {
            const isPickedWrong = revealResult && revealResult.choice === i && !revealResult.correct;
            const isPickedRight = revealResult && revealResult.choice === i && revealResult.correct;
            const isAnsRight = revealResult && i === q.correctIndex;
            let bg = 'rgba(31,24,12,0.55)';
            let border = 'rgba(120,53,15,0.5)';
            let color = '#fde68a';
            if (isPickedRight || (revealResult && isAnsRight)) {
              bg = 'rgba(16,185,129,0.25)'; border = '#10b981'; color = '#a7f3d0';
            } else if (isPickedWrong) {
              bg = 'rgba(220,38,38,0.25)'; border = '#dc2626'; color = '#fecaca';
            }
            return (
              <button
                key={i}
                onClick={() => handle(i)}
                disabled={!!revealResult}
                className="text-left px-3 py-2 rounded italic"
                style={{ background: bg, border: `1px solid ${border}`, color, cursor: revealResult ? 'default' : 'pointer' }}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {revealResult && (
          <div className="mt-3 text-xs italic text-amber-300">
            {revealResult.correct
              ? '✦ Thy answer rings true.'
              : '✦ Nay — but the trial does not pause.'}
            {q.explanation && (
              <div className="mt-1 text-amber-200/80">{q.explanation}</div>
            )}
          </div>
        )}
        {!isBoss && canFlee && (
          <button
            onClick={() => { if (!revealResult) onFlee(); }}
            disabled={!!revealResult}
            className="mt-3 px-3 py-2 rounded italic w-full text-sm"
            style={{
              background: 'rgba(31,24,12,0.55)',
              border: '1px solid rgba(59,130,246,0.6)',
              color: '#93c5fd',
              cursor: revealResult ? 'default' : 'pointer',
            }}
          >
            🛡️ Flee — costs 1 shield ({shieldsRemaining} remaining)
          </button>
        )}
        {!isBoss && !canFlee && (
          <div className="mt-3 text-xs italic text-amber-700/80 text-center">
            ⚜ No shields remain to flee with. ⚜
          </div>
        )}
        {isBoss && (
          <div className="mt-3 text-xs italic text-amber-700/80 text-center">
            ⚜ No flight from a dungeon lord. ⚜
          </div>
        )}
      </div>
    </div>
  );
}

// === EndRunOverlay ======================================================
function EndRunOverlay({ runState, biome, summary, onExit, onNewDelve }) {
  if (runState !== 'victory' && runState !== 'death') return null;
  const won = runState === 'victory';
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div
        className="rounded-lg p-6 max-w-md w-[90%] text-center"
        style={{
          background: won
            ? 'linear-gradient(180deg, rgba(20,40,28,0.97) 0%, rgba(8,20,14,0.97) 100%)'
            : 'linear-gradient(180deg, rgba(40,12,12,0.97) 0%, rgba(20,4,4,0.97) 100%)',
          border: `2px double ${won ? '#10b981' : '#dc2626'}`,
          fontFamily: '"Cinzel", Georgia, serif',
        }}
      >
        <div className="text-3xl mb-2">{won ? '👑' : '💀'}</div>
        <div className="text-xl italic mb-1" style={{ color: won ? '#a7f3d0' : '#fecaca' }}>
          {won ? 'Victory!' : 'Slain.'}
        </div>
        <div className="text-xs italic mb-4" style={{ color: biome.accentSolid }}>
          {won
            ? `Thou hast felled ${BOSS_DISPLAY[summary.bossId]?.name || 'the dungeon lord'}.`
            : 'Thy quest ends here. Return when thou art ready.'}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs italic mb-4">
          <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-amber-700">Foes felled</div>
            <div className="text-amber-200">{summary.score}</div>
          </div>
          <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-amber-700">HP remaining</div>
            <div className="text-amber-200">{summary.hp} / {summary.maxHp}</div>
          </div>
          <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-amber-700">Mistakes</div>
            <div className="text-amber-200">{summary.mistakes}</div>
          </div>
          <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-amber-700">Best streak</div>
            <div className="text-amber-200">{summary.maxStreak}</div>
          </div>
        </div>
        {won && (
          <div className="text-xs italic text-amber-300 mb-4">
            +{summary.xpAwarded} XP · +{summary.goldAwarded} gold
          </div>
        )}
        {!won && summary.deathPenaltyApplied && (
          <div className="text-xs italic mb-4">
            <div className="text-amber-300">+{summary.xpAwarded} XP awarded</div>
            <div className="text-rose-300/80 text-[11px] mt-1">
              ⚜ Death penalty: half thy in-run XP forfeit ({summary.xpEarnedInRun} → {summary.xpAwarded}) ⚜
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-center flex-wrap">
          {onNewDelve && (
            <button
              onClick={onNewDelve}
              className="px-4 py-2 rounded italic font-bold"
              style={{
                background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                color: '#451a03',
                border: '2px solid #fbbf24',
              }}
            >
              ⚔ New Delve
            </button>
          )}
          <button
            onClick={onExit}
            className="px-4 py-2 rounded italic"
            style={{
              background: 'rgba(120,53,15,0.7)',
              border: '1px solid rgba(245,158,11,0.8)',
              color: '#fde047',
            }}
          >
            Return to Hearth
          </button>
        </div>
      </div>
    </div>
  );
}

const FACING_LABELS = { up: 'up', down: 'down', left: 'left', right: 'right' };

const DIFFICULTY_LABELS = {
  apprentice: { label: 'Apprentice', icon: '🛡️' },
  adept:      { label: 'Adept',      icon: '⚔️' },
  master:     { label: 'Master',     icon: '👑' },
  mythic:     { label: 'Mythic',     icon: '🌟' },
};

// === Component ==========================================================
export default function DungeonExplore({
  onExit,
  playerState,
  subject,
  courseSet,
  tomeProgress,
  awardXP,
  awardGold,
  recordAnswer,
  checkAchievement,
  unlockSpecialTitle,
  updateProgress,
  updateTomeProgress,
  trackDungeonAttempt,
  onViewHistory,
  consumeItem,
}) {
  const isUnlocked = (id) => {
    if (id === 'apprentice') return true;
    if (!playerState) return false;
    const totalRuns = (playerState.library || []).reduce((s, t) => s + (t.progress?.runsCompleted || 0), 0);
    const ach = playerState.achievements || [];
    const lvl = playerState.level || 1;
    if (id === 'adept')  return lvl >= 10 || totalRuns >= 5;
    if (id === 'master') return lvl >= 25 || (ach.includes('flawless') && ach.includes('first_boss'));
    if (id === 'mythic') return lvl >= 50 || ach.includes('master_complete');
    return false;
  };
  const defaultDifficulty = useMemo(() => {
    const order = ['mythic', 'master', 'adept', 'apprentice'];
    return order.find(isUnlocked) || 'apprentice';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [difficulty, setDifficulty] = useState(defaultDifficulty);
  const diffConfig = DIFF_CONFIG[difficulty] || DIFF_CONFIG.apprentice;

  // Equipment — read from playerState. Compute combined dungeon bonuses
  // once per loadout change and apply at run start.
  const equipped = playerState?.equipped || {};
  const equipBonuses = useMemo(() => {
    const slots = [equipped.weapon, equipped.head, equipped.cloak].filter(Boolean);
    const acc = { maxHpBonus: 0, shieldBonus: 0, xpMul: 1, goldMul: 1, mobScoreBonus: 0, firstWrongFree: false };
    slots.forEach((id) => {
      const eff = EQUIP_EFFECTS[id];
      if (!eff) return;
      if (eff.maxHpBonus)    acc.maxHpBonus += eff.maxHpBonus;
      if (eff.shieldBonus)   acc.shieldBonus += eff.shieldBonus;
      if (eff.xpMul)         acc.xpMul *= eff.xpMul;
      if (eff.goldMul)       acc.goldMul *= eff.goldMul;
      if (eff.mobScoreBonus) acc.mobScoreBonus += eff.mobScoreBonus;
      if (eff.firstWrongFree) acc.firstWrongFree = true;
    });
    return acc;
  }, [equipped.weapon, equipped.head, equipped.cloak]);

  const permUp = playerState?.permUpgrades || {};
  const effectiveMaxHp     = diffConfig.hp + equipBonuses.maxHpBonus + (permUp.maxHp || 0);
  const effectiveMaxShield = Math.max(0, diffConfig.shields + equipBonuses.shieldBonus);

  const biomeId = useMemo(() => pickBiomeForSubject(subject), [subject]);
  const biome = BIOMES[biomeId] || BIOMES.halls;

  const initial = useMemo(
    () => generateMap({ difficulty, biome: biomeId }),
    [difficulty, biomeId],
  );

  // Run state
  const [phase, setPhase] = useState('setup'); // setup | world
  const [pos, setPos] = useState(initial.spawn);
  const [facing, setFacing] = useState('down');
  const [hp, setHp] = useState(effectiveMaxHp);
  const [shields, setShields] = useState(effectiveMaxShield);
  const [firstWrongUsed, setFirstWrongUsed] = useState(false);
  const [reviveAvailable, setReviveAvailable] = useState(false);
  const [xpBuffRemaining, setXpBuffRemaining] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [runState, setRunState] = useState('alive'); // alive | victory | death
  const [battle, setBattle] = useState(null);
  const [endSummary, setEndSummary] = useState(null);
  // Brief notification banner for potion/revive/buff feedback.
  const [notice, setNotice] = useState(null);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const mobsRef = useRef(initial.mobs.map((m) => ({ ...m })));
  const usedQuestionIdsRef = useRef(new Set());
  const runQuestionLogRef = useRef([]);
  const runStartTimeRef = useRef(Date.now());
  const trackedAttemptRef = useRef(false);
  // Phase 14: in-run XP accumulates here so death can halve it without
  // retroactively pulling XP back from playerState.
  const xpEarnedRef = useRef(0);

  const stateRef = useRef({});
  useLayoutEffect(() => {
    stateRef.current = {
      phase, pos, facing, biome, initial, hp, maxHp: effectiveMaxHp,
      shields, maxShields: effectiveMaxShield, battle, runState, score, equipped,
      reviveAvailable, xpBuffRemaining,
    };
  });

  // Reset on map regen / difficulty change / loadout change. Always returns
  // the player to the setup screen so the new run gets confirmed there.
  useEffect(() => {
    setPos(initial.spawn);
    setFacing('down');
    setHp(effectiveMaxHp);
    setShields(effectiveMaxShield);
    setFirstWrongUsed(false);
    setReviveAvailable(false);
    setXpBuffRemaining(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setMistakes(0);
    setRunState('alive');
    setBattle(null);
    setEndSummary(null);
    setPhase('setup');
    mobsRef.current = initial.mobs.map((m) => ({ ...m }));
    usedQuestionIdsRef.current = new Set();
    runQuestionLogRef.current = [];
    runStartTimeRef.current = Date.now();
    trackedAttemptRef.current = false;
    xpEarnedRef.current = 0;
  }, [initial, effectiveMaxHp, effectiveMaxShield]);

  // Begin a delve from the setup screen — fires the tutorial counter and
  // flips into the world phase.
  const beginRun = () => {
    setHp(effectiveMaxHp);
    setShields(effectiveMaxShield);
    setFirstWrongUsed(false);
    setReviveAvailable(false);
    setXpBuffRemaining(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setMistakes(0);
    setRunState('alive');
    setBattle(null);
    setEndSummary(null);
    setNotice(null);
    setPos(initial.spawn);
    setFacing('down');
    mobsRef.current = initial.mobs.map((m) => ({ ...m }));
    usedQuestionIdsRef.current = new Set();
    runQuestionLogRef.current = [];
    runStartTimeRef.current = Date.now();
    xpEarnedRef.current = 0;
    if (!trackedAttemptRef.current && trackDungeonAttempt) {
      trackedAttemptRef.current = true;
      try { trackDungeonAttempt(); } catch { /* best-effort */ }
    }
    setPhase('world');
  };

  // After a victory or defeat, return to the setup screen for another delve.
  const newDelve = () => setPhase('setup');

  // === Potion use =======================================================
  // Triggered by hotkeys 1/2/3 or the on-screen quick-slot buttons. Only
  // active during the world phase while alive and not in a battle.
  const usePotion = (slotIdx) => {
    if (phase !== 'world' || runState !== 'alive' || battle) return;
    const itemId = ((playerState?.equipped?.potions) || [null, null, null])[slotIdx];
    if (!itemId) return;
    const count = (playerState?.inventory || {})[itemId] || 0;
    if (count <= 0) return;
    const eff = POTION_EFFECTS[itemId];
    if (!eff) return;
    let usedLabel = POTION_INFO[itemId]?.name || 'Potion';
    let acted = false;
    switch (eff.kind) {
      case 'heal': {
        if (hp >= effectiveMaxHp) {
          setNotice({ tone: 'info', text: `${usedLabel}: thy lives are already full.` });
          return;
        }
        setHp((h) => Math.min(effectiveMaxHp, h + (eff.amount || 1)));
        acted = true;
        break;
      }
      case 'shield': {
        if (effectiveMaxShield === 0) {
          setNotice({ tone: 'info', text: `No shield bond is permitted on this difficulty.` });
          return;
        }
        if (shields >= effectiveMaxShield) {
          setNotice({ tone: 'info', text: `${usedLabel}: thy shields are already full.` });
          return;
        }
        setShields((s) => Math.min(effectiveMaxShield, s + (eff.amount || 1)));
        acted = true;
        break;
      }
      case 'revive': {
        if (reviveAvailable) {
          setNotice({ tone: 'info', text: 'Phoenix Ember already burns within thee.' });
          return;
        }
        setReviveAvailable(true);
        acted = true;
        break;
      }
      case 'xp_buff': {
        setXpBuffRemaining((n) => Math.max(n, eff.questions || 3));
        acted = true;
        break;
      }
      case 'noop':
      default: {
        acted = true;
        break;
      }
    }
    if (acted && consumeItem) consumeItem(itemId);
    if (acted) setNotice({ tone: 'good', text: `Drained: ${usedLabel}` });
  };

  // Auto-clear the notice banner after a short delay.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);

  // Movement.
  const tryMove = (dx, dy, dir) => {
    if (phase !== 'world' || battle || runState !== 'alive') return;
    setFacing(dir);
    setPos((p) => {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (ny < 0 || ny >= initial.map.length) return p;
      if (nx < 0 || nx >= initial.map[0].length) return p;
      if (!isWalkable(initial.map[ny][nx])) return p;
      return { x: nx, y: ny };
    });
  };

  // === Held-key movement ================================================
  // Track which direction keys are held so the player can walk
  // continuously by holding a key. The rAF loop repeats the move at
  // HOLD_REPEAT_MS cadence; the initial press fires immediately.
  const heldKeysRef = useRef(new Set());
  const lastMoveAtRef = useRef(0);
  const dirOfKey = (key) => {
    switch (key) {
      case 'ArrowUp': case 'w': case 'W':    return 'up';
      case 'ArrowDown': case 's': case 'S':  return 'down';
      case 'ArrowLeft': case 'a': case 'A':  return 'left';
      case 'ArrowRight': case 'd': case 'D': return 'right';
      default: return null;
    }
  };

  // Latest usePotion / tryMove via refs so the keydown handler can reach
  // them without restarting on every render.
  const usePotionRef = useRef(usePotion);
  useLayoutEffect(() => { usePotionRef.current = usePotion; });

  useEffect(() => {
    if (phase !== 'world') return undefined;
    const onKeyDown = (e) => {
      if (battle) return;
      if (runState !== 'alive') {
        if (e.key === 'Escape' && onExit) onExit();
        return;
      }
      if (e.key === 'Escape') { if (onExit) onExit(); return; }
      // Potion hotkeys 1/2/3.
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        usePotionRef.current && usePotionRef.current(parseInt(e.key, 10) - 1);
        e.preventDefault();
        return;
      }
      const dir = dirOfKey(e.key);
      if (!dir) return;
      e.preventDefault();
      if (!heldKeysRef.current.has(dir)) {
        heldKeysRef.current.add(dir);
        const [dx, dy] = DIR_DELTAS[dir];
        tryMove(dx, dy, dir);
        lastMoveAtRef.current = performance.now();
      }
    };
    const onKeyUp = (e) => {
      const dir = dirOfKey(e.key);
      if (dir) heldKeysRef.current.delete(dir);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    if (containerRef.current) containerRef.current.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      heldKeysRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, battle, runState, initial.map, onExit]);

  // Mob / boss collision detection on every position change.
  useEffect(() => {
    if (phase !== 'world' || battle || runState !== 'alive') return;
    // Boss collision
    if (initial.boss && pos.x === initial.boss.x && pos.y === initial.boss.y) {
      const qs = pickQuestions(courseSet, 5, usedQuestionIdsRef.current);
      if (qs.length === 0) {
        // No quiz questions in tome — auto-victory rather than soft-locking.
        finishRun(true, { earlyByEmptyTome: true });
        return;
      }
      qs.forEach((q) => usedQuestionIdsRef.current.add(q.id));
      setBattle({ type: 'boss', questions: qs, questionIdx: 0, correctCount: 0 });
      return;
    }
    // Mob collision — basic = 1 question, elite = 3 questions.
    const mobIdx = mobsRef.current.findIndex((m) => m.x === pos.x && m.y === pos.y);
    if (mobIdx >= 0) {
      const mob = mobsRef.current[mobIdx];
      const qCount = mob.tier === 'elite' ? ELITE_QUESTION_COUNT : 1;
      const qs = pickQuestions(courseSet, qCount, usedQuestionIdsRef.current);
      if (qs.length === 0) {
        mobsRef.current.splice(mobIdx, 1);
        if (awardXP) awardXP(5, 'Foe felled (silent)');
        return;
      }
      qs.forEach((q) => usedQuestionIdsRef.current.add(q.id));
      setBattle({ type: 'mob', mobIdx, mobTier: mob.tier, questions: qs, questionIdx: 0, correctCount: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // Battle answer resolution.
  const onBattleAnswer = (correct, q) => {
    runQuestionLogRef.current.push({
      id: q?.id || `q_${runQuestionLogRef.current.length}`,
      prompt: q?.question || '(question unavailable)',
      correct: !!correct,
      timeSec: 0,
      type: q?.type,
    });
    if (recordAnswer) {
      try { recordAnswer({ id: q?.id, type: q?.type, correct: !!correct }); }
      catch { /* journal write — best effort */ }
    }
    // Decrement xp buff after every question (correct or wrong) so it ticks
    // down naturally over the next 3 trials.
    if (xpBuffRemaining > 0) setXpBuffRemaining((n) => Math.max(0, n - 1));
    if (correct) {
      const scoreGain = 1 + (battle?.type === 'mob' ? equipBonuses.mobScoreBonus : 0);
      setScore((s) => s + scoreGain);
      setStreak((s) => {
        const next = s + 1;
        setMaxStreak((m) => Math.max(m, next));
        return next;
      });
      const buffMul = xpBuffRemaining > 0 ? 1.25 : 1;
      if (battle?.type === 'mob') {
        const tierMul = battle.mobTier === 'elite' ? 2 : 1;
        // XP is deferred to end-of-run so death can halve it.
        xpEarnedRef.current += Math.floor(10 * equipBonuses.xpMul * buffMul * tierMul);
        if (awardGold) awardGold(Math.floor(5 * equipBonuses.goldMul * tierMul), 'Foe felled');
      } else if (battle?.type === 'boss') {
        xpEarnedRef.current += Math.floor(15 * equipBonuses.xpMul * buffMul);
      }
    } else {
      setMistakes((m) => m + 1);
      setStreak(0);
      // Cloak of the Starbound: first wrong answer of the run does no damage.
      if (equipBonuses.firstWrongFree && !firstWrongUsed) {
        setFirstWrongUsed(true);
      } else {
        // Damage scales with whoever just hit you back.
        const dmg = battle?.type === 'boss'
          ? DMG_BY_TIER.boss
          : (battle?.mobTier === 'elite' ? DMG_BY_TIER.elite : DMG_BY_TIER.basic);
        setHp((h) => h - dmg);
      }
    }

    // Mob: cycle through the question gauntlet (1 for basic, 3 for elite),
    // then remove the mob. Wrongs along the way already cost HP above.
    if (battle?.type === 'mob') {
      const nextIdx = battle.questionIdx + 1;
      const nextCorrect = (battle.correctCount || 0) + (correct ? 1 : 0);
      if (nextIdx >= battle.questions.length) {
        mobsRef.current.splice(battle.mobIdx, 1);
        setBattle(null);
      } else {
        setBattle({ ...battle, questionIdx: nextIdx, correctCount: nextCorrect });
      }
      return;
    }

    // Boss: advance through the gauntlet.
    if (battle?.type === 'boss') {
      const nextIdx = battle.questionIdx + 1;
      const nextCorrect = (battle.correctCount || 0) + (correct ? 1 : 0);
      if (nextIdx >= battle.questions.length) {
        setBattle(null);
        setTimeout(() => {
          if (stateRef.current.hp > 0) finishRun(true, {});
        }, 0);
      } else {
        setBattle({ ...battle, questionIdx: nextIdx, correctCount: nextCorrect });
      }
    }
  };

  // Flee a non-boss battle. Costs 1 shield, removes the mob, closes modal.
  const onBattleFlee = () => {
    if (!battle || battle.type !== 'mob') return;
    if (shields <= 0) return;
    setShields((s) => s - 1);
    if (typeof battle.mobIdx === 'number') {
      mobsRef.current.splice(battle.mobIdx, 1);
    }
    setBattle(null);
  };

  // Watch HP — if it drops to 0 or below, end the run (or revive once if the
  // Phoenix Ember has been quaffed).
  useEffect(() => {
    if (phase !== 'world' || runState !== 'alive' || hp > 0) return;
    if (reviveAvailable) {
      setReviveAvailable(false);
      setHp(1);
      setNotice({ tone: 'good', text: '🔥 The Phoenix Ember bursts forth — thou art saved.' });
      return;
    }
    setBattle(null);
    finishRun(false, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hp, phase]);

  const finishRun = (won, opts = {}) => {
    if (runState !== 'alive') return;
    const durationSec = (Date.now() - runStartTimeRef.current) / 1000;
    const finalHp = Math.max(0, hp);

    let xpAwarded = 0;
    let goldAwarded = 0;
    const xpEarnedInRun = xpEarnedRef.current;
    if (won) {
      const completionXp = Math.floor(100 * diffConfig.xpMul * equipBonuses.xpMul);
      const completionGold = Math.floor(100 * diffConfig.goldMul * equipBonuses.goldMul);
      xpAwarded = xpEarnedInRun + completionXp;
      goldAwarded = completionGold;
      if (awardXP && xpAwarded > 0) awardXP(xpAwarded, `${diffConfig.label} Dungeon Cleared`);
      if (awardGold) awardGold(goldAwarded, `${diffConfig.label} Dungeon Cleared`);
      if (checkAchievement) {
        checkAchievement('first_run');
        checkAchievement('first_boss');
        const bossId = initial.boss?.kind;
        if (bossId) {
          const bossAch = `first_${bossId}`;
          checkAchievement(bossAch);
        }
        if (mistakes === 0) {
          checkAchievement('flawless');
          if (unlockSpecialTitle) unlockSpecialTitle('flawless');
        }
        if (diffConfig.completeAchievement) checkAchievement(diffConfig.completeAchievement);
      }
      if (diffConfig.rewardTitleId && unlockSpecialTitle) unlockSpecialTitle(diffConfig.rewardTitleId);
      if (updateTomeProgress) {
        const newRunCount = (tomeProgress?.runsCompleted || 0) + 1;
        const newBossCount = (tomeProgress?.bossesDefeated || 0) + 1;
        updateTomeProgress({ runsCompleted: newRunCount, bossesDefeated: newBossCount });
      }
      if (updateProgress && playerState) {
        updateProgress({ longestStreak: Math.max(playerState.longestStreak || 0, maxStreak) });
      }
    } else {
      // Death penalty: half the XP earned in the run, no completion bonus.
      // Gold accumulated mid-run was already paid out per kill so it stays.
      xpAwarded = Math.floor(xpEarnedInRun * 0.5);
      if (xpAwarded > 0 && awardXP) awardXP(xpAwarded, 'Half XP — death penalty');
    }

    // Run history entry — same shape as the legacy DungeonRun for Chronicle compatibility.
    const entry = {
      runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      difficulty,
      bossId: initial.boss?.kind,
      won: !!won,
      score,
      livesRemaining: finalHp,
      maxLives: effectiveMaxHp,
      mistakes,
      maxStreak,
      durationSec,
      modifiers: [],
      totalQuestions: runQuestionLogRef.current.length,
      questionLog: [...runQuestionLogRef.current],
    };
    if (updateTomeProgress) {
      const existing = tomeProgress?.runHistory || [];
      const trimmed = [...existing, entry].slice(-100);
      updateTomeProgress({ runHistory: trimmed });
    }

    setEndSummary({
      score,
      hp: finalHp,
      maxHp: effectiveMaxHp,
      mistakes,
      maxStreak,
      xpAwarded,
      goldAwarded,
      bossId: initial.boss?.kind,
      earlyByEmptyTome: !!opts.earlyByEmptyTome,
      xpEarnedInRun,
      deathPenaltyApplied: !won && xpEarnedInRun > 0,
    });
    setRunState(won ? 'victory' : 'death');
  };

  // Animation refs.
  const animPosRef = useRef({ x: initial.spawn.x, y: initial.spawn.y });
  const lastPosRef = useRef({ x: initial.spawn.x, y: initial.spawn.y });
  const moveStartRef = useRef(0);

  useEffect(() => {
    animPosRef.current = { x: initial.spawn.x, y: initial.spawn.y };
    lastPosRef.current = { x: initial.spawn.x, y: initial.spawn.y };
    moveStartRef.current = 0;
  }, [initial]);

  useEffect(() => {
    moveStartRef.current = performance.now();
    lastPosRef.current = { ...animPosRef.current };
  }, [pos]);

  // === rAF render loop ===================================================
  useEffect(() => {
    if (phase !== 'world') return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf;

    const tick = (now) => {
      const s = stateRef.current;
      const target = s.pos;
      const start = lastPosRef.current;
      const t0 = moveStartRef.current || now;
      const t = Math.min(1, (now - t0) / MOVE_MS);
      const eased = t * t * (3 - 2 * t);
      const ax = start.x + (target.x - start.x) * eased;
      const ay = start.y + (target.y - start.y) * eased;
      animPosRef.current = { x: ax, y: ay };

      // Held-key repeat: while a direction is held, fire moves at HOLD_REPEAT_MS
      // cadence. The first move on keydown was already fired in the handler.
      if (!s.battle && s.runState === 'alive' && heldKeysRef.current.size > 0) {
        if (now - lastMoveAtRef.current >= HOLD_REPEAT_MS) {
          // If multiple keys are held, prefer the most recently added (insertion-ordered Set).
          const keys = Array.from(heldKeysRef.current);
          const dir = keys[keys.length - 1];
          const [dx, dy] = DIR_DELTAS[dir];
          setFacing(dir);
          setPos((p) => {
            const nx = p.x + dx;
            const ny = p.y + dy;
            if (ny < 0 || ny >= s.initial.map.length) return p;
            if (nx < 0 || nx >= s.initial.map[0].length) return p;
            if (!isWalkable(s.initial.map[ny][nx])) return p;
            return { x: nx, y: ny };
          });
          lastMoveAtRef.current = now;
        }
      }

      const moving = t < 1;
      const walkFrame = moving ? Math.floor(now / WALK_FRAME_MS) % 4 : 0;

      // Mob AI — but pause while a battle is open or run is over. Each mob
      // ticks at its own cadence based on `nextMoveAt`. Behavior depends on
      // mob.ai: idle (no move), patrol (bounce one axis), aggressive (chase
      // when player is close, otherwise wander).
      if (!s.battle && s.runState === 'alive') {
        mobsRef.current.forEach((m) => {
          if (m.ai === 'idle') return;
          if (m.nextMoveAt === 0) {
            m.nextMoveAt = now + MOB_MOVE_MIN_MS + Math.random() * (MOB_MOVE_MAX_MS - MOB_MOVE_MIN_MS);
            return;
          }
          if (now < m.nextMoveAt) return;

          const tryStep = (dx, dy) => {
            const nx = m.x + dx;
            const ny = m.y + dy;
            const inBounds = nx >= m.bounds.x && nx < m.bounds.x + m.bounds.w &&
                             ny >= m.bounds.y && ny < m.bounds.y + m.bounds.h;
            if (!inBounds) return false;
            if (s.initial.map[ny]?.[nx] !== TILE.FLOOR) return false;
            if (nx === s.pos.x && ny === s.pos.y) return false;
            // Avoid stepping onto another mob.
            if (mobsRef.current.some((other) => other !== m && other.x === nx && other.y === ny)) return false;
            m.x = nx;
            m.y = ny;
            return true;
          };

          if (m.ai === 'aggressive') {
            const dist = Math.abs(s.pos.x - m.x) + Math.abs(s.pos.y - m.y);
            if (dist > 0 && dist <= MOB_AGGRO_RANGE) {
              const dx = Math.sign(s.pos.x - m.x);
              const dy = Math.sign(s.pos.y - m.y);
              // Try the longer axis first; fall back to the other.
              const horizFirst = Math.abs(s.pos.x - m.x) >= Math.abs(s.pos.y - m.y);
              if (horizFirst) {
                if (!(dx !== 0 && tryStep(dx, 0))) tryStep(0, dy);
              } else {
                if (!(dy !== 0 && tryStep(0, dy))) tryStep(dx, 0);
              }
              // Aggressive mobs tick faster than regular wander.
              m.nextMoveAt = now + 700 + Math.random() * 600;
              return;
            }
          }

          if (m.ai === 'patrol') {
            // Bounce horizontally; flip direction on wall.
            if (!tryStep(m.patrolDir || 1, 0)) {
              m.patrolDir = -(m.patrolDir || 1);
              tryStep(m.patrolDir, 0);
            }
            m.nextMoveAt = now + MOB_MOVE_MIN_MS + Math.random() * (MOB_MOVE_MAX_MS - MOB_MOVE_MIN_MS);
            return;
          }

          // Default wander (basic non-patrol mobs without aggression nearby).
          const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
          const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
          tryStep(dx, dy);
          m.nextMoveAt = now + MOB_MOVE_MIN_MS + Math.random() * (MOB_MOVE_MAX_MS - MOB_MOVE_MIN_MS);
        });
      }

      const cameraX = ax * TILE_PX - CANVAS_W / 2 + TILE_PX / 2;
      const cameraY = ay * TILE_PX - CANVAS_H / 2 + TILE_PX / 2;

      ctx.fillStyle = '#050302';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const startCol = Math.max(0, Math.floor(cameraX / TILE_PX) - 1);
      const endCol   = Math.min(s.initial.width,  startCol + VIEW_W + 3);
      const startRow = Math.max(0, Math.floor(cameraY / TILE_PX) - 1);
      const endRow   = Math.min(s.initial.height, startRow + VIEW_H + 3);

      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          const px = x * TILE_PX - cameraX;
          const py = y * TILE_PX - cameraY;
          drawTile(ctx, s.biome, s.initial.map[y][x], px, py);
        }
      }

      s.initial.decorations.forEach((d) => {
        if (d.x < startCol - 1 || d.x > endCol || d.y < startRow - 1 || d.y > endRow) return;
        const px = d.x * TILE_PX - cameraX;
        const py = d.y * TILE_PX - cameraY;
        const drawer = DECO_DRAWERS[d.kind];
        if (drawer) drawer(ctx, px, py, now);
      });

      if (s.initial.boss) {
        const b = s.initial.boss;
        if (b.x >= startCol - 1 && b.x <= endCol && b.y >= startRow - 1 && b.y <= endRow) {
          const px = b.x * TILE_PX - cameraX;
          const py = b.y * TILE_PX - cameraY;
          const drawer = BOSS_DRAWERS[b.kind];
          if (drawer) drawer(ctx, px, py, now);
        }
      }

      mobsRef.current.forEach((m) => {
        if (m.x < startCol - 1 || m.x > endCol || m.y < startRow - 1 || m.y > endRow) return;
        const px = m.x * TILE_PX - cameraX;
        const py = m.y * TILE_PX - cameraY;
        const drawer = MOB_DRAWERS[m.kind];
        if (drawer) drawer(ctx, px, py, now);
      });

      const ppx = ax * TILE_PX - cameraX;
      const ppy = ay * TILE_PX - cameraY;
      drawPlayer(ctx, ppx, ppy, s.facing, walkFrame, s.equipped);

      const grad = ctx.createRadialGradient(
        CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.4,
        CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.7,
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // HUD — biome name (top-left)
      ctx.font = "16px 'Cinzel', Georgia, serif";
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8, 8, 320, 28);
      ctx.fillStyle = s.biome.accentSolid;
      ctx.fillText(`${s.biome.icon}  ${s.biome.name}`, 16, 14);

      // HP hearts + shield icons (top-right). Hearts get a fixed slot; shields
      // sit immediately to their left.
      const heartCount = Math.min(s.maxHp, 6);
      const hudHpW = heartCount * 20 + 16 + (s.maxHp > 6 ? 36 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(CANVAS_W - hudHpW - 8, 8, hudHpW, 28);
      for (let i = 0; i < heartCount; i++) {
        const hx = CANVAS_W - hudHpW + 4 + i * 20;
        const hy = 14;
        ctx.fillStyle = i < s.hp ? '#ef4444' : '#3a1414';
        ctx.beginPath();
        ctx.arc(hx + 5,  hy + 5, 5, 0, Math.PI * 2);
        ctx.arc(hx + 11, hy + 5, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(hx,      hy + 6);
        ctx.lineTo(hx + 16, hy + 6);
        ctx.lineTo(hx + 8,  hy + 16);
        ctx.closePath();
        ctx.fill();
        // Highlight on full heart for crispness
        if (i < s.hp) {
          ctx.fillStyle = '#fca5a5';
          ctx.fillRect(hx + 3, hy + 3, 1, 1);
          ctx.fillRect(hx + 9, hy + 3, 1, 1);
        }
      }
      if (s.maxHp > 6) {
        ctx.fillStyle = '#fde047';
        ctx.font = "11px 'Cinzel', Georgia, serif";
        ctx.fillText(`×${s.hp}/${s.maxHp}`, CANVAS_W - 40, 16);
        ctx.font = "16px 'Cinzel', Georgia, serif";
      }

      // Shields, immediately left of HP.
      if (s.maxShields > 0) {
        const shieldCount = Math.min(s.maxShields, 4);
        const hudShW = shieldCount * 18 + 12;
        const shX = CANVAS_W - hudHpW - 8 - hudShW - 6;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(shX, 8, hudShW, 28);
        for (let i = 0; i < shieldCount; i++) {
          const sx = shX + 6 + i * 18;
          const sy = 12;
          ctx.fillStyle = i < s.shields ? '#3b82f6' : '#1e3a5f';
          ctx.beginPath();
          ctx.moveTo(sx,      sy);
          ctx.lineTo(sx + 12, sy);
          ctx.lineTo(sx + 12, sy + 8);
          ctx.lineTo(sx + 6,  sy + 14);
          ctx.lineTo(sx,      sy + 8);
          ctx.closePath();
          ctx.fill();
          if (i < s.shields) {
            ctx.fillStyle = '#fde047';
            ctx.fillRect(sx + 5, sy + 3, 2, 4);
          }
        }
      }

      // Score + difficulty (bottom-right)
      ctx.font = "12px 'Cinzel', Georgia, serif";
      const scoreText = `Foes: ${s.score} · ${(DIFFICULTY_LABELS[difficulty]?.label || difficulty)}`;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(CANVAS_W - 220, CANVAS_H - 28, 212, 22);
      ctx.fillStyle = '#fde047';
      ctx.fillText(scoreText, CANVAS_W - 212, CANVAS_H - 24);

      // Coords (bottom-left)
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8, CANVAS_H - 28, 180, 22);
      ctx.fillStyle = '#a8a29e';
      ctx.fillText(`(${s.pos.x}, ${s.pos.y}) · facing ${FACING_LABELS[s.facing]}`, 16, CANVAS_H - 24);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ============== Setup screen ==========================================
  if (phase === 'setup') {
    const bossKind = initial.boss?.kind;
    const bossDisp = bossKind ? BOSS_DISPLAY[bossKind] : null;
    const equippedPotions = equipped.potions || [null, null, null];
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button onClick={onExit} className="flex items-center gap-2 text-amber-600 hover:text-amber-400 italic">
            <ArrowLeft className="w-4 h-4" /> Return to Hearth
          </button>
          <div className="text-xs italic" style={{ color: biome.accentSolid }}>
            ⚜ Prepare thy delve ⚜
          </div>
        </div>

        <div className="rounded p-5 relative" style={{
          background: `linear-gradient(135deg, rgba(20,10,4,0.9) 0%, rgba(10,6,4,0.97) 100%)`,
          border: `3px double ${biome.accent}`,
          boxShadow: `0 0 30px ${biome.accent}, inset 0 0 30px rgba(0,0,0,0.6)`,
          fontFamily: '"Cinzel", Georgia, serif',
        }}>
          <div className="text-center mb-4">
            <div className="text-3xl mb-1">{biome.icon}</div>
            <h2 className="text-2xl font-bold italic" style={{ color: biome.accentSolid, textShadow: `0 0 12px ${biome.accent}` }}>
              {biome.name}
            </h2>
            <div className="text-xs italic text-amber-700/80 mt-1 max-w-md mx-auto">{biome.flavor}</div>
          </div>

          {/* Difficulty selector */}
          <div className="flex flex-wrap items-center gap-2 justify-center mb-4">
            <span className="text-xs text-amber-700 italic">Trial:</span>
            {Object.entries(DIFFICULTY_LABELS).map(([id, info]) => {
              const unlocked = isUnlocked(id);
              const selected = difficulty === id;
              return (
                <button
                  key={id}
                  disabled={!unlocked}
                  onClick={() => setDifficulty(id)}
                  className="px-3 py-1.5 rounded text-xs italic"
                  style={{
                    background: selected ? 'rgba(120,53,15,0.7)' : 'rgba(31,24,12,0.5)',
                    border: `1px solid ${selected ? 'rgba(245,158,11,0.8)' : 'rgba(120,53,15,0.4)'}`,
                    color: selected ? '#fde047' : (unlocked ? '#a8a29e' : '#52443a'),
                    opacity: unlocked ? 1 : 0.5,
                    cursor: unlocked ? 'pointer' : 'not-allowed',
                  }}
                  title={unlocked ? `${ROOMS_BY_DIFFICULTY[id]} chambers · ${DIFF_CONFIG[id].hp} HP · ${DIFF_CONFIG[id].shields} 🛡️` : 'Locked'}
                >
                  {info.icon} {info.label}
                </button>
              );
            })}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center mb-4">
            <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(239,68,68,0.4)' }}>
              <div className="text-[10px] uppercase italic text-amber-700">Lives</div>
              <div className="text-xl text-red-400 italic">❤ {effectiveMaxHp}</div>
            </div>
            <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(59,130,246,0.4)' }}>
              <div className="text-[10px] uppercase italic text-amber-700">Shields</div>
              <div className="text-xl text-blue-400 italic">🛡 {effectiveMaxShield}</div>
            </div>
            <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,158,11,0.4)' }}>
              <div className="text-[10px] uppercase italic text-amber-700">XP Mul</div>
              <div className="text-xl text-amber-300 italic">×{(diffConfig.xpMul * equipBonuses.xpMul).toFixed(2)}</div>
            </div>
            <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,158,11,0.4)' }}>
              <div className="text-[10px] uppercase italic text-amber-700">Gold Mul</div>
              <div className="text-xl text-yellow-300 italic">×{(diffConfig.goldMul * equipBonuses.goldMul).toFixed(2)}</div>
            </div>
          </div>

          {/* Boss preview */}
          {bossDisp && (
            <div className="p-3 rounded mb-4 flex items-center gap-3" style={{
              background: 'rgba(0,0,0,0.4)',
              border: `1px solid ${biome.accent}`,
            }}>
              <div className="text-4xl">{bossDisp.icon}</div>
              <div className="flex-1">
                <div className="text-[10px] uppercase italic text-amber-700">Final foe</div>
                <div className="text-lg italic" style={{ color: biome.accentSolid }}>{bossDisp.name}</div>
                <div className="text-[11px] italic text-amber-100/70">5-question gauntlet · no flight from a dungeon lord</div>
              </div>
            </div>
          )}

          {/* Loadout summary */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">⚔</span>
              <h4 className="text-xs font-bold italic text-amber-200 tracking-wider">Equipped</h4>
              <div className="flex-1 h-px bg-gradient-to-r from-amber-700/40 to-transparent" />
              <span className="text-[10px] italic text-amber-700">Manage in The Hoard</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs italic">
              {[
                { id: 'weapon', label: 'Weapon', emptyIcon: '⚔️' },
                { id: 'head',   label: 'Head',   emptyIcon: '👑' },
                { id: 'cloak',  label: 'Cloak',  emptyIcon: '🌌' },
                { id: 'pet',    label: 'Pet',    emptyIcon: '🐾' },
              ].map(({ id, label, emptyIcon }) => {
                const eq = equipped[id];
                const info = eq ? POTION_INFO[eq] : null; // potions excluded; gear icons embedded below
                // For weapon/head/cloak/pet we don't have a local lookup of name/icon.
                // Display the slot with a generic icon and "(Equipped)" text.
                return (
                  <div key={id} className="p-2 rounded" style={{
                    background: 'rgba(0,0,0,0.35)',
                    border: `1px solid ${eq ? 'rgba(245,158,11,0.55)' : 'rgba(120,53,15,0.3)'}`,
                  }}>
                    <div className="text-[10px] uppercase italic text-amber-700">{label}</div>
                    <div className={eq ? 'text-amber-200' : 'text-amber-700/60'}>
                      {eq ? `${emptyIcon} Equipped` : '— Empty —'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Potion quick-slots */}
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🧪</span>
                <h4 className="text-xs font-bold italic text-amber-200 tracking-wider">Potion Quick-Slots</h4>
                <div className="flex-1 h-px bg-gradient-to-r from-amber-700/40 to-transparent" />
                <span className="text-[10px] italic text-amber-700">Hotkeys 1 · 2 · 3</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs italic">
                {[0, 1, 2].map((i) => {
                  const pid = equippedPotions[i];
                  const info = pid ? POTION_INFO[pid] : null;
                  const count = pid ? ((playerState?.inventory || {})[pid] || 0) : 0;
                  return (
                    <div key={i} className="p-2 rounded flex items-center gap-2" style={{
                      background: 'rgba(0,0,0,0.35)',
                      border: `1px solid ${info ? 'rgba(34,197,94,0.55)' : 'rgba(120,53,15,0.3)'}`,
                    }}>
                      <div className="text-xl w-6 text-center">{info ? info.icon : (i + 1)}</div>
                      <div className="flex-1 min-w-0 truncate">
                        {info ? `${info.name} ×${count}` : <span className="text-amber-700/60">— Empty —</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Begin button */}
          <div className="text-center">
            <button
              onClick={beginRun}
              className="px-6 py-3 rounded font-bold italic text-lg"
              style={{
                background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                color: '#451a03',
                border: '2px solid #fbbf24',
                boxShadow: '0 0 24px rgba(245,158,11,0.5)',
                fontFamily: '"Cinzel", Georgia, serif',
              }}
            >
              ⚔ Begin the Delve ⚔
            </button>
            <div className="mt-2 text-[10px] italic text-amber-700">
              {ROOMS_BY_DIFFICULTY[difficulty]} chambers await · Use 1/2/3 to drink potions in-dungeon
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============== World view ============================================
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={() => setPhase('setup')} className="flex items-center gap-2 text-amber-600 hover:text-amber-400 italic">
          <ArrowLeft className="w-4 h-4" /> Abandon (back to setup)
        </button>
        <div className="text-xs italic" style={{ color: biome.accentSolid }}>
          {biome.icon} {biome.name} · {DIFFICULTY_LABELS[difficulty]?.label}
        </div>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        className="mx-auto outline-none rounded relative select-none"
        style={{
          width: '100%',
          maxWidth: CANVAS_W,
          aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
          background: '#0a0604',
          border: `3px double ${biome.accent}`,
          boxShadow: `0 0 30px ${biome.accent}, inset 0 0 30px rgba(0,0,0,0.7)`,
          overflow: 'hidden',
        }}
        onClick={() => containerRef.current?.focus()}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            imageRendering: 'pixelated',
          }}
        />
        <BattleModal
          battle={battle}
          biome={biome}
          onAnswer={onBattleAnswer}
          onFlee={onBattleFlee}
          canFlee={shields > 0}
          shieldsRemaining={shields}
          hp={hp}
          maxHp={effectiveMaxHp}
          bossDisplay={initial.boss?.kind ? BOSS_DISPLAY[initial.boss.kind] : null}
        />
        <EndRunOverlay
          runState={runState}
          biome={biome}
          summary={endSummary || { score, hp, maxHp: effectiveMaxHp, mistakes, maxStreak, xpAwarded: 0, goldAwarded: 0, bossId: initial.boss?.kind }}
          onExit={() => onExit && onExit()}
          onNewDelve={newDelve}
        />

        {/* Potion HUD — three quick-slot buttons centered at the bottom of the
            canvas. Hotkeys 1/2/3 also fire these. Hidden during battle. */}
        {!battle && runState === 'alive' && (
          <div className="absolute left-1/2 -translate-x-1/2 flex gap-2"
               style={{ bottom: 8, pointerEvents: 'auto' }}>
            {[0, 1, 2].map((i) => {
              const pid = (equipped.potions || [null, null, null])[i];
              const info = pid ? POTION_INFO[pid] : null;
              const count = pid ? ((playerState?.inventory || {})[pid] || 0) : 0;
              const usable = !!info && count > 0;
              return (
                <button
                  key={i}
                  onClick={() => usePotion(i)}
                  disabled={!usable}
                  className="rounded text-center"
                  style={{
                    width: 60, height: 44,
                    background: usable ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.4)',
                    border: `1px solid ${usable ? '#10b981' : 'rgba(120,53,15,0.4)'}`,
                    color: usable ? '#fde047' : '#52443a',
                    cursor: usable ? 'pointer' : 'not-allowed',
                    fontFamily: '"Cinzel", Georgia, serif',
                  }}
                  title={info ? `[${i + 1}] ${info.name} (×${count})` : `Empty quick-slot ${i + 1}`}
                >
                  <div className="text-[10px] italic">[{i + 1}]</div>
                  <div className="text-base leading-none">
                    {info ? `${info.icon}${count > 0 ? `×${count}` : ''}` : '—'}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Buff indicators top-center */}
        {(reviveAvailable || xpBuffRemaining > 0) && (
          <div className="absolute left-1/2 -translate-x-1/2 flex gap-2"
               style={{ top: 42, pointerEvents: 'none' }}>
            {reviveAvailable && (
              <div className="px-2 py-1 rounded text-[11px] italic"
                   style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #f97316', color: '#fdba74' }}>
                🔥 Phoenix Ember active
              </div>
            )}
            {xpBuffRemaining > 0 && (
              <div className="px-2 py-1 rounded text-[11px] italic"
                   style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #fbbf24', color: '#fde047' }}>
                ☕ +25% XP · {xpBuffRemaining} left
              </div>
            )}
          </div>
        )}

        {/* Transient notice banner */}
        {notice && (
          <div className="absolute left-1/2 -translate-x-1/2 px-3 py-2 rounded text-xs italic"
               style={{
                 top: 80,
                 background: 'rgba(0,0,0,0.78)',
                 border: `1px solid ${notice.tone === 'good' ? '#10b981' : '#a8a29e'}`,
                 color: notice.tone === 'good' ? '#a7f3d0' : '#fde68a',
                 pointerEvents: 'none',
                 maxWidth: '80%',
               }}
          >
            {notice.text}
          </div>
        )}
      </div>

      <div className="flex justify-center select-none">
        <div className="grid grid-cols-3 gap-1" style={{ width: 180 }}>
          <div />
          <button onClick={() => tryMove(0, -1, 'up')} className="rounded text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}>▲</button>
          <div />
          <button onClick={() => tryMove(-1, 0, 'left')} className="rounded text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}>◀</button>
          <button onClick={() => onExit && onExit()} className="rounded text-amber-700 text-xs italic"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}>Esc</button>
          <button onClick={() => tryMove(1, 0, 'right')} className="rounded text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}>▶</button>
          <div />
          <button onClick={() => tryMove(0, 1, 'down')} className="rounded text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}>▼</button>
          <div />
        </div>
      </div>

      <div className="text-center text-xs italic max-w-xl mx-auto" style={{ color: '#92400e' }}>
        ⚜ {biome.flavor} ⚜
        <div className="text-[10px] text-amber-700/70 mt-1">
          Walk into a foe to engage · Reach the dungeon lord to win the run · Esc to leave
        </div>
        {onViewHistory && (
          <button onClick={onViewHistory} className="mt-2 text-amber-600 hover:text-amber-400 italic underline text-[11px]">
            ⚜ View Chronicle of Delves ⚜
          </button>
        )}
      </div>
    </div>
  );
}
