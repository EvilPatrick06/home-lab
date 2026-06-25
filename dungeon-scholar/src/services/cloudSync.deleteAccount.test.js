import { beforeEach, describe, expect, it, vi } from 'vitest';

// Phase 41G — Phase-30 QA gap: deleteAccount was never covered by an
// automated test (the existing cloudSync.test.js mock-builder resolves every
// delete().eq() to { error: null } table-agnostically, so it cannot exercise
// the two-table sequence or the per-table error branches). This file mirrors
// that mock-builder shape but makes `from(table)` table-aware so each delete
// can be steered independently.

// del[table] captures the eq(col, val) args per table; delResult[table]
// resolves that table's delete().eq() — defaults to { error: null }.
const del = { saves: vi.fn(), profiles: vi.fn() };
const delResult = { saves: vi.fn(), profiles: vi.fn() };

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn((table) => ({
      delete: () => ({
        eq: (...a) => {
          del[table](...a);
          return delResult[table]();
        },
      }),
    })),
  },
  isSupabaseConfigured: () => true,
}));

import { deleteAccount } from './cloudSync.js';

describe('cloudSync — deleteAccount (Phase-30 QA gap)', () => {
  beforeEach(() => {
    del.saves.mockReset();
    del.profiles.mockReset();
    delResult.saves.mockReset();
    delResult.profiles.mockReset();
    // Happy-path defaults; individual tests override to inject errors.
    delResult.saves.mockResolvedValue({ error: null });
    delResult.profiles.mockResolvedValue({ error: null });
  });

  it('issues a saves delete by user_id AND a profiles delete by id', async () => {
    await deleteAccount('u1');
    // saves.delete().eq('user_id', id)
    expect(del.saves).toHaveBeenCalledWith('user_id', 'u1');
    // profiles.delete().eq('id', id)
    expect(del.profiles).toHaveBeenCalledWith('id', 'u1');
  });

  it('throws when the saves-delete errors', async () => {
    delResult.saves.mockResolvedValue({ error: { message: 'saves delete denied' } });
    await expect(deleteAccount('u1')).rejects.toEqual({ message: 'saves delete denied' });
  });

  it('throws when the profiles-delete errors (saves succeeded)', async () => {
    delResult.saves.mockResolvedValue({ error: null });
    delResult.profiles.mockResolvedValue({ error: { message: 'profiles delete denied' } });
    await expect(deleteAccount('u1')).rejects.toEqual({ message: 'profiles delete denied' });
    // saves delete still fired (it runs first, unconditionally).
    expect(del.saves).toHaveBeenCalledWith('user_id', 'u1');
  });
});
