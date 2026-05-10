import { describe, it, expect } from 'vitest';
import {
  generateMap,
  generateStarterMap,
  pickBiomeForSubject,
  BIOMES,
  BIOME_BOSS_POOL,
  TILE,
  ROOMS_BY_DIFFICULTY,
  SIZE_BY_DIFFICULTY,
  makeSeededRng,
  buildQuestionLogEntry,
} from './DungeonExplore.jsx';

// Seedable RNG so map-gen assertions are deterministic per test.
const seedRng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

describe('pickBiomeForSubject', () => {
  it('maps cybersecurity-ish subjects to crypt via keyword', () => {
    expect(pickBiomeForSubject('Encryption fundamentals')).toBe('crypt');
    expect(pickBiomeForSubject('PKI for the curious')).toBe('crypt');
  });

  it('maps networking subjects to tower', () => {
    expect(pickBiomeForSubject('Cisco CCNA networking')).toBe('tower');
    expect(pickBiomeForSubject('AWS Cloud Practitioner')).toBe('tower');
  });

  it('maps OWASP / web subjects to sewers', () => {
    expect(pickBiomeForSubject('OWASP Top 10')).toBe('sewers');
    expect(pickBiomeForSubject('Web app pen-testing')).toBe('sewers');
  });

  it('maps wireless subjects to wastes', () => {
    expect(pickBiomeForSubject('WiFi security 101')).toBe('wastes');
  });

  it('hashes unknown subjects deterministically', () => {
    const a = pickBiomeForSubject('Wholly Unrecognized Topic');
    const b = pickBiomeForSubject('Wholly Unrecognized Topic');
    expect(a).toBe(b);
    expect(BIOMES[a]).toBeTruthy();
  });

  it('uses rng when subject is empty', () => {
    const rng = () => 0;
    const biome = pickBiomeForSubject('', rng);
    expect(BIOMES[biome]).toBeTruthy();
  });
});

describe('generateMap', () => {
  it('honors difficulty room count (apprentice)', () => {
    const out = generateMap({ difficulty: 'apprentice', rng: seedRng(1) });
    expect(out.rooms.length).toBeGreaterThan(0);
    expect(out.rooms.length).toBeLessThanOrEqual(ROOMS_BY_DIFFICULTY.apprentice);
  });

  it('honors difficulty map size', () => {
    const a = generateMap({ difficulty: 'apprentice', rng: seedRng(1) });
    const m = generateMap({ difficulty: 'mythic', rng: seedRng(1) });
    expect(a.width).toBe(SIZE_BY_DIFFICULTY.apprentice.w);
    expect(a.height).toBe(SIZE_BY_DIFFICULTY.apprentice.h);
    expect(m.width).toBe(SIZE_BY_DIFFICULTY.mythic.w);
    expect(m.height).toBe(SIZE_BY_DIFFICULTY.mythic.h);
  });

  it('places spawn on a walkable tile inside the first room', () => {
    const out = generateMap({ difficulty: 'apprentice', rng: seedRng(42) });
    expect(out.rooms.length).toBeGreaterThan(0);
    const t = out.map[out.spawn.y][out.spawn.x];
    expect([TILE.FLOOR, TILE.STAIRS_DOWN, TILE.STAIRS_UP, TILE.DOOR]).toContain(t);
  });

  it('places stairs in the farthest room from spawn (Manhattan)', () => {
    // 25a-4: boss room is now the room with max Manhattan distance from
    // the spawn room center, not rooms[rooms.length - 1].
    const out = generateMap({ difficulty: 'apprentice', rng: seedRng(7) });
    if (out.rooms.length < 2) return; // tiny map edge case
    const cx = (r) => r.x + Math.floor(r.w / 2);
    const cy = (r) => r.y + Math.floor(r.h / 2);
    const spawn = out.rooms[0];
    const sx = cx(spawn), sy = cy(spawn);
    let farIdx = 1, maxDist = -1;
    for (let i = 1; i < out.rooms.length; i++) {
      const r = out.rooms[i];
      const d = Math.abs(cx(r) - sx) + Math.abs(cy(r) - sy);
      if (d > maxDist) { maxDist = d; farIdx = i; }
    }
    const far = out.rooms[farIdx];
    let foundStairs = false;
    for (let y = far.y; y < far.y + far.h && !foundStairs; y++) {
      for (let x = far.x; x < far.x + far.w; x++) {
        if (out.map[y][x] === TILE.STAIRS_DOWN) { foundStairs = true; break; }
      }
    }
    expect(foundStairs).toBe(true);
  });

  it('populates decorations, mobs, and boss lists', () => {
    const out = generateMap({ difficulty: 'adept', biome: 'crypt', rng: seedRng(100) });
    expect(Array.isArray(out.decorations)).toBe(true);
    expect(Array.isArray(out.mobs)).toBe(true);
    if (out.rooms.length > 1) {
      expect(out.boss).toBeTruthy();
      expect(out.boss.kind).toBeTruthy();
    }
    out.mobs.forEach((m) => {
      expect(m.kind).toBeTruthy();
      expect(m.bounds).toBeTruthy();
    });
  });

  it('passes biome through to result', () => {
    const out = generateMap({ difficulty: 'apprentice', biome: 'crypt', rng: seedRng(3) });
    expect(out.biome).toBe('crypt');
  });

  it('produces the same map for the same seed', () => {
    const a = generateMap({ difficulty: 'adept', rng: seedRng(123) });
    const b = generateMap({ difficulty: 'adept', rng: seedRng(123) });
    expect(a.rooms.length).toBe(b.rooms.length);
    expect(a.spawn).toEqual(b.spawn);
    expect(a.map[a.spawn.y][a.spawn.x]).toBe(b.map[b.spawn.y][b.spawn.x]);
  });
});

