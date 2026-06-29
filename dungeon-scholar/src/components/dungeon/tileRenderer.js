// Canvas tile/sprite renderer for the Dungeon Delve (S26 — extracted from
// the DungeonExplore God-file). Pure 2D-canvas drawing functions + their
// lookup tables. No React. TILE/BIOMES come from the game-data module.
import { TILE } from '../../game/dungeonMap.js';

export const TILE_PX = 48; // canvas tile size in px (shared with the component)

const tileSeed = (x, y) => {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
};

// === Tile drawing =======================================================
function drawWall(ctx, p, px, py, seed) {
  ctx.fillStyle = p.wallBase;
  ctx.fillRect(px, py, TILE_PX, TILE_PX);
  ctx.fillStyle = p.wallTop;
  ctx.fillRect(px, py, TILE_PX, 4);
  ctx.fillStyle = p.wallShade;
  ctx.fillRect(px, py + TILE_PX - 6, TILE_PX, 6);
  ctx.fillRect(px, py + 16, TILE_PX, 1);
  ctx.fillRect(px, py + 32, TILE_PX, 1);
  ctx.fillRect(px + 24, py + 4, 1, 12);
  ctx.fillRect(px + 12, py + 17, 1, 15);
  ctx.fillRect(px + 24, py + 33, 1, 9);
  // 25i-1: per-tile variation keyed off the wall's seed so re-renders are
  // stable. Six discrete buckets — cracks, scuffs, brick seams, accent
  // sigils, fleck clusters, moss bands — pull the wall away from the
  // single-pattern look the earlier drawer had.
  if (seed === undefined) return;
  if (seed < 0.18) {
    ctx.fillStyle = p.wallShade;
    const cx = 14 + Math.floor(seed * 90);
    ctx.fillRect(px + cx, py + 6, 1, TILE_PX - 14);
  } else if (seed < 0.36) {
    ctx.fillStyle = p.wallShade;
    const cx = 10 + Math.floor((seed - 0.18) * 90);
    ctx.fillRect(px + cx, py + 22, 1, 1);
    ctx.fillRect(px + cx + 1, py + 23, 1, 1);
    ctx.fillRect(px + cx + 2, py + 24, 1, 1);
  } else if (seed < 0.5) {
    ctx.fillStyle = p.wallShade;
    ctx.fillRect(px + 4, py + 24, TILE_PX - 8, 1);
  } else if (seed < 0.66) {
    ctx.fillStyle = p.wallDetail;
    ctx.globalAlpha = 0.45;
    const ox = 14 + Math.floor((seed - 0.5) * 90);
    const oy = 22 + Math.floor((seed - 0.5) * 50);
    ctx.fillRect(px + ox, py + oy, 2, 2);
    ctx.globalAlpha = 1;
  } else if (seed < 0.82) {
    ctx.fillStyle = p.wallTop;
    const ox = 16 + Math.floor((seed - 0.66) * 80);
    const oy = 26 + Math.floor((seed - 0.66) * 40);
    ctx.fillRect(px + ox, py + oy, 1, 1);
    ctx.fillRect(px + ox + 3, py + oy + 1, 1, 1);
    ctx.fillRect(px + ox + 1, py + oy + 4, 1, 1);
  } else {
    ctx.fillStyle = p.wallShade;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(px + 2, py + TILE_PX - 12, TILE_PX - 4, 2);
    ctx.globalAlpha = 1;
  }
}
function drawFloor(ctx, p, px, py, decoChance, seed, neighbors) {
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
  } else if (seed > 0.42 && seed < 0.5) {
    // 25i-1: third variation tier — a faint floor crack to break up the
    // grid pattern between deco-tile bursts.
    ctx.fillStyle = p.floorDetail;
    const len = 10 + Math.floor((seed - 0.42) * 220);
    ctx.fillRect(px + 12, py + 26, len, 1);
  } else if (seed > 0.62 && seed < 0.7) {
    // Tiny twin specks — darker pair to suggest grit.
    ctx.fillStyle = p.floorDetail;
    ctx.fillRect(px + 30, py + 18, 1, 1);
    ctx.fillRect(px + 33, py + 22, 1, 1);
  }
  // 25i-1: room-edge gradient — soft shadow band on every floor side that
  // touches a wall, so rooms feel inset rather than abrupt. Low alpha
  // keeps it subtle against the floorBase.
  if (neighbors) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = p.wallShade;
    if (neighbors.n === TILE.WALL) ctx.fillRect(px, py, TILE_PX, 3);
    if (neighbors.s === TILE.WALL) ctx.fillRect(px, py + TILE_PX - 3, TILE_PX, 3);
    if (neighbors.w === TILE.WALL) ctx.fillRect(px, py, 3, TILE_PX);
    if (neighbors.e === TILE.WALL) ctx.fillRect(px + TILE_PX - 3, py, 3, TILE_PX);
    ctx.globalAlpha = 1;
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

