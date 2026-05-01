// DungeonExplore — Phase 12 (Pokémon-feel revision).
// Canvas-rendered top-down RPG: large viewport (~1200×816), pixel-style
// sprites with walk animation, biome-themed tile textures, room-level fog
// of war with a player aura, dungeon size scaling with difficulty.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

export const TILE = {
  WALL: 0,
  FLOOR: 1,
  DOOR: 2,
  STAIRS_UP: 3,
  STAIRS_DOWN: 4,
};

// === Render constants ===================================================
const TILE_PX = 48;
const VIEW_W = 25;            // viewport width in tiles
const VIEW_H = 17;            // viewport height in tiles
const CANVAS_W = VIEW_W * TILE_PX;  // 1200
const CANVAS_H = VIEW_H * TILE_PX;  //  816
const PLAYER_AURA_RADIUS = 3;
const MOVE_MS = 150;          // tile-to-tile move duration
const WALK_FRAME_MS = 150;    // walk animation cycle period

const isWalkable = (t) => t === TILE.FLOOR || t === TILE.DOOR || t === TILE.STAIRS_UP || t === TILE.STAIRS_DOWN;

// === Biomes ============================================================
// Each biome carries a canvas color palette (separate from old DOM colors)
// keyed by tile type. The palette feeds into the per-biome tile drawer.
export const BIOMES = {
  crypt: {
    id: 'crypt',
    name: 'Crypt of Cryptography',
    icon: '🗝️',
    flavor: 'Mossy stone tombs, encoded sigils etched on every wall.',
    accent: 'rgba(168, 85, 247, 0.4)',
    accentSolid: '#a855f7',
    palette: {
      wallBase: '#1a1422', wallTop: '#2a1f36', wallShade: '#0d0814', wallDetail: '#a855f7',
      floorBase: '#241a30', floorAlt: '#2a2038', floorDetail: '#3d2a48', floorAccent: '#7c3aed',
    },
    decoChance: 0.12,
  },
  sewers: {
    id: 'sewers',
    name: 'Sewers of OWASP',
    icon: '🕸️',
    flavor: 'Dripping pipes and graffiti scrawled by long-departed pen-testers.',
    accent: 'rgba(16, 185, 129, 0.4)',
    accentSolid: '#10b981',
    palette: {
      wallBase: '#1a2820', wallTop: '#284030', wallShade: '#0e1c14', wallDetail: '#10b981',
      floorBase: '#142820', floorAlt: '#1a3024', floorDetail: '#284030', floorAccent: '#10b981',
    },
    decoChance: 0.18,
  },
  tower: {
    id: 'tower',
    name: 'Tower of Network Defense',
    icon: '🗼',
    flavor: 'Glittering steel walkways, every door a port — opened or sealed.',
    accent: 'rgba(59, 130, 246, 0.4)',
    accentSolid: '#3b82f6',
    palette: {
      wallBase: '#1c2838', wallTop: '#2a4060', wallShade: '#0e1828', wallDetail: '#3b82f6',
      floorBase: '#16243a', floorAlt: '#1c2c44', floorDetail: '#2a3c5c', floorAccent: '#60a5fa',
    },
    decoChance: 0.15,
  },
  halls: {
    id: 'halls',
    name: 'Halls of the Hardware',
    icon: '⚙️',
    flavor: 'Ancient circuitry pulses behind iron grates, fans humming low.',
    accent: 'rgba(245, 158, 11, 0.4)',
    accentSolid: '#f59e0b',
    palette: {
      wallBase: '#2a1a14', wallTop: '#4a2a1c', wallShade: '#1a0e0a', wallDetail: '#f59e0b',
      floorBase: '#2a1c14', floorAlt: '#3a2418', floorDetail: '#4a2e1c', floorAccent: '#fbbf24',
    },
    decoChance: 0.14,
  },
  wastes: {
    id: 'wastes',
    name: 'Wastes of WiFi',
    icon: '📡',
    flavor: 'A windswept plain where signals scream and antennas sway.',
    accent: 'rgba(217, 119, 6, 0.4)',
    accentSolid: '#d97706',
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
    [1,1,1],
    [1,1,1],
    [1,1,1],
    [1,1,1],
    [1,1,1],
    [1,1,1],
    [1,1,1],
    [1,1,1],
    [1,1,1],
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

export const ROOMS_BY_DIFFICULTY = { apprentice: 5, adept: 8, master: 12, mythic: 16 };
export const SIZE_BY_DIFFICULTY = {
  apprentice: { w: 60,  h: 40 },
  adept:      { w: 75,  h: 50 },
  master:     { w: 90,  h: 60 },
  mythic:     { w: 110, h: 70 },
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

  const corridors = [];
  for (let i = 1; i < rooms.length; i++) {
    const a = rectCenter(rooms[i - 1]);
    const b = rectCenter(rooms[i]);
    const horizontalFirst = rng() < 0.5;
    const tiles = [];
    const carveH = (y, x1, x2) => {
      const [lo, hi] = x1 < x2 ? [x1, x2] : [x2, x1];
      for (let x = lo; x <= hi; x++) {
        if (map[y][x] === TILE.WALL) {
          map[y][x] = TILE.FLOOR;
          tiles.push({ x, y });
        }
      }
    };
    const carveV = (x, y1, y2) => {
      const [lo, hi] = y1 < y2 ? [y1, y2] : [y2, y1];
      for (let y = lo; y <= hi; y++) {
        if (map[y][x] === TILE.WALL) {
          map[y][x] = TILE.FLOOR;
          tiles.push({ x, y });
        }
      }
    };
    if (horizontalFirst) {
      carveH(a.y, a.x, b.x);
      carveV(b.x, a.y, b.y);
    } else {
      carveV(a.x, a.y, b.y);
      carveH(b.y, a.x, b.x);
    }
    corridors.push({ from: i - 1, to: i, tiles });
  }

  if (rooms.length > 1) {
    const last = rectCenter(rooms[rooms.length - 1]);
    map[last.y][last.x] = TILE.STAIRS_DOWN;
  }

  const spawn = rooms.length > 0 ? rectCenter(rooms[0]) : { x: 1, y: 1 };
  return { map, rooms, corridors, spawn, width, height, biome };
}

export function generateStarterMap(opts = {}) {
  return generateMap({ difficulty: 'apprentice', biome: 'halls', ...opts });
}

const roomIndexAt = (rooms, x, y) => {
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return null;
};

// Cheap deterministic hash so per-tile decoration is stable across renders.
const tileSeed = (x, y) => {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
};

// === Tile drawing =======================================================
function drawWall(ctx, p, px, py) {
  ctx.fillStyle = p.wallBase;
  ctx.fillRect(px, py, TILE_PX, TILE_PX);
  // Top highlight
  ctx.fillStyle = p.wallTop;
  ctx.fillRect(px, py, TILE_PX, 4);
  // Bottom shadow
  ctx.fillStyle = p.wallShade;
  ctx.fillRect(px, py + TILE_PX - 6, TILE_PX, 6);
  // Brick mortar
  ctx.fillStyle = p.wallShade;
  ctx.fillRect(px, py + 16, TILE_PX, 1);
  ctx.fillRect(px, py + 32, TILE_PX, 1);
  ctx.fillRect(px + 24, py + 4,  1, 12);
  ctx.fillRect(px + 12, py + 17, 1, 15);
  ctx.fillRect(px + 24, py + 33, 1, 9);
}

function drawFloor(ctx, p, px, py, decoChance, seed) {
  ctx.fillStyle = p.floorBase;
  ctx.fillRect(px, py, TILE_PX, TILE_PX);
  // Subtle tile lines
  ctx.fillStyle = p.floorAlt;
  ctx.fillRect(px, py, TILE_PX, 1);
  ctx.fillRect(px, py, 1, TILE_PX);
  // Decoration — tufts/cracks/circuits depending on biome chance
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
  // Concentric chevrons descending
  ctx.fillStyle = p.wallShade;
  for (let i = 0; i < 5; i++) {
    const inset = i * 4;
    ctx.fillRect(px + 6 + inset, py + 6 + inset, TILE_PX - 12 - inset * 2, 3);
  }
  // Glow
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

function drawHidden(ctx, px, py) {
  ctx.fillStyle = '#050302';
  ctx.fillRect(px, py, TILE_PX, TILE_PX);
}

// === Player sprite ======================================================
// Hooded adventurer drawn at runtime — 32×40 px centered in a 48×48 tile.
// Walk frame: 0/2 = neutral, 1 = left foot, 3 = right foot.
function drawPlayer(ctx, px, py, facing, walkFrame) {
  const cx = px + TILE_PX / 2;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE_PX - 6, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const headTop = py + 6;
  const bodyTop = headTop + 12;
  const legTop = bodyTop + 12;

  // Cape (visible mostly when facing up/sides)
  if (facing !== 'down') {
    ctx.fillStyle = '#5a1d1d';
    ctx.fillRect(cx - 8, bodyTop + 2, 16, 12);
    ctx.fillStyle = '#3a0e0e';
    ctx.fillRect(cx - 8, bodyTop + 12, 16, 2);
  }

  // Head — hood
  ctx.fillStyle = '#2a1810';
  ctx.fillRect(cx - 8, headTop, 16, 4);
  ctx.fillRect(cx - 9, headTop + 2, 18, 2);
  ctx.fillRect(cx - 8, headTop + 4, 16, 8);
  // Face shadow inside hood
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(cx - 6, headTop + 4, 12, 6);
  // Eyes (only visible when not facing up)
  if (facing !== 'up') {
    ctx.fillStyle = '#fde047';
    if (facing === 'down') {
      ctx.fillRect(cx - 4, headTop + 7, 2, 2);
      ctx.fillRect(cx + 2, headTop + 7, 2, 2);
    } else if (facing === 'right') {
      ctx.fillRect(cx + 1, headTop + 7, 2, 2);
    } else if (facing === 'left') {
      ctx.fillRect(cx - 3, headTop + 7, 2, 2);
    }
  }

  // Body (tunic)
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 7, bodyTop, 14, 12);
  // Tunic highlight
  ctx.fillStyle = '#a3471a';
  ctx.fillRect(cx - 7, bodyTop, 14, 2);
  // Belt
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(cx - 7, bodyTop + 9, 14, 2);

  // Arms
  ctx.fillStyle = '#7c2d12';
  if (facing === 'left') {
    ctx.fillRect(cx - 9, bodyTop + 2, 3, 7);
  } else if (facing === 'right') {
    ctx.fillRect(cx + 6, bodyTop + 2, 3, 7);
  } else {
    ctx.fillRect(cx - 9, bodyTop + 2, 2, 7);
    ctx.fillRect(cx + 7, bodyTop + 2, 2, 7);
  }

  // Legs (animated)
  ctx.fillStyle = '#1c1410';
  const stepDelta = walkFrame === 1 ? 1 : walkFrame === 3 ? -1 : 0;
  ctx.fillRect(cx - 6, legTop + stepDelta,         5, 8 - Math.abs(stepDelta));
  ctx.fillRect(cx + 1, legTop - stepDelta,         5, 8 - Math.abs(stepDelta));
  // Boots
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(cx - 6, legTop + 6 + stepDelta, 5, 2);
  ctx.fillRect(cx + 1, legTop + 6 - stepDelta, 5, 2);
}

const FACING_LABELS = { up: 'up', down: 'down', left: 'left', right: 'right' };

const DIFFICULTY_LABELS = {
  apprentice: { label: 'Apprentice', icon: '🛡️' },
  adept:      { label: 'Adept',      icon: '⚔️' },
  master:     { label: 'Master',     icon: '👑' },
  mythic:     { label: 'Mythic',     icon: '🌟' },
};

// === Component ==========================================================
export default function DungeonExplore({ onExit, playerState, subject }) {
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

  const biomeId = useMemo(() => pickBiomeForSubject(subject), [subject]);
  const biome = BIOMES[biomeId] || BIOMES.halls;

  const initial = useMemo(
    () => generateMap({ difficulty, biome: biomeId }),
    [difficulty, biomeId],
  );

  const [pos, setPos] = useState(initial.spawn);
  const [facing, setFacing] = useState('down');
  const initialRoomIdx = roomIndexAt(initial.rooms, initial.spawn.x, initial.spawn.y);
  const [discoveredRooms, setDiscoveredRooms] = useState(() => new Set(initialRoomIdx === null ? [] : [initialRoomIdx]));
  const [currentRoom, setCurrentRoom] = useState(initialRoomIdx);
  const [roomFlashAt, setRoomFlashAt] = useState(0);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Mutable state mirrored into a ref so the rAF loop always sees fresh
  // values without re-creating the loop on every state change.
  const stateRef = useRef({});
  useLayoutEffect(() => {
    stateRef.current = {
      pos, facing, biome, initial, discoveredRooms, roomFlashAt,
    };
  });

  // Visible-tile memo (room bounding boxes + corridors w/ both endpoints
  // discovered). Player aura adds extra tiles inside the rAF render loop.
  const visibleTiles = useMemo(() => {
    const set = new Set();
    discoveredRooms.forEach((idx) => {
      const r = initial.rooms[idx];
      if (!r) return;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) set.add(`${x},${y}`);
      }
    });
    initial.corridors.forEach((c) => {
      if (discoveredRooms.has(c.from) && discoveredRooms.has(c.to)) {
        c.tiles.forEach(({ x, y }) => set.add(`${x},${y}`));
      }
    });
    return set;
  }, [discoveredRooms, initial.rooms, initial.corridors]);

  // Reset on map regeneration.
  useEffect(() => {
    const idx = roomIndexAt(initial.rooms, initial.spawn.x, initial.spawn.y);
    setPos(initial.spawn);
    setFacing('down');
    setDiscoveredRooms(new Set(idx === null ? [] : [idx]));
    setCurrentRoom(idx);
    setRoomFlashAt(performance.now());
  }, [initial]);

  // Detect room entry/exit on every position change.
  useEffect(() => {
    const idx = roomIndexAt(initial.rooms, pos.x, pos.y);
    if (idx !== currentRoom) {
      setCurrentRoom(idx);
      if (idx !== null) {
        setDiscoveredRooms((prev) => {
          if (prev.has(idx)) return prev;
          const next = new Set(prev);
          next.add(idx);
          return next;
        });
        setRoomFlashAt(performance.now());
      }
    }
  }, [pos, currentRoom, initial.rooms]);

  // Keyboard movement.
  useEffect(() => {
    const onKey = (e) => {
      let dx = 0, dy = 0, dir = null;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W':    dy = -1; dir = 'up';    break;
        case 'ArrowDown': case 's': case 'S':  dy = 1;  dir = 'down';  break;
        case 'ArrowLeft': case 'a': case 'A':  dx = -1; dir = 'left';  break;
        case 'ArrowRight': case 'd': case 'D': dx = 1;  dir = 'right'; break;
        case 'Escape': if (onExit) onExit(); return;
        default: return;
      }
      e.preventDefault();
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
    window.addEventListener('keydown', onKey);
    if (containerRef.current) containerRef.current.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [initial.map, onExit]);

  // Touch/mouse D-pad for mobile + click fallback.
  const move = (dx, dy, dir) => {
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

  // Animation refs — interpolated draw-position and walk frame.
  const animPosRef = useRef({ x: initial.spawn.x, y: initial.spawn.y });
  const lastPosRef = useRef({ x: initial.spawn.x, y: initial.spawn.y });
  const moveStartRef = useRef(0);

  // Reset anim refs on map regen.
  useEffect(() => {
    animPosRef.current = { x: initial.spawn.x, y: initial.spawn.y };
    lastPosRef.current = { x: initial.spawn.x, y: initial.spawn.y };
    moveStartRef.current = 0;
  }, [initial]);

  // Trigger a new tween whenever pos changes.
  useEffect(() => {
    moveStartRef.current = performance.now();
    lastPosRef.current = { ...animPosRef.current };
  }, [pos]);

  // === rAF render loop ===================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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

      const moving = t < 1;
      const walkFrame = moving ? Math.floor(now / WALK_FRAME_MS) % 4 : 0;

      // Camera centers on the animated player position.
      const cameraX = ax * TILE_PX - CANVAS_W / 2 + TILE_PX / 2;
      const cameraY = ay * TILE_PX - CANVAS_H / 2 + TILE_PX / 2;

      ctx.fillStyle = '#050302';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const startCol = Math.max(0, Math.floor(cameraX / TILE_PX) - 1);
      const endCol   = Math.min(s.initial.width,  startCol + VIEW_W + 3);
      const startRow = Math.max(0, Math.floor(cameraY / TILE_PX) - 1);
      const endRow   = Math.min(s.initial.height, startRow + VIEW_H + 3);

      // Player aura — square distance for crisp edges.
      const playerTileX = Math.round(ax);
      const playerTileY = Math.round(ay);

      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          const adx = Math.abs(x - playerTileX);
          const ady = Math.abs(y - playerTileY);
          const inAura = adx + ady <= PLAYER_AURA_RADIUS;
          const visible = inAura || visibleTiles.has(`${x},${y}`);
          const px = x * TILE_PX - cameraX;
          const py = y * TILE_PX - cameraY;
          if (!visible) {
            drawHidden(ctx, px, py);
          } else {
            drawTile(ctx, s.biome, s.initial.map[y][x], px, py);
          }
        }
      }

      // Player at draw position.
      const ppx = ax * TILE_PX - cameraX;
      const ppy = ay * TILE_PX - cameraY;
      drawPlayer(ctx, ppx, ppy, s.facing, walkFrame);

      // Vignette
      const grad = ctx.createRadialGradient(
        CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.3,
        CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.65,
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Cross-room flash overlay (fades 360ms).
      const flashAge = now - s.roomFlashAt;
      if (s.roomFlashAt && flashAge < 360) {
        ctx.fillStyle = s.biome.accent;
        ctx.globalAlpha = 0.55 * (1 - flashAge / 360);
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.globalAlpha = 1;
      }

      // HUD — biome name + chamber count, top-left
      ctx.font = "16px 'Cinzel', Georgia, serif";
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8, 8, 320, 28);
      ctx.fillStyle = s.biome.accentSolid;
      ctx.fillText(`${s.biome.icon}  ${s.biome.name}`, 16, 14);

      // Chamber counter, top-right
      const found = s.discoveredRooms.size;
      const total = s.initial.rooms.length;
      const counterText = `${found} / ${total} chambers`;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(CANVAS_W - 200, 8, 184, 28);
      ctx.fillStyle = '#fde047';
      ctx.fillText(counterText, CANVAS_W - 188, 14);

      // Coordinates, bottom-left
      ctx.font = "12px 'Cinzel', Georgia, serif";
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8, CANVAS_H - 28, 180, 22);
      ctx.fillStyle = '#a8a29e';
      ctx.fillText(`(${s.pos.x}, ${s.pos.y}) · facing ${FACING_LABELS[s.facing]}`, 16, CANVAS_H - 24);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visibleTiles]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={onExit} className="flex items-center gap-2 text-amber-600 hover:text-amber-400 italic">
          <ArrowLeft className="w-4 h-4" /> Return to Hearth
        </button>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <span className="text-xs text-amber-700 italic">Trial:</span>
          {Object.entries(DIFFICULTY_LABELS).map(([id, info]) => {
            const unlocked = isUnlocked(id);
            const selected = difficulty === id;
            return (
              <button
                key={id}
                disabled={!unlocked}
                onClick={() => setDifficulty(id)}
                className="px-2 py-1 rounded text-xs italic"
                style={{
                  background: selected ? 'rgba(120, 53, 15, 0.7)' : 'rgba(31, 24, 12, 0.5)',
                  border: `1px solid ${selected ? 'rgba(245, 158, 11, 0.8)' : 'rgba(120, 53, 15, 0.4)'}`,
                  color: selected ? '#fde047' : (unlocked ? '#a8a29e' : '#52443a'),
                  opacity: unlocked ? 1 : 0.5,
                  cursor: unlocked ? 'pointer' : 'not-allowed',
                }}
                title={unlocked ? `${info.label} — ${ROOMS_BY_DIFFICULTY[id]} chambers` : 'Locked'}
              >
                {info.icon} {info.label}
              </button>
            );
          })}
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
      </div>

      {/* Mobile / touch D-pad. Hidden on wider screens via media query in
          inline style? we can just let it render — buttons are unobtrusive. */}
      <div className="flex justify-center select-none">
        <div className="grid grid-cols-3 gap-1" style={{ width: 180 }}>
          <div />
          <button
            onClick={() => move(0, -1, 'up')}
            className="rounded text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}
          >▲</button>
          <div />
          <button
            onClick={() => move(-1, 0, 'left')}
            className="rounded text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}
          >◀</button>
          <button
            onClick={() => onExit && onExit()}
            className="rounded text-amber-700 text-xs italic"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}
          >Esc</button>
          <button
            onClick={() => move(1, 0, 'right')}
            className="rounded text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}
          >▶</button>
          <div />
          <button
            onClick={() => move(0, 1, 'down')}
            className="rounded text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(120,53,15,0.5)', height: 44 }}
          >▼</button>
          <div />
        </div>
      </div>

      <div className="text-center text-xs italic max-w-xl mx-auto" style={{ color: '#92400e' }}>
        ⚜ {biome.flavor} ⚜
        <div className="text-[10px] text-amber-700/70 mt-1">
          Arrow keys / WASD or the D-pad · Esc to leave
        </div>
      </div>
    </div>
  );
}
