import { supabase } from './supabase.js';
import { CURRENT_SCHEMA_VER } from './persistence.js';

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
export function subscribeSaves(userId, onUpdate) {
  if (!supabase || !userId) return () => {};
  const channel = supabase
    .channel(`saves:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'saves', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new;
        if (!row) return;
        onUpdate({
          data: row.data,
          updatedAt: row.updated_at,
          schemaVer: row.schema_ver,
        });
      }
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); } catch { /* ignore */ }
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