// 25a-6: locked boss door — heavy iron with a gold rim and a keyhole.
// Visually distinct from the normal DOOR tile so the player knows what
// stands between them and the boss chamber.
function drawBossDoor(ctx, p, px, py) {
  // Wall-toned backdrop so it reads as part of the boss room boundary.
  ctx.fillStyle = p.wallShade;
  ctx.fillRect(px, py, TILE_PX, TILE_PX);
  // Iron door body
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(px + 6, py + 4, TILE_PX - 12, TILE_PX - 8);
  ctx.fillStyle = '#5a3818';
  ctx.fillRect(px + 8, py + 6, TILE_PX - 16, TILE_PX - 12);
  // Gold rim + studs
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(px + 6, py + 4, TILE_PX - 12, 2);
  ctx.fillRect(px + 6, py + TILE_PX - 6, TILE_PX - 12, 2);
  ctx.fillRect(px + 6, py + 4, 2, TILE_PX - 8);
  ctx.fillRect(px + TILE_PX - 8, py + 4, 2, TILE_PX - 8);
  // Stud nails
  ctx.fillStyle = '#fde047';
  ctx.fillRect(px + 10, py + 8, 2, 2);
  ctx.fillRect(px + TILE_PX - 12, py + 8, 2, 2);
  ctx.fillRect(px + 10, py + TILE_PX - 10, 2, 2);
  ctx.fillRect(px + TILE_PX - 12, py + TILE_PX - 10, 2, 2);
  // Keyhole
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(px + TILE_PX / 2 - 1, py + TILE_PX / 2 - 4, 2, 8);
  ctx.fillRect(px + TILE_PX / 2 - 3, py + TILE_PX / 2 - 4, 6, 3);
}

// 25i-1: tile coords (x, y) and the map are now passed explicitly so the
// per-tile seed is stable across camera-scroll frames (the old version
// derived tile coords from pixel coords, which silently shifted the seed
// — and therefore the per-tile decorations — as the camera moved off the
// tile grid). The map enables neighbor-aware effects like the room-edge
// gradient on floor tiles.
export function drawTile(ctx, biome, type, px, py, x, y, map) {
  const p = biome.palette;
  const seed = tileSeed(x, y);
  if (type === TILE.WALL) drawWall(ctx, p, px, py, seed);
  else if (type === TILE.FLOOR) {
    const neighbors = map
      ? {
          n: map[y - 1]?.[x] ?? TILE.WALL,
          s: map[y + 1]?.[x] ?? TILE.WALL,
          e: map[y]?.[x + 1] ?? TILE.WALL,
          w: map[y]?.[x - 1] ?? TILE.WALL,
        }
      : null;
    drawFloor(ctx, p, px, py, biome.decoChance, seed, neighbors);
  } else if (type === TILE.STAIRS_DOWN || type === TILE.STAIRS_UP) drawStairs(ctx, p, px, py);
  else if (type === TILE.DOOR) drawDoor(ctx, p, px, py);
  else if (type === TILE.BOSS_DOOR) drawBossDoor(ctx, p, px, py);
  else drawWall(ctx, p, px, py, seed);
}

