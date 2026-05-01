// DungeonExplore — Phase 11. Top-down 2D dungeon viewport with grid movement.
// This is the foundation; combat (Phase 14), mobs (Phase 13), biomes (Phase 12),
// and loot (Phase 15) hook in later. For now: walk around a procedurally
// arranged starter map.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Home as HomeIcon } from 'lucide-react';

// Tile types — kept as named constants so future biomes can swap visuals.
export const TILE = {
  WALL: 0,
  FLOOR: 1,
  DOOR: 2,
  STAIRS_UP: 3,
  STAIRS_DOWN: 4,
};

// Per-tile rendering metadata. Glyphs sit on the floor color; walls fill solid.
const TILE_STYLE = {
  [TILE.WALL]:  { bg: '#1a0e0e', border: '#3a1818', glyph: ''  },
  [TILE.FLOOR]: { bg: '#221511', border: '#2c1a14', glyph: '·' },
  [TILE.DOOR]:  { bg: '#3a2114', border: '#5a3a20', glyph: '+' },
  [TILE.STAIRS_UP]:   { bg: '#1a1410', border: '#3a3018', glyph: '<' },
  [TILE.STAIRS_DOWN]: { bg: '#1a1410', border: '#3a3018', glyph: '>' },
};

const TILE_SIZE = 32;
const VIEW_TILES_W = 21; // odd → player centered cleanly
const VIEW_TILES_H = 15;

const isWalkable = (t) => t === TILE.FLOOR || t === TILE.DOOR || t === TILE.STAIRS_UP || t === TILE.STAIRS_DOWN;

const roomsOverlap = (a, b, pad = 1) => (
  a.x - pad < b.x + b.w &&
  a.x + a.w + pad > b.x &&
  a.y - pad < b.y + b.h &&
  a.y + a.h + pad > b.y
);

const roomCenter = (r) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });

