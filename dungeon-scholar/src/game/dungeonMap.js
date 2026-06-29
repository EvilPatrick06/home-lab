// Dungeon map generation + static game data (S26 — extracted from the
// DungeonExplore God-file). Pure logic/data; no React or canvas concerns.

export const MOB_AGGRO_RANGE = 5;

export const POTION_EFFECTS = {
  minor_heal_tonic: { kind: 'heal', amount: 1, label: 'Healing Tonic' },
  greater_heal_tonic: { kind: 'heal', amount: 2, label: 'Greater Draught' },
  shield_draught: { kind: 'shield', amount: 1, label: 'Shield Draught' },
  phoenix_ember: { kind: 'revive', label: 'Phoenix Ember' },
  scholars_brew: { kind: 'xp_buff', questions: 3, label: "Scholar's Brew" },
  // 17G: previously no-op (consumed the item, did nothing). Now real effects.
  foresight_scroll: { kind: 'foresight', label: 'Foresight Scroll' },
  tinkers_oil: { kind: 'mana', amount: 2, label: "Tinker's Oil" },
};

// Foresight Scroll (17G): consume one banked charge when a riddle is posed and
// return the domain label to preview. `chargesRef` is a {current:number} ref.
export const takeForesightPreview = (chargesRef, q) => {
  if (!chargesRef || chargesRef.current <= 0) return null;
  chargesRef.current -= 1;
  return q && q.domain ? q.domain : 'Uncharted';
};
// === Spell info (Phase 19) ==============================================
// In-dungeon mirror of the SPELLS catalog in App.jsx — kept here so the
// dungeon doesn't need to import App. The full spell metadata is passed
// in via the spellCatalog prop; this is just the icon/name fallback used
// for the HUD when looking up an equipped spell quickly.
export const TILE = {
  WALL: 0,
  FLOOR: 1,
  DOOR: 2,
  STAIRS_UP: 3,
  STAIRS_DOWN: 4,
  // 25a-6: locked door blocking the boss room entrance. NOT walkable
  // until the player presents the boss key — first contact unlocks
  // (consumes the key) and converts every BOSS_DOOR tile to FLOOR.
  BOSS_DOOR: 5,
};
export const BIOMES = {
  crypt: {
    id: 'crypt',
    name: 'Crypt of Cryptography',
    icon: '🗝️',
    flavor: 'Mossy stone tombs, encoded sigils etched on every wall.',
    accent: 'rgba(168, 85, 247, 0.4)',
    accentSolid: '#a855f7',
    palette: {
      wallBase: '#1a1422',
      wallTop: '#2a1f36',
      wallShade: '#0d0814',
      wallDetail: '#a855f7',
      floorBase: '#241a30',
      floorAlt: '#2a2038',
      floorDetail: '#3d2a48',
      floorAccent: '#7c3aed',
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
      wallBase: '#1a2820',
      wallTop: '#284030',
      wallShade: '#0e1c14',
      wallDetail: '#10b981',
      floorBase: '#142820',
      floorAlt: '#1a3024',
      floorDetail: '#284030',
      floorAccent: '#10b981',
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
      wallBase: '#1c2838',
      wallTop: '#2a4060',
      wallShade: '#0e1828',
      wallDetail: '#3b82f6',
      floorBase: '#16243a',
      floorAlt: '#1c2c44',
      floorDetail: '#2a3c5c',
      floorAccent: '#60a5fa',
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
      wallBase: '#2a1a14',
      wallTop: '#4a2a1c',
      wallShade: '#1a0e0a',
      wallDetail: '#f59e0b',
      floorBase: '#2a1c14',
      floorAlt: '#3a2418',
      floorDetail: '#4a2e1c',
      floorAccent: '#fbbf24',
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
      wallBase: '#3a3018',
      wallTop: '#5a4a28',
      wallShade: '#241c0e',
      wallDetail: '#d97706',
      floorBase: '#3a2e16',
      floorAlt: '#4a3c20',
      floorDetail: '#5a4830',
      floorAccent: '#fbbf24',
    },
    decoChance: 0.2,
  },
};
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
export const ROOMS_BY_DIFFICULTY = { apprentice: 12, adept: 18, master: 26, mythic: 36 };
export const SIZE_BY_DIFFICULTY = {
  apprentice: { w: 110, h: 75 },
  adept: { w: 140, h: 95 },
  master: { w: 180, h: 125 },
  mythic: { w: 220, h: 150 },
};