// === Plant + decoration sprites =========================================
function drawDeadBranch(ctx, px, py, t) {
  // 25i-4: shared plant-sway pattern — small horizontal sin offset keyed
  // off the world px so neighboring plants are naturally out of phase.
  const sway = Math.sin((t || 0) / 700 + px * 0.013) * 0.8;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 6;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 8;
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
function drawNightshade(ctx, px, py, t) {
  const sway = Math.sin((t || 0) / 580 + px * 0.013) * 0.8;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 6;
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
function drawFern(ctx, px, py, t) {
  const sway = Math.sin((t || 0) / 600 + px * 0.013) * 1.0;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 10;
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
function drawRotFlower(ctx, px, py, t) {
  const sway = Math.sin((t || 0) / 540 + px * 0.013) * 0.8;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 6;
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
function drawBonsai(ctx, px, py, t) {
  const sway = Math.sin((t || 0) / 750 + px * 0.013) * 0.7;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 10;
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
function drawIvy(ctx, px, py, t) {
  const sway = Math.sin((t || 0) / 640 + px * 0.013) * 0.9;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 6;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 4;
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
function drawPipeVine(ctx, px, py, t) {
  const sway = Math.sin((t || 0) / 660 + px * 0.013) * 0.6;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 6;
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
function drawRustFlower(ctx, px, py, t) {
  const sway = Math.sin((t || 0) / 560 + px * 0.013) * 0.8;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 6;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 10;
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(cx, cy - 10, 1, 10);
  ctx.fillStyle = '#15803d';
  for (let i = 0; i < 5; i++) {
    const ly = cy - 9 + i * 2;
    ctx.fillRect(cx - 5, ly, 5, 1);
    ctx.fillRect(cx + 1, ly + 1, 5, 1);
  }
  // animated steam puffs
  const tt = t || 0;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const off = (tt / 60) % 12;
  ctx.fillRect(cx - 2, cy - 14 - off, 1, 2);
  ctx.fillRect(cx + 1, cy - 16 - ((off + 4) % 12), 1, 2);
  ctx.fillRect(cx, cy - 18 - ((off + 8) % 12), 1, 2);
}
function drawTumbleweed(ctx, px, py, t) {
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 4;
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
function drawWildflower(ctx, px, py, t) {
  const sway = Math.sin((t || 0) / 520 + px * 0.013) * 0.8;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 6;
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
function drawDesertBrush(ctx, px, py, t) {
  const sway = Math.sin((t || 0) / 680 + px * 0.013) * 0.7;
  const cx = px + TILE_PX / 2 + sway,
    cy = py + TILE_PX / 2 + 8;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 6;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 4;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5eead4';
  ctx.fillRect(cx - 8, cy - 2, 4, 1);
  ctx.fillRect(cx + 2, cy + 1, 5, 1);
}
function drawTerminal(ctx, px, py) {
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 4;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 4;
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(cx - 4, cy - 10, 8, 12);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 3, cy - 9, 6, 2);
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(cx - 5, cy - 11, 10, 1);
  ctx.fillRect(cx - 1, cy - 13, 2, 3);
}
function drawCactus(ctx, px, py) {
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 6;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 6;
  ctx.fillStyle = '#52525b';
  ctx.fillRect(cx, cy - 18, 1, 18);
  ctx.fillRect(cx - 6, cy - 14, 13, 1);
  ctx.fillRect(cx - 4, cy - 10, 9, 1);
  ctx.fillRect(cx - 2, cy - 6, 5, 1);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(cx, cy - 20, 1, 2);
}
export const DECO_DRAWERS = {
  // existing
  bones: drawBones,
  candle: drawCandle,
  mushroom: drawMushroom,
  puddle: drawPuddle,
  terminal: drawTerminal,
  cable: drawCable,
  gear: drawGear,
  capacitor: drawCapacitor,
  cactus: drawCactus,
  antenna: drawAntenna,
  // plants & extras
  dead_branch: drawDeadBranch,
  moss_patch: drawMossPatch,
  nightshade: drawNightshade,
  algae: drawAlgae,
  fern: drawFern,
  rot_flower: drawRotFlower,
  bonsai: drawBonsai,
  ivy: drawIvy,
  crystal: drawCrystal,
  pipe_vine: drawPipeVine,
  rust_flower: drawRustFlower,
  steam_fern: drawSteamFern,
  tumbleweed: drawTumbleweed,
  wildflower: drawWildflower,
  desert_brush: drawDesertBrush,
};

// === Mob sprites ========================================================
function drawWraith(ctx, px, py, t) {
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + Math.sin(t / 400) * 2;
  ctx.fillStyle = 'rgba(168,85,247,0.55)';
  ctx.fillRect(cx - 8, cy - 6, 16, 16);
  ctx.fillStyle = 'rgba(168,85,247,0.85)';
  ctx.fillRect(cx - 7, cy - 10, 14, 6);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(cx - 4, cy - 7, 2, 2);
  ctx.fillRect(cx + 2, cy - 7, 2, 2);
}
function drawSlime(ctx, px, py, t) {
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 4;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + Math.sin(t / 400) * 0.6;
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(cx - 7, cy - 4, 14, 12);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx - 7, cy + 6, 14, 4);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx - 5, cy - 6, 10, 5);
  const blink = Math.floor(t / 120) % 6 === 0;
  ctx.fillStyle = blink ? '#fef9c3' : '#ef4444';
  ctx.fillRect(cx - 1, cy - 4, 2, 2);
}
function drawSpark(ctx, px, py, t) {
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2;
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
    const a = t / 200 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
    ctx.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
    ctx.stroke();
  }
}
function drawScorpion(ctx, px, py, t) {
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 2 + Math.sin(t / 220) * 0.8;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + Math.sin(t / 420) * 0.8;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + Math.sin(t / 300) * 2;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 4 + Math.sin(t / 200) * 0.8;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 4 + Math.sin(t / 380) * 1.0;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + Math.sin(t / 200) * 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE_PX - 4, 9, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#475569';
  ctx.fillRect(cx - 7, cy - 4, 14, 8);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cx - 5, cy - 8, 10, 4);
  const blink = Math.floor(t / 100) % 8 === 0;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + Math.sin(t / 500) * 0.4;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 2 + Math.sin(t / 200) * 1.2;
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
  const blink = Math.floor(t / 200) % 5 === 0;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + Math.sin(t / 450) * 0.5;
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
  const pulse = Math.floor(t / 200) % 2 === 0;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 2 + Math.sin(t / 240) * 0.8;
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
    const a = (i * Math.PI) / 5 + Math.PI / 4;
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
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + Math.sin(t / 300) * 1.0;
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
    const a = (i * Math.PI) / 3.5 + t / 250;
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, 1, 1);
  }
  // mouth
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 2, cy + 1, 5, 1);
}
export const MOB_DRAWERS = {
  // existing
  wraith: drawWraith,
  slime: drawSlime,
  sentry: drawSentry,
  spark: drawSpark,
  scorpion: drawScorpion,
  // new (Phase 13)
  skeleton: drawSkeleton,
  shade: drawShade,
  rat: drawRat,
  ooze: drawOoze,
  drone: drawDrone,
  firewall: drawFirewall,
  imp: drawImp,
  sentinel: drawSentinel,
  spider: drawSpider,
  elemental: drawElemental,
};

// === Boss sprites =======================================================
function drawLich(ctx, px, py, t) {
  // 25i-2: idle bob + a 270ms attack-tell pulse every 1.8s, shared
  // cadence with the other bosses so the player learns the "menace"
  // tempo regardless of which boss they're facing.
  const bob = Math.sin(t / 350) * 1.5;
  const tellPhase = (t % 1800) / 1800;
  const tell = tellPhase < 0.15 ? Math.sin((tellPhase * Math.PI) / 0.15) : 0;
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 - 4 + bob;
  ctx.fillStyle = 'rgba(168,85,247,0.4)';
  ctx.fillRect(cx - 16, cy + 8, 32, 16);
  ctx.fillStyle = '#a855f7';
  ctx.fillRect(cx - 12, cy - 10, 24, 24);
  ctx.fillStyle = '#1a0e2a';
  ctx.fillRect(cx - 8, cy - 6, 16, 12);
  if (tell > 0) {
    ctx.globalAlpha = 0.35 * tell;
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 9, cy - 5, 18, 9);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = tell > 0.5 ? '#fef9c3' : '#fde047';
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
  // 25i-2: body bob + middle head lunges forward on the attack-tell pulse.
  const bob = Math.sin(t / 400) * 1.2;
  const tellPhase = (t % 1800) / 1800;
  const tell = tellPhase < 0.15 ? Math.sin((tellPhase * Math.PI) / 0.15) : 0;
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 8 + bob;
  ctx.fillStyle = '#065f46';
  ctx.fillRect(cx - 14, cy - 4, 28, 12);
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 8;
    const sway = Math.sin(t / 300 + i) * 3;
    const lunge = i === 1 ? tell * 4 : 0;
    ctx.fillStyle = '#10b981';
    ctx.fillRect(cx - 3 + off + sway, cy - 18 + lunge, 6, 14);
    ctx.fillStyle = '#065f46';
    ctx.fillRect(cx - 4 + off + sway, cy - 22 + lunge, 8, 6);
    ctx.fillStyle = tell > 0.5 && i === 1 ? '#fef9c3' : '#fde047';
    ctx.fillRect(cx - 2 + off + sway, cy - 20 + lunge, 1, 1);
    ctx.fillRect(cx + 1 + off + sway, cy - 20 + lunge, 1, 1);
  }
}
function drawSphinx(ctx, px, py, t) {
  // 25i-2: bob + eye saturates toward a redder halo during the tell pulse.
  const bob = Math.sin(t / 420) * 1.2;
  const tellPhase = (t % 1800) / 1800;
  const tell = tellPhase < 0.15 ? Math.sin((tellPhase * Math.PI) / 0.15) : 0;
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + bob;
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(cx - 12, cy - 14, 24, 28);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cx - 12, cy + 10, 24, 6);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx - 10, cy - 12, 20, 8);
  if (tell > 0) {
    ctx.globalAlpha = 0.4 * tell;
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(cx - 4, cy - 11, 8, 7);
    ctx.globalAlpha = 1;
  }
  const blink = Math.floor(t / 150) % 4 === 0;
  ctx.fillStyle = blink ? '#fef9c3' : tell > 0.5 ? '#fca5a5' : '#ef4444';
  ctx.fillRect(cx - 2, cy - 9, 4, 3);
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(cx - 11, cy - 4, 22, 2);
}
function drawBehemoth(ctx, px, py, t) {
  // 25i-2: bob + body "clench" widens slightly during the tell pulse.
  const bob = Math.sin(t / 500) * 1.0;
  const tellPhase = (t % 1800) / 1800;
  const tell = tellPhase < 0.15 ? Math.sin((tellPhase * Math.PI) / 0.15) : 0;
  const widen = tell * 2;
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + bob;
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 14 - widen, cy - 12, 28 + widen * 2, 26);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 12 - widen, cy - 10, 24 + widen * 2, 4);
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 6, cy - 5, 4, 4);
  ctx.fillRect(cx + 2, cy - 5, 4, 4);
  ctx.fillStyle = tell > 0.5 ? '#fde047' : '#fb923c';
  const glow = Math.floor(t / 200) % 2 === 0 ? 1 : 0;
  if (glow || tell > 0.3) ctx.fillRect(cx - 5, cy - 4, 2, 2);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(cx - 8, cy + 4, 16, 4);
}
function drawRiddler(ctx, px, py, t) {
  // 25i-2: bob + cards flap wider and eyes glow red during the tell pulse.
  const bob = Math.sin(t / 350) * 1.2;
  const tellPhase = (t % 1800) / 1800;
  const tell = tellPhase < 0.15 ? Math.sin((tellPhase * Math.PI) / 0.15) : 0;
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + bob;
  const flap = Math.sin(t / 250) * (4 + tell * 4);
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx - 14 - flap, cy - 4, 12, 6);
  ctx.fillRect(cx + 2 + flap, cy - 4, 12, 6);
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 8, cy - 10, 16, 18);
  ctx.fillStyle = tell > 0.5 ? '#fef9c3' : '#fbbf24';
  ctx.fillRect(cx - 1, cy - 4, 2, 2);
  ctx.fillStyle = tell > 0.5 ? '#dc2626' : '#000';
  ctx.fillRect(cx - 4, cy - 7, 2, 2);
  ctx.fillRect(cx + 2, cy - 7, 2, 2);
}
export const BOSS_DRAWERS = {
  lich: drawLich,
  hydra: drawHydra,
  sphinx: drawSphinx,
  behemoth: drawBehemoth,
  riddler: drawRiddler,
};
export const BOSS_DISPLAY = {
  lich: { name: 'The Lich', icon: '💀' },
  hydra: { name: 'The Hydra', icon: '🐉' },
  sphinx: { name: 'The Sphinx', icon: '🦁' },
  behemoth: { name: 'The Behemoth', icon: '🪨' },
  riddler: { name: 'The Riddler', icon: '🃏' },
};

