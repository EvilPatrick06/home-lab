import { describe, expect, it } from 'vitest';
import { DIFFICULTY_ORDER, isDifficultyUnlocked } from '../../game/difficulty.js';
import {
  BIOME_BOSS_POOL,
  BIOMES,
  buildQuestionLogEntry,
  generateMap,
  makeSeededRng,
  POTION_EFFECTS,
  pickBiomeForSubject,
  ROOMS_BY_DIFFICULTY,
  revealDecoration,
  SIZE_BY_DIFFICULTY,
  TILE,
  takeForesightPreview,
} from '../../game/dungeonMap.js';

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
    const sx = cx(spawn),
      sy = cy(spawn);
    let farIdx = 1,
      maxDist = -1;
    for (let i = 1; i < out.rooms.length; i++) {
      const r = out.rooms[i];
      const d = Math.abs(cx(r) - sx) + Math.abs(cy(r) - sy);
      if (d > maxDist) {
        maxDist = d;
        farIdx = i;
      }
    }
    const far = out.rooms[farIdx];
    let foundStairs = false;
    for (let y = far.y; y < far.y + far.h && !foundStairs; y++) {
      for (let x = far.x; x < far.x + far.w; x++) {
        if (out.map[y][x] === TILE.STAIRS_DOWN) {
          foundStairs = true;
          break;
        }
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
      pool.forEach((boss) => {
        counts[boss] = (counts[boss] || 0) + 1;
      });
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
    seen.forEach((kind) => {
      expect(expected.has(kind)).toBe(true);
    });
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

  it('propagates difficulty (1-5) and bloomLevel into the entry (prompt overhaul P3)', () => {
    // After the prompt-overhaul (P1+P2) tomes carry per-item difficulty +
    // bloomLevel. The questionLog entry must carry them forward so the
    // Chronicle can compute average difficulty + Bloom's-mix per run.
    const enriched = { ...q, difficulty: 4, bloomLevel: 'analyze' };
    const entry = buildQuestionLogEntry(enriched, true, { type: 'mob', mobTier: 'basic' }, null);
    expect(entry.difficulty).toBe(4);
    expect(entry.bloomLevel).toBe('analyze');
  });

  it('omits difficulty + bloomLevel when the question lacks them (legacy tomes)', () => {
    // Legacy tomes generated before the prompt overhaul don't carry these
    // fields. The entry should leave them undefined, not coerce to 0 / "".
    const entry = buildQuestionLogEntry(q, true, { type: 'mob', mobTier: 'basic' }, null);
    expect(entry.difficulty).toBeUndefined();
    expect(entry.bloomLevel).toBeUndefined();
  });

  it('rejects non-numeric difficulty and non-string bloomLevel', () => {
    // Defensive against malformed tomes (AI may output "3" as string or
    // an object as bloomLevel). Reject silently rather than crash the
    // Chronicle aggregation.
    const malformed = { ...q, difficulty: '3', bloomLevel: { tier: 'apply' } };
    const entry = buildQuestionLogEntry(malformed, true, { type: 'mob' }, null);
    expect(entry.difficulty).toBeUndefined();
    expect(entry.bloomLevel).toBeUndefined();
  });
});

describe('BIOMES', () => {
  it('every biome has a complete canvas palette', () => {
    Object.values(BIOMES).forEach((b) => {
      expect(b.id).toBeTruthy();
      expect(b.name).toBeTruthy();
      expect(b.palette).toBeTruthy();
      ['wallBase', 'wallTop', 'wallShade', 'floorBase', 'floorAlt', 'floorDetail', 'floorAccent'].forEach((k) => {
        expect(typeof b.palette[k]).toBe('string');
      });
    });
  });
});

describe('POTION_EFFECTS (17G — no consuming no-ops)', () => {
  const IMPLEMENTED = ['heal', 'shield', 'revive', 'xp_buff', 'foresight', 'mana'];

  it('has no entry with kind "noop"', () => {
    for (const eff of Object.values(POTION_EFFECTS)) {
      expect(eff.kind).not.toBe('noop');
    }
  });

  it('every effect kind is in the implemented set', () => {
    for (const eff of Object.values(POTION_EFFECTS)) {
      expect(IMPLEMENTED).toContain(eff.kind);
    }
  });

  it("re-specs Foresight Scroll and Tinker's Oil to real effects", () => {
    expect(POTION_EFFECTS.foresight_scroll.kind).toBe('foresight');
    expect(POTION_EFFECTS.tinkers_oil).toMatchObject({ kind: 'mana', amount: 2 });
  });
});

describe('revealDecoration (PHASE-19 19C — non-color reveal)', () => {
  it('returns neutral solid + empty glyph before reveal', () => {
    expect(revealDecoration(null, 0, 1)).toEqual({ glyph: '', borderStyle: 'solid' });
  });

  it('marks the correct option with a check + solid border', () => {
    const rr = { choice: 2, correct: false };
    expect(revealDecoration(rr, 1, 1)).toEqual({ glyph: '✓ ', borderStyle: 'solid' });
  });

  it('marks the picked-wrong option with a cross + dashed border', () => {
    const rr = { choice: 2, correct: false };
    expect(revealDecoration(rr, 2, 1)).toEqual({ glyph: '✗ ', borderStyle: 'dashed' });
  });

  it('leaves other options neutral after reveal', () => {
    const rr = { choice: 2, correct: false };
    expect(revealDecoration(rr, 0, 1)).toEqual({ glyph: '', borderStyle: 'solid' });
  });
});

