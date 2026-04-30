import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const maybeSingle = vi.fn();
const del = vi.fn();

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: (...a) => { select(...a); return { eq: (...b) => { eq(...b); return { maybeSingle: () => maybeSingle() }; } }; },
      upsert: (...a) => { upsert(...a); return Promise.resolve({ error: null }); },
      delete: () => ({ eq: (...a) => { del(...a); return Promise.resolve({ error: null }); } }),
    })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
  },
  isSupabaseConfigured: () => true,
}));

import { pullSave, pushSave, deleteCloudSave } from './cloudSync.js';

describe('cloudSync', () => {
  beforeEach(() => {
    upsert.mockReset();
    select.mockReset();
    eq.mockReset();
    maybeSingle.mockReset();
    del.mockReset();
  });

  it('pullSave returns null when row absent', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const result = await pullSave('u1');
    expect(result).toBeNull();
  });

  it('pullSave returns the cloud blob when present', async () => {
    const data = { level: 7, library: [] };
    maybeSingle.mockResolvedValueOnce({
      data: { data, updated_at: '2026-04-29T10:00:00Z', schema_ver: 1 },
      error: null,
    });
    const result = await pullSave('u1');
    expect(result).toEqual({ data, updatedAt: '2026-04-29T10:00:00Z', schemaVer: 1 });
  });

  it('pushSave upserts the blob with user_id, schema_ver, and updated_at', async () => {
    const blob = { level: 4 };
    await pushSave('u1', blob);
    const arg = upsert.mock.calls[0][0];
    expect(arg.user_id).toBe('u1');
    expect(arg.data).toBe(blob);
    expect(arg.schema_ver).toBe(1);
    expect(typeof arg.updated_at).toBe('string');
  });

  it('deleteCloudSave deletes by user_id', async () => {
    await deleteCloudSave('u1');
    expect(del).toHaveBeenCalledWith('user_id', 'u1');
  });
});