// === Chest sprites (Phase 15) ===========================================
const CHEST_PALETTE = {
  wooden: { body: '#7c2d12', top: '#92400e', band: '#451a03', lock: '#fbbf24', glint: '#fde68a' },
  silver: { body: '#94a3b8', top: '#cbd5e1', band: '#475569', lock: '#fef3c7', glint: '#fef9c3' },
  gold: { body: '#a16207', top: '#fbbf24', band: '#7c2d12', lock: '#fef9c3', glint: '#ffffff' },
};
export function drawChest(ctx, tier, px, py, opened, t) {
  const cx = px + TILE_PX / 2,
    cy = py + TILE_PX / 2 + 4;
  const p = CHEST_PALETTE[tier] || CHEST_PALETTE.wooden;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 8, 12, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // base body
  ctx.fillStyle = p.body;
  ctx.fillRect(cx - 10, cy - 4, 20, 11);
  ctx.fillStyle = p.top;
  ctx.fillRect(cx - 10, cy - 4, 20, 1);
  ctx.fillStyle = p.band;
  ctx.fillRect(cx - 10, cy + 1, 20, 1);
  ctx.fillRect(cx - 10, cy + 6, 20, 1);
  ctx.fillRect(cx - 10, cy - 4, 1, 11);
  ctx.fillRect(cx + 9, cy - 4, 1, 11);
  if (opened) {
    // lid lifted up + back
    ctx.fillStyle = p.body;
    ctx.fillRect(cx - 10, cy - 11, 20, 5);
    ctx.fillStyle = p.top;
    ctx.fillRect(cx - 10, cy - 11, 20, 1);
    ctx.fillStyle = p.band;
    ctx.fillRect(cx - 10, cy - 7, 20, 1);
    // dark interior
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(cx - 8, cy - 4, 16, 4);
    // a faint glow if the chest paid out
    ctx.fillStyle = 'rgba(253, 230, 138, 0.4)';
    ctx.fillRect(cx - 7, cy - 3, 14, 2);
  } else {
    // closed lid + lock
    ctx.fillStyle = p.lock;
    ctx.fillRect(cx - 1, cy + 2, 2, 3);
    ctx.fillStyle = p.glint;
    ctx.fillRect(cx, cy + 2, 1, 1);
    // 25i-4: tier glints — silver chests get a cool cyan sparkle, gold
    // chests get a warm yellow sparkle plus twinkling corner pips on a
    // staggered cadence so the chest catches the eye from across a room.
    if (tier === 'silver') {
      const flash = Math.sin((t || 0) / 220) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(165, 243, 252, ${0.45 * flash})`;
      ctx.fillRect(cx - 8, cy - 3, 4, 1);
      const twinkle = Math.sin((t || 0) / 260 + 1.3) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(186, 230, 253, ${0.6 * twinkle})`;
      ctx.fillRect(cx + 5, cy - 3, 1, 1);
      ctx.fillRect(cx - 8, cy + 4, 1, 1);
    } else if (tier === 'gold') {
      const flash = Math.sin((t || 0) / 180) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(254, 240, 138, ${0.6 * flash})`;
      ctx.fillRect(cx - 8, cy - 3, 4, 1);
      const twinkleA = Math.sin((t || 0) / 200 + 1.3) * 0.5 + 0.5;
      const twinkleB = Math.sin((t || 0) / 240) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(253, 224, 71, ${0.75 * twinkleA})`;
      ctx.fillRect(cx + 5, cy - 3, 2, 1);
      ctx.fillStyle = `rgba(253, 230, 138, ${0.75 * twinkleB})`;
      ctx.fillRect(cx - 7, cy + 4, 2, 1);
    }
  }
}

