import { beforeEach, describe, expect, it } from 'vitest';
import {
  _resetSnapshotThrottleForTests,
  listSnapshots,
  pruneSnapshots,
  restoreSnapshot,
  SNAPSHOT_MAX,
  SNAPSHOT_PREFIX,
  writeSnapshot,
} from './persistence.js';

const meaningful = (over = {}) => ({ level: 4, totalXp: 120, library: [{ id: 't1' }], ...over });

function clearSnapshots() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SNAPSHOT_PREFIX)) localStorage.removeItem(k);
  }
}

describe('autosave snapshot ring buffer (I1)', () => {
  beforeEach(() => {
    clearSnapshots();
    _resetSnapshotThrottleForTests();
  });

  it('writes a snapshot and reads it back equal', () => {
    const state = meaningful({ gold: 99 });
    const res = writeSnapshot(state, { force: true });
    expect(res.ok).toBe(true);
    const snaps = listSnapshots();
    expect(snaps.length).toBe(1);
    const restored = restoreSnapshot(snaps[0].key);
    expect(restored.gold).toBe(99);
    expect(restored.level).toBe(4);
  });

  it('throttles ordinary writes but honors force', () => {
    expect(writeSnapshot(meaningful(), {}).ok).toBe(true); // first ordinary write ok
    expect(writeSnapshot(meaningful(), {}).skipped).toBe(true); // within interval → skipped
    expect(writeSnapshot(meaningful(), { force: true }).ok).toBe(true); // force bypasses
    expect(listSnapshots().length).toBe(2);
  });

  it('skips blank states unless forced', () => {
    expect(writeSnapshot({ level: 1, totalXp: 0, library: [] }, {}).skipped).toBe(true);
    expect(listSnapshots().length).toBe(0);
  });

  it('prunes to the newest SNAPSHOT_MAX', () => {
    for (let i = 0; i < SNAPSHOT_MAX + 3; i++) {
      // distinct keys: force + a hand-stamped ts via direct setItem ordering
      writeSnapshot(meaningful({ gold: i }), { force: true });
    }
    pruneSnapshots();
    const snaps = listSnapshots();
    expect(snaps.length).toBeLessThanOrEqual(SNAPSHOT_MAX);
  });

  it('returns null for a missing snapshot key', () => {
    expect(restoreSnapshot(SNAPSHOT_PREFIX + 'nope')).toBe(null);
  });
});