describe('delve setup difficulty gating (Phase-30 QA gap)', () => {
  // APPROACH NOTE: the Phase-30 QA gap asks the delve "setup screen" to show
  // four difficulties with apprentice unlocked and adept/master/mythic locked
  // at level 1. DungeonExplore is a single lazy, canvas-heavy component that
  // this test file deliberately never mounts (it only imports the module's
  // pure named exports). Mounting the full component here is impractical
  // (canvas + rAF + audio in happy-dom), so per the gap's fallback we unit-test
  // the `isDifficultyUnlocked` predicate that the setup screen renders each
  // tier's locked/unlocked state from — same source of truth, no canvas.
  const LEVEL1 = { level: 1, library: [], achievements: [] };

  it('exposes exactly the four difficulty tiers in order', () => {
    expect(DIFFICULTY_ORDER).toEqual(['apprentice', 'adept', 'master', 'mythic']);
  });

  it('level-1 state: apprentice unlocked, adept/master/mythic locked', () => {
    expect(isDifficultyUnlocked(LEVEL1, 'apprentice')).toBe(true);
    expect(isDifficultyUnlocked(LEVEL1, 'adept')).toBe(false);
    expect(isDifficultyUnlocked(LEVEL1, 'master')).toBe(false);
    expect(isDifficultyUnlocked(LEVEL1, 'mythic')).toBe(false);
  });

  it('apprentice is always unlocked regardless of state', () => {
    expect(isDifficultyUnlocked({}, 'apprentice')).toBe(true);
    expect(isDifficultyUnlocked({ level: 1, library: [], achievements: [] }, 'apprentice')).toBe(true);
  });

  it('adept unlocks at level 10 OR 5 completed runs', () => {
    expect(isDifficultyUnlocked({ ...LEVEL1, level: 10 }, 'adept')).toBe(true);
    expect(isDifficultyUnlocked({ ...LEVEL1, level: 9 }, 'adept')).toBe(false);
    // 5 runs summed across the library also unlocks it.
    const fiveRuns = {
      level: 1,
      achievements: [],
      library: [{ progress: { runsCompleted: 3 } }, { progress: { runsCompleted: 2 } }],
    };
    expect(isDifficultyUnlocked(fiveRuns, 'adept')).toBe(true);
    const fourRuns = { level: 1, achievements: [], library: [{ progress: { runsCompleted: 4 } }] };
    expect(isDifficultyUnlocked(fourRuns, 'adept')).toBe(false);
  });

  it('master unlocks at level 25 OR both flawless + first_boss', () => {
    expect(isDifficultyUnlocked({ ...LEVEL1, level: 25 }, 'master')).toBe(true);
    expect(isDifficultyUnlocked({ ...LEVEL1, level: 24 }, 'master')).toBe(false);
    expect(isDifficultyUnlocked({ ...LEVEL1, achievements: ['flawless', 'first_boss'] }, 'master')).toBe(true);
    expect(isDifficultyUnlocked({ ...LEVEL1, achievements: ['flawless'] }, 'master')).toBe(false);
  });

  it('mythic unlocks at level 50 OR a master_complete achievement', () => {
    expect(isDifficultyUnlocked({ ...LEVEL1, level: 50 }, 'mythic')).toBe(true);
    expect(isDifficultyUnlocked({ ...LEVEL1, level: 49 }, 'mythic')).toBe(false);
    expect(isDifficultyUnlocked({ ...LEVEL1, achievements: ['master_complete'] }, 'mythic')).toBe(true);
  });
});

describe('takeForesightPreview (17G)', () => {
  it('returns null at 0 charges and does not go negative', () => {
    const ref = { current: 0 };
    expect(takeForesightPreview(ref, { domain: 'Networking' })).toBe(null);
    expect(ref.current).toBe(0);
  });

  it('returns the question domain and decrements one charge', () => {
    const ref = { current: 1 };
    expect(takeForesightPreview(ref, { domain: 'Networking' })).toBe('Networking');
    expect(ref.current).toBe(0);
  });

  it('returns "Uncharted" for a domain-less question', () => {
    const ref = { current: 1 };
    expect(takeForesightPreview(ref, {})).toBe('Uncharted');
  });

  it('drains charges one per call across consecutive previews', () => {
    const ref = { current: 2 };
    expect(takeForesightPreview(ref, { domain: 'A' })).toBe('A');
    expect(takeForesightPreview(ref, { domain: 'B' })).toBe('B');
    expect(takeForesightPreview(ref, { domain: 'C' })).toBe(null); // drained
    expect(ref.current).toBe(0);
  });
});