// === Equipped weapon overlay ===========================================
// Drawn after the player so it sits on top. Hand position depends on facing.
export function drawWeapon(ctx, weaponId, cx, py, facing, swingT = 0) {
  if (!weaponId) return;
  const handX = facing === 'left' ? cx - 12 : facing === 'right' ? cx + 10 : cx + 9; // up/down — show on the right side
  const handY = py + 24;

  // 25i-3: swing arc — wrap the weapon drawing in a rotation pivoting on
  // the hand. Peaks at mid-window (sin(swingT*PI)) so the weapon "winds
  // up" then settles back. Direction matches facing; left flips sign so
  // the blade arcs forward rather than backward.
  const swingArc = swingT > 0 ? Math.sin(swingT * Math.PI) : 0;
  if (swingArc > 0) {
    const dir = facing === 'left' ? -1 : 1;
    const angle = dir * swingArc * (Math.PI / 3);
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(angle);
    ctx.translate(-handX, -handY);
  }

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

  if (swingArc > 0) ctx.restore();
}

// === Player sprite (more detailed; equipment-aware) =====================
export function drawPlayer(ctx, px, py, facing, walkFrame, equipped = {}, swingT = 0) {
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
      if (showCirclet) {
        // Mouth (only with circlet — visible face)
        ctx.fillStyle = '#451a03';
        ctx.fillRect(cx - 2, headTop + 11, 4, 1);
      } else {
        // 25i-3: soft hood shadow band under the brim so the lower
        // face reads as "in shadow-sm" rather than flat-dark like the
        // rest of the head interior.
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#000';
        ctx.fillRect(cx - 6, headTop + 10, 12, 3);
        ctx.globalAlpha = 1;
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
  ctx.fillRect(cx - 6, legTop + stepDelta, 5, legHeight - 3 - Math.abs(stepDelta));
  ctx.fillRect(cx + 1, legTop - stepDelta, 5, legHeight - 3 - Math.abs(stepDelta));
  // Boots
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(cx - 7, legTop + legHeight - 4 + stepDelta, 6, 3);
  ctx.fillRect(cx + 1, legTop + legHeight - 4 - stepDelta, 6, 3);
  // Boot trim
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(cx - 7, legTop + legHeight - 4 + stepDelta, 6, 1);
  ctx.fillRect(cx + 1, legTop + legHeight - 4 - stepDelta, 6, 1);

  // === Equipped weapon (top layer) ===
  drawWeapon(ctx, equipped.weapon, cx, py, facing, swingT);
}

// === Pet sprites (Phase 18) =============================================
// All pet drawers share the same anchor: bottom-center of the tile, with a
// small bob driven by `now` so the pet feels alive. The float offset adds
// a side-by-side hover so the pet sits beside the trail position.
function drawPetShadow(ctx, cx, baseY) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 3, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}
function drawPetOwl(ctx, px, py, now) {
  const cx = px + TILE_PX / 2;
  const baseY = py + TILE_PX - 4;
  const bob = Math.sin(now / 280) * 1.5;
  drawPetShadow(ctx, cx, baseY);
  // Body
  ctx.fillStyle = '#78350f';
  ctx.fillRect(cx - 7, baseY - 16 + bob, 14, 14);
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx - 7, baseY - 16 + bob, 14, 3);
  // Belly
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(cx - 4, baseY - 11 + bob, 8, 7);
  // Eyes
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(cx - 5, baseY - 14 + bob, 4, 4);
  ctx.fillRect(cx + 1, baseY - 14 + bob, 4, 4);
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(cx - 4, baseY - 13 + bob, 2, 2);
  ctx.fillRect(cx + 2, baseY - 13 + bob, 2, 2);
  // Beak
  ctx.fillStyle = '#facc15';
  ctx.fillRect(cx - 1, baseY - 10 + bob, 2, 2);
  // Tufts
  ctx.fillStyle = '#451a03';
  ctx.fillRect(cx - 7, baseY - 17 + bob, 2, 2);
  ctx.fillRect(cx + 5, baseY - 17 + bob, 2, 2);
}
function drawPetDragon(ctx, px, py, now) {
  const cx = px + TILE_PX / 2;
  const baseY = py + TILE_PX - 4;
  const bob = Math.sin(now / 220) * 2;
  drawPetShadow(ctx, cx, baseY);
  // Body — sinuous
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(cx - 8, baseY - 12 + bob, 14, 9);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(cx - 8, baseY - 12 + bob, 14, 2);
  // Spine spikes
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 5, baseY - 14 + bob, 1, 2);
  ctx.fillRect(cx - 1, baseY - 15 + bob, 1, 3);
  ctx.fillRect(cx + 3, baseY - 14 + bob, 1, 2);
  // Head
  ctx.fillStyle = '#991b1b';
  ctx.fillRect(cx + 4, baseY - 14 + bob, 6, 6);
  // Eye
  ctx.fillStyle = '#fde047';
  ctx.fillRect(cx + 7, baseY - 12 + bob, 1, 1);
  // Tail
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(cx - 10, baseY - 9 + bob, 2, 3);
  // Wing tip flicker
  ctx.fillStyle = 'rgba(255, 200, 60, 0.55)';
  ctx.fillRect(cx - 3, baseY - 10 + bob, 4, 2);
}
function drawPetMimic(ctx, px, py, now) {
  const cx = px + TILE_PX / 2;
  const baseY = py + TILE_PX - 4;
  const bob = Math.sin(now / 240) * 1.5;
  drawPetShadow(ctx, cx, baseY);
  // Coin body
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx - 7, baseY - 13 + bob, 14, 11);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 7, baseY - 13 + bob, 14, 3);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(cx - 6, baseY - 12 + bob, 12, 1);
  // Mimic mouth — teeth
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(cx - 5, baseY - 7 + bob, 2, 2);
  ctx.fillRect(cx - 1, baseY - 7 + bob, 2, 2);
  ctx.fillRect(cx + 3, baseY - 7 + bob, 2, 2);
  // Eyes
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(cx - 4, baseY - 11 + bob, 2, 2);
  ctx.fillRect(cx + 2, baseY - 11 + bob, 2, 2);
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(cx - 3, baseY - 11 + bob, 1, 1);
  ctx.fillRect(cx + 3, baseY - 11 + bob, 1, 1);
}
function drawPetFox(ctx, px, py, now) {
  const cx = px + TILE_PX / 2;
  const baseY = py + TILE_PX - 4;
  const bob = Math.sin(now / 260) * 1.5;
  drawPetShadow(ctx, cx, baseY);
  // Body
  ctx.fillStyle = '#c2410c';
  ctx.fillRect(cx - 7, baseY - 11 + bob, 14, 8);
  // Belly
  ctx.fillStyle = '#fff7ed';
  ctx.fillRect(cx - 5, baseY - 6 + bob, 10, 3);
  // Head
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(cx + 3, baseY - 14 + bob, 7, 7);
  // Ears
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx + 3, baseY - 16 + bob, 2, 3);
  ctx.fillRect(cx + 8, baseY - 16 + bob, 2, 3);
  // Snout + eye
  ctx.fillStyle = '#fff7ed';
  ctx.fillRect(cx + 8, baseY - 9 + bob, 2, 2);
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(cx + 6, baseY - 12 + bob, 1, 1);
  // Tail
  ctx.fillStyle = '#c2410c';
  ctx.fillRect(cx - 10, baseY - 11 + bob, 3, 5);
  ctx.fillStyle = '#fff7ed';
  ctx.fillRect(cx - 10, baseY - 8 + bob, 3, 2);
}
function drawPetImp(ctx, px, py, now) {
  const cx = px + TILE_PX / 2;
  const baseY = py + TILE_PX - 4;
  const bob = Math.sin(now / 200) * 1.5;
  drawPetShadow(ctx, cx, baseY);
  // Body
  ctx.fillStyle = '#581c87';
  ctx.fillRect(cx - 6, baseY - 12 + bob, 12, 10);
  ctx.fillStyle = '#7e22ce';
  ctx.fillRect(cx - 6, baseY - 12 + bob, 12, 2);
  // Horns
  ctx.fillStyle = '#fde047';
  ctx.fillRect(cx - 5, baseY - 15 + bob, 2, 3);
  ctx.fillRect(cx + 3, baseY - 15 + bob, 2, 3);
  // Eyes — glowing
  ctx.fillStyle = '#fde047';
  ctx.fillRect(cx - 4, baseY - 10 + bob, 2, 2);
  ctx.fillRect(cx + 2, baseY - 10 + bob, 2, 2);
  // Grin
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(cx - 3, baseY - 6 + bob, 6, 1);
  // Tail flicker
  ctx.fillStyle = '#7e22ce';
  ctx.fillRect(cx + 6, baseY - 6 + bob, 2, 2);
  ctx.fillRect(cx + 8, baseY - 8 + bob, 2, 2);
}
export const PET_DRAWERS = {
  owl: drawPetOwl,
  dragon: drawPetDragon,
  mimic: drawPetMimic,
  fox: drawPetFox,
  imp: drawPetImp,
};

// === Combat helpers =====================================================