// Procedural map: carve N rooms (rejection-sampled to avoid overlap), then
// connect each room to its predecessor with an L-shaped corridor.
export function generateStarterMap({
  width = 60,
  height = 40,
  roomCount = 7,
  minRoomW = 5,
  maxRoomW = 11,
  minRoomH = 4,
  maxRoomH = 8,
  rng = Math.random,
} = {}) {
  const map = Array.from({ length: height }, () => Array(width).fill(TILE.WALL));
  const rooms = [];
  let attempts = 0;

  while (rooms.length < roomCount && attempts < 200) {
    attempts++;
    const w = minRoomW + Math.floor(rng() * (maxRoomW - minRoomW + 1));
    const h = minRoomH + Math.floor(rng() * (maxRoomH - minRoomH + 1));
    const x = 1 + Math.floor(rng() * (width - w - 2));
    const y = 1 + Math.floor(rng() * (height - h - 2));
    const room = { x, y, w, h };
    if (rooms.some((r) => roomsOverlap(r, room, 1))) continue;
    rooms.push(room);
    for (let yi = y; yi < y + h; yi++) {
      for (let xi = x; xi < x + w; xi++) {
        map[yi][xi] = TILE.FLOOR;
      }
    }
  }

  // Connect rooms with L-shaped corridors. Random choice of horizontal-then-vertical
  // or vertical-then-horizontal to add variety.
  for (let i = 1; i < rooms.length; i++) {
    const a = roomCenter(rooms[i - 1]);
    const b = roomCenter(rooms[i]);
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

  // Place stairs in the last room (Phase 12 will use these to go between
  // dungeon levels; for now, purely decorative).
  if (rooms.length > 1) {
    const last = roomCenter(rooms[rooms.length - 1]);
    map[last.y][last.x] = TILE.STAIRS_DOWN;
  }

  const spawn = rooms.length > 0 ? roomCenter(rooms[0]) : { x: 1, y: 1 };
  return { map, rooms, spawn, width, height };
}

const FACING_ROTATION = { up: 0, right: 90, down: 180, left: 270 };

export default function DungeonExplore({ onExit }) {
  // Generated once per mount. Phase 12 will key on biome / seed.
  const initial = useMemo(() => generateStarterMap(), []);
  const [pos, setPos] = useState(initial.spawn);
  const [facing, setFacing] = useState('down');
  const containerRef = useRef(null);

  // Keyboard movement. Arrow keys + WASD. preventDefault on these keys so
  // the page doesn't scroll behind the dungeon.
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
    // Auto-focus so keyboard input flows to the page even after navigation.
    if (containerRef.current) containerRef.current.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [initial.map, onExit]);

  // Camera math — keep the player centered. The inner container is
  // translate'd by the negative camera offset.
  const viewW = VIEW_TILES_W * TILE_SIZE;
  const viewH = VIEW_TILES_H * TILE_SIZE;
  const cameraX = pos.x * TILE_SIZE - viewW / 2 + TILE_SIZE / 2;
  const cameraY = pos.y * TILE_SIZE - viewH / 2 + TILE_SIZE / 2;

  // Render only tiles within the viewport (+ small buffer) for perf. With a
  // 60×40 map that's ~315 visible tiles vs 2400 — meaningful on weaker hardware.
  const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE) - 1);
  const endCol   = Math.min(initial.width,  startCol + VIEW_TILES_W + 3);
  const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE) - 1);
  const endRow   = Math.min(initial.height, startRow + VIEW_TILES_H + 3);
  const visibleTiles = [];
  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      visibleTiles.push({ x, y, t: initial.map[y][x] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={onExit} className="flex items-center gap-2 text-amber-600 hover:text-amber-400 italic">
          <ArrowLeft className="w-4 h-4" /> Return to Hearth
        </button>
        <div className="text-xs text-amber-700 italic">
          Arrow keys / WASD to move · Esc to leave
        </div>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        className="mx-auto outline-none rounded relative select-none"
        style={{
          width: viewW,
          maxWidth: '100%',
          aspectRatio: `${viewW} / ${viewH}`,
          background: '#0a0604',
          border: '3px double rgba(120, 53, 15, 0.7)',
          boxShadow: '0 0 30px rgba(120, 53, 15, 0.3), inset 0 0 30px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          fontFamily: '"Cinzel", Georgia, serif',
        }}
      >
        {/* Inner map container — translated by the camera. transition gives
            a smooth slide between tiles instead of a jarring jump. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: initial.width * TILE_SIZE,
            height: initial.height * TILE_SIZE,
            transform: `translate(${-cameraX}px, ${-cameraY}px)`,
            transition: 'transform 120ms ease-out',
          }}
        >
          {visibleTiles.map(({ x, y, t }) => {
            const style = TILE_STYLE[t] || TILE_STYLE[TILE.WALL];
            return (
              <div
                key={`${x}-${y}`}
                style={{
                  position: 'absolute',
                  left: x * TILE_SIZE,
                  top: y * TILE_SIZE,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  background: style.bg,
                  borderRight: `1px solid ${style.border}`,
                  borderBottom: `1px solid ${style.border}`,
                  color: '#3d2a1c',
                  fontSize: '14px',
                  textAlign: 'center',
                  lineHeight: `${TILE_SIZE}px`,
                }}
              >
                {style.glyph}
              </div>
            );
          })}

          {/* Player. Centered in the viewport via the camera. The triangle
              rotates to indicate facing. */}
          <div
            style={{
              position: 'absolute',
              left: pos.x * TILE_SIZE,
              top: pos.y * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'left 120ms ease-out, top 120ms ease-out',
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 30% 30%, #fde047, #92400e)',
                boxShadow: '0 0 12px rgba(245, 158, 11, 0.7)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 0,
                  height: 0,
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderBottom: '8px solid #1a0e08',
                  transform: `translate(-50%, -50%) rotate(${FACING_ROTATION[facing]}deg)`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Vignette overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'radial-gradient(circle at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
          }}
        />

        {/* Coordinate readout */}
        <div className="absolute bottom-2 left-2 text-xs text-amber-700 italic" style={{ pointerEvents: 'none' }}>
          ({pos.x}, {pos.y}) · facing {facing}
        </div>
      </div>

      <div className="text-center text-xs text-amber-700 italic max-w-xl mx-auto">
        ⚜ The dungeon stretches before thee. For now thou mayest only walk —
        mobs, treasure, and combat shall arrive in the chambers ahead. ⚜
      </div>
    </div>
  );
}
