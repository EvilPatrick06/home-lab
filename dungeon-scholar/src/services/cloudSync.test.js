import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const maybeSingle = vi.fn();
const del = vi.fn();
const neq = vi.fn();
const limit = vi.fn();
const limitResult = vi.fn(); // 18C: resolves the cross-user RLS probe
const channelSpy = vi.fn(); // 18E: captures the Realtime channel topic

vi.mock('./supabase.js', () => ({
  supabase: {
    channel: (name) => {
      channelSpy(name);
      return { on: () => ({ subscribe: () => ({}) }) };
    },
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: (...a) => {
        select(...a);
        return {
          eq: (...b) => {
            eq(...b);
            return { maybeSingle: () => maybeSingle() };
          },
          neq: (...b) => {
            neq(...b);
            return {
              limit: (...c) => {
                limit(...c);
                return limitResult();
              },
            };
          },
        };
      },
      upsert: (...a) => {
        upsert(...a);
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        eq: (...a) => {
          del(...a);
          return Promise.resolve({ error: null });
        },
      }),
    })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
  },
  isSupabaseConfigured: () => true,
}));

import {
  checkRlsExposure,
  deleteAccount,
  deleteCloudSave,
  hashChannelTopic,
  pullSave,
  pushSave,
  subscribeSaves,
} from './cloudSync.js';

describe('cloudSync', () => {
  beforeEach(() => {
    upsert.mockReset();
    select.mockReset();
    eq.mockReset();
    maybeSingle.mockReset();
    del.mockReset();
    neq.mockReset();
    limit.mockReset();
    limitResult.mockReset();
    channelSpy.mockReset();
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

  it('pushSave upserts and returns the updatedAt it set', async () => {
    const blob = { level: 4 };
    const result = await pushSave('u1', blob);
    const arg = upsert.mock.calls[0][0];
    expect(arg.user_id).toBe('u1');
    expect(arg.data).toBe(blob);
    expect(arg.schema_ver).toBe(1);
    expect(typeof arg.updated_at).toBe('string');
    // pushSave's return must match exactly what it sent so the caller can
    // record lastSyncedAt without consulting the client clock again.
    expect(result.updatedAt).toBe(arg.updated_at);
  });

  it('deleteCloudSave deletes by user_id', async () => {
    await deleteCloudSave('u1');
    expect(del).toHaveBeenCalledWith('user_id', 'u1');
  });

  // Phase 41G — Phase-30 QA gap. The shared `del` spy fires for BOTH the
  // saves-delete (eq('user_id', id)) and the profiles-delete (eq('id', id))
  // because the mock's `from` is table-agnostic. The error-path coverage
  // (per-table error injection) lives in cloudSync.deleteAccount.test.js,
  // which needs a table-aware mock the shared builder here can't provide.
  it('deleteAccount deletes the saves row AND the profiles row', async () => {
    await deleteAccount('u1');
    expect(del).toHaveBeenCalledWith('user_id', 'u1'); // saves
    expect(del).toHaveBeenCalledWith('id', 'u1'); // profiles
  });

  describe('checkRlsExposure (18C / M11)', () => {
    it('reports exposed when a cross-user row comes back', async () => {
      limitResult.mockResolvedValueOnce({ data: [{ user_id: 'other' }], error: null });
      expect(await checkRlsExposure('u1')).toEqual({ checked: true, exposed: true });
      expect(neq).toHaveBeenCalledWith('user_id', 'u1');
    });

    it('reports not-exposed on an empty result (RLS active)', async () => {
      limitResult.mockResolvedValueOnce({ data: [], error: null });
      expect(await checkRlsExposure('u1')).toEqual({ checked: true, exposed: false });
    });

    it('reports unchecked on a query error', async () => {
      limitResult.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
      expect(await checkRlsExposure('u1')).toEqual({ checked: false, exposed: false });
    });

    it('reports unchecked without a userId (no probe)', async () => {
      expect(await checkRlsExposure('')).toEqual({ checked: false, exposed: false });
      expect(neq).not.toHaveBeenCalled();
    });
  });

  describe('hashChannelTopic + subscribeSaves topic (18E / L9)', () => {
    it('hashChannelTopic is deterministic, base36, and differs per UUID', () => {
      const a = hashChannelTopic('uuid-aaa');
      expect(hashChannelTopic('uuid-aaa')).toBe(a);
      expect(a).toMatch(/^[a-z0-9]+$/);
      expect(hashChannelTopic('uuid-bbb')).not.toBe(a);
    });

    it('subscribeSaves opens a saves: channel whose topic does not contain the raw UUID', () => {
      subscribeSaves('u1-raw-uuid', () => {});
      const topic = channelSpy.mock.calls[0][0];
      expect(topic.startsWith('saves:')).toBe(true);
      expect(topic).not.toContain('u1-raw-uuid');
      expect(topic).toBe(`saves:${hashChannelTopic('u1-raw-uuid')}`);
    });
  });
});