// HP, shields, XP/gold multipliers per difficulty.
// HP/shield curve tuned 25a-2: was 5/4/2/1 hp + 2/2/1/0 shields,
// now 4/3/2/1 hp + 3/2/1/0 shields per playtest feedback.
export const DIFF_CONFIG = {
  apprentice: {
    hp: 4,
    shields: 3,
    xpMul: 1,
    goldMul: 1,
    label: 'Apprentice',
    completeAchievement: null,
    rewardTitleId: null,
  },
  adept: {
    hp: 3,
    shields: 2,
    xpMul: 1.5,
    goldMul: 1.25,
    label: 'Adept',
    completeAchievement: 'adept_complete',
    rewardTitleId: 'adeptVeteran',
  },
  master: {
    hp: 2,
    shields: 1,
    xpMul: 2,
    goldMul: 1.5,
    label: 'Master',
    completeAchievement: 'master_complete',
    rewardTitleId: 'masterSlayer',
  },
  mythic: {
    hp: 1,
    shields: 0,
    xpMul: 3,
    goldMul: 2,
    label: 'Mythic',
    completeAchievement: 'mythic_complete',
    rewardTitleId: 'mythicSage',
  },
};

// Biome → boss kind. IDs match BOSS_TYPES in App.jsx for run-history display.
export const BIOME_BOSS_POOL = {
  crypt: ['lich', 'riddler', 'behemoth'],
  sewers: ['hydra', 'behemoth', 'riddler'],
  tower: ['sphinx', 'lich', 'riddler'],
  halls: ['behemoth', 'sphinx', 'lich'],
  wastes: ['riddler', 'sphinx', 'hydra'],
};
export const makeSeededRng = (seed) => {
  let s = ((seed >>> 0) * 2654435761) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
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

  // 25a-4: pick the boss room as the one FARTHEST (Manhattan) from spawn.
  // Was rooms[rooms.length-1], which depended on placement order — boss
  // could spawn close to the player on certain seeds.
  let bossPos = null;
  let bossRoomIdx = -1;
  if (rooms.length > 1) {
    const spawnCenter = rectCenter(rooms[0]);
    let maxDist = -1;
    for (let i = 1; i < rooms.length; i++) {
      const c = rectCenter(rooms[i]);
      const d = Math.abs(c.x - spawnCenter.x) + Math.abs(c.y - spawnCenter.y);
      if (d > maxDist) {
        maxDist = d;
        bossRoomIdx = i;
      }
    }
    const bossRoom = rooms[bossRoomIdx];
    const center = rectCenter(bossRoom);
    map[center.y][center.x] = TILE.STAIRS_DOWN;
    bossPos = { x: center.x, y: Math.max(bossRoom.y + 1, center.y - 1) };

    // 25a-6: place a BOSS_DOOR on every floor tile that sits OUTSIDE the
    // boss room but adjacent to one of its inside floor tiles — i.e. the
    // corridor's last step into the chamber. Multiple corridors may
    // connect to the boss room; every entry gets a locked door. First
    // unlock (key use) converts ALL boss doors to FLOOR.
    const inBoss = (x, y) =>
      x >= bossRoom.x && x < bossRoom.x + bossRoom.w && y >= bossRoom.y && y < bossRoom.y + bossRoom.h;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (map[y][x] !== TILE.FLOOR) continue;
        if (inBoss(x, y)) continue;
        const neighbors = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ];
        if (neighbors.some(([nx, ny]) => inBoss(nx, ny) && map[ny]?.[nx] === TILE.FLOOR)) {
          map[y][x] = TILE.BOSS_DOOR;
        }
      }
    }
  }

  const decorations = [];
  const mobs = [];
  const decoKinds = DECO_BY_BIOME[biome] || DECO_BY_BIOME.halls;
  const mobPool = MOBS_BY_BIOME[biome] || MOBS_BY_BIOME.halls;
  // 25a-4: keep decorations / chests / plants from clumping into lines or
  // adjacent blobs by enforcing a Chebyshev minimum spacing.
  const tooClose = (list, x, y, minDist) => list.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < minDist);

  // Pack rooms with decorations and mobs. Spawn room stays light so the
  // player isn't ambushed at start; boss room has a couple of decorations
  // (no mobs) flanking the lord.
  rooms.forEach((room, idx) => {
    const isSpawn = idx === 0;
    const isBoss = idx === bossRoomIdx;
    const roomArea = room.w * room.h;
    // Density: ~1 deco per 8 tiles, capped, plus a small base.
    const decoBase = isSpawn ? 1 : isBoss ? 2 : 4;
    const decoCount = decoBase + Math.floor(roomArea / 10) + Math.floor(rng() * 3);
    const mobCount = isBoss || isSpawn ? 0 : 3 + Math.floor(rng() * 4); // 3..6

    for (let i = 0; i < decoCount; i++) {
      const tx = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const ty = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (map[ty]?.[tx] !== TILE.FLOOR) continue;
      // Avoid stacking on top of existing decorations AND keep at least
      // a one-tile gap so they don't clump into rows. Chebyshev >= 2 means
      // no decoration sits in any of the 8 surrounding tiles of another.
      if (tooClose(decorations, tx, ty, 2)) continue;
      const kind = decoKinds[Math.floor(rng() * decoKinds.length)];
      decorations.push({ kind, x: tx, y: ty });
    }

    // Place a mix of basic and elite mobs. 25a-4 bumped elite presence
    // — was 0-1 mid rooms / 1-2 in big ones, now ~half the mob count
    // is elite minimum 1 in any populated room. Basics fill out the rest.
    const eliteCount = mobCount > 0 ? Math.max(1, Math.floor(mobCount / 2) + (rng() < 0.4 ? 1 : 0)) : 0;
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
        x: tx,
        y: ty,
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

  // 25a-4b: sprinkle decorations along hallways too — corridor floor tiles
  // (those NOT inside any room rect) get a low-density decoration pass.
  // Corridors are 1-tile wide, so the Chebyshev-2 spacing rule keeps them
  // walkable while still adding visual interest.
  const isInsideAnyRoom = (x, y) => rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (map[y][x] !== TILE.FLOOR) continue;
      if (isInsideAnyRoom(x, y)) continue;
      if (rng() > 0.08) continue; // ~8% chance per corridor tile
      if (tooClose(decorations, x, y, 2)) continue;
      const kind = decoKinds[Math.floor(rng() * decoKinds.length)];
      decorations.push({ kind, x, y });
    }
  }

  const boss = bossPos ? { kind: pickBossForBiome(biome, rng), x: bossPos.x, y: bossPos.y } : null;

  // Chests — placed in non-spawn, non-boss rooms. Each tier rolls a count
  // from CHEST_SPAWN[difficulty]; we shuffle eligible rooms for variety.
  const chests = [];
  const chestRolls = CHEST_SPAWN[difficulty] || CHEST_SPAWN.apprentice;
  const eligibleChestRooms = rooms.length > 2 ? rooms.slice(1, -1) : [];
  const placeChest = (tier) => {
    if (eligibleChestRooms.length === 0) return;
    const room = eligibleChestRooms[Math.floor(rng() * eligibleChestRooms.length)];
    for (let attempt = 0; attempt < 25; attempt++) {
      const tx = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const ty = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (map[ty]?.[tx] !== TILE.FLOOR) continue;
      // Chebyshev spacing: no chest within 2 tiles of another chest, and
      // no chest adjacent to a decoration / mob (keeps loot pickups
      // visually distinct from decor and breaks up clumps).
      if (tooClose(chests, tx, ty, 3)) continue;
      if (tooClose(decorations, tx, ty, 2)) continue;
      if (mobs.some((m) => m.x === tx && m.y === ty)) continue;
      chests.push({ tier, x: tx, y: ty, opened: false });
      return;
    }
  };
  for (const tier of ['wooden', 'silver', 'gold']) {
    for (let i = 0; i < (chestRolls[tier] || 0); i++) placeChest(tier);
  }

  // 25a-5: tag exactly one random chest with the boss key. The key is the
  // primary path to the boss room — mob drops are a backup. If no chests
  // exist (apprentice/adept have small counts but always >=4), the key
  // can only come from mob kills.
  if (chests.length > 0) {
    const keyIdx = Math.floor(rng() * chests.length);
    chests[keyIdx].hasKey = true;
  }

  const spawn = rooms.length > 0 ? rectCenter(rooms[0]) : { x: 1, y: 1 };
  return { map, rooms, decorations, mobs, boss, chests, spawn, width, height, biome };
}
export function revealDecoration(revealResult, optionIndex, correctIndex) {
  if (!revealResult) return { glyph: '', borderStyle: 'solid' };
  const isAnsRight = optionIndex === correctIndex;
  const isPickedWrong = revealResult.choice === optionIndex && !revealResult.correct;
  if (isAnsRight) return { glyph: '✓ ', borderStyle: 'solid' };
  if (isPickedWrong) return { glyph: '✗ ', borderStyle: 'dashed' };
  return { glyph: '', borderStyle: 'solid' };
}
export function buildQuestionLogEntry(q, correct, battle, bossKind, fallbackIdx = 0) {
  const source = battle?.type;
  const isMob = source === 'mob';
  const isBoss = source === 'boss';
  return {
    id: q?.id || `q_${fallbackIdx}`,
    prompt: q?.question || '(question unavailable)',
    correct: !!correct,
    timeSec: 0,
    type: q?.type,
    domain: q?.domain,
    tags: Array.isArray(q?.tags) ? q.tags.slice(0, 5) : undefined,
    difficulty: typeof q?.difficulty === 'number' ? q.difficulty : undefined,
    bloomLevel: typeof q?.bloomLevel === 'string' ? q.bloomLevel : undefined,
    source,
    mobTier: isMob ? battle?.mobTier : undefined,
    bossKind: isBoss ? bossKind : undefined,
  };
}

