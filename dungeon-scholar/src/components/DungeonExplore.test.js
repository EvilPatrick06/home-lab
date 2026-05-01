import { describe, it, expect } from 'vitest';
import {
  generateMap,
  generateStarterMap,
  pickBiomeForSubject,
  BIOMES,
  TILE,
  ROOMS_BY_DIFFICULTY,
  SIZE_BY_DIFFICULTY,
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

  it('places stairs in the last room', () => {
    const out = generateMap({ difficulty: 'apprentice', rng: seedRng(7) });
    if (out.rooms.length < 2) return; // tiny map edge case
    let foundStairs = false;
    const last = out.rooms[out.rooms.length - 1];
    for (let y = last.y; y < last.y + last.h && !foundStairs; y++) {
      for (let x = last.x; x < last.x + last.w; x++) {
        if (out.map[y][x] === TILE.STAIRS_DOWN) { foundStairs = true; break; }
      }
    }
    expect(foundStairs).toBe(true);
  });

  it('produces corridors with from/to indices and tile lists', () => {
    const out = generateMap({ difficulty: 'apprentice', rng: seedRng(100) });
    if (out.rooms.length < 2) return;
    expect(out.corridors.length).toBe(out.rooms.length - 1);
    out.corridors.forEach((c, i) => {
      expect(c.from).toBe(i);
      expect(c.to).toBe(i + 1);
      expect(Array.isArray(c.tiles)).toBe(true);
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
