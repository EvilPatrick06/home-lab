import { CURRENT_SCHEMA_VER } from './persistence.js';
import { supabase } from './supabase.js';

/**
 * Pull the current cloud save for a user.
 * Returns { data, updatedAt, schemaVer } or null if no row exists.
 */
export async function pullSave(userId) {
  const { data, error } = await supabase
    .from('saves')
    .select('data, updated_at, schema_ver')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { data: data.data, updatedAt: data.updated_at, schemaVer: data.schema_ver };
}

/**
 * Probe for a missing-RLS misconfiguration (PHASE-18 18C / M11): with correct
 * own-row policies a cross-user select returns zero rows (policies are implicit
 * WHERE clauses); any row coming back means RLS is disabled or mis-policied and
 * every authenticated user can read everyone's saves. Read-only and cheap
 * (limit 1). Limitation: cannot detect the problem before a second user has a row.
 */
export async function checkRlsExposure(userId) {
  if (!supabase || !userId) return { checked: false, exposed: false };
  try {
    const { data, error } = await supabase.from('saves').select('user_id').neq('user_id', userId).limit(1);
    if (error) return { checked: false, exposed: false };
    return { checked: true, exposed: Array.isArray(data) && data.length > 0 };
  } catch {
    return { checked: false, exposed: false };
  }
}

/**
 * Upsert the player state for a user. Caller is responsible for
 * ensuring `userId` matches the authenticated user.
 *
 * Returns { updatedAt } — the timestamp now stored on the row, so the
 * caller can record exactly what's in the cloud without depending on
 * client clock skew.
 */
export async function pushSave(userId, blob) {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from('saves').upsert({
    user_id: userId,
    data: blob,
    updated_at: updatedAt,
    schema_ver: CURRENT_SCHEMA_VER,
  });
  if (error) throw error;
  return { updatedAt };
}

/**
 * Subscribe to Realtime updates on the saves row for a given user.
 * The callback fires whenever the row is INSERTed or UPDATEd by anyone
 * (including this client — caller is responsible for deduping its own
 * pushes via the returned updatedAt).
 *
 * Returns an unsubscribe function. Caller MUST call it on cleanup.
 *
 * NOTE: Realtime must be enabled on the `saves` table in Supabase. Run
 * `alter publication supabase_realtime add table saves;` once in the
 * SQL editor.
 */
/** FNV-1a 32-bit, base36 (PHASE-18 18E / L9). Label obfuscation for channel
 *  topics — the topic appears in Realtime metadata/inspector; the raw UUID stays
 *  only in the postgres_changes filter, which the server requires. Not cryptographic. */
export function hashChannelTopic(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function subscribeSaves(userId, onUpdate) {
  if (!supabase || !userId) return () => {};
  const channel = supabase
    .channel(`saves:${hashChannelTopic(userId)}`)
    .on(
      'postgres_changes',
      // The raw UUID MUST stay in this filter — the server uses it to scope rows.
      // Only the channel topic above is hashed (it's a label, not an authenticator).
      { event: '*', schema: 'public', table: 'saves', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = /** @type {any} */ (payload.new);
        if (!row) return;
        onUpdate({
          data: row.data,
          updatedAt: row.updated_at,
          schemaVer: row.schema_ver,
        });
      },
    )
    .subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
  };
}

/** Delete only the cloud save row. Profile remains. */
export async function deleteCloudSave(userId) {
  const { error } = await supabase.from('saves').delete().eq('user_id', userId);
  if (error) throw error;
}

/** Delete both rows for the user (account deletion). */
export async function deleteAccount(userId) {
  const { error: e1 } = await supabase.from('saves').delete().eq('user_id', userId);
  const { error: e2 } = await supabase.from('profiles').delete().eq('id', userId);
  if (e1) throw e1;
  if (e2) throw e2;
}

/** Upsert a profile row from the user's GitHub metadata (idempotent). */
export async function upsertProfile(userId, githubLogin, avatarUrl) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    github_login: githubLogin,
    avatar_url: avatarUrl,
  });
  if (error) throw error;
}