// Non-exported helpers used by the map-gen/biome logic above (S26).
const BIOME_IDS = Object.keys(BIOMES);
const SUBJECT_BIOME_RULES = [
  { biome: 'crypt', re: /crypt|encryption|pki|cipher|hash/i },
  { biome: 'sewers', re: /owasp|appsec|web|injection|xss|sqli/i },
  { biome: 'tower', re: /network|cisco|firewall|routing|switch|cloud|aws|azure|gcp/i },
  { biome: 'halls', re: /hardware|endpoint|device|memory|registry|kernel/i },
  { biome: 'wastes', re: /wifi|wireless|802\.11|radio|bluetooth/i },
];
const shuffle = (arr, rng) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 25b: linear-congruential PRNG so delveSeed → fresh deterministic map.
// Mixed via Knuth multiplier so adjacent seeds (1, 2, 3…) diverge fast
// instead of producing near-identical layouts.

const ROOM_TEMPLATES = [
  {
    id: 'rect-l',
    tiles: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  {
    id: 'rect-s',
    tiles: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
  },
  {
    id: 'hall-h',
    tiles: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  {
    id: 'hall-v',
    tiles: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
  },
  {
    id: 'l-shape',
    tiles: [
      [1, 1, 1, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  {
    id: 'cross',
    tiles: [
      [0, 0, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 0, 0],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [0, 0, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 0, 0],
    ],
  },
  {
    id: 'pillars',
    tiles: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 0, 1, 1, 1, 0, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 0, 1, 1, 1, 0, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  {
    id: 'round',
    tiles: [
      [0, 1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1, 0],
    ],
  },
];

// Bumped 25a-4: maps were felt cramped, especially on master/mythic.
// Was 8/12/18/24 rooms across 80x55 → 160x110.
const DECO_BY_BIOME = {
  crypt: ['bones', 'candle', 'dead_branch', 'moss_patch', 'nightshade'],
  sewers: ['mushroom', 'puddle', 'algae', 'fern', 'rot_flower'],
  tower: ['terminal', 'cable', 'bonsai', 'ivy', 'crystal'],
  halls: ['gear', 'capacitor', 'pipe_vine', 'rust_flower', 'steam_fern'],
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
  wraith: { biome: 'crypt', tier: 'basic', ai: 'patrol' },
  skeleton: { biome: 'crypt', tier: 'basic', ai: 'aggressive' },
  shade: { biome: 'crypt', tier: 'elite', ai: 'patrol' },
  // Sewers
  slime: { biome: 'sewers', tier: 'basic', ai: 'idle' },
  rat: { biome: 'sewers', tier: 'basic', ai: 'aggressive' },
  ooze: { biome: 'sewers', tier: 'elite', ai: 'patrol' },
  // Tower
  sentry: { biome: 'tower', tier: 'basic', ai: 'idle' },
  drone: { biome: 'tower', tier: 'basic', ai: 'aggressive' },
  firewall: { biome: 'tower', tier: 'elite', ai: 'patrol' },
  // Halls
  spark: { biome: 'halls', tier: 'basic', ai: 'patrol' },
  imp: { biome: 'halls', tier: 'basic', ai: 'aggressive' },
  sentinel: { biome: 'halls', tier: 'elite', ai: 'idle' },
  // Wastes
  scorpion: { biome: 'wastes', tier: 'basic', ai: 'patrol' },
  spider: { biome: 'wastes', tier: 'basic', ai: 'aggressive' },
  elemental: { biome: 'wastes', tier: 'elite', ai: 'patrol' },
};
/** @type {Record<string, any>} */
const MOBS_BY_BIOME = Object.entries(MOB_DEFS).reduce((acc, [kind, def]) => {
  acc[def.biome] = acc[def.biome] || { basic: [], elite: [] };
  acc[def.biome][def.tier].push(kind);
  return acc;
}, {});
const CHEST_SPAWN = {
  apprentice: { wooden: 3, silver: 1, gold: 0 },
  adept: { wooden: 4, silver: 2, gold: 0 },
  master: { wooden: 5, silver: 3, gold: 1 },
  mythic: { wooden: 6, silver: 4, gold: 2 },
};

// === Lootable plants ===================================================
// Walking onto these decorations harvests them: they pay out a few gold
// and have a high chance of dropping a crafting reagent (Phase 16) or a
// finished apothecary item (rare).
const pickBossForBiome = (biome, rng) => {
  const pool = BIOME_BOSS_POOL[biome] || BIOME_BOSS_POOL.halls;
  return pool[Math.floor(rng() * pool.length)];
};
const templateRect = (template, x, y) => ({
  x,
  y,
  w: template.tiles[0].length,
  h: template.tiles.length,
  template: template.id,
});
const rectsOverlap = (a, b, pad = 1) =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
const rectCenter = (r) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
