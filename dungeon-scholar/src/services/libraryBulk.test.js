import { describe, expect, it } from 'vitest';
import { applyTagToTomes, buildTomeBundle, bundleFilename } from './libraryBulk.js';

const T = (id, tags) => ({ id, data: { metadata: { title: id, ...(tags ? { tags } : {}) }, flashcards: [] } });

describe('buildTomeBundle', () => {
  it('wraps selected tome data with metadata envelope', () => {
    const b = buildTomeBundle([T('a'), T('b')]);
    expect(b.bundle).toBe('dungeon-scholar');
    expect(b.count).toBe(2);
    expect(b.tomes).toHaveLength(2);
    expect(b.tomes[0].metadata.title).toBe('a');
    expect(typeof b.exportedAt).toBe('string');
  });

  it('tolerates empty / non-array input', () => {
    expect(buildTomeBundle(null).count).toBe(0);
    expect(buildTomeBundle([null, undefined]).tomes).toEqual([]);
  });
});

describe('bundleFilename', () => {
  it('singular vs plural', () => {
    expect(bundleFilename(1)).toBe('dungeon-scholar-bundle-1-tome.json');
    expect(bundleFilename(3)).toBe('dungeon-scholar-bundle-3-tomes.json');
  });
});

describe('applyTagToTomes', () => {
  it('adds a tag only to selected tomes, non-mutating', () => {
    const lib = [T('a'), T('b'), T('c')];
    const out = applyTagToTomes(lib, ['a', 'c'], 'Exam2026');
    expect(out[0].data.metadata.tags).toEqual(['Exam2026']);
    expect(out[1].data.metadata.tags).toBeUndefined();
    expect(out[2].data.metadata.tags).toEqual(['Exam2026']);
    // original library untouched
    expect(lib[0].data.metadata.tags).toBeUndefined();
  });

  it('de-dupes and preserves existing tags', () => {
    const lib = [T('a', ['Old'])];
    const out = applyTagToTomes(lib, ['a'], 'New');
    expect(out[0].data.metadata.tags).toEqual(['Old', 'New']);
    const again = applyTagToTomes(out, ['a'], 'New');
    expect(again[0].data.metadata.tags).toEqual(['Old', 'New']);
    // already-present tag => same object reference returned for that tome
    expect(again[0]).toBe(out[0]);
  });

  it('no-ops on empty tag or empty selection', () => {
    const lib = [T('a')];
    expect(applyTagToTomes(lib, ['a'], '   ')).toBe(lib);
    expect(applyTagToTomes(lib, [], 'X')).toBe(lib);
  });
});