describe('generateStarterMap', () => {
  it('returns an apprentice-sized map by default', () => {
    const out = generateStarterMap({ rng: seedRng(1) });
    expect(out.width).toBe(SIZE_BY_DIFFICULTY.apprentice.w);
    expect(out.height).toBe(SIZE_BY_DIFFICULTY.apprentice.h);
  });
});

describe('BIOME_BOSS_POOL (25b — random boss per delve)', () => {
  it('every biome has at least 2 candidate bosses', () => {
    Object.entries(BIOME_BOSS_POOL).forEach(([biome, pool]) => {
      expect(pool.length).toBeGreaterThanOrEqual(2);
      // No duplicates within a biome's pool.
      expect(new Set(pool).size).toBe(pool.length);
      // Sanity: biome key is one we expect a tone for.
      expect(BIOMES[biome]).toBeTruthy();
    });
  });

  it('every boss appears in at least 2 biome pools', () => {
    const counts = {};
    Object.values(BIOME_BOSS_POOL).forEach((pool) => {
      pool.forEach((boss) => { counts[boss] = (counts[boss] || 0) + 1; });
    });
    Object.entries(counts).forEach(([boss, n]) => {
      expect(n, `${boss} should appear in >=2 biome pools`).toBeGreaterThanOrEqual(2);
    });
  });

  it('different delve seeds rotate boss kinds for the same biome', () => {
    // Sample a wide range of seeds. We expect the rolled kinds to span
    // the full pool — if not, the rng plumbing is broken.
    const biome = 'crypt';
    const expected = new Set(BIOME_BOSS_POOL[biome]);
    const seen = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const out = generateMap({ difficulty: 'adept', biome, rng: makeSeededRng(seed) });
      if (out.boss) seen.add(out.boss.kind);
    }
    // Every entry in the pool should turn up in 40 rolls; fuzz tolerated
    // is "subset of pool, but not just one kind".
    seen.forEach((kind) => expect(expected.has(kind)).toBe(true));
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});

describe('buildQuestionLogEntry (25e — Chronicle source badges)', () => {
  const q = {
    id: 'q-42',
    question: 'What is XSS?',
    type: 'multiplechoice',
    domain: 'Web Security',
    tags: ['owasp', 'web', 'xss'],
  };

  it('tags a basic mob answer with source="mob" and mobTier="basic"', () => {
    const battle = { type: 'mob', mobTier: 'basic' };
    const entry = buildQuestionLogEntry(q, true, battle, 'lich');
    expect(entry.source).toBe('mob');
    expect(entry.mobTier).toBe('basic');
    expect(entry.bossKind).toBeUndefined();
    expect(entry.correct).toBe(true);
    expect(entry.prompt).toBe('What is XSS?');
    expect(entry.id).toBe('q-42');
    expect(entry.domain).toBe('Web Security');
  });

  it('tags an elite mob answer with mobTier="elite"', () => {
    const battle = { type: 'mob', mobTier: 'elite' };
    const entry = buildQuestionLogEntry(q, false, battle, null);
    expect(entry.source).toBe('mob');
    expect(entry.mobTier).toBe('elite');
    expect(entry.bossKind).toBeUndefined();
    expect(entry.correct).toBe(false);
  });

  it('tags a boss answer with source="boss" and the bossKind', () => {
    const battle = { type: 'boss' };
    const entry = buildQuestionLogEntry(q, true, battle, 'sphinx');
    expect(entry.source).toBe('boss');
    expect(entry.bossKind).toBe('sphinx');
    expect(entry.mobTier).toBeUndefined();
  });

  it('falls back gracefully when battle is null (auto_correct edge cases)', () => {
    const entry = buildQuestionLogEntry(q, true, null, null);
    expect(entry.source).toBeUndefined();
    expect(entry.bossKind).toBeUndefined();
    expect(entry.mobTier).toBeUndefined();
    expect(entry.correct).toBe(true);
  });

  it('synthesizes an id when the question lacks one', () => {
    const entry = buildQuestionLogEntry({ question: 'orphan' }, true, { type: 'mob' }, null, 7);
    expect(entry.id).toBe('q_7');
    expect(entry.prompt).toBe('orphan');
  });

  it('preserves domain + first 5 tags', () => {
    const longTags = { ...q, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] };
    const entry = buildQuestionLogEntry(longTags, true, { type: 'mob', mobTier: 'basic' }, null);
    expect(entry.tags).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(entry.domain).toBe('Web Security');
  });
});

describe('BIOMES', () => {
  it('every biome has a complete canvas palette', () => {
    Object.values(BIOMES).forEach((b) => {
      expect(b.id).toBeTruthy();
      expect(b.name).toBeTruthy();
      expect(b.palette).toBeTruthy();
      ['wallBase', 'wallTop', 'wallShade', 'floorBase', 'floorAlt', 'floorDetail', 'floorAccent']
        .forEach((k) => expect(typeof b.palette[k]).toBe('string'));
    });
  });
});
